// src/mcp/http.ts
// MCP-over-HTTP handler for VERSE2.
//
// Payment flow (single source of truth):
//   1. The OKX SDK middleware (mounted in server.ts) handles 402 challenges
//      and PAYMENT-SIGNATURE verification BEFORE this handler runs.
//   2. If the request has a valid payment, this handler runs the MCP logic.
//   3. The handler NEVER builds a 402 challenge, NEVER sets PAYMENT-REQUIRED
//      directly, and NEVER verifies signatures manually.

import type { Request, Response } from "express";
import { handleMcpHttpRequest } from "./server.js";
import { runPackage } from "../services/orchestrator.js";
import { runLitePackage } from "../services/lite.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: unknown;
  method?: string;
  params?: unknown;
}

async function handleToolCall(
  body: JsonRpcRequest,
): Promise<{ status: number; payload: unknown }> {
  const params = (body.params ?? {}) as {
    name?: string;
    arguments?: Record<string, unknown>;
  };
  if (params.name !== "create_music_video_package") {
    return {
      status: 200,
      payload: {
        jsonrpc: "2.0",
        id: body.id,
        error: { code: -32602, message: `Unknown tool: ${params.name}` },
      },
    };
  }

  const args = (params.arguments ?? {}) as {
    audio_url?: string;
    interview?: Record<string, unknown>;
    selected_concept_index?: number;
  };
  if (typeof args.audio_url !== "string" || args.audio_url.length === 0) {
    return {
      status: 200,
      payload: {
        jsonrpc: "2.0",
        id: body.id,
        error: { code: -32602, message: "audio_url is required" },
      },
    };
  }

  // Respond INSTANTLY (<1s) with status=processing. The marketplace UI
  // has a very short timeout (~5-10s). The package runs in the background.
  const jobId = `JOB-${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const startedAt = new Date().toISOString();
  const mode = (args as Record<string, unknown>).mode === "full" ? "full" : "lite";

  setImmediate(() => {
    const promise =
      mode === "full"
        ? runPackage({
            audio_url: args.audio_url!,
            interview: args.interview ?? {},
            selected_concept_index: args.selected_concept_index,
            budget_cap:
              typeof args.interview?.budget_cap === "number"
                ? (args.interview.budget_cap as number)
                : undefined,
            optimize: true,
          })
        : runLitePackage({
            audio_url: args.audio_url!,
            interview: args.interview ?? {},
          });
    promise
      .then((r) => {
        logger.info({ jobId, mode, result: r ? "ok" : "empty" }, "background package done");
      })
      .catch((e) => {
        logger.error({ jobId, mode, err: e instanceof Error ? e.message : e }, "background package failed");
      });
  });

  return {
    status: 200,
    payload: {
      jsonrpc: "2.0",
      id: body.id,
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "processing",
                message: "Package build queued. Result is typically available in 15-20 seconds. Poll for completion via the jobId.",
                jobId,
                audio_url: args.audio_url,
                startedAt,
              },
              null,
              2,
            ),
          },
        ],
      },
    },
  };
}

/**
 * MCP-over-HTTP handler. Payment has already been verified by the SDK
 * middleware before this handler runs.
 */
export async function handleMcpRequest(
  req: Request,
  res: Response,
): Promise<void> {
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

  // For tools/call, handle inline with the package logic (lite by default)
  if (body.method === "tools/call") {
    const { status, payload } = await handleToolCall(body);
    res.status(status).json(payload);
    return;
  }

  // For all other methods (initialize, tools/list, ping, etc.) pass through
  // to the MCP server transport.
  try {
    const result = await handleMcpHttpRequest(body);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({
      jsonrpc: "2.0",
      id: body.id,
      error: {
        code: -32603,
        message: err instanceof Error ? err.message : String(err),
      },
    });
  }
}
