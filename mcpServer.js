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

function extractApiKey(req) {
    // Node lowercases header names; check both just in case.
    return (req?.headers?.["x-api-key"] || req?.headers?.["X-API-KEY"] || "").trim();
}

// Validates the key against the gateway and returns the bound session context, or null if invalid.
async function validateApiKey(apiKey) {
    if (!apiKey) return null;
    const baseUrl = process.env.BASE_URL || "https://api.admin.u-code.io";
    try {
        const resp = await fetch(`${baseUrl}/v1/api-key/validate`, {
            method: "GET",
            headers: {"X-API-KEY": apiKey, "Content-Type": "application/json"},
        });
        if (!resp.ok) {
            console.warn("[MCP][auth] validate rejected, status:", resp.status);
            return null;
        }
        const json = await resp.json();
        const data = json?.data ?? json; // gateway wraps payload in { data }
        if (!data || data.valid !== true) return null;
        return {
            apiKey,
            appId: data.app_id || "",
            projectId: data.project_id || "",
            environmentId: data.environment_id || "",
        };
    } catch (error) {
        console.error("[MCP][auth] validate error:", error?.message || error);
        return null;
    }
}

async function setupServerHandlers(server, tools, authContext = {}) {
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
            // Inject the session's API key + bound project/environment so the LLM never handles auth.
            // The key always comes from the session; project/env fill in only when the LLM omits them.
            const enrichedArgs = {...args, x_api_key: authContext.apiKey};
            if (authContext.projectId) {
                enrichedArgs.projectId ??= authContext.projectId;
                enrichedArgs.project_id ??= authContext.projectId;
            }
            if (authContext.environmentId) {
                enrichedArgs.environmentId ??= authContext.environmentId;
                enrichedArgs.environment_id ??= authContext.environmentId;
            }

            const result = await tool.function(enrichedArgs);
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

        // Idle-eviction: bound how long a session (and its API key) can sit in RAM if the
        // client vanishes without a clean close, so an orphaned key can't linger forever.
        const sessionLastSeen = new Map(); // sid -> last activity (ms)
        const SESSION_IDLE_MS = Number(process.env.MCP_SESSION_IDLE_MS || 30 * 60 * 1000); // 30 min
        const touchSession = (sid) => { if (sid) sessionLastSeen.set(sid, Date.now()); };
        const forgetSession = (sid) => { if (sid) sessionLastSeen.delete(sid); };

        const evictIdleSessions = () => {
            const now = Date.now();
            for (const [sid, ts] of sessionLastSeen) {
                if (now - ts <= SESSION_IDLE_MS) continue;
                console.log("[MCP] evicting idle session:", sid);
                const transport = httpTransports[sid] || transports[sid];
                if (transport && typeof transport.close === "function") {
                    Promise.resolve(transport.close()).catch(() => {}); // close() fires onclose → cleans maps
                } else {
                    delete httpTransports[sid];
                    delete httpServers[sid];
                    delete transports[sid];
                    delete servers[sid];
                    sessionLastSeen.delete(sid);
                }
            }
        };
        const sweeper = setInterval(evictIdleSessions, 5 * 60 * 1000);
        sweeper.unref?.();

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

                        // Gate the session on a valid X-API-KEY before doing anything else.
                        const authContext = await validateApiKey(extractApiKey(req));
                        if (!authContext) {
                            res.status(401).json({
                                jsonrpc: "2.0",
                                error: {code: -32001, message: "Unauthorized: missing or invalid X-API-KEY"},
                                id: req.body?.id ?? null,
                            });
                            return;
                        }

                        server = new Server(
                            {name: SERVER_NAME, version: "0.1.1"},
                            {capabilities: {tools: {}}, instructions}
                        );

                        // <<<< ADDED: enhanced server.onerror logging
                        server.onerror = (error) => {
                            console.error("[Error][Server.onerror]", error && (error.stack || error));
                        };

                        await setupServerHandlers(server, tools, authContext);

                        transport = new StreamableHTTPServerTransport({
                            sessionIdGenerator: () => randomUUID(),
                            onsessioninitialized: (sid) => {
                                console.log("[MCP] onsessioninitialized sid =", sid);
                                httpTransports[sid] = transport;
                                httpServers[sid] = server;
                                touchSession(sid);
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
                            forgetSession(sid);
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

                touchSession(transport.sessionId);

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

        app.get("/sse", async (req, res) => {
            console.log("[SSE] New connection");

            // Gate the SSE session on a valid X-API-KEY.
            const authContext = await validateApiKey(extractApiKey(req));
            if (!authContext) {
                res.status(401).json({error: "Unauthorized: missing or invalid X-API-KEY"});
                return;
            }

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

            const transport = new SSEServerTransport("/messages", res);
            console.log("[SSE] transport created, sessionId:", transport.sessionId);
            await setupServerHandlers(server, tools, authContext);

            transports[transport.sessionId] = transport;
            servers[transport.sessionId] = server;
            touchSession(transport.sessionId);

            res.on("close", async () => {
                console.log("[SSE] connection closed, sessionId:", transport.sessionId);
                delete transports[transport.sessionId];
                await server.close();
                delete servers[transport.sessionId];
                forgetSession(transport.sessionId);
            });

            await server.connect(transport);
        });

        app.post("/messages", async (req, res) => {
            console.log("[MCP] /messages called (for SSE) body method:", req.body && req.body.method);
            const sessionId = req.query.sessionId;
            const transport = transports[sessionId];
            const server = servers[sessionId];

            if (transport && server) {
                touchSession(sessionId);
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
        // stdio mode: key comes from the env (set X_API_KEY in the MCP client config).
        const authContext = await validateApiKey((process.env.X_API_KEY || "").trim());
        if (!authContext) {
            console.error("[MCP][stdio] Missing or invalid X_API_KEY env var — set it to a valid ucode API key.");
            process.exit(1);
        }

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
        await setupServerHandlers(server, tools, authContext);

        process.on("SIGINT", async () => {
            await server.close();
            process.exit(0);
        });

        const transport = new StdioServerTransport();
        await server.connect(transport);
    }

}

run().catch(console.error);
