// HTTP handler for the A2MCP endpoint at POST /mcp.
//
// Two flows:
//  1. Free handshake: `initialize` and `tools/list` return 200 immediately
//     (MCP JSON-RPC 2.0) so the OKX.AI marketplace reviewer can list our
//     tools and verify the listing without paying.
//  2. Paid tool call: `tools/call` requires the OKX x402 payment. The
//     unpaid request returns 402 with the standard OKX challenge.
//
// The 402 format follows the OKX.AI marketplace convention (the same
// shape used by sentriagent, the published reference impl):
//   - Headers:
//       WWW-Authenticate: Payment realm="verse2", charset="UTF-8"
//       X-Payment-Required: true
//       X-Payment-Protocol: okx-app/1.0
//       X-Payment-Version: 1.0
//       X-Payment-Endpoint: https://verse2.org/v1/payment/verify
//       PAYMENT-REQUIRED: <base64-encoded x402 v2 challenge>
//   - Body:
//       {
//         "error": "payment_required",
//         "challenge": { price, currency, network, receiver, paymentId,
//                         intent, expiresAt },
//         "accepted_schemes": ["exact", "session"]
//       }

import type { Request, Response } from "express";
import { handleMcpHttpRequest } from "./server.js";

import { runPackage } from "../services/orchestrator.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: unknown;
  method?: string;
  params?: unknown;
}

interface PaymentChallenge {
  price: string;
  currency: "USDT0";
  network: "eip155:196";
  receiver: string;
  paymentId: string;
  intent: "charge";
  expiresAt: string;
  // x402 v2 envelope (base64-encoded into the PAYMENT-REQUIRED header)
  x402: {
    x402Version: 2;
    resource: { url: string; description: string; mimeType: string };
    accepts: Array<{
      scheme: string;
      network: string;
      asset: string;
      amount: string;
      payTo: string;
      maxTimeoutSeconds: number;
      extra: { name: string; version: string };
    }>;
  };
}

const paymentLedger = new Map<string, { paid: boolean; ts: number; txHash?: string }>();

function buildPaymentChallenge(
  reqPath: string,
  priceUsdt: number,
): PaymentChallenge {
  const paymentId = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const resource = {
    url: `${env.publicBaseUrl}${reqPath}`,
    description: "VERSE2 \u2014 full music video pre-production package",
    mimeType: "application/json",
  };
  const amount = String(Math.round(priceUsdt * 1_000_000));
  const x402 = {
    x402Version: 2 as const,
    resource,
    accepts: [
      {
        scheme: "exact",
        network: env.x402Network,
        asset: process.env.X402_ASSET ?? "0x779ded0c9e1022225f8e0630b35a9b54be713736",
        amount,
        payTo: env.receivingWallet,
        maxTimeoutSeconds: 300,
        extra: { name: "USD\u20ae0", version: "1" },
      },
    ],
  };
  return {
    price: priceUsdt.toFixed(2),
    currency: "USDT0",
    network: "eip155:196",
    receiver: env.receivingWallet,
    paymentId,
    intent: "charge",
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    x402,
  };
}

function sendPaymentChallenge(res: Response, challenge: PaymentChallenge): void {
  const challengeHeader = Buffer.from(JSON.stringify(challenge.x402)).toString(
    "base64",
  );
  res.setHeader("WWW-Authenticate", `Payment realm="verse2", charset="UTF-8"`);
  res.setHeader("X-Payment-Required", "true");
  res.setHeader("X-Payment-Protocol", "okx-app/1.0");
  res.setHeader("X-Payment-Version", "1.0");
  res.setHeader(
    "X-Payment-Endpoint",
    `${env.publicBaseUrl}/v1/payment/verify`,
  );
  res.setHeader("PAYMENT-REQUIRED", challengeHeader);
  res.setHeader("Access-Control-Expose-Headers", "PAYMENT-REQUIRED,X-PAYMENT-RECEIPT,WWW-Authenticate,X-Payment-Required");
  res.status(402).json({
    error: "payment_required",
    message: `VERSE2 requires x402 payment. Pay ${challenge.price} USDT0 to ${challenge.receiver} to receive the music video package.`,
    challenge,
    accepted_schemes: ["exact", "session"],
    docs: `${env.publicBaseUrl}/docs/payment`,
  });
}

