import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { ZodError } from 'zod';
import { EazyUiApiClient } from './api-client.js';
import { verifyAuthorizationHeader } from './auth.js';
import { loadConfig } from './config.js';
import { err, isJsonRpcRequest, JSONRPC_ERRORS, ok } from './jsonrpc.js';
import { log } from './logger.js';
import { MCP_RESOURCES, readResource } from './mcp-resources.js';
import { executeTool, MCP_TOOLS } from './mcp-tools.js';
import { ProjectRepository } from './project-repository.js';
import { ResourceReadInputSchema, ToolCallInputSchema } from './schemas.js';
import type { RequestContext } from './types.js';

const MCP_SUPPORTED_PROTOCOLS = ['2024-11-05', '2024-10-07'] as const;
const MCP_DEFAULT_PROTOCOL = MCP_SUPPORTED_PROTOCOLS[0];

function loadEnv() {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../../.env'),
  ];
  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      dotenv.config({ path: filePath });
      return filePath;
    }
  }
  dotenv.config();
  return null;
}

const envPath = loadEnv();
const config = loadConfig();
const app = Fastify({ logger: false });
const apiClient = new EazyUiApiClient({
  baseUrl: config.apiBaseUrl,
  timeoutMs: config.fetchTimeoutMs,
  retries: config.fetchRetries,
  internalApiKey: config.internalApiKey,
});
const projectRepo = new ProjectRepository();

app.get('/health', async () => {
  return {
    ok: true,
    service: 'mcp-server',
    apiBaseUrl: config.apiBaseUrl,
    mutatingToolsEnabled: config.enableMutatingTools,
    requireAuth: config.requireAuth,
    devUid: config.devUid || null,
    fetchTimeoutMs: config.fetchTimeoutMs,
    fetchRetries: config.fetchRetries,
    internalApiKeyConfigured: Boolean(config.internalApiKey),
    envPath: envPath || 'default',
  };
});

app.post('/mcp', async (request, reply) => {
  const traceId = String(request.headers['x-trace-id'] || `mcp-${randomUUID()}`);
  const authorization = typeof request.headers.authorization === 'string' ? request.headers.authorization : undefined;
  const context: RequestContext = {
    traceId,
    authorization,
  };

  if (!isJsonRpcRequest(request.body)) {
    return reply.status(400).send(err(null, JSONRPC_ERRORS.invalidRequest, 'Invalid JSON-RPC request body.'));
  }

  const rpc = request.body;
  log('info', 'mcp_request', {
    traceId,
    method: rpc.method,
    id: rpc.id ?? null,
  });

  try {
    if (rpc.method === 'initialize') {
      const params = (rpc.params && typeof rpc.params === 'object')
        ? (rpc.params as { protocolVersion?: unknown })
        : {};
      const requestedProtocol = typeof params.protocolVersion === 'string'
        ? params.protocolVersion
        : undefined;
      const negotiatedProtocol = requestedProtocol && MCP_SUPPORTED_PROTOCOLS.includes(requestedProtocol as (typeof MCP_SUPPORTED_PROTOCOLS)[number])
        ? requestedProtocol
        : MCP_DEFAULT_PROTOCOL;
      return reply.send(
        ok(rpc.id ?? null, {
          protocolVersion: negotiatedProtocol,
          serverInfo: {
            name: 'eazyui-mcp-server',
            version: '0.1.0',
          },
          capabilities: {
            tools: { listChanged: false },
            resources: { subscribe: false, listChanged: false },
          },
        }),
      );
    }

    if (rpc.method === 'ping') {
      return reply.send(ok(rpc.id ?? null, { pong: true }));
    }

    if (rpc.method.startsWith('notifications/')) {
      // JSON-RPC notifications do not require a response payload.
      return reply.status(204).send();
    }

    if (config.requireAuth && rpc.method !== 'tools/list' && rpc.method !== 'resources/list') {
      const identity = await verifyAuthorizationHeader(authorization);
      context.uid = identity.uid;
    } else if (!config.requireAuth) {
      const headerUid = typeof request.headers['x-eazyui-uid'] === 'string'
        ? request.headers['x-eazyui-uid'].trim()
        : '';
      context.uid = headerUid || config.devUid;
    }

    if (rpc.method === 'resources/list') {
      return reply.send(ok(rpc.id ?? null, { resources: MCP_RESOURCES }));
    }

    if (rpc.method === 'resources/read') {
      const input = ResourceReadInputSchema.parse(rpc.params || {});
      const payload = await readResource(projectRepo, context, input.uri);
      return reply.send(
        ok(rpc.id ?? null, {
          contents: [
            {
              uri: input.uri,
              mimeType: 'application/json',
              text: JSON.stringify(payload),
            },
          ],
        }),
      );
    }

    if (rpc.method === 'tools/list') {
      return reply.send(ok(rpc.id ?? null, { tools: MCP_TOOLS }));
    }

    if (rpc.method === 'tools/call') {
      const input = ToolCallInputSchema.parse(rpc.params || {});
      try {
        const output = await executeTool({
          apiClient,
          projectRepo,
          context,
          name: input.name,
          args: input.arguments,
          enableMutations: config.enableMutatingTools,
        });
        return reply.send(
          ok(rpc.id ?? null, {
            content: [
              {
                type: 'text',
                text: JSON.stringify(output, null, 2),
              },
            ],
            structuredContent: output,
            isError: false,
          }),
        );
      } catch (error) {
        const message = (error as Error).message || 'Tool execution failed';
        log('warn', 'mcp_tool_failed', {
          traceId,
          tool: input.name,
          message,
        });
        const payload = {
          traceId,
          tool: input.name,
          status: 'error',
          error: message,
        };
        return reply.send(
          ok(rpc.id ?? null, {
            content: [
              {
                type: 'text',
                text: JSON.stringify(payload, null, 2),
              },
            ],
            structuredContent: payload,
            isError: true,
          }),
        );
      }
    }

    return reply.status(404).send(err(rpc.id ?? null, JSONRPC_ERRORS.methodNotFound, `Method not found: ${rpc.method}`));
  } catch (error) {
    const message = (error as Error).message || 'Unexpected error';
    if (error instanceof ZodError) {
      return reply.status(400).send(err(rpc.id ?? null, JSONRPC_ERRORS.invalidParams, 'Invalid params', error.flatten()));
    }
    if (message.toLowerCase().includes('unauthorized') || message.toLowerCase().includes('authorization')) {
      return reply.status(401).send(err(rpc.id ?? null, JSONRPC_ERRORS.invalidRequest, message));
    }
    if (message.toLowerCase().startsWith('conflict:')) {
      return reply.status(409).send(err(rpc.id ?? null, JSONRPC_ERRORS.invalidRequest, message));
    }
    log('error', 'mcp_request_failed', {
      traceId,
      method: rpc.method,
      id: rpc.id ?? null,
      message,
    });
    return reply.status(500).send(err(rpc.id ?? null, JSONRPC_ERRORS.internalError, message));
  }
});

app.listen({ host: config.host, port: config.port })
  .then((address) => {
    log('info', 'mcp_server_started', {
      address,
      apiBaseUrl: config.apiBaseUrl,
      mutatingToolsEnabled: config.enableMutatingTools,
    });
  })
  .catch((error) => {
    log('error', 'mcp_server_start_failed', { message: (error as Error).message });
    process.exit(1);
  });
