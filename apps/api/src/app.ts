// ============================================================================
// API Server - Fastify entry point
// ============================================================================

import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyRawBody from 'fastify-raw-body';
import { v4 as uuidv4 } from 'uuid';
import { generateDesign, editDesign, completePartialScreen, generateImageAsset, generateProjectDesignSystem, type HtmlDesignSpec, type ProjectDesignSystem } from './services/gemini.js';
import { synthesizeImagesForScreens } from './services/imagePipeline.js';
import { saveProject, getProject, listProjects, deleteProject } from './services/database.js';
import { GROQ_MODELS, getLastGroqChatDebug, groqWhisperTranscription } from './services/groq.provider.js';
import { NVIDIA_MODELS, getLastNvidiaChatDebug } from './services/nvidia.provider.js';
import { getPlannerModels, runDesignPlanner, type PlannerPhase } from './services/designPlanner.js';
import { verifyAuthHeader, type AuthUserContext } from './services/firebaseAuth.js';
import {
    buildBillingSummaryForApi,
    estimateCredits,
    grantTopupCredits,
    inferCreditModelProfile,
    InsufficientCreditsError,
    listBillingLedgerForApi,
    reserveCredits,
    resolvePlanFromStripePriceId,
    resolveStripePriceIdForPlan,
    resolveTopupCreditsForPriceId,
    setUserPlan,
    settleReservation,
    getStripeCustomerId,
    attachStripeCustomer,
    findUidByStripeCustomerId,
    type BillingOperation,
    type CreditModelProfile,
    type ReservationOutcome,
} from './services/billing.js';
import {
    createStripeBillingPortalSession,
    createStripeCheckoutSession,
    constructStripeWebhookEvent,
    getStripeClient,
    getStripePublishableKey,
    isStripeConfigured,
    retrieveCheckoutSessionWithLineItems,
} from './services/stripeBilling.js';

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

function resolveAuthHeader(request: { headers: Record<string, unknown> }): string | undefined {
    const value = request.headers.authorization;
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
    return undefined;
}

async function requireAuthenticatedUser(
    request: { headers: Record<string, unknown>; id: string },
    reply: { status: (code: number) => { send: (body: unknown) => unknown } },
    route: string
): Promise<AuthUserContext | null> {
    try {
        const header = resolveAuthHeader(request);
        const user = await verifyAuthHeader(header);
        return user;
    } catch (error) {
        fastify.log.warn({
            traceId: request.id,
            route,
            stage: 'auth',
            err: error,
        }, 'auth: failed');
        reply.status(401).send({
            error: 'Unauthorized',
            message: 'Sign in again to continue.',
            code: 'AUTH_REQUIRED',
        });
        return null;
    }
}

function toCreditModelProfile(preferredModel?: string): CreditModelProfile {
    return inferCreditModelProfile(preferredModel || '');
}

function settleForOutcome(
    uid: string,
    reservationId: string,
    outcome: ReservationOutcome,
    finalCredits?: number,
    metadata?: Record<string, unknown>
) {
    return settleReservation({
        uid,
        reservationId,
        outcome,
        finalCredits,
        metadata,
    });
}

