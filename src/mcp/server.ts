// MCP-over-HTTP server for VERSE2.
//
// Exposes 1 MCP tool: `create_music_video_package`
//   - Input:  { audio_url, interview, budget_cap? }
//   - Output: { job_id, concepts[], cost, files }
//
// The /mcp endpoint is the entry point for the OKX.AI marketplace
// (A2MCP transport). initialize + tools/list are free (handshake);
// tools/call requires x402 payment via the OKX Agent Payments Protocol.
//
// Per the OKX.AI marketplace requirement, each POST /mcp is
// independent: no session state is kept between requests. We build
// a fresh server + WebStandardStreamableHTTPServerTransport per
// request with `sessionIdGenerator: undefined` (stateless mode)
// and `enableJsonResponse: true` (so the marketplace reviewer gets
// plain JSON, not SSE).

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runPackage } from "../services/orchestrator.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "verse2",
    version: "0.1.0",
  });

  // ─── Tool: create_music_video_package ───────────────────────
  // Returns a 3-concept pre-production package (treatment, shot list,
  // schedule) for a music video. Fuses audio analysis (librosa via the
  // Python sidecar) with an LLM creative director. The package is
  // pay-per-call in USDT0 on X Layer via x402.
  server.tool(
    "create_music_video_package",
    "Generate a complete music video pre-production package. Takes an audio URL and a short interview (genre / mood / budget / cap), runs librosa BPM/energy analysis on the track, then synthesises 3 distinct visual concepts with shot lists, treatment, schedule, and a budget that auto-fits your cap. Returns job_id + 3 concepts + cost + file URLs. Pay-per-call in USDT0 on X Layer via x402.",
    {
      audio_url: z
        .string()
        .url()
        .describe("Public HTTPS URL to the audio file (mp3/wav). Must be reachable by the server."),
      interview: z
        .object({
          track_genre: z.string().optional().describe("Track genre (e.g. 'afrobeats', 'trap')"),
          visual_mood: z.string().optional().describe("Visual mood (e.g. 'Lagos at dawn', 'cyberpunk neon')"),
          budget_currency: z.string().optional().describe("Currency code, default 'USD'"),
          budget_cap: z.number().positive().optional().describe("Hard cap on treatment cost, in budget_currency"),
          artist_name: z.string().optional().describe("Artist / brand name to anchor the treatment"),
        })
        .optional()
        .describe("Short interview fields that steer the creative direction."),
      selected_concept_index: z
        .number()
        .int()
        .min(0)
        .max(2)
        .optional()
        .describe("If you already picked a concept from a previous call, pass its index to get a deeper package."),
    },
    async ({ audio_url, interview, selected_concept_index }) => {
      logger.info(
        { tool: "create_music_video_package", audio_url, hasInterview: !!interview },
        "MCP tool called",
      );
      try {
        const result = await runPackage({
          audio_url,
          interview: (interview as Record<string, unknown>) ?? {},
          selected_concept_index,
          budget_cap:
            typeof interview?.budget_cap === "number" ? interview.budget_cap : undefined,
          optimize: true,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        logger.error({ err, tool: "create_music_video_package" }, "Tool failed");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: String(err),
                proceed: false,
                recommendation: "BLOCK: Tool failure — the LLM or audio analyser returned an error.",
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  return server;
}

/**
 * Handle a single HTTP request as a stateless MCP-over-HTTP call.
 * Returns the parsed JSON-RPC response (or a wrapper with `raw` if
 * the transport returns non-JSON).
 */
export async function handleMcpHttpRequest(body: unknown): Promise<unknown> {
  const server = createMcpServer();
  const { WebStandardStreamableHTTPServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
  );

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true, // marketplace wants plain JSON
  });

  await server.connect(
    transport as unknown as Parameters<typeof server.connect>[0],
  );

  // The transport needs a Web Request with the right Accept header.
  const request = new Request("https://verse2.org/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(body),
  });

  const response = await transport.handleRequest(request);
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
