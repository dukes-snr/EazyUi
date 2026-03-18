import util from 'node:util';

type DevTag = 'API' | 'Request' | 'Gemini' | 'Firecrawl' | 'Billing' | 'Stripe' | 'Postgres';

const RESET = '\x1b[0m';
const TAG_COLORS: Record<DevTag, string> = {
    API: '\x1b[38;5;39m',
    Request: '\x1b[38;5;81m',
    Gemini: '\x1b[38;5;42m',
    Firecrawl: '\x1b[38;5;208m',
    Billing: '\x1b[38;5;45m',
    Stripe: '\x1b[38;5;171m',
    Postgres: '\x1b[38;5;141m',
};

function supportsColor(): boolean {
    return Boolean(process.stdout?.isTTY);
}

function colorizeTag(tag: DevTag): string {
    if (!supportsColor()) return `[${tag}]`;
    return `${TAG_COLORS[tag]}[${tag}]${RESET}`;
}

function patchConsoleMethod(method: 'log' | 'info' | 'warn' | 'error') {
    const original = console[method].bind(console);
    console[method] = ((...args: unknown[]) => {
        const [first, ...rest] = args;
        if (typeof first === 'string') {
            const match = first.match(/^\[(API|Request|Gemini|Firecrawl|Billing|Stripe|Postgres)\](.*)$/);
            if (match) {
                const tag = match[1] as DevTag;
                const suffix = match[2] || '';
                original(`${colorizeTag(tag)}${suffix}`, ...rest);
                return;
            }
        }
        original(...args);
    }) as typeof console[typeof method];
}

let installed = false;

export function installDevLogColors(): void {
    if (installed) return;
    installed = true;
    patchConsoleMethod('log');
    patchConsoleMethod('info');
    patchConsoleMethod('warn');
    patchConsoleMethod('error');
}

export function logTagged(tag: DevTag, label: string, payload?: unknown): void {
    installDevLogColors();
    if (payload === undefined) {
        console.info(`[${tag}] ${label}`);
        return;
    }
    console.info(`[${tag}] ${label}`, payload);
}

export function warnTagged(tag: DevTag, label: string, payload?: unknown): void {
    installDevLogColors();
    if (payload === undefined) {
        console.warn(`[${tag}] ${label}`);
        return;
    }
    console.warn(`[${tag}] ${label}`, payload);
}

export function formatTaggedPayload(payload: unknown): string {
    return util.inspect(payload, {
        colors: supportsColor(),
        depth: 6,
        breakLength: 110,
        compact: false,
    });
}

function colorizeStatus(statusCode: number): string {
    const text = String(statusCode);
    if (!supportsColor()) return text;
    if (statusCode >= 500) return `\x1b[38;5;196m${text}${RESET}`;
    if (statusCode >= 400) return `\x1b[38;5;214m${text}${RESET}`;
    if (statusCode >= 300) return `\x1b[38;5;220m${text}${RESET}`;
    if (statusCode >= 200) return `\x1b[38;5;42m${text}${RESET}`;
    return `\x1b[38;5;244m${text}${RESET}`;
}

export function logRequestStart(reqId: string, method: string, url: string): void {
    installDevLogColors();
    console.info(`[Request] ${reqId} ${method.toUpperCase()} ${url}`);
}

export function logRequestComplete(reqId: string, method: string, url: string, statusCode: number, responseTimeMs?: number): void {
    installDevLogColors();
    const status = colorizeStatus(statusCode);
    const time = typeof responseTimeMs === 'number' ? ` ${responseTimeMs.toFixed(1)}ms` : '';
    console.info(`[Request] ${reqId} ${method.toUpperCase()} ${url} -> ${status}${time}`);
}

installDevLogColors();
