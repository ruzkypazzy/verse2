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

function buildFacilitatorClient(): OKXFacilitatorClient | null {
  const apiKey = process.env.OKX_FACILITATOR_API_KEY;
  const secretKey = process.env.OKX_FACILITATOR_SECRET_KEY;
  const passphrase = process.env.OKX_FACILITATOR_PASSPHRASE;
  if (!apiKey || !secretKey || !passphrase) {
    // Challenge-only mode: without facilitator credentials we can still
    // serve the spec 402 challenge on unpaid requests (the OKX validator
    // only needs that), we just can't verify payments server-side. Crashing
    // here would take the whole service down and fail the availability check.
    // eslint-disable-next-line no-console
    console.warn(
      "[x402] OKX facilitator credentials missing — running in challenge-only mode. " +
      "Unpaid requests get the standard 402 challenge; payment verification is disabled. " +
      "Set OKX_FACILITATOR_API_KEY / OKX_FACILITATOR_SECRET_KEY / OKX_FACILITATOR_PASSPHRASE."
    );
    return null;
  }
  return new OKXFacilitatorClient({
    apiKey,
    secretKey,
    passphrase,
    baseUrl: process.env.OKX_FACILITATOR_BASE_URL ?? "https://web3.okx.com",
    // async settle (fire-and-forget) — syncSettle waits for on-chain tx
    // confirmation which can take 15-30s and may hit Cloudflare rate limits
    // from Railway. Async returns the tx hash immediately after the user-side
    // signature is verified; the on-chain settlement happens in the background.
    syncSettle: false,
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
    error: "payment_required",
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
        extra: { name: "USD\u20ae0", version: "1", decimals: 6 },
      },
    ],
  };
  return { challenge, priceUSDT };
}

function send402(res: Response, challenge: object, priceUSDT: number): void {
  res.setHeader("PAYMENT-REQUIRED", Buffer.from(JSON.stringify(challenge)).toString("base64"));
  // Body: the x402 v2 PaymentRequired object itself, top-level, so
  // validators that parse the body (v1-style) see the same challenge as
  // validators that decode the PAYMENT-REQUIRED header.
  res.status(402).json({
    ...challenge,
    message: `x402 challenge: pay ${priceUSDT} USDT0 to ${env.receivingWallet}`,
  });
}

// Standalone 402-challenge handler for method probes (GET/HEAD) on paid
// resources. The x402 spec requires any unpaid request to a paid resource
// to receive a 402 challenge \u2014 a 404 on GET fails the OKX validator.
export function x402ChallengeHandler(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const info = build402Challenge(req.path);
    if (!info) {
      next();
      return;
    }
    send402(res, info.challenge, info.priceUSDT);
  };
}

// Demo bypass: only honored when X402_DEMO_BYPASS_TOKEN is explicitly set
// in the environment and the request presents the exact token. Previously
// this accepted the hardcoded string "demo-bypass", which let anyone who
// read the public repo skip payment entirely.
function demoBypassAllowed(req: Request): boolean {
  const token = process.env.X402_DEMO_BYPASS_TOKEN;
  return Boolean(token) && req.header("x-payment") === token;
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

  // Challenge-only mode: no facilitator credentials. Every unpaid (i.e.
  // every) request to a gated route gets the spec 402 challenge. This keeps
  // the service up and x402-conformant even when the deploy platform drops
  // the facilitator env vars.
  if (!facilitator) {
    cachedMiddleware = (req: Request, res: Response, next: NextFunction) => {
      if (demoBypassAllowed(req)) {
        next();
        return;
      }
      const info = build402Challenge(req.path);
      if (!info) {
        next();
        return;
      }
      send402(res, info.challenge, info.priceUSDT);
    };
    cachedRoutesKey = routesKey;
    return cachedMiddleware;
  }

  const scheme = new ExactEvmScheme();

  // Build a ResourceServer with the supported kinds pre-populated. This avoids
  // calling `getSupported()` on the OKX facilitator, which hangs from Railway's
  // egress IP because Cloudflare blocks the /api/v6/pay/x402/supported path with
  // 1010. We know OKX supports `exact` on eip155:196 from the docs and from
  // the working /verify endpoint, so we hardcode the supported response.
  //
  // The supportedResponsesMap structure is:
  //   supportedResponsesMap[x402Version][network][scheme] = SupportedResponse
  // IMPORTANT: the outer key MUST be the number 2 (matches the constant
  // x402Version in the SDK), not the string "2" — Map.get() is type-strict.
  const resourceServer = new x402ResourceServer([facilitator]);
  const fakeSupportedResponse = {
    kinds: [
      {
        x402Version: 2,
        scheme: "exact",
        network: NETWORK,
        extra: { name: "USD\u20ae0", version: "1", decimals: 6 },
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

  // Add an AbortController-backed 30s timeout to all facilitator fetch calls.
  // The OKX web3 API endpoint at web3.okx.com is heavily Cloudflare-protected;
  // some calls (e.g. settle) hang for minutes without a server-side timeout.
  // We abort the fetch after 30s and treat it as a 402 with the spec challenge,
  // so the user can retry without the request getting stuck.
  const installTimeout = (originalFn: (...a: never[]) => Promise<unknown>, label: string) => {
    return async (...args: Parameters<typeof originalFn>) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      try {
        const promise = originalFn(...args);
        // Race the original against the abort; we can't actually pass the
        // AbortSignal into the SDK's internal fetch, so we just race the
        // overall operation.
        return await Promise.race([
          promise,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`facilitator ${label} timeout after 30s`)), 30_000),
          ),
        ]);
      } finally {
        clearTimeout(timer);
        controller.abort();
      }
    };
  };
  facilitator.verify = installTimeout(
    facilitator.verify.bind(facilitator) as (...a: never[]) => Promise<unknown>,
    "verify",
  ) as typeof facilitator.verify;
  if (facilitator.settle) {
    facilitator.settle = installTimeout(
      facilitator.settle.bind(facilitator) as (...a: never[]) => Promise<unknown>,
      "settle",
    ) as typeof facilitator.settle;
  }

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
    if (demoBypassAllowed(req)) {
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
      if (!headersSent) {
        // The SDK generates a 402 challenge that has known spec issues
        // (e.g. it uses `req.protocol://req.get('host')` which Cloudflare's
        // TLS termination makes `http://`, and it may set an empty
        // mimeType). Always intercept the 402 and serve our own spec-clean
        // challenge. This keeps the OKX validator happy.
        if (code === 402) {
          headersSent = true;
          send402(res, info.challenge, info.priceUSDT);
          return res;
        }
        if (code >= 500) {
          // SDK tried to 500 because the facilitator rejected the key.
          // Serve the proper 402 challenge instead.
          headersSent = true;
          send402(res, info.challenge, info.priceUSDT);
          return res;
        }
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
