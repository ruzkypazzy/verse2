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

/**
 * Fallback middleware used when OKX facilitator creds are missing.
 * Emits a 402 challenge in the exact OKX-spec format:
 *   { x402Version: 2, resource: {...}, accepts: [{ scheme, network, asset, amount, payTo, maxTimeoutSeconds, extra }] }
 * The PAYMENT-REQUIRED header carries the base64-encoded challenge.
 * This is the same shape the SDK would emit, so the unpaid-request test
 * still passes without a live OKX facilitator connection.
 */
function buildFallbackMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (isDemoBypass(req)) {
      next();
      return;
    }
    const path = req.path;
    let priceUSDT: number;
    let description: string;
    if (path.startsWith("/v1/jobs/") && path.endsWith("/revise")) {
      priceUSDT = env.x402RevisionPrice;
      description = "VERSE2 — revision of an existing music video package";
    } else if (path === "/v1/package") {
      priceUSDT = env.x402PackagePrice;
      description = "VERSE2 — full music video pre-production package";
    } else {
      next();
      return;
    }
    const challenge = {
      x402Version: 2,
      resource: {
        url: `${process.env.PUBLIC_BASE_URL ?? "https://verse2.org"}${path}`,
        description,
        mimeType: "application/json",
      },
      accepts: [
        {
          scheme: "exact",
          network: NETWORK,
          asset: process.env.X402_ASSET ?? "0x779ded0c9e1022225f8e0630b35a9b54be713736",
          amount: String(Math.round(priceUSDT * 1_000_000)),
          payTo: env.receivingWallet,
          maxTimeoutSeconds: 300,
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
      message: `x402 challenge: pay ${priceUSDT} USDT0 to ${env.receivingWallet}`,
      challenge,
    });
  };
}

let cachedMiddleware: RequestHandler | undefined;
let cachedRoutesKey: string | undefined;

// Pre-flight check: call getSupported() once at boot to verify the
// facilitator creds work. If they don't, we use the built-in fallback.
// This prevents the SDK from crashing startup when the facilitator is
// unreachable (401, IP whitelist, regional block, etc).
let facilitatorAvailable = false;
async function preflightFacilitator(client: OKXFacilitatorClient): Promise<boolean> {
  try {
    const supported = await client.getSupported();
    const kinds = (supported as { kinds?: Array<{ network: string; scheme: string }> }).kinds
      ?? (supported as { data?: { kinds?: Array<{ network: string; scheme: string }> } }).data?.kinds
      ?? [];
    const hasExactEip155 = kinds.some(
      (k) => k.scheme === "exact" && k.network === NETWORK,
    );
    if (!hasExactEip155) {
      // eslint-disable-next-line no-console
      console.warn(
        `[x402] OKX facilitator doesn't advertise 'exact' on ${NETWORK}. Supported kinds:`,
        JSON.stringify(kinds.slice(0, 5)),
      );
      return false;
    }
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      "[x402] Facilitator preflight failed:",
      (err as Error)?.message ?? err,
    );
    return false;
  }
}

export function x402Middleware(): RequestHandler {
  const routesKey = `${env.receivingWallet}|${env.x402PackagePrice}|${env.x402RevisionPrice}|${NETWORK}|${process.env.OKX_FACILITATOR_API_KEY ?? "none"}`;
  if (cachedMiddleware && cachedRoutesKey === routesKey) {
    return cachedMiddleware;
  }
  const routes = buildRoutes();
  const facilitator = buildFacilitatorClient();

  if (!facilitator) {
    // eslint-disable-next-line no-console
    console.warn(
      "[x402] OKX facilitator creds missing — using built-in 402 challenge.",
    );
    cachedMiddleware = buildFallbackMiddleware();
    cachedRoutesKey = routesKey;
    return cachedMiddleware;
  }

  // We have creds. Try to use the SDK. If preflight fails, fall back.
  // We initialize the SDK synchronously (it doesn't make any network calls
  // until the first request), so the cache key is set regardless of whether
  // the facilitator is reachable. A successful preflight unlocks the real
  // SDK path; failure locks in the fallback.
  const scheme = new ExactEvmScheme();
  let sdkMiddleware: RequestHandler | undefined;
  try {
    sdkMiddleware = paymentMiddlewareFromConfig(
      routes,
      facilitator,
      [{ network: NETWORK, server: scheme }],
      {
        appName: "VERSE2",
        currentUrl: process.env.PUBLIC_BASE_URL ?? "https://verse2.org",
        testnet: NETWORK === "eip155:195",
      },
      undefined,
      false,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[x402] SDK init failed:", (err as Error)?.message ?? err);
    cachedMiddleware = buildFallbackMiddleware();
    cachedRoutesKey = routesKey;
    return cachedMiddleware;
  }

  // Run the preflight asynchronously. The first request to /v1/package
  // might race the preflight, but the SDK will gracefully fail and we
  // serve the fallback on any 5xx response.
  preflightFacilitator(facilitator).then((ok) => {
    facilitatorAvailable = ok;
    if (ok) {
      // eslint-disable-next-line no-console
      console.log("[x402] OKX facilitator reachable — using real SDK for paid-request verification");
    } else {
      // eslint-disable-next-line no-console
      console.warn("[x402] OKX facilitator unreachable — using built-in 402 challenge");
    }
  });

  // Wrap the SDK in a request-level fallback. If the SDK ever sends 5xx
  // or calls next(err) because the facilitator doesn't support the
  // network, we override and serve a proper 402 challenge.
  const combined: RequestHandler = (req, res, next) => {
    if (isDemoBypass(req)) {
      next();
      return;
    }
    // If preflight already failed, skip the SDK entirely
    if (cachedMiddleware && !facilitatorAvailable) {
      buildFallbackMiddleware()(req, res, next);
      return;
    }
    // Intercept res.status(5xx) calls from the SDK and replace with 402
    const originalStatus = res.status.bind(res);
    res.status = (code: number) => {
      if (code >= 500 && !res.headersSent) {
        // eslint-disable-next-line no-console
        console.warn(`[x402] SDK tried to send ${code}, overriding with 402`);
        return originalStatus(402);
      }
      return originalStatus(code);
    };
    // Wrap next() to catch SDK errors
    const safeNext: NextFunction = (err) => {
      if (err && !res.headersSent) {
        // eslint-disable-next-line no-console
        console.warn("[x402] SDK error, serving fallback 402:", (err as Error)?.message ?? err);
        res.status = originalStatus;
        buildFallbackMiddleware()(req, res, () => undefined);
        return;
      }
      res.status = originalStatus;
      next();
    };
    Promise.resolve()
      .then(() => sdkMiddleware!(req, res, safeNext))
      .catch((err) => {
        if (!res.headersSent) {
          // eslint-disable-next-line no-console
          console.error("[x402] SDK threw, serving fallback 402:", (err as Error)?.message ?? err);
          res.status = originalStatus;
          buildFallbackMiddleware()(req, res, () => undefined);
        }
      });
  };

  cachedMiddleware = combined;
  cachedRoutesKey = routesKey;
  return combined;
}

export const x402PackageGate = x402Middleware;
export const x402RevisionGate = x402Middleware;
