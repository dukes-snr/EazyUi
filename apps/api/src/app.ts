// ============================================================================
// API Server - Fastify entry point
// ============================================================================

import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { v4 as uuidv4 } from 'uuid';
import { generateDesign, editDesign, completePartialScreen, generateImageAsset, generateProjectDesignSystem, type HtmlDesignSpec, type ProjectDesignSystem } from './services/gemini.js';
import { synthesizeImagesForScreens } from './services/imagePipeline.js';
import { saveProject, getProject, listProjects, deleteProject } from './services/database.js';
import { GROQ_MODELS, getLastGroqChatDebug, groqWhisperTranscription } from './services/groq.provider.js';
import { NVIDIA_MODELS, getLastNvidiaChatDebug } from './services/nvidia.provider.js';
import { getPlannerModels, runDesignPlanner, type PlannerPhase } from './services/designPlanner.js';

const fastify = Fastify({
    logger: true,
    bodyLimit: parseInt(process.env.API_BODY_LIMIT || `${25 * 1024 * 1024}`, 10),
});

let renderBrowserPromise: Promise<any> | null = null;

type PlatformKind = 'mobile' | 'tablet' | 'desktop';
type StyleKind = 'modern' | 'minimal' | 'vibrant' | 'luxury' | 'playful';
const LOG_PREVIEW_MAX = 220;

function normalizePlatform(input?: string): PlatformKind | undefined {
    if (input === 'mobile' || input === 'tablet' || input === 'desktop') return input;
    return undefined;
}

function normalizeStyle(input?: string): StyleKind | undefined {
    if (input === 'modern' || input === 'minimal' || input === 'vibrant' || input === 'luxury' || input === 'playful') return input;
    return undefined;
}

function previewText(value: unknown, max = LOG_PREVIEW_MAX): string {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    return text.length <= max ? text : `${text.slice(0, max)}...`;
}

async function getRenderBrowser() {
    if (!renderBrowserPromise) {
        renderBrowserPromise = (async () => {
            const load = new Function('return import("playwright")') as () => Promise<any>;
            const playwright = await load();
            return playwright.chromium.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            });
        })();
    }
    return renderBrowserPromise;
}

function isBlockedProxyHost(hostname: string): boolean {
    const host = hostname.trim().toLowerCase();
    if (!host) return true;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local')) return true;

    // Block direct private IPv4 ranges.
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
        const parts = host.split('.').map((p) => Number(p));
        const [a, b] = parts;
        if (a === 10) return true;
        if (a === 127) return true;
        if (a === 0) return true;
        if (a === 169 && b === 254) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
    }
    return false;
}

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
      <p><code>POST /api/plan</code></p>
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
        projectDesignSystem?: ProjectDesignSystem;
    };
}>('/api/generate', async (request, reply) => {
    const { prompt, stylePreset, platform, images, preferredModel, projectDesignSystem } = request.body;
    const startedAt = Date.now();
    const traceId = request.id;

    if (!prompt?.trim()) {
        return reply.status(400).send({ error: 'Prompt is required' });
    }

    try {
        fastify.log.info({
            traceId,
            route: '/api/generate',
            stage: 'start',
            platform,
            stylePreset,
            imagesCount: images?.length || 0,
            preferredModel,
            hasProjectDesignSystem: Boolean(projectDesignSystem),
            promptPreview: previewText(prompt),
        }, 'generate: start');
        const designSpec = await generateDesign({ prompt, stylePreset, platform, images, preferredModel, projectDesignSystem });
        const versionId = uuidv4();
        fastify.log.info({
            traceId,
            route: '/api/generate',
            stage: 'response',
            durationMs: Date.now() - startedAt,
            screens: designSpec.screens.length,
            screenNames: designSpec.screens.map((screen) => screen.name).slice(0, 8),
            descriptionPreview: previewText(designSpec.description),
        }, 'generate: complete');

        return { designSpec, versionId };
    } catch (error) {
        fastify.log.error({ traceId, route: '/api/generate', durationMs: Date.now() - startedAt, err: error }, 'generate: failed');
        return reply.status(500).send({
            error: 'Failed to generate design',
            message: (error as Error).message,
        });
    }
});

