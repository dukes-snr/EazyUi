// ============================================================================
// API Server - Fastify entry point
// ============================================================================

import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { v4 as uuidv4 } from 'uuid';
import { generateDesign, editDesign, completePartialScreen, generateImageAsset, type HtmlDesignSpec } from './services/gemini.js';
import { saveProject, getProject, listProjects, deleteProject } from './services/database.js';
import { GROQ_MODELS, getLastGroqChatDebug, groqWhisperTranscription } from './services/groq.provider.js';
import { NVIDIA_MODELS, getLastNvidiaChatDebug } from './services/nvidia.provider.js';

const fastify = Fastify({
    logger: true,
    bodyLimit: parseInt(process.env.API_BODY_LIMIT || `${25 * 1024 * 1024}`, 10),
});

// Register CORS
await fastify.register(cors, {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
});

// ============================================================================
// Routes
// ============================================================================

fastify.get('/', async (_request, reply) => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>EazyUI API</title>
  <style>
    body { font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #0b0f16; color: #e5e7eb; margin: 0; }
    .wrap { max-width: 860px; margin: 56px auto; padding: 0 20px; }
    .card { background: #121824; border: 1px solid #263043; border-radius: 12px; padding: 16px; margin-top: 14px; }
    a { color: #93c5fd; text-decoration: none; }
    a:hover { text-decoration: underline; }
    code { color: #bfdbfe; }
    .muted { color: #94a3b8; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>EazyUI API</h1>
    <p class="muted">Backend service is running.</p>
    <div class="card">
      <h2>Quick Links</h2>
      <p><a href="/api/health">/api/health</a></p>
      <p><a href="/api/models">/api/models</a></p>
    </div>
    <div class="card">
      <h2>Core Endpoints</h2>
      <p><code>POST /api/generate</code></p>
      <p><code>POST /api/generate-stream</code></p>
      <p><code>POST /api/edit</code></p>
      <p><code>POST /api/generate-image</code></p>
      <p><code>POST /api/transcribe-audio</code></p>
    </div>
  </div>
</body>
</html>`;
    return reply.type('text/html; charset=utf-8').send(html);
});

// Health check
fastify.get('/api/health', async (request, reply) => {
    const apiKey = process.env.GEMINI_API_KEY || '';
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-pro';
    const groqModels = Object.keys(GROQ_MODELS);
    const nvidiaModels = Object.keys(NVIDIA_MODELS);

    const payload = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        gemini: {
            model,
            apiKeyPresent: Boolean(apiKey),
        },
        groq: {
            apiKeyPresent: Boolean((process.env.GROQ_API_KEY || '').trim()),
            models: groqModels,
        },
        nvidia: {
            apiKeyPresent: Boolean((process.env.NVIDIA_API_KEY || '').trim()),
            models: nvidiaModels,
        },
    };

    const accept = String(request.headers.accept || '');
    if (accept.includes('text/html')) {
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>EazyUI API Health</title>
  <style>
    body { font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #0b0f16; color: #e5e7eb; margin: 0; }
    .wrap { max-width: 860px; margin: 48px auto; padding: 0 20px; }
    .card { background: #121824; border: 1px solid #263043; border-radius: 12px; padding: 16px; margin-top: 14px; }
    .ok { color: #86efac; font-weight: 600; }
    .muted { color: #94a3b8; }
    code { color: #bfdbfe; }
    ul { margin-top: 8px; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>EazyUI API Health <span class="ok">OK</span></h1>
    <p class="muted">Timestamp: ${payload.timestamp}</p>
    <div class="card">
      <h2>Gemini</h2>
      <p>Model: <code>${payload.gemini.model}</code></p>
      <p>API Key Present: <code>${payload.gemini.apiKeyPresent}</code></p>
    </div>
    <div class="card">
      <h2>Groq</h2>
      <p>API Key Present: <code>${payload.groq.apiKeyPresent}</code></p>
      <p>Models:</p>
      <ul>${payload.groq.models.map((m) => `<li><code>${m}</code></li>`).join('')}</ul>
    </div>
    <div class="card">
      <h2>NVIDIA</h2>
      <p>API Key Present: <code>${payload.nvidia.apiKeyPresent}</code></p>
      <p>Models:</p>
      <ul>${payload.nvidia.models.map((m) => `<li><code>${m}</code></li>`).join('')}</ul>
    </div>
    <div class="card">
      <h2>Useful Endpoints</h2>
      <p><code>POST /api/generate</code></p>
      <p><code>POST /api/edit</code></p>
      <p><code>POST /api/transcribe-audio</code></p>
      <p><code>GET /api/models</code></p>
    </div>
  </div>
</body>
</html>`;
        return reply.type('text/html; charset=utf-8').send(html);
    }

    return payload;
});

// Generate new design (returns HTML)
fastify.post<{
    Body: {
        prompt: string;
        stylePreset?: string;
        platform?: string;
        images?: string[];
        preferredModel?: string;
    };
}>('/api/generate', async (request, reply) => {
    const { prompt, stylePreset, platform, images, preferredModel } = request.body;

    if (!prompt?.trim()) {
        return reply.status(400).send({ error: 'Prompt is required' });
    }

    try {
        fastify.log.info({ platform, stylePreset, imagesCount: images?.length || 0, preferredModel }, 'generate: start');
        const designSpec = await generateDesign({ prompt, stylePreset, platform, images, preferredModel });
        const versionId = uuidv4();
        fastify.log.info({ screens: designSpec.screens.length }, 'generate: complete');

        return { designSpec, versionId };
    } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
            error: 'Failed to generate design',
            message: (error as Error).message,
        });
    }
});

