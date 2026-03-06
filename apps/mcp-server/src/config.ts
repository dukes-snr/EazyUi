export interface McpServerConfig {
  port: number;
  host: string;
  apiBaseUrl: string;
  internalApiKey?: string;
  enableMutatingTools: boolean;
  requireAuth: boolean;
  devUid?: string;
  fetchTimeoutMs: number;
  fetchHeavyTimeoutMs: number;
  fetchRetries: number;
}

function toBooleanFlag(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no') return false;
  return fallback;
}

export function loadConfig(): McpServerConfig {
  return {
    port: Number(process.env.MCP_SERVER_PORT || 3010),
    host: process.env.MCP_SERVER_HOST || '0.0.0.0',
    apiBaseUrl: (process.env.EAZYUI_API_BASE_URL || 'http://localhost:3001').trim().replace(/\/+$/, ''),
    internalApiKey: (process.env.MCP_INTERNAL_API_KEY || '').trim() || undefined,
    enableMutatingTools: toBooleanFlag(process.env.MCP_ENABLE_MUTATIONS, true),
    requireAuth: toBooleanFlag(process.env.MCP_REQUIRE_AUTH, true),
    devUid: (process.env.MCP_DEV_UID || '').trim() || undefined,
    fetchTimeoutMs: Math.max(2_000, Math.min(300_000, Number(process.env.MCP_FETCH_TIMEOUT_MS || 90_000))),
    fetchHeavyTimeoutMs: Math.max(
      120_000,
      Math.min(900_000, Number(process.env.MCP_FETCH_HEAVY_TIMEOUT_MS || 420_000)),
    ),
    fetchRetries: Math.max(0, Math.min(3, Number(process.env.MCP_FETCH_RETRIES || 1))),
  };
}
