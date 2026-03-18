import './utils/devLogs.js';
import app, { closeRenderBrowser } from './app.js';
import { shutdownPostHog } from './services/posthog.js';
import { logTagged } from './utils/devLogs.js';

const port = parseInt(process.env.PORT || '3001', 10);
const host = process.env.HOST || '0.0.0.0';

try {
    await app.listen({ port, host });
    logTagged('API', `Server running at http://${host}:${port}`);
} catch (err) {
    app.log.error(err);
    process.exit(1);
}

async function shutdownServer() {
    await closeRenderBrowser();
    await shutdownPostHog();
    process.exit(0);
}

process.on('SIGINT', shutdownServer);
process.on('SIGTERM', shutdownServer);