// Edit existing design (modifies HTML)
fastify.post<{
    Body: {
        instruction: string;
        html: string;
        screenId: string;
        images?: string[];
        preferredModel?: string;
    };
}>('/api/edit', async (request, reply) => {
    const { instruction, html, screenId, images, preferredModel } = request.body;

    if (!instruction?.trim()) {
        return reply.status(400).send({ error: 'Instruction is required' });
    }

    if (!html) {
        return reply.status(400).send({ error: 'HTML is required' });
    }

    try {
        const edited = await editDesign({ instruction, html, screenId, images, preferredModel });
        const versionId = uuidv4();

        return { html: edited.html, description: edited.description, versionId };
    } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
            error: 'Failed to edit design',
            message: (error as Error).message,
        });
    }
});

fastify.post<{
    Body: {
        prompt: string;
        instruction?: string;
        preferredModel?: string;
    };
}>('/api/generate-image', async (request, reply) => {
    const { prompt, instruction, preferredModel } = request.body;

    if (!prompt?.trim()) {
        return reply.status(400).send({ error: 'Prompt is required' });
    }

    try {
        const result = await generateImageAsset({ prompt, instruction, preferredModel });
        return result;
    } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
            error: 'Failed to generate image',
            message: (error as Error).message,
        });
    }
});

// Generate new design (STREAM)
fastify.post<{
    Body: {
        audioBase64: string;
        mimeType: string;
        language?: string;
        model?: string;
    };
}>('/api/transcribe-audio', async (request, reply) => {
    const { audioBase64, mimeType, language, model } = request.body;

    if (!audioBase64?.trim()) {
        return reply.status(400).send({ error: 'audioBase64 is required' });
    }
    if (!mimeType?.trim()) {
        return reply.status(400).send({ error: 'mimeType is required' });
    }

    try {
        fastify.log.info({
            mimeType,
            language: language || 'auto',
            model: model || process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo',
            audioBytesApprox: Math.round(audioBase64.length * 0.75),
        }, 'transcribe-audio: start');
        const result = await groqWhisperTranscription({ audioBase64, mimeType, language, model });
        fastify.log.info({
            modelUsed: result.modelUsed,
            textLength: result.text.length,
            preview: result.text.slice(0, 120),
        }, 'transcribe-audio: complete');
        return result;
    } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
            error: 'Failed to transcribe audio',
            message: (error as Error).message,
        });
    }
});

fastify.get('/api/models', async () => {
    return {
        groq: Object.keys(GROQ_MODELS),
        nvidia: Object.keys(NVIDIA_MODELS),
        defaultTextModel: process.env.GEMINI_MODEL || 'gemini-2.5-pro',
    };
});

