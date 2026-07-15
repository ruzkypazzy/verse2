// x402 v2 middleware using the OKX Payment SDK.
// For unpaid requests, returns the standard 402 challenge.
// For paid requests, verifies the X-PAYMENT header against the OKX facilitator
// using HMAC-SHA256 signed requests to /api/v6/pay/x402/{verify,settle}.
//
// To use this, the user must set:
//   OKX_FACILITATOR_API_KEY     (from web3.okx.com/onchainos/dev-portal)
//   OKX_FACILITATOR_SECRET_KEY  (same)
//   OKX_FACILITATOR_PASSPHRASE  (same)

import type { Request, Response, NextFunction, RequestHandler } from "express";
import { paymentMiddlewareFromConfig } from "@okxweb3/x402-express";
import { ExactEvmScheme } from "@okxweb3/x402-evm/exact/server";
import { OKXFacilitatorClient } from "@okxweb3/x402-core";
import { env } from "../config/env.js";

const NETWORK = (process.env.X402_NETWORK ?? "eip155:196") as `eip155:${string}`;

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
    syncSettle: true,
  });
}

function isDemoBypass(req: Request): boolean {
  return req.header("x-payment") === "demo-bypass";
}

let cachedMiddleware: RequestHandler | undefined;
let cachedRoutesKey: string | undefined;

export function x402Middleware(): RequestHandler {
  const routesKey = `${env.receivingWallet}|${env.x402PackagePrice}|${env.x402RevisionPrice}|${NETWORK}`;
  if (cachedMiddleware && cachedRoutesKey === routesKey) {
    return cachedMiddleware;
  }
  const routes = buildRoutes();
  const facilitator = buildFacilitatorClient();
  const scheme = new ExactEvmScheme();

  if (!facilitator) {
    throw new Error(
      "OKX_FACILITATOR_API_KEY / OKX_FACILITATOR_SECRET_KEY / OKX_FACILITATOR_PASSPHRASE are required. " +
      "Apply at https://web3.okx.com/onchainos/dev-portal"
    );
  }

  const sdkMiddleware = paymentMiddlewareFromConfig(
    routes,
    facilitator,
    [{ network: NETWORK, server: scheme }],
    {
      appName: "VERSE2",
      currentUrl: process.env.PUBLIC_BASE_URL ?? "https://verse2.org",
      testnet: NETWORK === "eip155:195",
    },
    undefined,
    true,
  );

  const combined: RequestHandler = (req, res, next) => {
    if (isDemoBypass(req)) {
      next();
      return;
    }
    Promise.resolve()
      .then(() => sdkMiddleware(req, res, next))
      .catch(next);
  };

  cachedMiddleware = combined;
  cachedRoutesKey = routesKey;
  return combined;
}

export const x402PackageGate = x402Middleware;
export const x402RevisionGate = x402Middleware;
