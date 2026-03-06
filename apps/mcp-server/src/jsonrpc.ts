import type { JsonRpcError, JsonRpcId, JsonRpcRequest, JsonRpcSuccess } from './types.js';

export const JSONRPC_VERSION = '2.0';

export const JSONRPC_ERRORS = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
} as const;

export function isJsonRpcRequest(input: unknown): input is JsonRpcRequest {
  if (!input || typeof input !== 'object') return false;
  const value = input as Partial<JsonRpcRequest>;
  return value.jsonrpc === JSONRPC_VERSION && typeof value.method === 'string';
}

export function ok(id: JsonRpcId, result: unknown): JsonRpcSuccess {
  return {
    jsonrpc: JSONRPC_VERSION,
    id,
    result,
  };
}

export function err(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcError {
  return {
    jsonrpc: JSONRPC_VERSION,
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  };
}