function sendInsufficientCredits(
    reply: { status: (code: number) => { send: (body: unknown) => unknown } },
    error: InsufficientCreditsError
) {
    return reply.status(402).send({
        error: 'Insufficient credits',
        message: `Need ${error.requiredCredits} credits but only ${error.availableCredits} available.`,
        code: 'INSUFFICIENT_CREDITS',
        details: {
            operation: error.operation,
            requiredCredits: error.requiredCredits,
            availableCredits: error.availableCredits,
        },
    });
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
await fastify.register(fastifyRawBody, {
    field: 'rawBody',
    global: false,
    encoding: false,
    runFirst: true,
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

fastify.get('/api/billing/summary', async (request, reply) => {
    const user = await requireAuthenticatedUser(request, reply, '/api/billing/summary');
    if (!user) return;
    try {
        const summary = buildBillingSummaryForApi(user.uid);
        return {
            summary,
            stripe: {
                configured: isStripeConfigured(),
                publishableKeyPresent: Boolean(getStripePublishableKey()),
            },
        };
    } catch (error) {
        fastify.log.error({ traceId: request.id, route: '/api/billing/summary', err: error }, 'billing summary failed');
        return reply.status(500).send({
            error: 'Failed to load billing summary',
            message: (error as Error).message,
        });
    }
});

fastify.get<{
    Querystring: { limit?: string };
}>('/api/billing/ledger', async (request, reply) => {
    const user = await requireAuthenticatedUser(request, reply, '/api/billing/ledger');
    if (!user) return;
    try {
        const limit = Math.max(1, Math.min(200, Number(request.query.limit || 50)));
        const items = listBillingLedgerForApi(user.uid, limit);
        return { items };
    } catch (error) {
        fastify.log.error({ traceId: request.id, route: '/api/billing/ledger', err: error }, 'billing ledger failed');
        return reply.status(500).send({
            error: 'Failed to load billing ledger',
            message: (error as Error).message,
        });
    }
});

fastify.post<{
    Body: {
        operation: BillingOperation;
        preferredModel?: string;
        expectedScreenCount?: number;
        expectedImageCount?: number;
        expectedMinutes?: number;
        bundleIncludesDesignSystem?: boolean;
    };
}>('/api/billing/estimate', async (request, reply) => {
    const user = await requireAuthenticatedUser(request, reply, '/api/billing/estimate');
    if (!user) return;
    try {
        const modelProfile = toCreditModelProfile(request.body.preferredModel);
        const estimate = estimateCredits({
            operation: request.body.operation,
            modelProfile,
            expectedScreenCount: request.body.expectedScreenCount,
            expectedImageCount: request.body.expectedImageCount,
            expectedMinutes: request.body.expectedMinutes,
            bundleIncludesDesignSystem: Boolean(request.body.bundleIncludesDesignSystem),
        });
        const summary = buildBillingSummaryForApi(user.uid);
        return { estimate, summary };
    } catch (error) {
        fastify.log.error({ traceId: request.id, route: '/api/billing/estimate', err: error }, 'billing estimate failed');
        return reply.status(500).send({
            error: 'Failed to estimate credits',
            message: (error as Error).message,
        });
    }
});

fastify.post<{
    Body: {
        productKey: 'pro' | 'team' | 'topup_1000';
        successUrl: string;
        cancelUrl: string;
    };
}>('/api/billing/checkout-session', async (request, reply) => {
    const user = await requireAuthenticatedUser(request, reply, '/api/billing/checkout-session');
    if (!user) return;

    try {
        const { productKey, successUrl, cancelUrl } = request.body;
        const planPriceId = productKey === 'pro'
            ? resolveStripePriceIdForPlan('pro')
            : productKey === 'team'
                ? resolveStripePriceIdForPlan('team')
                : String(process.env.STRIPE_PRICE_TOPUP_1000 || '').trim();
        if (!planPriceId) {
            return reply.status(400).send({
                error: 'Stripe price id missing',
                message: `Price id for ${productKey} is not configured.`,
            });
        }
        if (!isStripeConfigured()) {
            return reply.status(503).send({
                error: 'Billing unavailable',
                message: 'Stripe is not configured on the server.',
            });
        }

        const stripe = getStripeClient();
        if (!stripe) {
            return reply.status(503).send({
                error: 'Billing unavailable',
                message: 'Stripe is not configured on the server.',
            });
        }

        let customerId = getStripeCustomerId(user.uid);
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                metadata: { uid: user.uid },
            });
            customerId = customer.id;
            attachStripeCustomer(user.uid, customerId);
        }

        const mode = productKey === 'topup_1000' ? 'payment' : 'subscription';
        const session = await createStripeCheckoutSession({
            customerId,
            mode,
            priceId: planPriceId,
            successUrl,
            cancelUrl,
            uid: user.uid,
            productKey,
        });
        return {
            id: session.id,
            url: session.url,
        };
    } catch (error) {
        fastify.log.error({ traceId: request.id, route: '/api/billing/checkout-session', err: error }, 'checkout session failed');
        return reply.status(500).send({
            error: 'Failed to create checkout session',
            message: (error as Error).message,
        });
    }
});

fastify.post<{
    Body: {
        returnUrl: string;
    };
}>('/api/billing/portal-session', async (request, reply) => {
    const user = await requireAuthenticatedUser(request, reply, '/api/billing/portal-session');
    if (!user) return;
    try {
        const customerId = getStripeCustomerId(user.uid);
        if (!customerId) {
            return reply.status(400).send({
                error: 'No billing customer',
                message: 'No Stripe customer profile found for this user.',
            });
        }
        const session = await createStripeBillingPortalSession({
            customerId,
            returnUrl: request.body.returnUrl,
        });
        return { url: session.url };
    } catch (error) {
        fastify.log.error({ traceId: request.id, route: '/api/billing/portal-session', err: error }, 'billing portal failed');
        return reply.status(500).send({
            error: 'Failed to create billing portal session',
            message: (error as Error).message,
        });
    }
});