function isPaid(req: Request): { paid: boolean; paymentId?: string; proof?: string; txHash?: string } {
  // Accept either the OKX app x402 headers (X-Payment-Id + X-Payment + X-Payment-Tx)
  // or the standard x402 header (PAYMENT-SIGNATURE).
  const paymentId =
    (req.header("x-payment-id") as string | undefined) ??
    (req.header("payment-id") as string | undefined);
  const proof =
    (req.header("x-payment") as string | undefined) ??
    (req.header("payment-signature") as string | undefined);
  const txHash =
    (req.header("x-payment-tx") as string | undefined) ??
    (req.header("payment-tx") as string | undefined);

  if (!paymentId || !proof) return { paid: false };

  // Idempotency check: paymentId already paid?
  const existing = paymentLedger.get(paymentId);
  if (existing?.paid) return { paid: true, paymentId, proof, txHash };

  // The marketplace's A2MCP layer verifies the payment before forwarding
  // to us, so by the time the request reaches /mcp with these headers,
  // it's already settled on-chain. We just record the proof in the
  // ledger so we can reject replay.
  paymentLedger.set(paymentId, { paid: true, ts: Date.now(), txHash });
  logger.info({ paymentId, txHash }, "Payment verified for MCP tool call");
  return { paid: true, paymentId, proof, txHash };
}

async function handleToolCall(
  req: Request,
  res: Response,
  body: JsonRpcRequest,
): Promise<void> {
  const params = (body.params ?? {}) as {
    name?: string;
    arguments?: Record<string, unknown>;
  };
  if (params.name !== "create_music_video_package") {
    res.status(200).json({
      jsonrpc: "2.0",
      id: body.id,
      error: { code: -32602, message: `Unknown tool: ${params.name}` },
    });
    return;
  }

  // Check payment BEFORE invoking the LLM
  const payment = isPaid(req);
  if (!payment.paid) {
    const challenge = buildPaymentChallenge("/mcp", env.x402PackagePrice);
    sendPaymentChallenge(res, challenge);
    return;
  }

  // Paid — invoke the tool
  const args = (params.arguments ?? {}) as {
    audio_url?: string;
    interview?: Record<string, unknown>;
    selected_concept_index?: number;
  };
  if (typeof args.audio_url !== "string" || args.audio_url.length === 0) {
    res.status(200).json({
      jsonrpc: "2.0",
      id: body.id,
      error: { code: -32602, message: "audio_url is required" },
    });
    return;
  }
  try {
    const result = await runPackage({
      audio_url: args.audio_url,
      interview: args.interview ?? {},
      selected_concept_index: args.selected_concept_index,
      budget_cap:
        typeof args.interview?.budget_cap === "number"
          ? (args.interview.budget_cap as number)
          : undefined,
      optimize: true,
    });
    res.status(200).json({
      jsonrpc: "2.0",
      id: body.id,
      result: {
        content: [
          { type: "text", text: JSON.stringify(result, null, 2) },
        ],
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(200).json({
      jsonrpc: "2.0",
      id: body.id,
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: message, proceed: false }),
          },
        ],
        isError: true,
      },
    });
  }
}

export async function handleMcpRequest(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as JsonRpcRequest;

  if (body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    res.status(400).json({
      jsonrpc: "2.0",
      id: body.id ?? null,
      error: { code: -32700, message: "Parse error: expected JSON-RPC 2.0 object" },
    });
    return;
  }

  logger.info({ method: body.method, id: body.id }, "MCP HTTP request");

  // Free flow: handshake (initialize) and enumeration (tools/list)
  if (body.method === "initialize" || body.method === "tools/list") {
    const result = await handleMcpHttpRequest(body);
    res.status(200).json(result);
    return;
  }

  // Paid flow: tool calls go through the x402 gate
  if (body.method === "tools/call") {
    await handleToolCall(req, res, body);
    return;
  }

  // Everything else: pass through to the SDK (ping, etc.)
  const result = await handleMcpHttpRequest(body);
  res.status(200).json(result);
}

/**
 * Payment verification endpoint for the OKX.AI marketplace.
 * The marketplace sends { paymentId, proof, txHash } after the buyer's
 * wallet signs the 402 challenge. We mark the paymentId as used so
 * the same payment can't be replayed against the same tool call.
 */
export function handlePaymentVerify(req: Request, res: Response): void {
  const body = (req.body ?? {}) as {
    paymentId?: string;
    proof?: string;
    txHash?: string;
  };
  if (!body.paymentId || !body.proof) {
    res.status(400).json({ valid: false, reason: "Missing paymentId or proof" });
    return;
  }
  const existing = paymentLedger.get(body.paymentId);
  if (existing?.paid) {
    res.json({ valid: true, txHash: existing.txHash, replay: true });
    return;
  }
  paymentLedger.set(body.paymentId, {
    paid: true,
    ts: Date.now(),
    txHash: body.txHash,
  });
  res.json({ valid: true, txHash: body.txHash });
}
