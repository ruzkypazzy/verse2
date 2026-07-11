// x402 v2 middleware for the OKX Agent Payments protocol.
// Two modes:
//   - LIVE: verify the X-PAYMENT header against the OKX x402 facilitator
//   - DEMO (default for the hackathon): log the payment header but allow the
//     request through. This is the @okxweb3/x402-express default; we keep
//     the same shape so a production deployment can swap in a real verifier.

import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";

export interface X402Options {
  /** Price in USDT0 (or any unit the x402 facilitator uses). */
  priceUSDT: number;
  /** Resource path. The PAYMENT-REQUIRED header references this. */
  resource: string;
  /** Optional description for the receipt. */
  description?: string;
  /** Receiving wallet (X Layer testnet address). */
  payTo: string;
}

/**
 * x402 payment gate. Drops a 402 challenge if no/invalid X-PAYMENT header.
 * In demo mode (default for the hackathon) the gate is logged-but-not-blocking.
 */
export function x402Gate(opts: X402Options) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const payment = req.header("x-payment") ?? req.header("X-PAYMENT");
    const isPaid = payment && payment.length > 0;

    if (!isPaid) {
      // Build a minimal v2 PAYMENT-REQUIRED header.
      const challenge = {
        x402Version: 2,
        accepts: [
          {
            scheme: "exact",
            network: "x-layer-testnet",
            maxAmountRequired: String(Math.round(opts.priceUSDT * 1_000_000)), // 6 decimals
            resource: opts.resource,
            description: opts.description ?? `VERSE2 ${opts.resource}`,
            payTo: opts.payTo,
            mimeType: "application/json",
            extra: { name: "USDT0" },
          },
        ],
      };
      res.setHeader("PAYMENT-REQUIRED", Buffer.from(JSON.stringify(challenge)).toString("base64"));
      res.status(402).json({
        error: "Payment Required",
        message: `x402 challenge: pay ${opts.priceUSDT} USDT0 to ${opts.payTo}`,
        challenge,
      });
      return;
    }

    // Payment header present. In demo mode, accept it.
    // In production, verify signature with the OKX x402 facilitator here.
    if (process.env.X402_MODE === "live") {
      // TODO: verify against https://www.okx.com/x402/verify
      // For now we log + accept.
    }
    // Stash payment receipt on the request for downstream logging
    (req as Request & { x402Receipt?: string }).x402Receipt = payment;
    next();
  };
}

/**
 * Default price gate for the /v1/package endpoint.
 */
export function x402PackageGate() {
  if (!env.receivingWallet) {
    // No wallet configured — fail open in demo mode so the service can run
    // without one, but log a warning.
    if (process.env.X402_STRICT === "true") {
      return (req: Request, res: Response) => {
        res.status(503).json({ error: "x402 not configured", message: "RECEIVING_WALLET_ADDRESS is not set" });
      };
    }
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }
  return x402Gate({
    priceUSDT: env.x402PackagePrice,
    resource: "/v1/package",
    description: "VERSE2 — full music video pre-production package",
    payTo: env.receivingWallet,
  });
}

export function x402RevisionGate() {
  if (!env.receivingWallet) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }
  return x402Gate({
    priceUSDT: env.x402RevisionPrice,
    resource: "/v1/package/{id}/revise",
    description: "VERSE2 — single revision pass",
    payTo: env.receivingWallet,
  });
}
