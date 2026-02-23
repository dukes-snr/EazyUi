import app, { closeRenderBrowser } from './app.js';

const port = parseInt(process.env.PORT || '3001', 10);
const host = process.env.HOST || '0.0.0.0';

try {
    await app.listen({ port, host });
    console.log(`Server running at http://${host}:${port}`);
} catch (err) {
    app.log.error(err);
    process.exit(1);
}

process.on('SIGINT', async () => {
    await closeRenderBrowser();
    process.exit(0);
});
