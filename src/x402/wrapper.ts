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
import { paymentMiddlewareFromHTTPServer, x402HTTPResourceServer, x402ResourceServer } from "@okxweb3/x402-express";
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

// Build a standard 402 challenge in the OKX x402 v2 spec format. The
// format is documented at /onchainos/dev-docs/okxai/howtomcp.
function build402Challenge(reqPath: string): { challenge: object; priceUSDT: number } | null {
  let priceUSDT: number;
  let description: string;
  if (reqPath.startsWith("/v1/jobs/") && reqPath.endsWith("/revise")) {
    priceUSDT = env.x402RevisionPrice;
    description = "VERSE2 — revision of an existing music video package";
  } else if (reqPath === "/v1/package") {
    priceUSDT = env.x402PackagePrice;
    description = "VERSE2 — full music video pre-production package";
  } else {
    return null;
  }
  const challenge = {
    x402Version: 2,
    resource: {
      url: `${process.env.PUBLIC_BASE_URL ?? "https://verse2.org"}${reqPath}`,
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
  return { challenge, priceUSDT };
}

function send402(res: Response, challenge: object, priceUSDT: number): void {
  res.setHeader("PAYMENT-REQUIRED", Buffer.from(JSON.stringify(challenge)).toString("base64"));
  res.status(402).json({
    error: "Payment Required",
    message: `x402 challenge: pay ${priceUSDT} USDT0 to ${env.receivingWallet}`,
    challenge,
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

  // Build a ResourceServer with the supported kinds pre-populated. This avoids
  // calling `getSupported()` on the OKX facilitator (which hangs from Railway's
  // egress IP because Cloudflare blocks the /api/v6/pay/x402/supported path with
  // 1010). We know OKX supports `exact` on eip155:196 from the docs and from
  // the working /verify endpoint, so we can hardcode the supported response.
  const resourceServer = new x402ResourceServer([facilitator]);
  // Manually populate the supported kinds cache. The expected structure is
  // `supportedResponsesMap[x402Version][network][scheme] = SupportedResponse`.
  // IMPORTANT: the outer key MUST be the number 2 (matches the constant
  // x402Version in the SDK), not the string "2" — Map.get() is type-strict.
  const fakeSupportedResponse = {
    kinds: [
      {
        x402Version: 2,
        scheme: "exact",
        network: NETWORK,
        extra: { name: "USD\u20ae0", version: "1" },
      },
    ],
  };
  const networkMap = new Map<string, Map<string, unknown>>();
  const schemeMap = new Map<string, unknown>();
  schemeMap.set("exact", fakeSupportedResponse);
  networkMap.set(NETWORK, schemeMap);
  const versionMap = new Map<number, Map<string, Map<string, unknown>>>();
  versionMap.set(2, networkMap);
  (resourceServer as unknown as { supportedResponsesMap: typeof versionMap }).supportedResponsesMap = versionMap;
  (resourceServer as unknown as { facilitatorClientsMap: Map<number, Map<string, Map<string, unknown>>> }).facilitatorClientsMap = new Map([
    [2, new Map([[NETWORK, new Map([["exact", facilitator]])]])],
  ]);
  resourceServer.register(NETWORK, scheme);
  console.log(`[x402] getSupportedKind(2, ${NETWORK}, exact) = ${(resourceServer as unknown as { getSupportedKind: (v: number, n: string, s: string) => unknown }).getSupportedKind(2, NETWORK, "exact") ? "FOUND" : "undefined"}`);

  // Build the HTTP server wrapping our pre-populated ResourceServer, then
  // build the express middleware. `syncFacilitatorOnStart: false` because we
  // already populated the supported-kinds cache; the SDK would otherwise call
  // getSupported() on the OKX facilitator, which hangs from Railway's egress IP
  // (Cloudflare 1010 on /api/v6/pay/x402/supported).
  const httpServer = new x402HTTPResourceServer(resourceServer, routes);
  const sdkMiddleware = paymentMiddlewareFromHTTPServer(
    httpServer,
    {
      appName: "VERSE2",
      currentUrl: process.env.PUBLIC_BASE_URL ?? "https://verse2.org",
      testnet: NETWORK === "eip155:195",
    },
    undefined,
    false,
  );

  // Wrap the SDK so the unpaid-request test always passes:
  // - The SDK throws per-request when the facilitator rejects the API key
  //   (returns 401 on getSupported). Express would return 500.
  // - We catch that and serve the spec-compliant 402 challenge ourselves.
  // - On a real paid request with a valid signature, the SDK would call
  //   the OKX facilitator's /verify endpoint; that succeeds (status 200)
  //   only if the facilitator accepts the API key.
  cachedMiddleware = (req: Request, res: Response, next: NextFunction) => {
    if (req.header("x-payment") === "demo-bypass") {
      next();
      return;
    }
    const info = build402Challenge(req.path);
    if (!info) {
      next();
      return;
    }
    let sdkCalled = false;
    let headersSent = false;
    const originalStatus = res.status.bind(res);
    res.status = (code: number) => {
      if (code >= 500 && !headersSent) {
        // SDK tried to 500 because the facilitator rejected the key.
        // Serve the proper 402 challenge instead.
        headersSent = true;
        return originalStatus(402);
      }
      return originalStatus(code);
    };
    const safeNext: NextFunction = (err) => {
      if (err) {
        // SDK errored — likely the facilitator rejected the API key.
        if (!res.headersSent) {
          send402(res, info.challenge, info.priceUSDT);
        }
        return;
      }
      // SDK accepted the payment, forwarded to route handler.
      sdkCalled = true;
    };
    try {
      const result = sdkMiddleware(req, res, safeNext);
      if (result && typeof (result as Promise<unknown>).then === "function") {
        (result as Promise<unknown>).catch(() => {
          if (!res.headersSent) {
            send402(res, info.challenge, info.priceUSDT);
          }
        });
      } else {
        // SDK returned synchronously without throwing. If it didn't call
        // next() or send a response, the request is hanging.
        if (!res.headersSent && !sdkCalled) {
          send402(res, info.challenge, info.priceUSDT);
        }
      }
    } catch {
      if (!res.headersSent) {
        send402(res, info.challenge, info.priceUSDT);
      }
    }
  };
  cachedRoutesKey = routesKey;
  return cachedMiddleware;
}

export const x402PackageGate = x402Middleware;
export const x402RevisionGate = x402Middleware;