fastify.post<{
    Body: unknown;
}>('/api/stripe/webhook', {
    config: {
        rawBody: true,
    },
}, async (request, reply) => {
    const signature = String(request.headers['stripe-signature'] || '').trim();
    if (!signature) {
        return reply.status(400).send({ error: 'Missing Stripe signature header' });
    }
    try {
        const raw = ((request as any).rawBody as Buffer | undefined) || Buffer.from(JSON.stringify(request.body || {}));
        const event = constructStripeWebhookEvent(raw, signature);

        if (event.type === 'checkout.session.completed') {
            const checkout = event.data.object as any;
            const session = await retrieveCheckoutSessionWithLineItems(checkout.id);
            const customerId = typeof session.customer === 'string'
                ? session.customer
                : session.customer?.id;
            const uid = String(session.metadata?.uid || '').trim() || (customerId ? findUidByStripeCustomerId(customerId) : null);
            if (uid) {
                if (customerId) {
                    attachStripeCustomer(uid, customerId);
                }
                const linePrice = session.line_items?.data?.[0]?.price?.id || null;
                const planId = resolvePlanFromStripePriceId(linePrice);
                const topupCredits = resolveTopupCreditsForPriceId(linePrice);
                if (planId) {
                    setUserPlan({
                        uid,
                        planId,
                        reason: 'stripe_checkout_completed',
                        stripeSubscriptionId: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id,
                        stripePriceId: linePrice,
                    });
                } else if (topupCredits > 0) {
                    grantTopupCredits({
                        uid,
                        credits: topupCredits,
                        reason: 'stripe_topup_purchase',
                        metadata: {
                            sessionId: session.id,
                            priceId: linePrice,
                        },
                    });
                }
            }
        } else if (event.type === 'customer.subscription.deleted' || event.type === 'customer.subscription.updated') {
            const subscription = event.data.object as any;
            const customerId = String(subscription.customer || '').trim();
            const uid = customerId ? findUidByStripeCustomerId(customerId) : null;
            if (uid) {
                const active = subscription.status === 'active' || subscription.status === 'trialing';
                const priceId = subscription.items?.data?.[0]?.price?.id || '';
                const mappedPlan = resolvePlanFromStripePriceId(priceId);
                setUserPlan({
                    uid,
                    planId: mappedPlan || 'free',
                    status: active ? 'active' : 'cancelled',
                    stripeSubscriptionId: subscription.id || null,
                    stripePriceId: priceId || null,
                    reason: 'stripe_subscription_update',
                });
            }
        }

        return reply.send({ received: true });
    } catch (error) {
        fastify.log.error({ traceId: request.id, route: '/api/stripe/webhook', err: error }, 'stripe webhook failed');
        return reply.status(400).send({
            error: 'Webhook processing failed',
            message: (error as Error).message,
        });
    }
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
        bundleIncludesDesignSystem?: boolean;
        projectId?: string;
    };
}>('/api/generate', async (request, reply) => {
    const { prompt, stylePreset, platform, images, preferredModel, projectDesignSystem, bundleIncludesDesignSystem, projectId } = request.body;
    const startedAt = Date.now();
    const traceId = request.id;

    if (!prompt?.trim()) {
        return reply.status(400).send({ error: 'Prompt is required' });
    }

    const user = await requireAuthenticatedUser(request, reply, '/api/generate');
    if (!user) return;

    const reservationEstimate = estimateCredits({
        operation: 'generate',
        modelProfile: toCreditModelProfile(preferredModel),
        expectedScreenCount: 4,
        bundleIncludesDesignSystem: Boolean(bundleIncludesDesignSystem),
    });
    let reservation: { reservationId: string } | null = null;

    try {
        reservation = reserveCredits({
            uid: user.uid,
            requestId: traceId,
            operation: 'generate',
            reservedCredits: reservationEstimate.estimatedCredits,
            projectId,
            metadata: {
                route: '/api/generate',
                modelProfile: reservationEstimate.modelProfile,
                bundleIncludesDesignSystem: Boolean(bundleIncludesDesignSystem),
            },
        });
        fastify.log.info({
            traceId,
            route: '/api/generate',
            stage: 'start',
            uid: user.uid,
            platform,
            stylePreset,
            imagesCount: images?.length || 0,
            preferredModel,
            hasProjectDesignSystem: Boolean(projectDesignSystem),
            promptPreview: previewText(prompt),
        }, 'generate: start');
        const designSpec = await generateDesign({ prompt, stylePreset, platform, images, preferredModel, projectDesignSystem });
        const versionId = uuidv4();
        const charge = estimateCredits({
            operation: 'generate',
            modelProfile: toCreditModelProfile(preferredModel),
            expectedScreenCount: designSpec.screens.length,
            bundleIncludesDesignSystem: Boolean(bundleIncludesDesignSystem),
        });
        const settled = settleForOutcome(user.uid, reservation.reservationId, 'success', charge.estimatedCredits, {
            route: '/api/generate',
            screenCount: designSpec.screens.length,
        });
        fastify.log.info({
            traceId,
            route: '/api/generate',
            stage: 'response',
            uid: user.uid,
            durationMs: Date.now() - startedAt,
            screens: designSpec.screens.length,
            screenNames: designSpec.screens.map((screen) => screen.name).slice(0, 8),
            descriptionPreview: previewText(designSpec.description),
            creditsCharged: settled.finalChargedCredits,
            creditsRemaining: settled.summary.balanceCredits,
        }, 'generate: complete');

        return {
            designSpec,
            versionId,
            billing: {
                creditsCharged: settled.finalChargedCredits,
                creditsRemaining: settled.summary.balanceCredits,
                reservationId: reservation.reservationId,
            },
        };
    } catch (error) {
        if (error instanceof InsufficientCreditsError) {
            return sendInsufficientCredits(reply, error);
        }
        if (reservation) {
            settleForOutcome(user.uid, reservation.reservationId, 'failed', 0, {
                route: '/api/generate',
                error: (error as Error).message,
            });
        }
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
        bundleWithFirstGeneration?: boolean;
        projectId?: string;
    };
}>('/api/design-system', async (request, reply) => {
    const { prompt, stylePreset, platform, images, preferredModel, projectDesignSystem, bundleWithFirstGeneration, projectId } = request.body;
    const startedAt = Date.now();
    const traceId = request.id;

    if (!prompt?.trim()) {
        return reply.status(400).send({ error: 'Prompt is required' });
    }

    const user = await requireAuthenticatedUser(request, reply, '/api/design-system');
    if (!user) return;
    const bundled = Boolean(bundleWithFirstGeneration);
    let reservation: { reservationId: string } | null = null;

    try {
        if (!bundled) {
            const estimate = estimateCredits({
                operation: 'design_system',
                modelProfile: toCreditModelProfile(preferredModel),
            });
            reservation = reserveCredits({
                uid: user.uid,
                requestId: traceId,
                operation: 'design_system',
                reservedCredits: estimate.estimatedCredits,
                projectId,
                metadata: {
                    route: '/api/design-system',
                },
            });
        }
        fastify.log.info({
            traceId,
            route: '/api/design-system',
            stage: 'start',
            uid: user.uid,
            platform,
            stylePreset,
            imagesCount: images?.length || 0,
            preferredModel,
            hasProjectDesignSystem: Boolean(projectDesignSystem),
            bundledWithFirstGeneration: bundled,
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
        let billingMeta: { creditsCharged: number; creditsRemaining: number; reservationId?: string } | undefined;
        if (reservation) {
            const charge = estimateCredits({
                operation: 'design_system',
                modelProfile: toCreditModelProfile(preferredModel),
            });
            const settled = settleForOutcome(user.uid, reservation.reservationId, 'success', charge.estimatedCredits, {
                route: '/api/design-system',
                bundledWithFirstGeneration: bundled,
            });
            billingMeta = {
                creditsCharged: settled.finalChargedCredits,
                creditsRemaining: settled.summary.balanceCredits,
                reservationId: reservation.reservationId,
            };
        } else {
            const summary = buildBillingSummaryForApi(user.uid);
            billingMeta = {
                creditsCharged: 0,
                creditsRemaining: summary.balanceCredits,
            };
        }
        fastify.log.info({
            traceId,
            route: '/api/design-system',
            stage: 'response',
            uid: user.uid,
            durationMs: Date.now() - startedAt,
            systemName: designSystem.systemName,
            stylePreset: designSystem.stylePreset,
            platform: designSystem.platform,
            themeMode: designSystem.themeMode,
            creditsCharged: billingMeta.creditsCharged,
            creditsRemaining: billingMeta.creditsRemaining,
        }, 'design-system: complete');
        return { designSystem, billing: billingMeta };
    } catch (error) {
        if (error instanceof InsufficientCreditsError) {
            return sendInsufficientCredits(reply, error);
        }
        if (reservation) {
            settleForOutcome(user.uid, reservation.reservationId, 'failed', 0, {
                route: '/api/design-system',
                error: (error as Error).message,
            });
        }
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
        projectId?: string;
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
    const { instruction, html, screenId, images, preferredModel, projectDesignSystem, projectId, consistencyProfile, referenceScreens } = request.body;
    const startedAt = Date.now();
    const traceId = request.id;

    if (!instruction?.trim()) {
        return reply.status(400).send({ error: 'Instruction is required' });
    }

    if (!html) {
        return reply.status(400).send({ error: 'HTML is required' });
    }

    const user = await requireAuthenticatedUser(request, reply, '/api/edit');
    if (!user) return;
    const estimate = estimateCredits({
        operation: 'edit',
        modelProfile: toCreditModelProfile(preferredModel),
    });
    let reservation: { reservationId: string } | null = null;

    try {
        reservation = reserveCredits({
            uid: user.uid,
            requestId: traceId,
            operation: 'edit',
            reservedCredits: estimate.estimatedCredits,
            projectId,
            metadata: {
                route: '/api/edit',
                screenId,
            },
        });
        fastify.log.info({
            traceId,
            route: '/api/edit',
            stage: 'start',
            uid: user.uid,
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
        const charge = estimateCredits({
            operation: 'edit',
            modelProfile: toCreditModelProfile(preferredModel),
        });
        const settled = settleForOutcome(user.uid, reservation.reservationId, 'success', charge.estimatedCredits, {
            route: '/api/edit',
            screenId,
        });
        fastify.log.info({
            traceId,
            route: '/api/edit',
            stage: 'response',
            uid: user.uid,
            durationMs: Date.now() - startedAt,
            screenId,
            htmlChars: edited.html.length,
            descriptionPreview: previewText(edited.description),
            creditsCharged: settled.finalChargedCredits,
            creditsRemaining: settled.summary.balanceCredits,
        }, 'edit: complete');

        return {
            html: edited.html,
            description: edited.description,
            versionId,
            billing: {
                creditsCharged: settled.finalChargedCredits,
                creditsRemaining: settled.summary.balanceCredits,
                reservationId: reservation.reservationId,
            },
        };
    } catch (error) {
        if (error instanceof InsufficientCreditsError) {
            return sendInsufficientCredits(reply, error);
        }
        if (reservation) {
            settleForOutcome(user.uid, reservation.reservationId, 'failed', 0, {
                route: '/api/edit',
                error: (error as Error).message,
                screenId,
            });
        }
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
        projectId?: string;
        screens: Array<{
            screenId?: string;
            name: string;
            html: string;
            width?: number;
            height?: number;
        }>;
    };
}>('/api/synthesize-screen-images', async (request, reply) => {
    const { appPrompt, stylePreset, platform, preferredModel, maxImages, projectId, screens } = request.body;
    const startedAt = Date.now();
    const traceId = request.id;

    if (!appPrompt?.trim()) {
        return reply.status(400).send({ error: 'appPrompt is required' });
    }
    if (!Array.isArray(screens) || screens.length === 0) {
        return reply.status(400).send({ error: 'screens is required' });
    }

    const user = await requireAuthenticatedUser(request, reply, '/api/synthesize-screen-images');
    if (!user) return;
    const estimate = estimateCredits({
        operation: 'synthesize_screen_images',
        modelProfile: toCreditModelProfile(preferredModel),
        expectedImageCount: screens.length,
    });
    let reservation: { reservationId: string } | null = null;

    try {
        reservation = reserveCredits({
            uid: user.uid,
            requestId: traceId,
            operation: 'synthesize_screen_images',
            reservedCredits: estimate.estimatedCredits,
            projectId,
            metadata: {
                route: '/api/synthesize-screen-images',
                screenCount: screens.length,
            },
        });
        fastify.log.info({
            traceId,
            route: '/api/synthesize-screen-images',
            stage: 'start',
            uid: user.uid,
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
        const generatedCount = result.stats.generated || 0;
        const charge = estimateCredits({
            operation: 'synthesize_screen_images',
            modelProfile: toCreditModelProfile(preferredModel),
            expectedImageCount: generatedCount,
        });
        const settled = settleForOutcome(user.uid, reservation.reservationId, 'success', charge.estimatedCredits, {
            route: '/api/synthesize-screen-images',
            generatedCount,
        });
        fastify.log.info({
            traceId,
            route: '/api/synthesize-screen-images',
            stage: 'response',
            uid: user.uid,
            durationMs: Date.now() - startedAt,
            stats: result.stats,
            creditsCharged: settled.finalChargedCredits,
            creditsRemaining: settled.summary.balanceCredits,
        }, 'synthesize-screen-images: complete');
        return {
            ...result,
            billing: {
                creditsCharged: settled.finalChargedCredits,
                creditsRemaining: settled.summary.balanceCredits,
                reservationId: reservation.reservationId,
            },
        };
    } catch (error) {
        if (error instanceof InsufficientCreditsError) {
            return sendInsufficientCredits(reply, error);
        }
        if (reservation) {
            settleForOutcome(user.uid, reservation.reservationId, 'failed', 0, {
                route: '/api/synthesize-screen-images',
                error: (error as Error).message,
            });
        }
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
        projectId?: string;
    };
}>('/api/generate-image', async (request, reply) => {
    const { prompt, instruction, preferredModel, projectId } = request.body;
    const startedAt = Date.now();
    const traceId = request.id;

    if (!prompt?.trim()) {
        return reply.status(400).send({ error: 'Prompt is required' });
    }

    const user = await requireAuthenticatedUser(request, reply, '/api/generate-image');
    if (!user) return;
    const estimate = estimateCredits({
        operation: 'generate_image',
        modelProfile: toCreditModelProfile(preferredModel),
    });
    let reservation: { reservationId: string } | null = null;

    try {
        reservation = reserveCredits({
            uid: user.uid,
            requestId: traceId,
            operation: 'generate_image',
            reservedCredits: estimate.estimatedCredits,
            projectId,
            metadata: {
                route: '/api/generate-image',
            },
        });
        fastify.log.info({
            traceId,
            route: '/api/generate-image',
            stage: 'start',
            uid: user.uid,
            preferredModel,
            promptPreview: previewText(prompt),
            instructionPreview: previewText(instruction),
        }, 'generate-image: start');
        const result = await generateImageAsset({ prompt, instruction, preferredModel });
        const charge = estimateCredits({
            operation: 'generate_image',
            modelProfile: toCreditModelProfile(preferredModel),
        });
        const settled = settleForOutcome(user.uid, reservation.reservationId, 'success', charge.estimatedCredits, {
            route: '/api/generate-image',
            modelUsed: result.modelUsed,
        });
        fastify.log.info({
            traceId,
            route: '/api/generate-image',
            stage: 'response',
            uid: user.uid,
            durationMs: Date.now() - startedAt,
            modelUsed: result.modelUsed,
            srcPreview: previewText(result.src, 120),
            creditsCharged: settled.finalChargedCredits,
            creditsRemaining: settled.summary.balanceCredits,
        }, 'generate-image: complete');
        return {
            ...result,
            billing: {
                creditsCharged: settled.finalChargedCredits,
                creditsRemaining: settled.summary.balanceCredits,
                reservationId: reservation.reservationId,
            },
        };
    } catch (error) {
        if (error instanceof InsufficientCreditsError) {
            return sendInsufficientCredits(reply, error);
        }
        if (reservation) {
            settleForOutcome(user.uid, reservation.reservationId, 'failed', 0, {
                route: '/api/generate-image',
                error: (error as Error).message,
            });
        }
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

    const user = await requireAuthenticatedUser(request, reply, '/api/transcribe-audio');
    if (!user) return;
    const approxBytes = Math.round(audioBase64.length * 0.75);
    const approxMinutes = Math.max(1, Math.ceil(approxBytes / (48000 * 60)));
    const estimate = estimateCredits({
        operation: 'transcribe_audio',
        modelProfile: toCreditModelProfile(model),
        expectedMinutes: approxMinutes,
    });
    let reservation: { reservationId: string } | null = null;

    try {
        reservation = reserveCredits({
            uid: user.uid,
            requestId: request.id,
            operation: 'transcribe_audio',
            reservedCredits: estimate.estimatedCredits,
            metadata: {
                route: '/api/transcribe-audio',
                approxMinutes,
            },
        });
        fastify.log.info({
            mimeType,
            language: language || 'auto',
            model: model || process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo',
            uid: user.uid,
            audioBytesApprox: approxBytes,
        }, 'transcribe-audio: start');
        const result = await groqWhisperTranscription({ audioBase64, mimeType, language, model });
        const settled = settleForOutcome(user.uid, reservation.reservationId, 'success', estimate.estimatedCredits, {
            route: '/api/transcribe-audio',
            textLength: result.text.length,
        });
        fastify.log.info({
            modelUsed: result.modelUsed,
            textLength: result.text.length,
            preview: result.text.slice(0, 120),
            uid: user.uid,
            creditsCharged: settled.finalChargedCredits,
            creditsRemaining: settled.summary.balanceCredits,
        }, 'transcribe-audio: complete');
        return {
            ...result,
            billing: {
                creditsCharged: settled.finalChargedCredits,
                creditsRemaining: settled.summary.balanceCredits,
                reservationId: reservation.reservationId,
            },
        };
    } catch (error) {
        if (error instanceof InsufficientCreditsError) {
            return sendInsufficientCredits(reply, error);
        }
        if (reservation) {
            settleForOutcome(user.uid, reservation.reservationId, 'failed', 0, {
                route: '/api/transcribe-audio',
                error: (error as Error).message,
            });
        }
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
        routeReferenceScreens?: Array<{ screenId?: string; name: string; html: string }>;
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
        routeReferenceScreens,
        referenceImages,
        preferredModel,
    } = request.body;
    const startedAt = Date.now();
    const traceId = request.id;

    if (!appPrompt?.trim()) {
        return reply.status(400).send({ error: 'appPrompt is required' });
    }

    const user = await requireAuthenticatedUser(request, reply, '/api/plan');
    if (!user) return;

    try {
        fastify.log.info({
            traceId,
            route: '/api/plan',
            stage: 'start',
            uid: user.uid,
            phase,
            platform,
            stylePreset,
            screensGeneratedCount: screensGenerated?.length || 0,
            screenDetailsCount: screenDetails?.length || 0,
            recentMessagesCount: recentMessages?.length || 0,
            hasProjectMemorySummary: Boolean(projectMemorySummary?.trim()),
            routeReferenceScreensCount: routeReferenceScreens?.length || 0,
            routeReferenceScreenNames: (routeReferenceScreens || []).map((screen) => screen.name).slice(0, 3),
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
            routeReferenceScreens,
            referenceImages,
            preferredModel,
        });
        if (plan.phase === 'route') {
            fastify.log.info({
                traceId,
                route: '/api/plan',
                stage: 'decision',
                uid: user.uid,
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
            uid: user.uid,
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
        bundleIncludesDesignSystem?: boolean;
        projectId?: string;
    };
}>('/api/generate-stream', async (request, reply) => {
    const {
        prompt,
        stylePreset,
        platform,
        images,
        preferredModel,
        projectDesignSystem,
        bundleIncludesDesignSystem,
        projectId,
    } = request.body;
    const startedAt = Date.now();
    const traceId = request.id;

    if (!prompt?.trim()) {
        return reply.status(400).send({ error: 'Prompt is required' });
    }

    const user = await requireAuthenticatedUser(request, reply, '/api/generate-stream');
    if (!user) return;
    const estimate = estimateCredits({
        operation: 'generate_stream',
        modelProfile: toCreditModelProfile(preferredModel),
        expectedScreenCount: 4,
        bundleIncludesDesignSystem: Boolean(bundleIncludesDesignSystem),
    });
    let reservation: { reservationId: string } | null = null;
    let chunkCount = 0;
    let charCount = 0;
    let completedScreens = 0;
    let clientAborted = false;
    request.raw.once('aborted', () => {
        clientAborted = true;
    });
    request.raw.once('close', () => {
        if (!reply.raw.writableEnded) {
            clientAborted = true;
        }
    });

    try {
        reservation = reserveCredits({
            uid: user.uid,
            requestId: traceId,
            operation: 'generate_stream',
            reservedCredits: estimate.estimatedCredits,
            projectId,
            metadata: {
                route: '/api/generate-stream',
                bundleIncludesDesignSystem: Boolean(bundleIncludesDesignSystem),
            },
        });
    } catch (error) {
        if (error instanceof InsufficientCreditsError) {
            return sendInsufficientCredits(reply, error);
        }
        fastify.log.error({ traceId, route: '/api/generate-stream', stage: 'reserve', err: error }, 'generate-stream: reservation failed');
        return reply.status(500).send({
            error: 'Failed to reserve credits',
            message: (error as Error).message,
        });
    }

    reply.raw.setHeader('Content-Type', 'text/plain; charset=utf-8');
    reply.raw.setHeader('Transfer-Encoding', 'chunked');

    try {
        const { generateDesignStream } = await import('./services/gemini.js');
        fastify.log.info({
            traceId,
            route: '/api/generate-stream',
            stage: 'start',
            uid: user.uid,
            platform,
            stylePreset,
            imagesCount: images?.length || 0,
            preferredModel,
            hasProjectDesignSystem: Boolean(projectDesignSystem),
            bundleIncludesDesignSystem: Boolean(bundleIncludesDesignSystem),
            promptPreview: previewText(prompt),
        }, 'generate-stream: start');
        const stream = generateDesignStream({ prompt, stylePreset, platform, images, preferredModel, projectDesignSystem });

        for await (const chunk of stream) {
            chunkCount += 1;
            charCount += chunk.length;
            const matchCount = (chunk.match(/<\/screen>/gi) || []).length;
            if (matchCount > 0) {
                completedScreens += matchCount;
            }
            if (chunkCount === 1) {
                fastify.log.info({
                    traceId,
                    route: '/api/generate-stream',
                    stage: 'progress',
                    uid: user.uid,
                    firstChunkPreview: previewText(chunk, 120),
                }, 'generate-stream: first chunk');
            }
            reply.raw.write(chunk);
        }
        if (reservation) {
            const finalCharge = estimateCredits({
                operation: 'generate_stream',
                modelProfile: toCreditModelProfile(preferredModel),
                expectedScreenCount: Math.max(1, completedScreens),
                bundleIncludesDesignSystem: Boolean(bundleIncludesDesignSystem),
            });
            const settled = settleForOutcome(user.uid, reservation.reservationId, 'success', finalCharge.estimatedCredits, {
                route: '/api/generate-stream',
                chunkCount,
                charCount,
                completedScreens,
            });
            fastify.log.info({
                traceId,
                route: '/api/generate-stream',
                stage: 'billing',
                uid: user.uid,
                creditsCharged: settled.finalChargedCredits,
                creditsRemaining: settled.summary.balanceCredits,
                reservationId: reservation.reservationId,
            }, 'generate-stream: settled');
        }
        fastify.log.info({
            traceId,
            route: '/api/generate-stream',
            stage: 'response',
            uid: user.uid,
            durationMs: Date.now() - startedAt,
            chunkCount,
            charCount,
            completedScreens,
        }, 'generate-stream: complete');
    } catch (error) {
        if (reservation) {
            settleForOutcome(
                user.uid,
                reservation.reservationId,
                clientAborted ? 'cancelled' : 'failed',
                undefined,
                {
                    route: '/api/generate-stream',
                    error: (error as Error).message,
                    chunkCount,
                    charCount,
                    completedScreens,
                    clientAborted,
                }
            );
        }
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
        preferredModel?: string;
        projectId?: string;
    };
}>('/api/complete-screen', async (request, reply) => {
    const { screenName, partialHtml, prompt, platform, stylePreset, projectDesignSystem, preferredModel, projectId } = request.body;
    const startedAt = Date.now();
    const traceId = request.id;

    if (!screenName?.trim()) {
        return reply.status(400).send({ error: 'screenName is required' });
    }

    if (!partialHtml?.trim()) {
        return reply.status(400).send({ error: 'partialHtml is required' });
    }

    const user = await requireAuthenticatedUser(request, reply, '/api/complete-screen');
    if (!user) return;
    const estimate = estimateCredits({
        operation: 'complete_screen',
        modelProfile: toCreditModelProfile(preferredModel),
    });
    let reservation: { reservationId: string } | null = null;

    try {
        reservation = reserveCredits({
            uid: user.uid,
            requestId: traceId,
            operation: 'complete_screen',
            reservedCredits: estimate.estimatedCredits,
            projectId,
            metadata: {
                route: '/api/complete-screen',
                screenName,
            },
        });
        fastify.log.info({
            traceId,
            route: '/api/complete-screen',
            stage: 'start',
            uid: user.uid,
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
        const settled = settleForOutcome(user.uid, reservation.reservationId, 'success', estimate.estimatedCredits, {
            route: '/api/complete-screen',
            screenName,
            htmlChars: html.length,
        });
        fastify.log.info({
            traceId,
            route: '/api/complete-screen',
            stage: 'response',
            uid: user.uid,
            durationMs: Date.now() - startedAt,
            screenName,
            htmlChars: html.length,
            creditsCharged: settled.finalChargedCredits,
            creditsRemaining: settled.summary.balanceCredits,
        }, 'complete-screen: complete');
        return {
            html,
            billing: {
                creditsCharged: settled.finalChargedCredits,
                creditsRemaining: settled.summary.balanceCredits,
                reservationId: reservation.reservationId,
            },
        };
    } catch (error) {
        if (error instanceof InsufficientCreditsError) {
            return sendInsufficientCredits(reply, error);
        }
        if (reservation) {
            settleForOutcome(user.uid, reservation.reservationId, 'failed', 0, {
                route: '/api/complete-screen',
                error: (error as Error).message,
                screenName,
            });
        }
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
