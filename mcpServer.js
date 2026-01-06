#!/usr/bin/env node

import dotenv from "dotenv";
import express from "express";
import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
    CallToolRequestSchema,
    ErrorCode,
    isInitializeRequest,
    ListToolsRequestSchema,
    McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { discoverTools } from "./lib/tools.js";

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, ".env") });

const SERVER_NAME = "ucode";

function buildInstructions(toolsForInstructions) {
    return [
        "ucode MCP server.",
        "",
        "Tools (JSON):",
        JSON.stringify(toolsForInstructions, null, 2),
        "",
        "Note: the canonical method to fetch tools is `tools/list`.",
    ].join("\n");
}

async function transformTools(tools) {
    return tools
        .map((tool) => {
            const definitionFunction = tool.definition?.function;
            if (!definitionFunction) return;
            return {
                name: definitionFunction.name,
                description: definitionFunction.description,
                inputSchema: definitionFunction.parameters,
            };
        })
        .filter(Boolean);
}

async function setupServerHandlers(server, tools) {
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: await transformTools(tools),
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const toolName = request.params?.name;
        const tool = tools.find((t) => {
            return t?.definition && t.definition.function && t.definition.function.name === toolName;
        });

        if (!tool) {
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
        }

        const args = request.params?.arguments || {};
        const requiredParameters =
            (tool.definition &&
                tool.definition.function &&
                tool.definition.function.parameters &&
                tool.definition.function.parameters.required) ||
            [];

        for (const requiredParameter of requiredParameters) {
            if (!(requiredParameter in args)) {
                throw new McpError(
                    ErrorCode.InvalidParams,
                    `Missing required parameter: ${requiredParameter}`
                );
            }
        }

        try {
            // <<< FIX FOR TIMEOUT (ЕДИНСТВЕННОЕ ИЗМЕНЕНИЕ)
            // запускаем tool в фоне, НЕ ждём выполнения
            Promise.resolve()
                .then(() => {
                    console.log("[MCP] Tool started:", toolName);
                    return tool.function(args);
                })
                .then(() => {
                    console.log("[MCP] Tool finished:", toolName);
                })
                .catch((error) => {
                    console.error("[MCP] Tool error:", error);
                });

            // MCP отвечает сразу → Cloudflare не ждёт
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                status: "started",
                                tool: toolName,
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error) {
            console.error("[Error] Failed to start tool:", error);
            throw new McpError(
                ErrorCode.InternalError,
                `API error: ${error?.message || String(error)}`
            );
        }
    });
}

async function run() {
    console.log("[MCP Server] Starting...");
    const args = process.argv.slice(2);
    const isSSE = args.includes("--sse");
    const tools = await discoverTools();
    const transformedTools = await transformTools(tools);
    const instructions = buildInstructions(transformedTools);

    if (isSSE) {
        const app = express();
        app.use(express.json());

        app.get("/health", (_req, res) => {
            res.status(200).json({ status: "ok", server: SERVER_NAME });
        });

        const transports = {};
        const servers = {};
        const httpTransports = {};
        const httpServers = {};

        app.all("/mcp", async (req, res) => {
            try {
                console.log("[MCP] /mcp incoming", {
                    time: new Date().toISOString(),
                    method: req.method,
                    mcpSessionId: req.headers["mcp-session-id"],
                    bodyMethod: req.body && req.body.method,
                });

                const sessionId = req.headers["mcp-session-id"];
                let transport = sessionId ? httpTransports[sessionId] : undefined;
                let server = sessionId ? httpServers[sessionId] : undefined;

                if (!transport || !server) {
                    if (!sessionId && req.method === "POST" && isInitializeRequest(req.body)) {
                        server = new Server(
                            { name: SERVER_NAME, version: "0.1.1" },
                            { capabilities: { tools: {} }, instructions }
                        );

                        server.onerror = (error) =>
                            console.error("[Server.onerror]", error?.stack || error);

                        await setupServerHandlers(server, tools);

                        transport = new StreamableHTTPServerTransport({
                            sessionIdGenerator: () => randomUUID(),
                            onsessioninitialized: (sid) => {
                                httpTransports[sid] = transport;
                                httpServers[sid] = server;
                            },
                        });

                        transport.onclose = () => {
                            const sid = transport.sessionId;
                            delete httpTransports[sid];
                            httpServers[sid]?.close();
                            delete httpServers[sid];
                        };

                        await server.connect(transport);
                    } else {
                        res.status(400).json({ error: "No valid MCP session" });
                        return;
                    }
                }

                await transport.handleRequest(req, res, req.body);
            } catch (error) {
                console.error("[MCP] /mcp error:", error);
                if (!res.headersSent) {
                    res.status(500).json({ error: "Internal error" });
                }
            }
        });

        const port = process.env.PORT || 3001;
        const httpServer = app.listen(port, () => {
            console.log(`[SSE Server] running on port ${port}`);
        });

        httpServer.timeout = 0;
        httpServer.keepAliveTimeout = 0;
        httpServer.headersTimeout = 0;
    } else {
        const server = new Server(
            { name: SERVER_NAME, version: "0.1.1" },
            { capabilities: { tools: {} }, instructions }
        );

        server.onerror = (error) =>
            console.error("[Error][Stdio]", error && (error.stack || error));

        await setupServerHandlers(server, tools);

        process.on("SIGINT", async () => {
            await server.close();
            process.exit(0);
        });

        const transport = new StdioServerTransport();
        await server.connect(transport);
    }
}

run().catch(console.error);
