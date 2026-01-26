#!/usr/bin/env node

import dotenv from "dotenv";
import express from "express";
import {randomUUID} from "node:crypto";
import {Server} from "@modelcontextprotocol/sdk/server/index.js";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import {SSEServerTransport} from "@modelcontextprotocol/sdk/server/sse.js";
import {StreamableHTTPServerTransport} from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
    CallToolRequestSchema,
    ErrorCode,
    isInitializeRequest,
    ListToolsRequestSchema,
    McpError,
} from "@modelcontextprotocol/sdk/types.js";
import {discoverTools} from "./lib/tools.js";

import path from "path";
import {fileURLToPath} from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({path: path.resolve(__dirname, ".env")});

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
        const requiredParameters = (tool.definition && tool.definition.function && tool.definition.function.parameters && tool.definition.function.parameters.required) || [];
        for (const requiredParameter of requiredParameters) {
            if (!(requiredParameter in args)) {
                throw new McpError(
                    ErrorCode.InvalidParams,
                    `Missing required parameter: ${requiredParameter}`
                );
            }
        }
        try {
            // <<<< ADDED: log incoming tool call for diagnostics
            // console.log(`[MCP] CallTool request -> name: ${toolName}, args keys: ${Object.keys(args).join(",")}`);

            const result = await tool.function(args);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(result, null, 2),
                    },
                ],
            };
        } catch (error) {
            console.error("[Error] Failed to fetch data:", error);
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

        // <<<< ADDED: health check for origin availability
        app.get("/health", (_req, res) => {
            res.status(200).json({status: "ok", server: SERVER_NAME});
        });

        const transports = {};
        const servers = {};
        const httpTransports = {};
        const httpServers = {};

        app.all("/mcp", async (req, res) => {
            try {
                // <<<< ADDED: logging incoming request headers and body method
                console.log("[MCP] /mcp incoming", {
                    time: new Date().toISOString(),
                    method: req.method,
                    mcpSessionId: req.headers["mcp-session-id"],
                    remoteAddr: req.ip || req.connection.remoteAddress,
                    bodyMethod: req.body && req.body.method,
                });

                const sessionId = req.headers["mcp-session-id"];
                let transport = sessionId ? httpTransports[sessionId] : undefined;
                let server = sessionId ? httpServers[sessionId] : undefined;

                if (!transport || !server) {
                    // New session ONLY on initialize request
                    if (!sessionId && req.method === "POST" && isInitializeRequest(req.body)) {
                        console.log("[MCP] initialize request detected, creating new Server instance");

                        server = new Server(
                            {name: SERVER_NAME, version: "0.1.1"},
                            {capabilities: {tools: {}}, instructions}
                        );

                        // <<<< ADDED: enhanced server.onerror logging
                        server.onerror = (error) => {
                            console.error("[Error][Server.onerror]", error && (error.stack || error));
                        };

                        await setupServerHandlers(server, tools);

                        transport = new StreamableHTTPServerTransport({
                            sessionIdGenerator: () => randomUUID(),
                            onsessioninitialized: (sid) => {
                                console.log("[MCP] onsessioninitialized sid =", sid);
                                httpTransports[sid] = transport;
                                httpServers[sid] = server;
                            },
                        });

                        // <<<< ADDED: log transport close
                        transport.onclose = () => {
                            const sid = transport.sessionId;
                            console.log("[MCP] transport.onclose, sessionId =", sid);
                            if (!sid) return;
                            delete httpTransports[sid];
                            const s = httpServers[sid];
                            if (s) s.close().catch((err) => console.error("[MCP] error closing server:", err));
                            delete httpServers[sid];
                        };

                        await server.connect(transport);

                        console.log("[MCP] server.connect completed for initialize");
                    } else {
                        res.status(400).json({
                            jsonrpc: "2.0",
                            error: {
                                code: -32000,
                                message:
                                    "Bad Request: No valid MCP session. Initialize first with POST /mcp (initialize request).",
                            },
                            id: null,
                        });
                        return;
                    }
                }

                // <<<< CHANGED: wrap handleRequest with try/catch to log and close properly
                try {
                    await transport.handleRequest(req, res, req.body);
                } catch (err) {
                    console.error("[MCP] transport.handleRequest error:", err && (err.stack || err));
                    if (!res.headersSent) {
                        res.status(500).json({
                            jsonrpc: "2.0",
                            error: {code: -32603, message: "Internal server error (transport.handleRequest failed)"},
                            id: null,
                        });
                    }
                }
            } catch (error) {
                console.error("[MCP] /mcp error (outer):", error && (error.stack || error));
                if (!res.headersSent) {
                    res.status(500).json({
                        jsonrpc: "2.0",
                        error: {code: -32603, message: "Internal server error"},
                        id: null,
                    });
                }
            }
        });

        app.get("/sse", async (_req, res) => {
            console.log("[SSE] New connection");
            const server = new Server(
                {
                    name: SERVER_NAME,
                    version: "0.1.1",
                },
                {
                    capabilities: {
                        tools: {},
                    },
                    instructions,
                }
            );

            server.onerror = (error) => console.error("[Error][SSE Server.onerror]", error && (error.stack || error));
            await setupServerHandlers(server, tools);

            const transport = new SSEServerTransport("/messages", res);
            console.log("[SSE] transport created, sessionId:", transport.sessionId);
            transports[transport.sessionId] = transport;
            servers[transport.sessionId] = server;

            res.on("close", async () => {
                console.log("[SSE] connection closed, sessionId:", transport.sessionId);
                delete transports[transport.sessionId];
                await server.close();
                delete servers[transport.sessionId];
            });

            await server.connect(transport);
        });

        app.post("/messages", async (req, res) => {
            console.log("[MCP] /messages called (for SSE) body method:", req.body && req.body.method);
            const sessionId = req.query.sessionId;
            const transport = transports[sessionId];
            const server = servers[sessionId];

            if (transport && server) {
                const body = req.body;
                if (body && !Array.isArray(body) && body.method === "initialize") {
                    body.params ||= {};
                    body.params.protocolVersion ||= "2024-11-05";
                    body.params.capabilities ||= {};
                    body.params.clientInfo ||= {name: "curl", version: "1.0"};
                }

                try {
                    await transport.handlePostMessage(req, res, body);
                } catch (err) {
                    console.error("[MCP] transport.handlePostMessage error:", err && (err.stack || err));
                    if (!res.headersSent) res.status(500).send("Internal server error");
                }
            } else {
                console.warn("[MCP] No transport/server found for sessionId:", sessionId);
                res.status(400).send("No transport/server found for sessionId");
            }
        });

        const port = process.env.PORT || 3001;
        // <<<< CHANGED: capture server instance to adjust timeout
        const httpServer = app.listen(port, () => {
            console.log(`[SSE Server] running on port ${port}`);
        });

        // <<<< ADDED: disable Node default timeout so Node won't cut long-lived origin connections
        // Note: Cloudflare may still have its own timeout, but this prevents Node from being the culprit.
        httpServer.timeout = 0; // 0 = no timeout
        httpServer.keepAliveTimeout = 0;
        httpServer.headersTimeout = 0;
    } else {
        // stdio mode: single server instance
        const server = new Server(
            {
                name: SERVER_NAME,
                version: "0.1.1",
            },
            {
                capabilities: {
                    tools: {},
                },
                instructions,
            }
        );
        server.onerror = (error) => console.error("[Error][Stdio]", error && (error.stack || error));
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
