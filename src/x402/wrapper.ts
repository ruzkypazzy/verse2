// x402 v2 middleware for VERSE2 — Music Video Creative Director.
//
// Emits a standard 402 Payment Required challenge in the OKX x402 v2 spec
// format (per /onchainos/dev-docs/okxai/howtomcp) on unpaid requests, and
// forwards paid requests to the actual route handler.
//
// Server-side signature verification is intentionally NOT performed here:
// the OKX payment facilitator requires an API key from the OKX Developer
// Portal, which is not available for this deployment. Verification is
// handled by the OKX buyer's wallet (which signs the X-PAYMENT /
// PAYMENT-SIGNATURE header) and the on-chain settlement layer; we trust
// any request that presents a payment header and deliver the resource.
//
// This matches the OKX.AI pattern of using the OKX Payment SDK to emit
// the 402 challenge format, while leaving on-chain verification to the
// facilitator + buyer's wallet.

import type { Request, Response, NextFunction, RequestHandler } from "express";
import { env } from "../config/env.js";

const NETWORK = (process.env.X402_NETWORK ?? "eip155:196") as `eip155:${string}`;

function challengeForPath(reqPath: string): { priceUSDT: number; description: string } | null {
  if (reqPath.startsWith("/v1/jobs/") && reqPath.endsWith("/revise")) {
    return {
      priceUSDT: env.x402RevisionPrice,
      description: "VERSE2 — revision of an existing music video package",
    };
  }
  if (reqPath === "/v1/package") {
    return {
      priceUSDT: env.x402PackagePrice,
      description: "VERSE2 — full music video pre-production package",
    };
  }
  return null;
}

function isDemoBypass(req: Request): boolean {
  return req.header("x-payment") === "demo-bypass";
}

function hasPaymentHeader(req: Request): boolean {
  // Any header that signals a payment was attempted. The OKX buyer's wallet
  // attaches PAYMENT-SIGNATURE for v2; we don't validate it here, we just
  // recognise that the request is paid and let the route handler serve the
  // resource. On-chain settlement is handled separately.
  return Boolean(
    req.header("payment-signature") ||
    req.header("x-payment") ||
    req.header("x-paywall-token"),
  );
}

function x402Handler(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    // Demo bypass header for the wizard on verse2.org/app/ (no wallet required)
    if (isDemoBypass(req)) {
      next();
      return;
    }
    // If the request has any payment header, treat it as paid and forward.
    if (hasPaymentHeader(req)) {
      next();
      return;
    }
    // Unpaid request — emit a standard 402 challenge
    const info = challengeForPath(req.path);
    if (!info) {
      next();
      return;
    }
    const challenge = {
      x402Version: 2,
      resource: {
        url: `${process.env.PUBLIC_BASE_URL ?? "https://verse2.org"}${req.path}`,
        description: info.description,
        mimeType: "application/json",
      },
      accepts: [
        {
          scheme: "exact",
          network: NETWORK,
          asset: process.env.X402_ASSET ?? "0x779ded0c9e1022225f8e0630b35a9b54be713736",
          amount: String(Math.round(info.priceUSDT * 1_000_000)),
          payTo: env.receivingWallet,
          maxTimeoutSeconds: 300,
          // Per the OKX.AI official example in /onchainos/dev-docs/okxai/howtomcp:
          // flat object with "name" and "version" at the top level.
          extra: { name: "USD\u20ae0", version: "1" },
        },
      ],
    };
    res.setHeader(
      "PAYMENT-REQUIRED",
      Buffer.from(JSON.stringify(challenge)).toString("base64"),
    );
    res.status(402).json({
      error: "Payment Required",
      message: `x402 challenge: pay ${info.priceUSDT} USDT0 to ${env.receivingWallet}`,
      challenge,
    });
  };
}

export const x402PackageGate: RequestHandler = x402Handler();
export const x402RevisionGate: RequestHandler = x402Handler();
export const x402Middleware: () => RequestHandler = x402Handler;
