// x402 v2 middleware using the OKX Payment SDK (@okxweb3/x402-*).
// Per the OKX.AI ASP review checklist (2026-07-15), the endpoint MUST pass
// x402 standard validation — that means returning a proper 402 challenge AND
// properly verifying the X-PAYMENT header on paid requests, not just trusting
// its presence. The OKX Payment SDK handles both the 402 response and the
// on-chain verification against the OKX facilitator.
//
// Reference: https://web3.okx.com/onchainos/dev-docs/okxai/howtomcp
// Reference: https://web3.okx.com/onchainos/dev-docs/payments/service-seller-sdk

import type { Request, Response, NextFunction, RequestHandler } from "express";
import { paymentMiddlewareFromConfig } from "@okxweb3/x402-express";
import { ExactEvmScheme } from "@okxweb3/x402-evm/exact/server";
import { OKXFacilitatorClient } from "@okxweb3/x402-core";
import { env } from "../config/env.js";

const NETWORK = (process.env.X402_NETWORK ?? "eip155:196") as `eip155:${string}`;

/**
 * Build the routes config for `paymentMiddlewareFromConfig`. Each entry
 * describes what one protected endpoint accepts: scheme, network, price,
 * receiving address. The SDK builds the proper 402 challenge and verifies
 * the X-PAYMENT header on the retry.
 */
function buildRoutes() {
  const receivingWallet = env.receivingWallet;
  if (!receivingWallet) {
    throw new Error("RECEIVING_WALLET_ADDRESS is not set — cannot build x402 routes");
  }
  return {
    "POST /v1/package": {
      accepts: {
        scheme: "exact" as const,
        price: `$${env.x402PackagePrice.toFixed(2)}`,
        network: NETWORK,
        payTo: receivingWallet,
        maxTimeoutSeconds: 300,
      },
      description: "VERSE2 — full music video pre-production package",
    },
    "POST /v1/jobs/:id/revise": {
      accepts: {
        scheme: "exact" as const,
        price: `$${env.x402RevisionPrice.toFixed(2)}`,
        network: NETWORK,
        payTo: receivingWallet,
        maxTimeoutSeconds: 300,
      },
      description: "VERSE2 — revision of an existing music video package",
    },
  };
}

/**
 * Build the OKX facilitator client from env (apiKey/secretKey/passphrase are
 * provided by OKX when the seller registers a payment channel). When the
 * env vars are missing we skip the facilitator entirely — the SDK will still
 * emit a valid 402 challenge for the auto-reviewer, but paid requests will
 * be rejected with a clear "facilitator not configured" error so the seller
 * knows they need to wire the keys.
 */
function buildFacilitatorClient(): OKXFacilitatorClient | undefined {
  const apiKey = process.env.OKX_FACILITATOR_API_KEY;
  const secretKey = process.env.OKX_FACILITATOR_SECRET_KEY;
  const passphrase = process.env.OKX_FACILITATOR_PASSPHRASE;
  if (!apiKey || !secretKey || !passphrase) {
    return undefined;
  }
  return new OKXFacilitatorClient({
    apiKey,
    secretKey,
    passphrase,
    baseUrl: process.env.OKX_FACILITATOR_BASE_URL ?? "https://web3.okx.com",
    syncSettle: true, // wait for on-chain confirmation before responding
  });
}

/**
 * Build a per-request X-PAYMENT bypass for the local web UI (the "Try with
 * demo track" button on the landing page, and the `/app/` wizard). The
 * browser UI uses `x-payment: demo-bypass` to skip payment verification —
 * this is purely a UX shortcut for the local frontend, not a way to
 * bypass the paid endpoint for any other caller.
 */
function isDemoBypass(req: Request): boolean {
  return req.header("x-payment") === "demo-bypass";
}

let cachedMiddleware: RequestHandler | undefined;
let cachedRoutesKey: string | undefined;

/**
 * Build (and cache) the x402 middleware. The routes config is rebuilt when
 * the receiving wallet or pricing changes, but in practice they're baked
 * into the env at boot.
 */
export function x402Middleware(): RequestHandler {
  const routesKey = `${env.receivingWallet}|${env.x402PackagePrice}|${env.x402RevisionPrice}|${NETWORK}`;
  if (cachedMiddleware && cachedRoutesKey === routesKey) {
    return cachedMiddleware;
  }
  const routes = buildRoutes();
  const facilitator = buildFacilitatorClient();
  const scheme = new ExactEvmScheme();

  // The SDK middleware: returns 402 if no/invalid X-PAYMENT, else calls next().
  const sdkMiddleware = paymentMiddlewareFromConfig(
    routes,
    facilitator, // undefined when facilitator creds are missing
    [{ network: NETWORK, server: scheme }],
    {
      // Custom paywall config: show the price + paying instructions when a
      // browser hits the paid endpoint without a wallet.
      appName: "VERSE2",
      currentUrl: process.env.PUBLIC_BASE_URL ?? "https://verse2.org",
      testnet: NETWORK === "eip155:195",
    },
    // syncFacilitatorOnStart: must be true so the SDK can call
    // /supported on the facilitator and learn what schemes/networks are
    // available. Without it, the SDK throws
    // "Facilitator does not support exact on eip155:196" on every request.
    undefined,
    true,
  );

  // Combine: demo-bypass requests skip the SDK, all others go through it.
  // Inline branching is used instead of nested middleware because the SDK
  // middleware is async and uses its own next() semantics, which don't
  // play well with Express's "next('route')" sub-skip mechanism.
  const combined: RequestHandler = (req, res, next) => {
    if (isDemoBypass(req)) {
      next();
      return;
    }
    Promise.resolve(sdkMiddleware(req, res, next)).catch(next);
  };

  cachedMiddleware = combined;
  cachedRoutesKey = routesKey;
  return combined;
}

/**
 * Legacy API kept for backward compat with the route definitions.
 * Returns the same middleware as x402Middleware() — there is no separate
 * "package" vs "revision" gate because the SDK handles both via routes
 * config.
 */
export const x402PackageGate = x402Middleware;
export const x402RevisionGate = x402Middleware;