fastify.get('/api/debug/groq-last-chat', async (_request, reply) => {
    const debug = getLastGroqChatDebug();
    if (!debug) {
        return reply.status(404).send({ error: 'No Groq chat call has been captured yet.' });
    }
    return debug;
});

fastify.get('/api/debug/nvidia-last-chat', async (_request, reply) => {
    const debug = getLastNvidiaChatDebug();
    if (!debug) {
        return reply.status(404).send({ error: 'No NVIDIA chat call has been captured yet.' });
    }
    return debug;
});

fastify.post<{
    Body: {
        prompt: string;
        stylePreset?: string;
        platform?: string;
        images?: string[];
    };
}>('/api/generate-stream', async (request, reply) => {
    const { prompt, stylePreset, platform, images } = request.body;

    if (!prompt?.trim()) {
        return reply.status(400).send({ error: 'Prompt is required' });
    }

    reply.raw.setHeader('Content-Type', 'text/plain; charset=utf-8');
    reply.raw.setHeader('Transfer-Encoding', 'chunked');

    try {
        const { generateDesignStream } = await import('./services/gemini.js');
        fastify.log.info({ platform, stylePreset, imagesCount: images?.length || 0 }, 'generate-stream: start');
        const stream = generateDesignStream({ prompt, stylePreset, platform, images });

        for await (const chunk of stream) {
            reply.raw.write(chunk);
        }
        fastify.log.info('generate-stream: complete');
    } catch (error) {
        fastify.log.error(error);
        reply.raw.write(`\nERROR: ${(error as Error).message}\n`);
    } finally {
        reply.raw.end();
    }
});

// Complete a partial streamed screen
fastify.post<{
    Body: {
        screenName: string;
        partialHtml: string;
        prompt?: string;
        platform?: string;
        stylePreset?: string;
    };
}>('/api/complete-screen', async (request, reply) => {
    const { screenName, partialHtml, prompt, platform, stylePreset } = request.body;

    if (!screenName?.trim()) {
        return reply.status(400).send({ error: 'screenName is required' });
    }

    if (!partialHtml?.trim()) {
        return reply.status(400).send({ error: 'partialHtml is required' });
    }

    try {
        const html = await completePartialScreen({
            screenName,
            partialHtml,
            prompt,
            platform,
            stylePreset,
        });
        return { html };
    } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
            error: 'Failed to complete partial screen',
            message: (error as Error).message,
        });
    }
});


// Save project
fastify.post<{
    Body: {
        projectId?: string;
        designSpec: HtmlDesignSpec;
    };
}>('/api/save', async (request, reply) => {
    const { projectId, designSpec } = request.body;

    if (!designSpec) {
        return reply.status(400).send({ error: 'Design spec is required' });
    }

    try {
        const result = saveProject(designSpec, undefined, projectId);
        return result;
    } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
            error: 'Failed to save project',
            message: (error as Error).message,
        });
    }
});

// Get project
fastify.get<{
    Params: { id: string };
}>('/api/project/:id', async (request, reply) => {
    const { id } = request.params;

    try {
        const project = getProject(id);

        if (!project) {
            return reply.status(404).send({ error: 'Project not found' });
        }

        return {
            projectId: project.id,
            designSpec: project.designSpec,
            canvasDoc: project.canvasDoc,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
        };
    } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
            error: 'Failed to get project',
            message: (error as Error).message,
        });
    }
});

// List projects
fastify.get('/api/projects', async () => {
    const projects = listProjects();
    return { projects };
});

// Delete project
fastify.delete<{
    Params: { id: string };
}>('/api/project/:id', async (request, reply) => {
    const { id } = request.params;

    try {
        const deleted = deleteProject(id);

        if (!deleted) {
            return reply.status(404).send({ error: 'Project not found' });
        }

        return { success: true };
    } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
            error: 'Failed to delete project',
            message: (error as Error).message,
        });
    }
});

// ============================================================================
// Start Server
// ============================================================================

const port = parseInt(process.env.PORT || '3001', 10);
const host = process.env.HOST || '0.0.0.0';

try {
    await fastify.listen({ port, host });
    console.log(`Server running at http://${host}:${port}`);
} catch (err) {
    fastify.log.error(err);
    process.exit(1);
}
