import type { IncomingMessage, ServerResponse } from 'node:http';
import app from '../apps/api/src/app.js';

let appReady: PromiseLike<void> | null = null;

async function ensureAppReady(): Promise<void> {
    if (!appReady) {
        appReady = app.ready().then(() => undefined);
    }
    await appReady;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    await ensureAppReady();
    app.server.emit('request', req, res);
}
