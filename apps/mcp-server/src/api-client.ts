import { log } from './logger.js';
import type { EazyUiProjectPayload, RequestContext } from './types.js';

interface ApiClientOptions {
  baseUrl: string;
  timeoutMs: number;
  retries: number;
  internalApiKey?: string;
}

export class EazyUiApiClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly internalApiKey?: string;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs;
    this.retries = options.retries;
    this.internalApiKey = options.internalApiKey?.trim() || undefined;
  }

  async getProject(context: RequestContext, projectId: string): Promise<EazyUiProjectPayload> {
    return this.request<EazyUiProjectPayload>(context, 'GET', `/api/project/${encodeURIComponent(projectId)}`);
  }

  async listProjects(context: RequestContext): Promise<{ projects: unknown[] }> {
    return this.request<{ projects: unknown[] }>(context, 'GET', '/api/projects');
  }

  async routePlan(
    context: RequestContext,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(context, 'POST', '/api/plan', body);
  }

  async generate(
    context: RequestContext,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(context, 'POST', '/api/generate', body);
  }

  async edit(
    context: RequestContext,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(context, 'POST', '/api/edit', body);
  }

  async designSystem(
    context: RequestContext,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(context, 'POST', '/api/design-system', body);
  }

  async save(
    context: RequestContext,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(context, 'POST', '/api/save', body);
  }

  async renderScreenImage(
    context: RequestContext,
    body: { html: string; width?: number; height?: number; scale?: number },
  ): Promise<{ pngBase64: string; width: number; height: number; scale: number }> {
    return this.request<{ pngBase64: string; width: number; height: number; scale: number }>(
      context,
      'POST',
      '/api/render-screen-image',
      body,
    );
  }

  async resolveMcpApiKey(
    context: RequestContext,
    apiKey: string,
  ): Promise<{ uid: string; keyId: string; label?: string }> {
    return this.request<{ uid: string; keyId: string; label?: string }>(
      context,
      'POST',
      '/api/mcp/resolve-key',
      { apiKey },
    );
  }

  private async request<T>(
    context: RequestContext,
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const payload = normalizeRequestBody(body);
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-trace-id': context.traceId,
      'x-eazyui-source': 'mcp',
    };
    if (payload.idempotencyKey) {
      headers['x-idempotency-key'] = payload.idempotencyKey;
    }
    if (context.authorization) {
      headers.authorization = context.authorization;
    }
    if (this.internalApiKey) {
      headers['x-internal-api-key'] = this.internalApiKey;
      if (context.uid) {
        headers['x-eazyui-uid'] = context.uid;
      }
    }
    const attempts = this.retries + 1;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await fetch(url, {
          method,
          headers,
          body: payload.body === undefined ? undefined : JSON.stringify(payload.body),
          signal: controller.signal,
        });

        const text = await response.text();
        const parsed = text ? (safeParseJson(text) as T | null) : null;

        if (!response.ok) {
          const shouldRetry = response.status >= 500 && attempt < attempts;
          if (shouldRetry) {
            log('warn', 'upstream_api_retry', {
              traceId: context.traceId,
              method,
              path,
              status: response.status,
              attempt,
              attempts,
            });
            continue;
          }
          log('warn', 'upstream_api_error', {
            traceId: context.traceId,
            method,
            path,
            status: response.status,
          });
          throw new Error(
            `API ${method} ${path} failed (${response.status}): ${text.slice(0, 300) || 'unknown error'}`,
          );
        }

        if (parsed === null) {
          throw new Error(`API ${method} ${path} returned non-JSON response.`);
        }

        return parsed;
      } catch (error) {
        lastError = error as Error;
        const isAbort = lastError.name === 'AbortError';
        const canRetry = attempt < attempts;
        if (!canRetry) break;
        log('warn', 'upstream_api_retry_error', {
          traceId: context.traceId,
          method,
          path,
          attempt,
          attempts,
          isAbort,
          message: lastError.message,
        });
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError || new Error(`API ${method} ${path} failed`);
  }
}

function safeParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeRequestBody(body: unknown): { body: unknown; idempotencyKey?: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { body };
  }
  const source = body as Record<string, unknown>;
  const idempotencyKey = typeof source.idempotencyKey === 'string' ? source.idempotencyKey.trim() : undefined;
  if (!idempotencyKey) return { body };
  const next = { ...source };
  delete next.idempotencyKey;
  return {
    body: next,
    idempotencyKey,
  };
}