fastify.post<{
    Body: {
        prompt: string;
        stylePreset?: string;
        platform?: string;
        images?: string[];
        preferredModel?: string;
        projectDesignSystem?: ProjectDesignSystem;
    };
}>('/api/design-system', async (request, reply) => {
    const { prompt, stylePreset, platform, images, preferredModel, projectDesignSystem } = request.body;
    const startedAt = Date.now();
    const traceId = request.id;

    if (!prompt?.trim()) {
        return reply.status(400).send({ error: 'Prompt is required' });
    }

    try {
        fastify.log.info({
            traceId,
            route: '/api/design-system',
            stage: 'start',
            platform,
            stylePreset,
            imagesCount: images?.length || 0,
            preferredModel,
            hasProjectDesignSystem: Boolean(projectDesignSystem),
            promptPreview: previewText(prompt),
        }, 'design-system: start');
        const designSystem = await generateProjectDesignSystem({
            prompt,
            stylePreset,
            platform,
            images,
            preferredModel,
            projectDesignSystem,
        });
        fastify.log.info({
            traceId,
            route: '/api/design-system',
            stage: 'response',
            durationMs: Date.now() - startedAt,
            systemName: designSystem.systemName,
            stylePreset: designSystem.stylePreset,
            platform: designSystem.platform,
            themeMode: designSystem.themeMode,
        }, 'design-system: complete');
        return { designSystem };
    } catch (error) {
        fastify.log.error({ traceId, route: '/api/design-system', durationMs: Date.now() - startedAt, err: error }, 'design-system: failed');
        return reply.status(500).send({
            error: 'Failed to generate project design system',
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
        projectDesignSystem?: ProjectDesignSystem;
        consistencyProfile?: {
            canonicalNavbarLabels?: string[];
            canonicalNavbarSignature?: string;
            rules?: string[];
        };
        referenceScreens?: Array<{
            screenId: string;
            name: string;
            html: string;
        }>;
    };
}>('/api/edit', async (request, reply) => {
    const { instruction, html, screenId, images, preferredModel, projectDesignSystem, consistencyProfile, referenceScreens } = request.body;
    const startedAt = Date.now();
    const traceId = request.id;

    if (!instruction?.trim()) {
        return reply.status(400).send({ error: 'Instruction is required' });
    }

    if (!html) {
        return reply.status(400).send({ error: 'HTML is required' });
    }

    try {
        fastify.log.info({
            traceId,
            route: '/api/edit',
            stage: 'start',
            screenId,
            htmlChars: html.length,
            imagesCount: images?.length || 0,
            preferredModel,
            hasProjectDesignSystem: Boolean(projectDesignSystem),
            consistencyRuleCount: consistencyProfile?.rules?.length || 0,
            canonicalNavbarLabels: consistencyProfile?.canonicalNavbarLabels?.slice(0, 8) || [],
            referenceScreens: (referenceScreens || []).map((screen) => screen.name).slice(0, 4),
            instructionPreview: previewText(instruction),
        }, 'edit: start');
        const edited = await editDesign({
            instruction,
            html,
            screenId,
            images,
            preferredModel,
            projectDesignSystem,
            consistencyProfile,
            referenceScreens,
        });
        const versionId = uuidv4();
        fastify.log.info({
            traceId,
            route: '/api/edit',
            stage: 'response',
            durationMs: Date.now() - startedAt,
            screenId,
            htmlChars: edited.html.length,
            descriptionPreview: previewText(edited.description),
        }, 'edit: complete');

        return { html: edited.html, description: edited.description, versionId };
    } catch (error) {
        fastify.log.error({ traceId, route: '/api/edit', durationMs: Date.now() - startedAt, screenId, err: error }, 'edit: failed');
        return reply.status(500).send({
            error: 'Failed to edit design',
            message: (error as Error).message,
        });
    }
});

fastify.post<{
    Body: {
        appPrompt: string;
        stylePreset?: string;
        platform?: string;
        preferredModel?: string;
        maxImages?: number;
        screens: Array<{
            screenId?: string;
            name: string;
            html: string;
            width?: number;
            height?: number;
        }>;
    };
}>('/api/synthesize-screen-images', async (request, reply) => {
    const { appPrompt, stylePreset, platform, preferredModel, maxImages, screens } = request.body;
    const startedAt = Date.now();
    const traceId = request.id;

    if (!appPrompt?.trim()) {
        return reply.status(400).send({ error: 'appPrompt is required' });
    }
    if (!Array.isArray(screens) || screens.length === 0) {
        return reply.status(400).send({ error: 'screens is required' });
    }

    try {
        fastify.log.info({
            traceId,
            route: '/api/synthesize-screen-images',
            stage: 'start',
            screens: screens.length,
            stylePreset,
            platform,
            preferredModel,
            maxImages,
            appPromptPreview: previewText(appPrompt),
        }, 'synthesize-screen-images: start');
        const normalizedPlatform = normalizePlatform(platform);
        const normalizedStyle = normalizeStyle(stylePreset);
        const result = await synthesizeImagesForScreens(screens, {
            appPrompt: appPrompt.trim(),
            stylePreset: normalizedStyle,
            platform: normalizedPlatform,
            preferredModel: preferredModel || 'image',
            maxImages,
        });
        fastify.log.info({
            traceId,
            route: '/api/synthesize-screen-images',
            stage: 'response',
            durationMs: Date.now() - startedAt,
            stats: result.stats,
        }, 'synthesize-screen-images: complete');
        return result;
    } catch (error) {
        fastify.log.error({ traceId, route: '/api/synthesize-screen-images', durationMs: Date.now() - startedAt, err: error }, 'synthesize-screen-images: failed');
        return reply.status(500).send({
            error: 'Failed to synthesize screen images',
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
    const startedAt = Date.now();
    const traceId = request.id;

    if (!prompt?.trim()) {
        return reply.status(400).send({ error: 'Prompt is required' });
    }

    try {
        fastify.log.info({
            traceId,
            route: '/api/generate-image',
            stage: 'start',
            preferredModel,
            promptPreview: previewText(prompt),
            instructionPreview: previewText(instruction),
        }, 'generate-image: start');
        const result = await generateImageAsset({ prompt, instruction, preferredModel });
        fastify.log.info({
            traceId,
            route: '/api/generate-image',
            stage: 'response',
            durationMs: Date.now() - startedAt,
            modelUsed: result.modelUsed,
            srcPreview: previewText(result.src, 120),
        }, 'generate-image: complete');
        return result;
    } catch (error) {
        fastify.log.error({ traceId, route: '/api/generate-image', durationMs: Date.now() - startedAt, err: error }, 'generate-image: failed');
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
        planner: getPlannerModels(),
        defaultTextModel: process.env.GEMINI_MODEL || 'gemini-2.5-pro',
    };
});

fastify.post<{
    Body: {
        phase?: PlannerPhase;
        appPrompt: string;
        platform?: 'mobile' | 'tablet' | 'desktop';
        stylePreset?: 'modern' | 'minimal' | 'vibrant' | 'luxury' | 'playful';
        screenCountDesired?: number;
        screensGenerated?: Array<{ name: string; description?: string; htmlSummary?: string }>;
        screenDetails?: Array<{ screenId?: string; name: string; htmlSummary?: string }>;
        recentMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
        projectMemorySummary?: string;
        referenceImages?: string[];
        preferredModel?: string;
    };
}>('/api/plan', async (request, reply) => {
    const {
        phase = 'plan',
        appPrompt,
        platform,
        stylePreset,
        screenCountDesired,
        screensGenerated,
        screenDetails,
        recentMessages,
        projectMemorySummary,
        referenceImages,
        preferredModel,
    } = request.body;
    const startedAt = Date.now();
    const traceId = request.id;

    if (!appPrompt?.trim()) {
        return reply.status(400).send({ error: 'appPrompt is required' });
    }

    try {
        fastify.log.info({
            traceId,
            route: '/api/plan',
            stage: 'start',
            phase,
            platform,
            stylePreset,
            screensGeneratedCount: screensGenerated?.length || 0,
            screenDetailsCount: screenDetails?.length || 0,
            recentMessagesCount: recentMessages?.length || 0,
            hasProjectMemorySummary: Boolean(projectMemorySummary?.trim()),
            referenceImagesCount: referenceImages?.length || 0,
            preferredModel,
            appPromptPreview: previewText(appPrompt),
        }, 'plan: start');
        const plan = await runDesignPlanner({
            phase,
            appPrompt: appPrompt.trim(),
            platform,
            stylePreset,
            screenCountDesired,
            screensGenerated,
            screenDetails,
            recentMessages,
            projectMemorySummary,
            referenceImages,
            preferredModel,
        });
        if (plan.phase === 'route') {
            fastify.log.info({
                traceId,
                route: '/api/plan',
                stage: 'decision',
                phase: plan.phase,
                intent: plan.intent,
                action: plan.action,
                confidence: plan.confidence,
                reason: previewText(plan.reason),
                matchedExistingScreenName: plan.matchedExistingScreenName,
                targetScreenName: plan.targetScreenName,
                generateTheseNow: plan.generateTheseNow,
                hasAssistantResponse: Boolean(plan.assistantResponse?.trim()),
            }, 'plan: route decision');
        }
        fastify.log.info({
            traceId,
            route: '/api/plan',
            stage: 'response',
            phase: plan.phase,
            durationMs: Date.now() - startedAt,
            summary: plan.phase === 'route'
                ? `${plan.intent}:${plan.action || 'n/a'}`
                : plan.phase === 'postgen'
                    ? `nextSuggestions=${plan.nextScreenSuggestions.length}`
                    : `recommendedScreens=${plan.recommendedScreens.length}`,
        }, 'plan: complete');
        return plan;
    } catch (error) {
        fastify.log.error({ traceId, route: '/api/plan', durationMs: Date.now() - startedAt, err: error }, 'plan: failed');
        return reply.status(500).send({
            error: 'Failed to create planner output',
            message: (error as Error).message,
        });
    }
});

fastify.get<{
    Querystring: {
        url?: string;
    };
}>('/api/proxy-image', async (request, reply) => {
    const rawUrl = String(request.query.url || '').trim();
    if (!rawUrl) {
        return reply.status(400).send({ error: 'url query param is required' });
    }

    let target: URL;
    try {
        target = new URL(rawUrl);
    } catch {
        return reply.status(400).send({ error: 'Invalid url' });
    }

    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
        return reply.status(400).send({ error: 'Only http/https URLs are allowed' });
    }
    if (isBlockedProxyHost(target.hostname)) {
        return reply.status(403).send({ error: 'Blocked host' });
    }

    try {
        const upstream = await fetch(target.toString(), {
            method: 'GET',
            headers: {
                // Some image hosts require a UA/referrer-like header.
                'user-agent': 'EazyUI-ImageProxy/1.0',
            },
        });
        if (!upstream.ok) {
            return reply.status(502).send({ error: `Upstream image request failed (${upstream.status})` });
        }

        const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
        if (!contentType.startsWith('image/')) {
            return reply.status(415).send({ error: 'Upstream response is not an image' });
        }

        const cacheControl = upstream.headers.get('cache-control') || 'public, max-age=1800';
        const buffer = Buffer.from(await upstream.arrayBuffer());
        return reply
            .header('Content-Type', contentType)
            .header('Cache-Control', cacheControl)
            .send(buffer);
    } catch (error) {
        fastify.log.error({ err: error, target: target.toString() }, 'proxy-image: failed');
        return reply.status(500).send({
            error: 'Failed to proxy image',
            message: (error as Error).message,
        });
    }
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
        html: string;
        width?: number;
        height?: number;
        scale?: number;
    };
}>('/api/render-screen-image', async (request, reply) => {
    const html = String(request.body?.html || '');
    const width = Math.max(240, Math.min(2400, Number(request.body?.width || 375)));
    const height = Math.max(240, Math.min(3200, Number(request.body?.height || 812)));
    const scale = Math.max(1, Math.min(3, Number(request.body?.scale || 2)));

    if (!html.trim()) {
        return reply.status(400).send({ error: 'html is required' });
    }

    try {
        const browser = await getRenderBrowser();
        const context = await browser.newContext({
            viewport: { width, height },
            deviceScaleFactor: scale,
        });
        const page = await context.newPage();
        try {
            await page.setContent(html, {
                waitUntil: 'domcontentloaded',
                timeout: 20000,
            });
            // Best-effort settle without hard dependency on external CDN/network-idle.
            try {
                await page.waitForLoadState('networkidle', { timeout: 1500 });
            } catch {
                // ignore
            }
            await page.waitForTimeout(180);
            const image = await page.screenshot({
                type: 'png',
                fullPage: false,
            });
            return {
                pngBase64: image.toString('base64'),
                width,
                height,
                scale,
            };
        } finally {
            await context.close();
        }
    } catch (error) {
        fastify.log.error({ err: error }, 'render-screen-image: failed');
        return reply.status(500).send({
            error: 'Failed to render image',
            message: (error as Error).message,
        });
    }
});

fastify.post<{
    Body: {
        prompt: string;
        stylePreset?: string;
        platform?: string;
        images?: string[];
        preferredModel?: string;
        projectDesignSystem?: ProjectDesignSystem;
    };
}>('/api/generate-stream', async (request, reply) => {
    const { prompt, stylePreset, platform, images, preferredModel, projectDesignSystem } = request.body;
    const startedAt = Date.now();
    const traceId = request.id;

    if (!prompt?.trim()) {
        return reply.status(400).send({ error: 'Prompt is required' });
    }

    reply.raw.setHeader('Content-Type', 'text/plain; charset=utf-8');
    reply.raw.setHeader('Transfer-Encoding', 'chunked');

    try {
        const { generateDesignStream } = await import('./services/gemini.js');
        fastify.log.info({
            traceId,
            route: '/api/generate-stream',
            stage: 'start',
            platform,
            stylePreset,
            imagesCount: images?.length || 0,
            preferredModel,
            hasProjectDesignSystem: Boolean(projectDesignSystem),
            promptPreview: previewText(prompt),
        }, 'generate-stream: start');
        const stream = generateDesignStream({ prompt, stylePreset, platform, images, preferredModel, projectDesignSystem });
        let chunkCount = 0;
        let charCount = 0;

        for await (const chunk of stream) {
            chunkCount += 1;
            charCount += chunk.length;
            if (chunkCount === 1) {
                fastify.log.info({
                    traceId,
                    route: '/api/generate-stream',
                    stage: 'progress',
                    firstChunkPreview: previewText(chunk, 120),
                }, 'generate-stream: first chunk');
            }
            reply.raw.write(chunk);
        }
        fastify.log.info({
            traceId,
            route: '/api/generate-stream',
            stage: 'response',
            durationMs: Date.now() - startedAt,
            chunkCount,
            charCount,
        }, 'generate-stream: complete');
    } catch (error) {
        fastify.log.error({ traceId, route: '/api/generate-stream', durationMs: Date.now() - startedAt, err: error }, 'generate-stream: failed');
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
        projectDesignSystem?: ProjectDesignSystem;
    };
}>('/api/complete-screen', async (request, reply) => {
    const { screenName, partialHtml, prompt, platform, stylePreset, projectDesignSystem } = request.body;
    const startedAt = Date.now();
    const traceId = request.id;

    if (!screenName?.trim()) {
        return reply.status(400).send({ error: 'screenName is required' });
    }

    if (!partialHtml?.trim()) {
        return reply.status(400).send({ error: 'partialHtml is required' });
    }

    try {
        fastify.log.info({
            traceId,
            route: '/api/complete-screen',
            stage: 'start',
            screenName,
            partialHtmlChars: partialHtml.length,
            platform,
            stylePreset,
            hasProjectDesignSystem: Boolean(projectDesignSystem),
            promptPreview: previewText(prompt),
        }, 'complete-screen: start');
        const html = await completePartialScreen({
            screenName,
            partialHtml,
            prompt,
            platform,
            stylePreset,
            projectDesignSystem,
        });
        fastify.log.info({
            traceId,
            route: '/api/complete-screen',
            stage: 'response',
            durationMs: Date.now() - startedAt,
            screenName,
            htmlChars: html.length,
        }, 'complete-screen: complete');
        return { html };
    } catch (error) {
        fastify.log.error({ traceId, route: '/api/complete-screen', durationMs: Date.now() - startedAt, screenName, err: error }, 'complete-screen: failed');
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
        canvasDoc?: unknown;
        chatState?: unknown;
    };
}>('/api/save', async (request, reply) => {
    const { projectId, designSpec, canvasDoc, chatState } = request.body;

    if (!designSpec) {
        return reply.status(400).send({ error: 'Design spec is required' });
    }

    try {
        const result = saveProject(designSpec, canvasDoc, chatState, projectId);
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
            chatState: project.chatState,
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

export async function closeRenderBrowser(): Promise<void> {
    try {
        const browser = await renderBrowserPromise;
        if (browser) await browser.close();
    } catch {
        // ignore cleanup errors
    }
}

export default fastify;
