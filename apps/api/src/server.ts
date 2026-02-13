// ============================================================================
// API Server - Fastify entry point
// ============================================================================

import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { v4 as uuidv4 } from 'uuid';
import { generateDesign, editDesign, completePartialScreen, type HtmlDesignSpec } from './services/gemini.js';
import { saveProject, getProject, listProjects, deleteProject } from './services/database.js';

const fastify = Fastify({
    logger: true,
});

// Register CORS
await fastify.register(cors, {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
});

// ============================================================================
// Routes
// ============================================================================

// Health check
fastify.get('/api/health', async () => {
    const apiKey = process.env.GEMINI_API_KEY || '';
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-pro';
    const maskedKey = apiKey ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}` : 'missing';

    return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        gemini: {
            model,
            apiKey: maskedKey,
            apiKeyPresent: Boolean(apiKey),
        },
    };
});

// Generate new design (returns HTML)
fastify.post<{
    Body: {
        prompt: string;
        stylePreset?: string;
        platform?: string;
        images?: string[];
    };
}>('/api/generate', async (request, reply) => {
    const { prompt, stylePreset, platform, images } = request.body;

    if (!prompt?.trim()) {
        return reply.status(400).send({ error: 'Prompt is required' });
    }

    try {
        fastify.log.info({ platform, stylePreset, imagesCount: images?.length || 0 }, 'generate: start');
        const designSpec = await generateDesign({ prompt, stylePreset, platform, images });
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
    };
}>('/api/edit', async (request, reply) => {
    const { instruction, html, screenId, images } = request.body;

    if (!instruction?.trim()) {
        return reply.status(400).send({ error: 'Instruction is required' });
    }

    if (!html) {
        return reply.status(400).send({ error: 'HTML is required' });
    }

    try {
        const edited = await editDesign({ instruction, html, screenId, images });
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

// Generate new design (STREAM)
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
