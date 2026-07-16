// x402 v2 middleware for VERSE2 — Music Video Creative Director.
//
// Uses the official OKX Payment SDK (paymentMiddlewareFromConfig) with
// a real OKXFacilitatorClient (HMAC-SHA256 signed requests against
// https://web3.okx.com/api/v6/pay/x402/*).
//
// On unpaid requests the SDK returns a standard 402 challenge in the
// OKX x402 v2 spec format (per /onchainos/dev-docs/okxai/howtomcp).
// On paid requests the SDK verifies the X-PAYMENT / PAYMENT-SIGNATURE
// header by calling the OKX facilitator's /verify endpoint, then
// forwards the request to the route handler which delivers the
// resource.
//
// If OKX_FACILITATOR_API_KEY / OKX_FACILITATOR_SECRET_KEY /
// OKX_FACILITATOR_PASSPHRASE are missing, the SDK cannot be initialized
// and the service refuses to start — the seller must provide valid OKX
// facilitator credentials.

import type { Request, Response, NextFunction, RequestHandler } from "express";
import { paymentMiddlewareFromConfig } from "@okxweb3/x402-express";
import { ExactEvmScheme } from "@okxweb3/x402-evm/exact/server";
import { OKXFacilitatorClient } from "@okxweb3/x402-core";
import { env } from "../config/env.js";

const NETWORK = (process.env.X402_NETWORK ?? "eip155:196") as `eip155:${string}`;

function buildRoutes() {
  if (!env.receivingWallet) {
    throw new Error("RECEIVING_WALLET_ADDRESS is not set — cannot build x402 routes");
  }
  return {
    "POST /v1/package": {
      accepts: {
        scheme: "exact" as const,
        price: `$${env.x402PackagePrice.toFixed(2)}`,
        network: NETWORK,
        payTo: env.receivingWallet,
        maxTimeoutSeconds: 300,
      },
      description: "VERSE2 — full music video pre-production package",
    },
    "POST /v1/jobs/:id/revise": {
      accepts: {
        scheme: "exact" as const,
        price: `$${env.x402RevisionPrice.toFixed(2)}`,
        network: NETWORK,
        payTo: env.receivingWallet,
        maxTimeoutSeconds: 300,
      },
      description: "VERSE2 — revision of an existing music video package",
    },
  };
}

function buildFacilitatorClient(): OKXFacilitatorClient {
  const apiKey = process.env.OKX_FACILITATOR_API_KEY;
  const secretKey = process.env.OKX_FACILITATOR_SECRET_KEY;
  const passphrase = process.env.OKX_FACILITATOR_PASSPHRASE;
  if (!apiKey || !secretKey || !passphrase) {
    throw new Error(
      "OKX_FACILITATOR_API_KEY / OKX_FACILITATOR_SECRET_KEY / OKX_FACILITATOR_PASSPHRASE are required. " +
      "Apply at https://web3.okx.com/onchainos/dev-portal to obtain them."
    );
  }
  return new OKXFacilitatorClient({
    apiKey,
    secretKey,
    passphrase,
    baseUrl: process.env.OKX_FACILITATOR_BASE_URL ?? "https://web3.okx.com",
    syncSettle: true,
  });
}

let cachedMiddleware: RequestHandler | undefined;
let cachedRoutesKey: string | undefined;

export function x402Middleware(): RequestHandler {
  const routesKey = `${env.receivingWallet}|${env.x402PackagePrice}|${env.x402RevisionPrice}|${NETWORK}|${process.env.OKX_FACILITATOR_API_KEY ?? "none"}`;
  if (cachedMiddleware && cachedRoutesKey === routesKey) {
    return cachedMiddleware;
  }
  const routes = buildRoutes();
  const facilitator = buildFacilitatorClient();
  const scheme = new ExactEvmScheme();
  cachedMiddleware = paymentMiddlewareFromConfig(
    routes,
    facilitator,
    [{ network: NETWORK, server: scheme }],
    {
      appName: "VERSE2",
      currentUrl: process.env.PUBLIC_BASE_URL ?? "https://verse2.org",
      testnet: NETWORK === "eip155:195",
    },
    undefined,
    false, // don't block startup on facilitator connectivity
  );
  cachedRoutesKey = routesKey;
  return cachedMiddleware;
}

export const x402PackageGate = x402Middleware;
export const x402RevisionGate = x402Middleware;
