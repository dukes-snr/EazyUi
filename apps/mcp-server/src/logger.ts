type LogLevel = 'info' | 'warn' | 'error';

export function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const payload = {
    level,
    time: new Date().toISOString(),
    service: 'mcp-server',
    message,
    ...(meta || {}),
  };
  // Keep output structured for ingestion by existing log pipelines.
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload));
}
