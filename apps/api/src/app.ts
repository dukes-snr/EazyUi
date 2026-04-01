// ============================================================================
// API Server - Fastify entry point
// ============================================================================

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyRawBody from 'fastify-raw-body';
import { v4 as uuidv4 } from 'uuid';
import { generateDesign, editDesign, completePartialScreen, generateImageAsset, generateProjectDesignSystem, type HtmlDesignSpec, type ProjectDesignSystem } from './services/gemini.js';
import { synthesizeImagesForScreens } from './services/imagePipeline.js';
import { saveProject, getProject, listProjects, deleteProject } from './services/database.js';
import { ensurePersistenceSchema } from './services/postgres.js';
import { GROQ_MODELS, getLastGroqChatDebug, groqWhisperTranscription } from './services/groq.provider.js';
import { NVIDIA_MODELS, getLastNvidiaChatDebug } from './services/nvidia.provider.js';
import { getDefaultGeminiTextModel, normalizeGeminiTextModel } from './services/modelConfig.js';
import { getPlannerModels, runDesignPlannerWithUsage, type PlannerPhase } from './services/designPlanner.js';
import { buildFirecrawlReferenceContext, type FirecrawlLogEvent } from './services/firecrawl.js';
import { getFirebaseStorageBucket, verifyAuthHeader, type AuthUserContext } from './services/firebaseAuth.js';
import { consumePluginAuthSession, writePluginAuthSession } from './services/pluginAuthSessions.js';
import { getPluginProjectScreenRenderSource, getPluginProjectScreens, listPluginProjects } from './services/pluginProjects.js';
import { resolveProjectBrandAssetContext, sanitizeAssetReferences, type AssetReference as RequestAssetReference } from './services/projectAssetContext.js';
import { renderRequestActivityDashboardHtml } from './services/requestActivityDashboard.js';
import { getRequestActivitySnapshot, upsertRequestActivity, type RequestActivityItem as ServerActivityItem } from './services/requestActivity.js';
import {
    buildBillingSummaryForApi,
    estimateCredits,
    estimateReservationCredits,
    grantTopupCredits,
    inferCreditModelProfile,
    InsufficientCreditsError,
    listBillingLedgerForApi,
    quoteCreditsFromTokenUsage,
    recordStripeWebhookEvent,
    reserveCredits,
    resolvePlanFromStripePriceId,
    resolveStripePriceIdForPlan,
    resolveTopupCreditsForPriceId,
    setUserPlan,
    settleReservation,
    getStripeCustomerId,
    getBillingPurchase,
    attachStripeCustomer,
    findUidByStripeCustomerId,
    listBillingPurchases,
    listRecentBillingPurchases,
    listRecentStripeWebhookEvents,
    getBillingPurchaseBySource,
    type BillingOperation,
    type BillingSummary,
    type CreditModelProfile,
    type ReservationOutcome,
    type UsageCreditQuote,
    upsertBillingPurchase,
} from './services/billing.js';
import type { TokenUsageSummary } from './services/tokenUsage.js';
import {
    createStripeBillingPortalSession,
    createStripeCheckoutSession,
    constructStripeWebhookEvent,
    getStripeClient,
    getStripePricingCatalog,
    getStripePublishableKey,
    isStripeConfigured,
    retrieveCheckoutSessionWithLineItems,
} from './services/stripeBilling.js';
import {
    constructPolarWebhookEvent,
    createPolarCheckoutSession,
    createPolarCustomerPortalSession,
    getPolarPricingCatalog,
    isPolarConfigured,
    resolveBillingProviderName,
    resolvePlanFromPolarProductId,
    resolvePolarProductId,
    resolveTopupCreditsForPolarProductId,
    retrievePolarCheckoutSession,
    WebhookVerificationError as PolarWebhookVerificationError,
} from './services/polarBilling.js';
import {
    createMcpApiKey,
    listMcpApiKeys,
    resolveMcpApiKey,
    revokeMcpApiKey,
} from './services/mcpApiKeys.js';
import { captureServerAnalyticsEvent } from './services/posthog.js';
import { getResendConfigSummary, sendAccountCreationWelcomeEmail, sendContactInquiryEmail, sendNewsletterSignupEmail } from './services/resendEmail.js';
import { logRequestComplete, logRequestStart, logTagged, warnTagged } from './utils/devLogs.js';

function loadEnv() {
    const candidates = [
        path.resolve(process.cwd(), '.env'),
        path.resolve(process.cwd(), '../../.env'),
    ];
    for (const filePath of candidates) {
        if (fs.existsSync(filePath)) {
            dotenv.config({ path: filePath, override: true });
            return filePath;
        }
    }
    dotenv.config({ override: true });
    return null;
}

loadEnv();

const fastify = Fastify({
    logger: true,
    bodyLimit: parseInt(process.env.API_BODY_LIMIT || `${25 * 1024 * 1024}`, 10),
});

const persistenceReadyPromise = ensurePersistenceSchema();

fastify.addHook('onReady', async () => {
    await persistenceReadyPromise;
});

fastify.addHook('onRequest', async (request) => {
    logRequestStart(request.id, request.method, request.url);
});

fastify.addHook('onResponse', async (request, reply) => {
    const responseTimeMs = typeof reply.elapsedTime === 'number' ? reply.elapsedTime : undefined;
    logRequestComplete(request.id, request.method, request.url, reply.statusCode, responseTimeMs);
});

let renderBrowserPromise: Promise<any> | null = null;

type PlatformKind = 'mobile' | 'tablet' | 'desktop';
type StyleKind = 'modern' | 'minimal' | 'vibrant' | 'luxury' | 'playful';
const LOG_PREVIEW_MAX = 220;
const STREAM_BILLING_MARKER_PREFIX = '\u001eEAZYUI_BILLING:';
const STREAM_BILLING_MARKER_SUFFIX = '\u001e';
const SERVER_ACTIVITY_LIMIT = 250;
const REFERENCE_CONTEXT_HEADER = 'x-eazyui-reference-context';
const STREAM_KEEPALIVE_INTERVAL_MS = 15000;
const DEFAULT_FRONTEND_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173', 'https://eazyui.vercel.app'];

function parseAllowedFrontendOrigins(rawValue: string | undefined): string[] {
    const parts = String(rawValue || '')
        .split(/[,\n\r\t ]+/)
        .map((item) => item.trim())
        .filter(Boolean);
    const normalized = new Set<string>();

    for (const value of [...DEFAULT_FRONTEND_ORIGINS, ...parts]) {
        try {
            normalized.add(new URL(value).origin.toLowerCase());
        } catch {
            warnTagged('API', `Ignoring invalid FRONTEND_URL origin: ${value}`);
        }
    }

    return Array.from(normalized);
}

const allowedFrontendOrigins = parseAllowedFrontendOrigins(process.env.FRONTEND_URL);
const allowVercelPreviewOrigins = /^(1|true|yes)$/i.test(String(process.env.FRONTEND_ALLOW_VERCEL_PREVIEWS || '').trim());

function isAllowedCorsOrigin(origin: string | undefined): boolean {
    if (!origin) return true;
    if (origin === 'null') return true;

    let normalizedOrigin: string;
    let hostname = '';
    try {
        const parsed = new URL(origin);
        normalizedOrigin = parsed.origin.toLowerCase();
        hostname = parsed.hostname.toLowerCase();
    } catch {
        return false;
    }

    if (allowedFrontendOrigins.includes(normalizedOrigin)) {
        return true;
    }

    if (allowVercelPreviewOrigins && hostname.endsWith('.vercel.app')) {
        return true;
    }

    if (hostname === 'figma.com' || hostname === 'www.figma.com' || hostname.endsWith('.figma.com')) {
        return true;
    }

    return false;
}

function applyStreamingCorsHeaders(request: any, reply: any): void {
    const origin = typeof request.headers?.origin === 'string' ? request.headers.origin : undefined;
    if (!origin || !isAllowedCorsOrigin(origin)) return;

    reply.raw.setHeader('Access-Control-Allow-Origin', origin);
    reply.raw.setHeader('Vary', 'Origin');
    reply.raw.setHeader('Access-Control-Expose-Headers', REFERENCE_CONTEXT_HEADER);
}

function prepareStreamingResponse(request: any, reply: any): void {
    applyStreamingCorsHeaders(request, reply);
    reply.raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('Transfer-Encoding', 'chunked');
    reply.raw.setHeader('X-Accel-Buffering', 'no');

    if (typeof reply.raw.flushHeaders === 'function') {
        reply.raw.flushHeaders();
    }

    // Send an initial SSE comment so upstream proxies flush the response immediately.
    reply.raw.write(': stream-open\n\n');
}

function startStreamKeepalive(reply: any): ReturnType<typeof setInterval> {
    return setInterval(() => {
        if (reply.raw.writableEnded || reply.raw.destroyed) return;
        reply.raw.write(': keepalive\n\n');
    }, STREAM_KEEPALIVE_INTERVAL_MS);
}

function stopStreamKeepalive(timer: ReturnType<typeof setInterval> | null | undefined): void {
    if (timer) {
        clearInterval(timer);
    }
}

function mergeAssetReferences(
    explicitAssetRefs: RequestAssetReference[],
    projectBrandAssetRefs: RequestAssetReference[]
): RequestAssetReference[] {
    const seen = new Set<string>();
    const merged: RequestAssetReference[] = [];
    for (const assetRef of [...explicitAssetRefs, ...projectBrandAssetRefs]) {
        const key = `${assetRef.assetId}:${assetRef.scope}:${assetRef.projectId || ''}:${assetRef.source}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(assetRef);
    }
    return merged;
}

async function resolveEffectiveAssetReferences(input: {
    uid: string;
    projectId?: string;
    assetRefs?: unknown;
}) {
    const explicitAssetRefs = sanitizeAssetReferences(input.assetRefs);
    try {
        const projectBrandContext = await resolveProjectBrandAssetContext({
            uid: input.uid,
            projectId: input.projectId,
        });
        const projectBrandAssetRefs = projectBrandContext.context?.autoUseBrandAssets
            ? projectBrandContext.assetRefs
            : [];
        return {
            explicitAssetRefs,
            projectBrandAssetRefs,
            mergedAssetRefs: mergeAssetReferences(explicitAssetRefs, projectBrandAssetRefs),
            projectBrandContext: projectBrandContext.context,
        };
    } catch (error) {
        fastify.log.warn({
            route: 'asset-ref-resolution',
            uid: input.uid,
            projectId: input.projectId,
            err: error,
        }, 'asset refs: falling back to explicit request refs only');
        return {
            explicitAssetRefs,
            projectBrandAssetRefs: [] as RequestAssetReference[],
            mergedAssetRefs: explicitAssetRefs,
            projectBrandContext: null,
        };
    }
}

function parseDataUrlPayload(value: string): { mimeType: string; buffer: Buffer } {
    const match = String(value || '').match(/^data:([^;]+);base64,(.+)$/);
    if (!match?.[1] || !match?.[2]) {
        throw new Error('Invalid data URL payload.');
    }
    return {
        mimeType: match[1].trim(),
        buffer: Buffer.from(match[2], 'base64'),
    };
}

function getActiveBillingProvider() {
    return resolveBillingProviderName(isStripeConfigured());
}

async function buildBillingOperationsSnapshot() {
    const provider = getActiveBillingProvider();
    const stripeWebhookSecretPresent = Boolean(String(process.env.STRIPE_WEBHOOK_SECRET || '').trim());
    const stripePublishableKeyPresent = Boolean(getStripePublishableKey());
    const polarWebhookSecretPresent = Boolean(String(process.env.POLAR_WEBHOOK_SECRET || '').trim());
    const [activity, purchases, stripeWebhookEvents, stripeCatalog, polarCatalog] = await Promise.all([
        getRequestActivitySnapshot(500),
        listRecentBillingPurchases(40),
        provider === 'stripe' ? listRecentStripeWebhookEvents(40) : Promise.resolve([]),
        provider === 'stripe' ? getStripePricingCatalog().catch(() => null) : Promise.resolve(null),
        provider === 'polar' ? getPolarPricingCatalog().catch(() => null) : Promise.resolve(null),
    ]);

    const billingItems = activity.items.filter((item) => item.route.startsWith('/api/billing') || item.route.startsWith('/api/stripe/') || item.route.startsWith('/api/polar/'));
    const providerItems = billingItems.filter((item) => {
        if (provider === 'polar') return item.route.startsWith('/api/billing') || item.route.startsWith('/api/polar/');
        if (provider === 'stripe') return item.route.startsWith('/api/billing') || item.route.startsWith('/api/stripe/');
        return item.route.startsWith('/api/billing');
    });
    const billingErrors = providerItems.filter((item) => item.status === 'error');
    const successfulPayments = purchases.filter((item) => item.status === 'paid' || item.status === 'complete' || item.status === 'succeeded');
    const pendingFulfillment = purchases.filter((item) => item.purchaseKind === 'topup' && item.fulfillmentStatus !== 'applied');
    const grossUsd = purchases.reduce((sum, item) => sum + (Number(item.amountTotal || 0) / 100), 0);
    const recentWebhookEvents = provider === 'polar'
        ? providerItems
            .filter((item) => item.route === '/api/polar/webhook')
            .slice(0, 40)
            .map((item) => ({
                id: item.id,
                eventType: String(item.metadata?.eventType || item.metadata?.stage || 'polar.webhook'),
                receivedAt: item.startedAt,
                status: item.status,
            }))
        : stripeWebhookEvents;

    return {
        timestamp: new Date().toISOString(),
        provider: {
            name: provider,
            configured: provider === 'polar' ? isPolarConfigured() : provider === 'stripe' ? isStripeConfigured() : false,
        },
        help: {
            localCliForwardingRequired: false,
            productionWebhookPath: provider === 'polar' ? '/api/polar/webhook' : provider === 'stripe' ? '/api/stripe/webhook' : null,
            note: provider === 'polar'
                ? 'Polar should post directly to the deployed webhook endpoint. Stripe can remain disabled.'
                : provider === 'stripe'
                    ? 'Use stripe listen only for local development. Production Stripe should post directly to the deployed webhook endpoint.'
                    : 'No billing provider is currently configured.',
        },
        config: {
            activeProvider: provider,
            stripeConfigured: isStripeConfigured(),
            polarConfigured: isPolarConfigured(),
            configured: provider === 'polar' ? isPolarConfigured() : provider === 'stripe' ? isStripeConfigured() : false,
            publishableKeyPresent: provider === 'stripe' ? stripePublishableKeyPresent : false,
            webhookSecretPresent: provider === 'polar' ? polarWebhookSecretPresent : stripeWebhookSecretPresent,
            productIdsConfigured: provider === 'polar'
                ? {
                    pro: Boolean(resolvePolarProductId('pro')),
                    team: Boolean(resolvePolarProductId('team')),
                    topup_1000: Boolean(resolvePolarProductId('topup_1000')),
                }
                : undefined,
            priceCatalog: provider === 'polar' ? polarCatalog : stripeCatalog,
        },
        summary: {
            retainedBillingRequests: providerItems.length,
            retainedBillingErrors: billingErrors.length,
            retainedBillingRunning: providerItems.filter((item) => item.status === 'running').length,
            recentPurchases: purchases.length,
            successfulPayments: successfulPayments.length,
            pendingFulfillment: pendingFulfillment.length,
            webhookEvents: recentWebhookEvents.length,
            grossUsd,
        },
        recentErrors: billingErrors.slice(0, 12),
        recentRequests: providerItems.slice(0, 20),
        recentPayments: purchases,
        recentWebhookEvents,
    };
}

type ReferenceContextMeta = {
    requestedUrls: string[];
    normalizedUrls: string[];
    webContextApplied: boolean;
    warnings: string[];
    skippedReason?: 'missing_api_key' | 'no_valid_urls' | 'all_failed';
    sourceCount: number;
    referenceImageCount: number;
};

const serverActivityById = new Map<string, ServerActivityItem>();
const serverActivityOrder: string[] = [];

function compactServerActivities() {
    while (serverActivityOrder.length > SERVER_ACTIVITY_LIMIT) {
        const staleId = serverActivityOrder.pop();
        if (staleId) serverActivityById.delete(staleId);
    }
}

function encodeReferenceContextHeader(value: ReferenceContextMeta): string {
    return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

function upsertServerActivity(id: string, patch: Partial<ServerActivityItem>) {
    const existing = serverActivityById.get(id);
    if (existing) {
        serverActivityById.set(id, { ...existing, ...patch, metadata: { ...(existing.metadata || {}), ...(patch.metadata || {}) } });
        void persistServerActivity(id);
        return;
    }
    const next: ServerActivityItem = {
        id,
        ...(patch.requestKey ? { requestKey: patch.requestKey } : {}),
        ...(patch.uid ? { uid: patch.uid } : {}),
        ...(patch.userEmail ? { userEmail: patch.userEmail } : {}),
        ...(patch.authType ? { authType: patch.authType } : {}),
        route: patch.route || '',
        method: patch.method || 'GET',
        status: patch.status || 'running',
        startedAt: patch.startedAt || new Date().toISOString(),
        ...(patch.completedAt ? { completedAt: patch.completedAt } : {}),
        ...(typeof patch.durationMs === 'number' ? { durationMs: patch.durationMs } : {}),
        ...(patch.ip ? { ip: patch.ip } : {}),
        ...(patch.operation ? { operation: patch.operation } : {}),
        ...(patch.requestPreview ? { requestPreview: patch.requestPreview } : {}),
        ...(patch.preferredModel ? { preferredModel: patch.preferredModel } : {}),
        ...(typeof patch.expectedScreenCount === 'number' ? { expectedScreenCount: patch.expectedScreenCount } : {}),
        ...(typeof patch.expectedImageCount === 'number' ? { expectedImageCount: patch.expectedImageCount } : {}),
        ...(typeof patch.estimatedCredits === 'number' ? { estimatedCredits: patch.estimatedCredits } : {}),
        ...(typeof patch.reserveCredits === 'number' ? { reserveCredits: patch.reserveCredits } : {}),
        ...(typeof patch.minimumFloorCredits === 'number' ? { minimumFloorCredits: patch.minimumFloorCredits } : {}),
        ...(typeof patch.finalCredits === 'number' ? { finalCredits: patch.finalCredits } : {}),
        ...(typeof patch.balanceCredits === 'number' ? { balanceCredits: patch.balanceCredits } : {}),
        ...(typeof patch.tokensUsed === 'number' ? { tokensUsed: patch.tokensUsed } : {}),
        ...(patch.errorMessage ? { errorMessage: patch.errorMessage } : {}),
        ...(patch.metadata ? { metadata: patch.metadata } : {}),
    };
    serverActivityById.set(id, next);
    serverActivityOrder.unshift(id);
    compactServerActivities();
    void persistServerActivity(id);
}

async function persistServerActivity(id: string): Promise<void> {
    const item = serverActivityById.get(id);
    if (!item) return;
    try {
        await upsertRequestActivity(item);
    } catch (error) {
        fastify.log.warn({ traceId: id, err: error }, 'request activity persistence failed');
    }
}

function shouldTrackServerActivity(url: string): boolean {
    const cleanUrl = String(url || '').split('?')[0];
    return !(
        cleanUrl === '/'
        || cleanUrl === '/dashboard'
        || cleanUrl.startsWith('/dashboard/')
        || cleanUrl === '/api/server/activity'
        || cleanUrl === '/api/server/billing'
        || cleanUrl === '/api/server/stripe'
        || cleanUrl === '/api/health'
        || cleanUrl === '/api/models'
    );
}

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

function canonicalizeReferenceUrlForMatch(value: string): string {
    try {
        const url = new URL(value);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
        if (/^www\./i.test(url.hostname)) {
            url.hostname = url.hostname.replace(/^www\./i, '');
        }
        url.hash = '';
        const serialized = url.toString();
        return serialized.endsWith('/') ? serialized.slice(0, -1) : serialized;
    } catch {
        return '';
    }
}

function normalizeReferenceImageSelectionUrls(referenceUrls?: string[]): string[] {
    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const rawValue of referenceUrls || []) {
        if (typeof rawValue !== 'string') continue;
        const candidate = rawValue.trim();
        if (!candidate) continue;
        const serialized = canonicalizeReferenceUrlForMatch(candidate);
        if (!serialized || seen.has(serialized)) continue;
        seen.add(serialized);
        normalized.push(serialized);
    }
    return normalized;
}

function mergeReferenceImages(baseImages?: string[], referenceImages?: string[]): string[] {
    const merged = [...(Array.isArray(baseImages) ? baseImages : []), ...(Array.isArray(referenceImages) ? referenceImages : [])];
    return Array.from(new Set(
        merged.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    ));
}

async function applyReferenceUrlContext(
    text: string,
    referenceUrls: string[] | undefined,
    referenceImageUrls: string[] | undefined,
    traceId: string,
    route: string,
): Promise<{
    text: string;
    normalizedUrls: string[];
    webContextApplied: boolean;
    scrapedReferenceImages: string[];
    referenceContext: ReferenceContextMeta;
}> {
    const baseText = typeof text === 'string' ? text : String(text || '');
    const requestedUrls = (referenceUrls || []).filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    if (!referenceUrls?.length) {
        return {
            text: baseText,
            normalizedUrls: [],
            webContextApplied: false,
            referenceContext: {
                requestedUrls: [],
                normalizedUrls: [],
                webContextApplied: false,
                warnings: [],
                sourceCount: 0,
                referenceImageCount: 0,
            },
            scrapedReferenceImages: [],
        };
    }

    try {
        const logFirecrawlEvent = (event: FirecrawlLogEvent) => {
            const payload = {
                traceId,
                route,
                firecrawlStage: event.stage,
                firecrawlEndpoint: event.endpoint,
                requestedUrls: 'requestedUrls' in event ? event.requestedUrls : undefined,
                normalizedUrls: 'normalizedUrls' in event ? event.normalizedUrls : undefined,
                url: 'url' in event ? event.url : undefined,
                resolvedUrl: 'resolvedUrl' in event ? event.resolvedUrl : undefined,
                title: 'title' in event ? event.title : undefined,
                description: 'description' in event ? event.description : undefined,
                notesLength: 'notesLength' in event ? event.notesLength : undefined,
                notesPreview: 'notesPreview' in event ? event.notesPreview : undefined,
                brandingPreview: 'brandingPreview' in event ? event.brandingPreview : undefined,
                warnings: 'warnings' in event ? event.warnings?.slice(0, 3) : undefined,
                skippedReason: 'skippedReason' in event ? event.skippedReason : undefined,
                sourceCount: 'sourceCount' in event ? event.sourceCount : undefined,
                promptContextLength: 'promptContextLength' in event ? event.promptContextLength : undefined,
                sources: 'sources' in event ? event.sources : undefined,
                errorMessage: 'errorMessage' in event ? event.errorMessage : undefined,
            };
            if (event.level === 'warn') {
                fastify.log.warn(payload, 'reference-urls: firecrawl');
                warnTagged('Firecrawl', event.stage, payload);
                return;
            }
            fastify.log.info(payload, 'reference-urls: firecrawl');
            logTagged('Firecrawl', event.stage, payload);
        };
        const result = await buildFirecrawlReferenceContext(referenceUrls, { onEvent: logFirecrawlEvent });
        const requestedReferenceImageSources = new Set(normalizeReferenceImageSelectionUrls(referenceImageUrls));
        const scrapedReferenceImages = requestedReferenceImageSources.size > 0
            ? Array.from(new Set(
                result.sources.flatMap((source) => {
                    const requestedUrl = canonicalizeReferenceUrlForMatch(source.requestedUrl);
                    const resolvedUrl = canonicalizeReferenceUrlForMatch(source.resolvedUrl);
                    const matchesSelection = requestedReferenceImageSources.has(requestedUrl)
                        || requestedReferenceImageSources.has(resolvedUrl);
                    return matchesSelection ? source.imageUrls : [];
                })
            ))
            : [];
        const referenceContext: ReferenceContextMeta = {
            requestedUrls,
            normalizedUrls: result.normalizedUrls,
            webContextApplied: Boolean(result.promptContext),
            warnings: result.warnings,
            skippedReason: result.skippedReason,
            sourceCount: result.sources.length,
            referenceImageCount: scrapedReferenceImages.length,
        };
        if (result.warnings.length) {
            fastify.log.warn({
                traceId,
                route,
                referenceUrlsCount: referenceUrls.length,
                normalizedReferenceUrlsCount: result.normalizedUrls.length,
                warnings: result.warnings.slice(0, 3),
                skippedReason: result.skippedReason,
            }, 'reference-urls: partial failure');
        }
        logTagged('Firecrawl', `context ${referenceContext.webContextApplied ? 'applied' : 'skipped'}`, {
            route,
            requestedUrls: referenceContext.requestedUrls,
            normalizedUrls: referenceContext.normalizedUrls,
            sourceCount: referenceContext.sourceCount,
            referenceImageCount: referenceContext.referenceImageCount,
            skippedReason: referenceContext.skippedReason,
            warnings: referenceContext.warnings.slice(0, 2),
            contextPreview: result.promptContext ? previewText(result.promptContext, 600) : undefined,
        });

        if (!result.promptContext) {
            return {
                text: baseText,
                normalizedUrls: result.normalizedUrls,
                webContextApplied: false,
                scrapedReferenceImages,
                referenceContext,
            };
        }

        return {
            text: `${baseText.trim()}\n\n${result.promptContext}`,
            normalizedUrls: result.normalizedUrls,
            webContextApplied: true,
            scrapedReferenceImages,
            referenceContext,
        };
    } catch (error) {
        fastify.log.warn({
            traceId,
            route,
            referenceUrlsCount: referenceUrls.length,
            err: error,
        }, 'reference-urls: failed to build context');
        warnTagged('Firecrawl', 'context failed', {
            route,
            requestedUrls,
            errorMessage: (error as Error).message,
        });
        return {
            text: baseText,
            normalizedUrls: [],
            webContextApplied: false,
            referenceContext: {
                requestedUrls,
                normalizedUrls: [],
                webContextApplied: false,
                warnings: [(error as Error).message || 'Failed to build web reference context.'],
                skippedReason: 'all_failed',
                sourceCount: 0,
                referenceImageCount: 0,
            },
            scrapedReferenceImages: [],
        };
    }
}

function resolveAuthHeader(request: { headers: Record<string, unknown> }): string | undefined {
    const value = request.headers.authorization;
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
    return undefined;
}

function parseBearerToken(headerValue: string | undefined): string | null {
    const value = String(headerValue || '').trim();
    if (!value) return null;
    const match = value.match(/^Bearer\s+(.+)$/i);
    return match?.[1]?.trim() || null;
}

function resolveMcpApiKeyFromHeaders(headers: Record<string, unknown>): string | null {
    const direct = resolveHeaderString(headers, 'x-eazyui-api-key')
        || resolveHeaderString(headers, 'x-api-key');
    if (direct && direct.startsWith('eazy_mcp_')) return direct;

    const auth = resolveHeaderString(headers, 'authorization');
    if (!auth) return null;
    const match = auth.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim() || '';
    if (token.startsWith('eazy_mcp_')) return token;
    return null;
}

function resolveHeaderString(headers: Record<string, unknown>, key: string): string | undefined {
    const value = headers[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) return value[0].trim();
    return undefined;
}

function resolveInternalApiUser(headers: Record<string, unknown>): AuthUserContext | null {
    if (!hasValidInternalApiKey(headers)) return null;
    const uid = resolveHeaderString(headers, 'x-eazyui-uid');
    if (!uid) return null;
    return { uid };
}

function hasValidInternalApiKey(headers: Record<string, unknown>): boolean {
    const expectedKey = String(process.env.INTERNAL_API_KEY || '').trim();
    if (!expectedKey) return false;
    const providedKey = resolveHeaderString(headers, 'x-internal-api-key');
    if (!providedKey || providedKey !== expectedKey) return false;
    return true;
}

function requireInternalApiKey(
    request: { headers: Record<string, unknown>; id: string },
    reply: { status: (code: number) => { send: (body: unknown) => unknown } },
    route: string
): boolean {
    if (hasValidInternalApiKey(request.headers)) return true;
    fastify.log.warn({
        traceId: request.id,
        route,
        stage: 'internal_auth',
    }, 'internal auth: failed');
    reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid internal API key.',
        code: 'INTERNAL_AUTH_REQUIRED',
    });
    return false;
}

function resolveBillingRequestId(request: { id: string; headers: Record<string, unknown> }): string {
    const idempotencyKey = resolveHeaderString(request.headers, 'x-idempotency-key')
        || resolveHeaderString(request.headers, 'idempotency-key')
        || resolveHeaderString(request.headers, 'x-request-id');
    if (!idempotencyKey) return request.id;
    return idempotencyKey.slice(0, 180);
}

async function requireAuthenticatedUser(
    request: { headers: Record<string, unknown>; id: string },
    reply: { status: (code: number) => { send: (body: unknown) => unknown } },
    route: string
): Promise<AuthUserContext | null> {
    const mcpApiKey = resolveMcpApiKeyFromHeaders(request.headers);
    if (mcpApiKey) {
        try {
            const resolved = await resolveMcpApiKey(mcpApiKey, {
                ip: String((request as unknown as { ip?: string }).ip || '').slice(0, 80),
                userAgent: resolveHeaderString(request.headers, 'user-agent'),
            });
            if (resolved) {
                upsertServerActivity(request.id, {
                    uid: resolved.uid,
                    authType: 'mcp',
                });
                return { uid: resolved.uid };
            }
        } catch (error) {
            fastify.log.warn({
                traceId: request.id,
                route,
                stage: 'mcp_api_key_auth',
                err: error,
            }, 'mcp api key auth: failed');
        }
    }

    const internalUser = resolveInternalApiUser(request.headers);
    if (internalUser) {
        upsertServerActivity(request.id, {
            uid: internalUser.uid,
            authType: 'internal',
        });
        return internalUser;
    }
    try {
        const header = resolveAuthHeader(request);
        const user = await verifyAuthHeader(header);
        upsertServerActivity(request.id, {
            uid: user.uid,
            userEmail: user.email,
            authType: 'firebase',
        });
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

async function settleForOutcome(
    uid: string,
    reservationId: string,
    outcome: ReservationOutcome,
    finalCredits?: number,
    metadata?: Record<string, unknown>
) {
    const settled = await settleReservation({
        uid,
        reservationId,
        outcome,
        finalCredits,
        metadata,
    });
    logTagged('Billing', `settled ${outcome}`, {
        uid,
        reservationId,
        route: typeof metadata?.route === 'string' ? metadata.route : undefined,
        finalCredits,
        balanceCredits: settled.summary.balanceCredits,
    });
    return settled;
}

function annotateServerBillingActivity(traceId: string, patch: {
    operation?: BillingOperation;
    preferredModel?: string;
    estimatedCredits?: number;
    reserveCredits?: number;
    minimumFloorCredits?: number;
    finalCredits?: number;
    balanceCredits?: number;
    tokensUsed?: number;
    requestPreview?: string;
    metadata?: Record<string, unknown>;
    errorMessage?: string;
}) {
    upsertServerActivity(traceId, patch);
}

function encodeStreamBillingMarker(payload: Record<string, unknown>): string {
    const base64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
    return `${STREAM_BILLING_MARKER_PREFIX}${base64}${STREAM_BILLING_MARKER_SUFFIX}`;
}

function resolveUsageCharge(params: {
    operation: BillingOperation;
    usage?: TokenUsageSummary;
    fallbackEstimatedCredits: number;
}): { finalCredits: number; usageQuote?: UsageCreditQuote } {
    if (params.operation === 'plan_route') {
        return { finalCredits: 0 };
    }
    if (params.operation === 'plan_assist') {
        return { finalCredits: params.fallbackEstimatedCredits };
    }
    const hasUsage = Boolean(
        params.usage
        && (
            (params.usage.entries?.length || 0) > 0
            || Number(params.usage.totalTokens || 0) > 0
            || Number(params.usage.inputTokens || 0) > 0
            || Number(params.usage.outputTokens || 0) > 0
        )
    );
    if (!hasUsage) {
        return { finalCredits: params.fallbackEstimatedCredits };
    }
    const usageQuote = quoteCreditsFromTokenUsage({
        operation: params.operation,
        usage: params.usage!,
    });
    return {
        finalCredits: Math.max(params.fallbackEstimatedCredits, usageQuote.credits),
        usageQuote,
    };
}

function sendInsufficientCredits(
    reply: { status: (code: number) => { send: (body: unknown) => unknown } },
    error: InsufficientCreditsError,
    details?: Record<string, unknown>
) {
    return reply.status(402).send({
        error: 'Insufficient credits',
        message: `Need ${error.requiredCredits} credits but only ${error.availableCredits} available.`,
        code: 'INSUFFICIENT_CREDITS',
        paywallCode: 'insufficient_credits',
        details: {
            operation: error.operation,
            requiredCredits: error.requiredCredits,
            availableCredits: error.availableCredits,
            ...(details || {}),
        },
    });
}

async function reconcileCompletedCheckoutSession(session: any, eventId?: string | null): Promise<{ uid: string | null; applied: boolean; summary?: BillingSummary }> {
    const customerId = typeof session.customer === 'string'
        ? session.customer
        : session.customer?.id;
    const uid = String(session.metadata?.uid || '').trim() || (customerId ? await findUidByStripeCustomerId(customerId) : null);
    if (!uid) return { uid: null, applied: false };

    if (customerId) {
        await attachStripeCustomer(uid, customerId);
    }

    const linePrice = session.line_items?.data?.[0]?.price?.id || null;
    const planId = resolvePlanFromStripePriceId(linePrice);
    const topupCredits = resolveTopupCreditsForPriceId(linePrice);
    const lineItem = session.line_items?.data?.[0];
    const quantity = Number(lineItem?.quantity || 1);
    const invoiceRef = typeof session.invoice === 'string'
        ? session.invoice
        : session.invoice?.id || '';
    const sourceType: 'checkout' | 'invoice' = invoiceRef ? 'invoice' : 'checkout';
    const sourceId = invoiceRef || session.id;
    const sourceInvoice = typeof session.invoice === 'object' ? session.invoice : null;
    const productKey = String(session.metadata?.productKey || '').trim();
    const purchaseKind: 'subscription' | 'topup' | 'other' = planId
        ? 'subscription'
        : topupCredits > 0
            ? 'topup'
            : 'other';
    const existingPurchase = await getBillingPurchaseBySource(sourceType, sourceId);
    const topupAlreadyApplied = existingPurchase?.purchaseKind === 'topup' && existingPurchase.fulfillmentStatus === 'applied';

    await upsertBillingPurchase({
        uid,
        sourceType,
        sourceId,
        purchaseKind,
        productKey: productKey || undefined,
        planId: planId || undefined,
        stripeCustomerId: customerId || undefined,
        stripeSubscriptionId: (typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id) || undefined,
        stripeInvoiceId: invoiceRef || undefined,
        stripePaymentIntentId: (typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id) || undefined,
        stripePriceId: linePrice || undefined,
        amountTotal: Number(session.amount_total || session.amount_subtotal || 0),
        currency: String(session.currency || 'usd'),
        quantity,
        status: String(session.payment_status || session.status || 'paid'),
        description: String(lineItem?.description || lineItem?.price?.nickname || productKey || 'Checkout purchase'),
        invoiceNumber: sourceInvoice?.number || undefined,
        invoiceUrl: sourceInvoice?.hosted_invoice_url || undefined,
        invoicePdfUrl: sourceInvoice?.invoice_pdf || undefined,
        fulfillmentStatus: planId
            ? 'applied'
            : topupCredits > 0
                ? (topupAlreadyApplied ? 'applied' : 'pending')
                : 'applied',
        creditsAppliedAt: topupAlreadyApplied ? (existingPurchase?.creditsAppliedAt || new Date().toISOString()) : null,
        metadata: {
            ...(eventId ? { stripeEventId: eventId } : {}),
            checkoutSessionId: session.id,
        },
        createdAt: new Date((Number(session.created || 0) || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    });

    if (planId) {
        const summary = await setUserPlan({
            uid,
            planId,
            reason: eventId ? 'stripe_checkout_completed' : 'stripe_checkout_return',
            stripeSubscriptionId: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id,
            stripePriceId: linePrice,
        });
        return { uid, applied: !existingPurchase, summary };
    }

    if (topupCredits > 0) {
        if (topupAlreadyApplied) {
            return { uid, applied: false, summary: await buildBillingSummaryForApi(uid) };
        }
        const summary = await grantTopupCredits({
            uid,
            credits: topupCredits,
            reason: eventId ? 'stripe_topup_purchase' : 'stripe_topup_return',
            metadata: {
                sessionId: session.id,
                priceId: linePrice,
            },
        });
        await upsertBillingPurchase({
            uid,
            sourceType,
            sourceId,
            purchaseKind,
            productKey: productKey || undefined,
            planId: planId || undefined,
            stripeCustomerId: customerId || undefined,
            stripeSubscriptionId: (typeof session.subscription === 'string'
                ? session.subscription
                : session.subscription?.id) || undefined,
            stripeInvoiceId: invoiceRef || undefined,
            stripePaymentIntentId: (typeof session.payment_intent === 'string'
                ? session.payment_intent
                : session.payment_intent?.id) || undefined,
            stripePriceId: linePrice || undefined,
            amountTotal: Number(session.amount_total || session.amount_subtotal || 0),
            currency: String(session.currency || 'usd'),
            quantity,
            status: String(session.payment_status || session.status || 'paid'),
            description: String(lineItem?.description || lineItem?.price?.nickname || productKey || 'Checkout purchase'),
            invoiceNumber: sourceInvoice?.number || undefined,
            invoiceUrl: sourceInvoice?.hosted_invoice_url || undefined,
            invoicePdfUrl: sourceInvoice?.invoice_pdf || undefined,
            fulfillmentStatus: 'applied',
            creditsAppliedAt: new Date().toISOString(),
            metadata: {
                ...(eventId ? { stripeEventId: eventId } : {}),
                checkoutSessionId: session.id,
                topupCreditsGranted: topupCredits,
            },
            createdAt: new Date((Number(session.created || 0) || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
        });
        return { uid, applied: true, summary };
    }

    return { uid, applied: !existingPurchase, summary: await buildBillingSummaryForApi(uid) };
}

async function reconcileCompletedPolarCheckout(checkout: any, eventId?: string | null): Promise<{ uid: string | null; applied: boolean; summary?: BillingSummary }> {
    const uid = String(checkout.externalCustomerId || checkout.metadata?.uid || '').trim();
    if (!uid) return { uid: null, applied: false };

    const productId = String(checkout.productId || checkout.product?.id || '').trim() || null;
    const planId = resolvePlanFromPolarProductId(productId);
    const topupCredits = resolveTopupCreditsForPolarProductId(productId);
    const productKey = String(checkout.metadata?.productKey || '').trim();
    const purchaseKind: 'subscription' | 'topup' | 'other' = planId
        ? 'subscription'
        : topupCredits > 0
            ? 'topup'
            : 'other';
    const existingPurchase = await getBillingPurchaseBySource('checkout', checkout.id);
    const topupAlreadyApplied = existingPurchase?.purchaseKind === 'topup' && existingPurchase.fulfillmentStatus === 'applied';

    await upsertBillingPurchase({
        uid,
        sourceType: 'checkout',
        sourceId: checkout.id,
        purchaseKind,
        productKey: productKey || undefined,
        planId: planId || undefined,
        amountTotal: Number(checkout.totalAmount || checkout.amount || 0),
        currency: String(checkout.currency || 'usd'),
        quantity: 1,
        status: String(checkout.status || 'succeeded'),
        description: String(checkout.product?.name || productKey || 'Polar checkout purchase'),
        fulfillmentStatus: planId
            ? 'applied'
            : topupCredits > 0
                ? (topupAlreadyApplied ? 'applied' : 'pending')
                : 'applied',
        creditsAppliedAt: topupAlreadyApplied ? (existingPurchase?.creditsAppliedAt || new Date().toISOString()) : null,
        metadata: {
            provider: 'polar',
            ...(eventId ? { polarEventType: eventId } : {}),
            polarCheckoutId: checkout.id,
            polarProductId: productId,
            polarCustomerId: checkout.customerId || null,
            polarPaymentProcessor: checkout.paymentProcessor || null,
        },
        createdAt: new Date(checkout.createdAt || Date.now()).toISOString(),
    });

    if (planId) {
        const summary = await setUserPlan({
            uid,
            planId,
            reason: eventId ? 'polar_checkout_completed' : 'polar_checkout_return',
        });
        return { uid, applied: !existingPurchase, summary };
    }

    if (topupCredits > 0) {
        if (topupAlreadyApplied) {
            return { uid, applied: false, summary: await buildBillingSummaryForApi(uid) };
        }
        const summary = await grantTopupCredits({
            uid,
            credits: topupCredits,
            reason: eventId ? 'polar_topup_purchase' : 'polar_topup_return',
            metadata: {
                checkoutId: checkout.id,
                productId,
            },
        });
        await upsertBillingPurchase({
            uid,
            sourceType: 'checkout',
            sourceId: checkout.id,
            purchaseKind,
            productKey: productKey || undefined,
            planId: planId || undefined,
            amountTotal: Number(checkout.totalAmount || checkout.amount || 0),
            currency: String(checkout.currency || 'usd'),
            quantity: 1,
            status: String(checkout.status || 'succeeded'),
            description: String(checkout.product?.name || productKey || 'Polar checkout purchase'),
            fulfillmentStatus: 'applied',
            creditsAppliedAt: new Date().toISOString(),
            metadata: {
                provider: 'polar',
                ...(eventId ? { polarEventType: eventId } : {}),
                polarCheckoutId: checkout.id,
                polarProductId: productId,
                polarCustomerId: checkout.customerId || null,
                polarPaymentProcessor: checkout.paymentProcessor || null,
                topupCreditsGranted: topupCredits,
            },
            createdAt: new Date(checkout.createdAt || Date.now()).toISOString(),
        });
        return { uid, applied: true, summary };
    }

    return { uid, applied: !existingPurchase, summary: await buildBillingSummaryForApi(uid) };
}

async function reconcilePolarPaidOrder(order: any, eventType: string): Promise<{ uid: string | null; applied: boolean; summary?: BillingSummary }> {
    const uid = String(order.customer?.externalId || order.metadata?.uid || '').trim();
    if (!uid) return { uid: null, applied: false };

    const productId = String(order.productId || order.product?.id || '').trim() || null;
    const planId = resolvePlanFromPolarProductId(productId);
    const topupCredits = resolveTopupCreditsForPolarProductId(productId);
    const sourceId = String(order.checkoutId || order.id || '').trim();
    if (!sourceId) return { uid, applied: false, summary: await buildBillingSummaryForApi(uid) };
    const productKey = String(order.metadata?.productKey || '').trim();
    const purchaseKind: 'subscription' | 'topup' | 'other' = planId
        ? 'subscription'
        : topupCredits > 0
            ? 'topup'
            : 'other';
    const existingPurchase = await getBillingPurchaseBySource('checkout', sourceId);
    const topupAlreadyApplied = existingPurchase?.purchaseKind === 'topup' && existingPurchase.fulfillmentStatus === 'applied';

    await upsertBillingPurchase({
        uid,
        sourceType: 'checkout',
        sourceId,
        purchaseKind,
        productKey: productKey || undefined,
        planId: planId || undefined,
        amountTotal: Number(order.totalAmount || order.netAmount || 0),
        currency: String(order.currency || 'usd'),
        quantity: Math.max(1, Number(order.items?.[0]?.quantity || 1)),
        status: String(order.status || (order.paid ? 'paid' : 'pending')),
        description: String(order.description || order.product?.name || productKey || 'Polar order'),
        invoiceNumber: String(order.invoiceNumber || '').trim() || undefined,
        fulfillmentStatus: planId
            ? 'applied'
            : topupCredits > 0
                ? (topupAlreadyApplied ? 'applied' : 'pending')
                : 'applied',
        creditsAppliedAt: topupAlreadyApplied ? (existingPurchase?.creditsAppliedAt || new Date().toISOString()) : null,
        metadata: {
            provider: 'polar',
            polarEventType: eventType,
            polarOrderId: order.id,
            polarCheckoutId: order.checkoutId || null,
            polarProductId: productId,
            polarSubscriptionId: order.subscriptionId || null,
        },
        createdAt: new Date(order.createdAt || Date.now()).toISOString(),
    });

    if (planId) {
        const summary = await setUserPlan({
            uid,
            planId,
            reason: eventType === 'subscription.active' ? 'polar_subscription_active' : 'polar_order_paid',
        });
        return { uid, applied: !existingPurchase, summary };
    }

    if (topupCredits > 0) {
        if (topupAlreadyApplied) {
            return { uid, applied: false, summary: await buildBillingSummaryForApi(uid) };
        }
        const summary = await grantTopupCredits({
            uid,
            credits: topupCredits,
            reason: 'polar_order_paid',
            metadata: {
                orderId: order.id,
                checkoutId: order.checkoutId || null,
                productId,
            },
        });
        await upsertBillingPurchase({
            uid,
            sourceType: 'checkout',
            sourceId,
            purchaseKind,
            productKey: productKey || undefined,
            planId: planId || undefined,
            amountTotal: Number(order.totalAmount || order.netAmount || 0),
            currency: String(order.currency || 'usd'),
            quantity: Math.max(1, Number(order.items?.[0]?.quantity || 1)),
            status: String(order.status || (order.paid ? 'paid' : 'pending')),
            description: String(order.description || order.product?.name || productKey || 'Polar order'),
            invoiceNumber: String(order.invoiceNumber || '').trim() || undefined,
            fulfillmentStatus: 'applied',
            creditsAppliedAt: new Date().toISOString(),
            metadata: {
                provider: 'polar',
                polarEventType: eventType,
                polarOrderId: order.id,
                polarCheckoutId: order.checkoutId || null,
                polarProductId: productId,
                polarSubscriptionId: order.subscriptionId || null,
                topupCreditsGranted: topupCredits,
            },
            createdAt: new Date(order.createdAt || Date.now()).toISOString(),
        });
        return { uid, applied: true, summary };
    }

    return { uid, applied: !existingPurchase, summary: await buildBillingSummaryForApi(uid) };
}

const KNOWN_BILLING_OPERATIONS: BillingOperation[] = [
    'design_system',
    'generate',
    'generate_stream',
    'edit',
    'complete_screen',
    'generate_image',
    'synthesize_screen_images',
    'transcribe_audio',
    'plan_route',
    'plan_assist',
];

const DEFAULT_PAID_ONLY_OPERATIONS: BillingOperation[] = [
    'generate_image',
    'synthesize_screen_images',
];

function parsePaidOnlyOperations(): Set<BillingOperation> {
    const configured = String(process.env.BILLING_PAID_ONLY_OPERATIONS || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    const source = configured.length > 0 ? configured : DEFAULT_PAID_ONLY_OPERATIONS;
    const known = new Set<string>(KNOWN_BILLING_OPERATIONS);
    const resolved = source.filter((operation): operation is BillingOperation => known.has(operation));
    return new Set<BillingOperation>(resolved);
}

const PAID_ONLY_OPERATIONS = parsePaidOnlyOperations();

function sendPlanRequired(
    reply: { status: (code: number) => { send: (body: unknown) => unknown } },
    params: { operation: BillingOperation; planId: BillingSummary['planId']; status: BillingSummary['status'] }
) {
    return reply.status(402).send({
        error: 'Paid plan required',
        message: 'This action requires an active paid plan. Upgrade to Pro or Team to continue.',
        code: 'PLAN_REQUIRED',
        paywallCode: 'plan_required',
        details: {
            operation: params.operation,
            currentPlanId: params.planId,
            currentPlanStatus: params.status,
            requiredPlan: 'pro_or_team',
        },
    });
}

async function ensureBillingEntitlementOrReply(input: {
    reply: { status: (code: number) => { send: (body: unknown) => unknown } };
    traceId: string;
    route: string;
    uid: string;
    operation: BillingOperation;
    estimatedCredits: number;
    minimumFloorCredits?: number;
}): Promise<BillingSummary | null> {
    const summary = await buildBillingSummaryForApi(input.uid);
    const requiresPaidPlan = PAID_ONLY_OPERATIONS.has(input.operation);
    const hasActivePaidPlan = summary.planId !== 'free' && summary.status === 'active';

    if (requiresPaidPlan && !hasActivePaidPlan) {
        annotateServerBillingActivity(input.traceId, {
            operation: input.operation,
            estimatedCredits: input.estimatedCredits,
            minimumFloorCredits: input.minimumFloorCredits,
            errorMessage: 'Paid plan required',
        });
        fastify.log.info({
            traceId: input.traceId,
            route: input.route,
            stage: 'billing_entitlement',
            uid: input.uid,
            operation: input.operation,
            decision: 'blocked',
            reason: 'plan_required',
            planId: summary.planId,
            planStatus: summary.status,
            estimatedCredits: input.estimatedCredits,
            balanceCredits: summary.balanceCredits,
        }, 'billing entitlement blocked');
        warnTagged('Billing', 'entitlement blocked', {
            route: input.route,
            operation: input.operation,
            reason: 'plan_required',
            estimatedCredits: input.estimatedCredits,
            balanceCredits: summary.balanceCredits,
            planId: summary.planId,
        });
        sendPlanRequired(input.reply, {
            operation: input.operation,
            planId: summary.planId,
            status: summary.status,
        });
        return null;
    }

    if (input.estimatedCredits > 0 && summary.balanceCredits < input.estimatedCredits) {
        const insufficient = new InsufficientCreditsError({
            operation: input.operation,
            requiredCredits: input.estimatedCredits,
            availableCredits: summary.balanceCredits,
        });
        annotateServerBillingActivity(input.traceId, {
            operation: input.operation,
            estimatedCredits: input.estimatedCredits,
            reserveCredits: input.estimatedCredits,
            minimumFloorCredits: input.minimumFloorCredits,
            balanceCredits: summary.balanceCredits,
            errorMessage: `Need ${input.estimatedCredits} credits but only ${summary.balanceCredits} available.`,
            metadata: { pricingMode: 'reserve_then_settle' },
        });
        fastify.log.info({
            traceId: input.traceId,
            route: input.route,
            stage: 'billing_entitlement',
            uid: input.uid,
            operation: input.operation,
            decision: 'blocked',
            reason: 'insufficient_credits',
            estimatedCredits: input.estimatedCredits,
            balanceCredits: summary.balanceCredits,
        }, 'billing entitlement blocked');
        warnTagged('Billing', 'entitlement blocked', {
            route: input.route,
            operation: input.operation,
            reason: 'insufficient_credits',
            estimatedCredits: input.estimatedCredits,
            balanceCredits: summary.balanceCredits,
        });
        sendInsufficientCredits(input.reply, insufficient, {
            reserveEstimatedCredits: input.estimatedCredits,
            minimumFloorCredits: typeof input.minimumFloorCredits === 'number'
                ? input.minimumFloorCredits
                : input.estimatedCredits,
            pricingMode: 'reserve_then_settle',
        });
        return null;
    }

    fastify.log.info({
        traceId: input.traceId,
        route: input.route,
        stage: 'billing_entitlement',
        uid: input.uid,
        operation: input.operation,
        decision: 'allowed',
        estimatedCredits: input.estimatedCredits,
        balanceCredits: summary.balanceCredits,
        planId: summary.planId,
        planStatus: summary.status,
    }, 'billing entitlement allowed');
    logTagged('Billing', 'entitlement allowed', {
        route: input.route,
        operation: input.operation,
        estimatedCredits: input.estimatedCredits,
        balanceCredits: summary.balanceCredits,
        planId: summary.planId,
    });
    annotateServerBillingActivity(input.traceId, {
        operation: input.operation,
        estimatedCredits: input.estimatedCredits,
        reserveCredits: input.estimatedCredits,
        minimumFloorCredits: input.minimumFloorCredits,
        balanceCredits: summary.balanceCredits,
    });
    return summary;
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

function hasExplicitDarkThemeSignal(html: string): boolean {
    const source = String(html || '');
    return /<(html|body)\b[^>]*\bclass\s*=\s*["'][^"']*\bdark\b/i.test(source)
        || /<(html|body)\b[^>]*\bdata-theme\s*=\s*["']dark["']/i.test(source)
        || /<(html|body)\b[^>]*\bdata-color-scheme\s*=\s*["']dark["']/i.test(source)
        || /<(html|body)\b[^>]*\bstyle\s*=\s*["'][^"']*color-scheme\s*:\s*dark/i.test(source);
}

function normalizeRenderColorSchemeHtml(html: string): { html: string; colorScheme: 'light' | 'dark' } {
    const source = String(html || '');
    if (!source.trim()) {
        return { html: source, colorScheme: 'light' };
    }

    if (hasExplicitDarkThemeSignal(source)) {
        return { html: source, colorScheme: 'dark' };
    }

    const colorSchemeStyle = `
<style id="eazyui-render-color-scheme">
  :root { color-scheme: light !important; }
</style>`;
    const patchedMedia = source.replace(/prefers-color-scheme\s*:\s*dark/gi, 'max-width: 0px');
    const nextHtml = /<head\b[^>]*>/i.test(patchedMedia)
        ? patchedMedia.replace(/<head\b([^>]*)>/i, `<head$1>${colorSchemeStyle}`)
        : `${colorSchemeStyle}${patchedMedia}`;

    return {
        html: nextHtml,
        colorScheme: 'light',
    };
}

async function renderHtmlToImagePayload(params: {
    html: string;
    width?: number;
    height?: number;
    scale?: number;
    fullPage?: boolean;
    format?: 'png' | 'jpeg';
    quality?: number;
    fitToViewport?: boolean;
}): Promise<{
    imageBase64: string;
    mimeType: string;
    pngBase64: string;
    width: number;
    height: number;
    scale: number;
    fullPage: boolean;
}> {
    const rawHtml = String(params.html || '');
    const width = Math.max(240, Math.min(2400, Number(params.width || 402)));
    const height = Math.max(240, Math.min(3200, Number(params.height || 874)));
    const scale = Math.max(1, Math.min(3, Number(params.scale || 2)));
    const fullPage = params.fullPage === true;
    const format = params.format === 'jpeg' ? 'jpeg' : 'png';
    const quality = format === 'jpeg'
        ? Math.max(30, Math.min(95, Number(params.quality || 72)))
        : undefined;
    const fitToViewport = params.fitToViewport === true;

    if (!rawHtml.trim()) {
        throw new Error('html is required');
    }

    const normalizedRender = normalizeRenderColorSchemeHtml(rawHtml);
    const browser = await getRenderBrowser();
    const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: scale,
        colorScheme: normalizedRender.colorScheme,
    });
    const page = await context.newPage();
    try {
        await page.setContent(normalizedRender.html, {
            waitUntil: 'domcontentloaded',
            timeout: 20000,
        });
        try {
            await page.waitForLoadState('networkidle', { timeout: 1500 });
        } catch {
            // ignore
        }
        if (fitToViewport) {
            await page.evaluate(({ viewportWidth, viewportHeight }: { viewportWidth: number; viewportHeight: number }) => {
                const docEl = document.documentElement;
                const body = document.body;
                if (!docEl || !body) return;
                docEl.style.margin = '0';
                body.style.margin = '0';
                body.style.transform = 'none';
                body.style.width = 'auto';
                body.style.height = 'auto';
                body.style.minHeight = 'auto';
                body.style.position = 'absolute';
                body.style.top = '0';
                body.style.left = '0';
                body.style.right = 'auto';
                body.style.bottom = 'auto';
                body.style.overflow = 'visible';
                const docWidth = Math.max(
                    docEl.scrollWidth,
                    docEl.offsetWidth,
                    body.scrollWidth,
                    body.offsetWidth,
                    1,
                );
                const docHeight = Math.max(
                    docEl.scrollHeight,
                    docEl.offsetHeight,
                    body.scrollHeight,
                    body.offsetHeight,
                    1,
                );
                const scaleToFitWidth = viewportWidth / Math.max(1, docWidth);
                const safeScale = Number.isFinite(scaleToFitWidth) ? Math.min(1, Math.max(0.1, scaleToFitWidth)) : 1;
                const offsetX = Math.max(0, (viewportWidth - (docWidth * safeScale)) / 2);
                docEl.style.width = `${viewportWidth}px`;
                docEl.style.height = `${viewportHeight}px`;
                docEl.style.overflow = 'hidden';
                body.style.overflow = 'hidden';
                body.style.transformOrigin = 'top left';
                body.style.transform = `translate(${offsetX}px, 0px) scale(${safeScale})`;
                body.style.width = `${docWidth}px`;
                body.style.height = `${docHeight}px`;
            }, { viewportWidth: width, viewportHeight: height });
            await page.waitForTimeout(120);
        }
        await page.waitForTimeout(180);
        const image = await page.screenshot({
            type: format,
            fullPage,
            ...(typeof quality === 'number' ? { quality } : {}),
        });
        return {
            imageBase64: image.toString('base64'),
            mimeType: format === 'jpeg' ? 'image/jpeg' : 'image/png',
            pngBase64: image.toString('base64'),
            width,
            height,
            scale,
            fullPage,
        };
    } finally {
        await context.close();
    }
}

async function buildFigmaScenePayloadFromHtml(params: {
    html: string;
    screenId: string;
    name: string;
    width?: number;
    height?: number;
    designSystem?: unknown;
}): Promise<Record<string, unknown>> {
    const rawHtml = String(params.html || '');
    const width = Math.max(240, Math.min(2400, Number(params.width || 402)));
    const height = Math.max(240, Math.min(3200, Number(params.height || 874)));
    if (!rawHtml.trim()) {
        throw new Error('html is required');
    }

    const normalizedRender = normalizeRenderColorSchemeHtml(rawHtml);
    const browser = await getRenderBrowser();
    const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 1,
        colorScheme: normalizedRender.colorScheme,
    });
    const page = await context.newPage();
    try {
        await page.setContent(normalizedRender.html, {
            waitUntil: 'domcontentloaded',
            timeout: 20000,
        });
        try {
            await page.waitForLoadState('networkidle', { timeout: 1500 });
        } catch {
            // ignore
        }
        await page.waitForTimeout(180);

        const payload = await page.evaluate(({ screenId, name, width, height, designSystem }: {
            screenId: string;
            name: string;
            width: number;
            height: number;
            designSystem: unknown;
        }) => {
            const SKIP_TAGS = new Set(['script', 'style', 'meta', 'link', 'head', 'title', 'noscript', 'template']);
            const TEXT_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'label', 'small', 'strong', 'em', 'b', 'i', 'li', 'figcaption', 'blockquote', 'code', 'pre']);

            function round2(value: any) {
                return Math.round((Number(value) || 0) * 100) / 100;
            }

            function toPx(value: any) {
                const parsed = Number.parseFloat(String(value || '0'));
                return Number.isFinite(parsed) ? parsed : 0;
            }

            function readInsets(css: any, prefix: any) {
                return {
                    top: round2(toPx(prefix === 'padding' ? css.paddingTop : css.marginTop)),
                    right: round2(toPx(prefix === 'padding' ? css.paddingRight : css.marginRight)),
                    bottom: round2(toPx(prefix === 'padding' ? css.paddingBottom : css.marginBottom)),
                    left: round2(toPx(prefix === 'padding' ? css.paddingLeft : css.marginLeft)),
                };
            }

            function normalizeBounds(rect: any, rootRect: any) {
                return {
                    x: round2(rect.left - rootRect.left),
                    y: round2(rect.top - rootRect.top),
                    width: round2(rect.width),
                    height: round2(rect.height),
                };
            }

            function getNodeName(element: any) {
                const tagName = element.tagName.toLowerCase();
                const idName = String(element.getAttribute('id') || '').trim();
                const className = String(element.getAttribute('class') || '').trim();
                if (idName) return `${tagName}#${idName}`;
                if (className) return `${tagName}.${className.split(/\s+/)[0]}`;
                return tagName;
            }

            function extractDirectText(element: any) {
                const tagName = element.tagName.toLowerCase();
                if (tagName === 'input') {
                    return String(element.value || element.placeholder || '').trim();
                }
                if (tagName === 'textarea') {
                    return String(element.value || element.placeholder || '').trim();
                }
                return Array.from(element.childNodes)
                    .filter((node: any) => node.nodeType === Node.TEXT_NODE)
                    .map((node: any) => node.textContent || '')
                    .join(' ')
                    .replace(/\s+/g, ' ')
                    .trim();
            }

            function hasElementChildren(element: any) {
                return Array.from(element.children).some((child: any) => !SKIP_TAGS.has(child.tagName.toLowerCase()));
            }

            function hasVisualChrome(css: any) {
                return css.backgroundColor !== 'rgba(0, 0, 0, 0)'
                    || toPx(css.borderTopWidth) > 0
                    || toPx(css.borderRightWidth) > 0
                    || toPx(css.borderBottomWidth) > 0
                    || toPx(css.borderLeftWidth) > 0
                    || css.boxShadow !== 'none'
                    || css.backdropFilter !== 'none';
            }

            function inferSizeMode(css: any, axis: any) {
                const display = String(css.display || '').toLowerCase();
                const sizeValue = String(axis === 'width' ? css.width : css.height || '').toLowerCase();
                if (sizeValue === 'max-content' || sizeValue === 'fit-content') return 'hug';
                if (sizeValue === 'auto' && (display === 'inline' || display === 'inline-flex' || display === 'inline-block')) {
                    return 'hug';
                }
                if ((axis === 'width' && Number.parseFloat(css.flexGrow || '0') > 0) || (axis === 'height' && Number.parseFloat(css.flexGrow || '0') > 0)) {
                    return 'fill';
                }
                return 'fixed';
            }

            function buildLayout(css: any) {
                const flexGrow = Number.parseFloat(css.flexGrow || '0');
                const flexShrink = Number.parseFloat(css.flexShrink || '1');
                return {
                    display: css.display,
                    position: css.position,
                    flexDirection: css.flexDirection || undefined,
                    justifyContent: css.justifyContent || undefined,
                    alignContent: css.alignContent || undefined,
                    alignItems: css.alignItems || undefined,
                    alignSelf: css.alignSelf || undefined,
                    gap: round2(toPx(css.gap)),
                    rowGap: round2(toPx(css.rowGap || css.gap)),
                    columnGap: round2(toPx(css.columnGap || css.gap)),
                    wrap: css.flexWrap === 'wrap' || css.flexWrap === 'wrap-reverse',
                    flexGrow: Number.isFinite(flexGrow) ? round2(flexGrow) : undefined,
                    flexShrink: Number.isFinite(flexShrink) ? round2(flexShrink) : undefined,
                    flexBasis: css.flexBasis && css.flexBasis !== 'auto' ? css.flexBasis : undefined,
                    justifySelf: css.justifySelf || undefined,
                    widthMode: inferSizeMode(css, 'width'),
                    heightMode: inferSizeMode(css, 'height'),
                    overflowX: css.overflowX || undefined,
                    overflowY: css.overflowY || undefined,
                    safeAutoLayout: false,
                    padding: readInsets(css, 'padding'),
                    margin: readInsets(css, 'margin'),
                };
            }

            function buildBorder(css: any) {
                return {
                    radius: css.borderRadius,
                    top: { width: round2(toPx(css.borderTopWidth)), color: css.borderTopColor, style: css.borderTopStyle },
                    right: { width: round2(toPx(css.borderRightWidth)), color: css.borderRightColor, style: css.borderRightStyle },
                    bottom: { width: round2(toPx(css.borderBottomWidth)), color: css.borderBottomColor, style: css.borderBottomStyle },
                    left: { width: round2(toPx(css.borderLeftWidth)), color: css.borderLeftColor, style: css.borderLeftStyle },
                };
            }

            function buildTypography(css: any) {
                return {
                    fontFamily: css.fontFamily,
                    fontSize: css.fontSize,
                    fontWeight: css.fontWeight,
                    fontStyle: css.fontStyle,
                    lineHeight: css.lineHeight,
                    letterSpacing: css.letterSpacing,
                    textAlign: css.textAlign,
                    textTransform: css.textTransform,
                    textDecoration: css.textDecorationLine || css.textDecoration,
                    whiteSpace: css.whiteSpace,
                    fontVariationSettings: css.fontVariationSettings || undefined,
                };
            }

            function buildVisual(css: any, element: any) {
                const visual: any = {
                    color: css.color || 'rgb(17, 24, 39)',
                    backgroundColor: css.backgroundColor || 'rgba(0, 0, 0, 0)',
                    backgroundImage: css.backgroundImage && css.backgroundImage !== 'none' ? css.backgroundImage : undefined,
                    backgroundSize: css.backgroundSize && css.backgroundSize !== 'auto' ? css.backgroundSize : undefined,
                    backgroundPosition: css.backgroundPosition && css.backgroundPosition !== '0% 0%' ? css.backgroundPosition : undefined,
                    backgroundRepeat: css.backgroundRepeat && css.backgroundRepeat !== 'repeat' ? css.backgroundRepeat : undefined,
                    backgroundBlendMode: css.backgroundBlendMode && css.backgroundBlendMode !== 'normal' ? css.backgroundBlendMode : undefined,
                    opacity: css.opacity || '1',
                    boxShadow: css.boxShadow || 'none',
                    filter: css.filter && css.filter !== 'none' ? css.filter : undefined,
                    backdropFilter: css.backdropFilter && css.backdropFilter !== 'none' ? css.backdropFilter : undefined,
                    textShadow: css.textShadow && css.textShadow !== 'none' ? css.textShadow : undefined,
                    mixBlendMode: css.mixBlendMode && css.mixBlendMode !== 'normal' ? css.mixBlendMode : undefined,
                    clipPath: css.clipPath && css.clipPath !== 'none' ? css.clipPath : undefined,
                    maskImage: css.maskImage && css.maskImage !== 'none' ? css.maskImage : undefined,
                    maskSize: css.maskSize && css.maskSize !== 'auto' ? css.maskSize : undefined,
                    maskPosition: css.maskPosition && css.maskPosition !== '0% 0%' ? css.maskPosition : undefined,
                    maskRepeat: css.maskRepeat && css.maskRepeat !== 'repeat' ? css.maskRepeat : undefined,
                    outlineWidth: css.outlineWidth && css.outlineWidth !== '0px' ? css.outlineWidth : undefined,
                    outlineColor: css.outlineColor && css.outlineColor !== 'currentcolor' ? css.outlineColor : undefined,
                    outlineStyle: css.outlineStyle && css.outlineStyle !== 'none' ? css.outlineStyle : undefined,
                    outlineOffset: css.outlineOffset && css.outlineOffset !== '0px' ? css.outlineOffset : undefined,
                };
                if (element.tagName && element.tagName.toLowerCase() === 'img') {
                    visual.objectFit = css.objectFit || undefined;
                    visual.objectPosition = css.objectPosition || undefined;
                }
                return visual;
            }

            function createTextChild(element: any, textNode: any, rootRect: any, nodeId: any): any {
                const textContent = String(textNode.textContent || '').replace(/\s+/g, ' ').trim();
                if (!textContent) return null;
                const range = document.createRange();
                range.selectNodeContents(textNode);
                const rect = range.getBoundingClientRect();
                const targetRect = (rect.width > 0 || rect.height > 0) ? rect : element.getBoundingClientRect();
                const css = window.getComputedStyle(element);
                return {
                    id: nodeId,
                    name: `${getNodeName(element)}:text`,
                    nodeType: 'text',
                    tagName: '#text',
                    bounds: normalizeBounds(targetRect, rootRect),
                    layout: {
                        display: 'inline',
                        position: 'static',
                        padding: { top: 0, right: 0, bottom: 0, left: 0 },
                        margin: { top: 0, right: 0, bottom: 0, left: 0 },
                    },
                    border: {
                        radius: '0px',
                        top: { width: 0, color: 'transparent', style: 'none' },
                        right: { width: 0, color: 'transparent', style: 'none' },
                        bottom: { width: 0, color: 'transparent', style: 'none' },
                        left: { width: 0, color: 'transparent', style: 'none' },
                    },
                    visual: {
                        color: css.color || 'rgb(17, 24, 39)',
                        backgroundColor: 'rgba(0, 0, 0, 0)',
                        opacity: css.opacity || '1',
                        boxShadow: 'none',
                    },
                    typography: buildTypography(css),
                    textContent,
                    children: [],
                };
            }

            function buildSceneNode(element: any, rootRect: any): any {
                const css = window.getComputedStyle(element);
                const tagName = element.tagName.toLowerCase();
                if (SKIP_TAGS.has(tagName)) return null;
                if (css.display === 'none' || css.visibility === 'hidden' || element.hidden) return null;

                const bounds = normalizeBounds(element.getBoundingClientRect(), rootRect);
                const directText = extractDirectText(element);
                const hasSize = bounds.width > 0.25 || bounds.height > 0.25;
                if (!hasSize && !directText) return null;

                if (tagName === 'svg') {
                    return {
                        id: element.getAttribute('data-uid') || element.getAttribute('id') || `svg-${Math.random().toString(36).slice(2, 10)}`,
                        name: getNodeName(element),
                        nodeType: 'svg',
                        tagName,
                        bounds,
                        layout: buildLayout(css),
                        border: buildBorder(css),
                        visual: buildVisual(css, element),
                        svg: {
                            markup: element.outerHTML,
                            kind: 'inline-svg',
                        },
                        children: [],
                    };
                }

                if (tagName === 'img') {
                    return {
                        id: element.getAttribute('data-uid') || element.getAttribute('id') || `img-${Math.random().toString(36).slice(2, 10)}`,
                        name: getNodeName(element),
                        nodeType: 'image',
                        tagName,
                        bounds,
                        layout: buildLayout(css),
                        border: buildBorder(css),
                        visual: buildVisual(css, element),
                        image: {
                            src: element.currentSrc || element.src || '',
                            alt: element.alt || '',
                            kind: 'content-image',
                        },
                        children: [],
                    };
                }

                if (TEXT_TAGS.has(tagName) && !hasElementChildren(element) && !hasVisualChrome(css) && directText) {
                    return {
                        id: element.getAttribute('data-uid') || element.getAttribute('id') || `${tagName}-${Math.random().toString(36).slice(2, 10)}`,
                        name: getNodeName(element),
                        nodeType: 'text',
                        tagName,
                        bounds,
                        layout: buildLayout(css),
                        border: buildBorder(css),
                        visual: buildVisual(css, element),
                        typography: buildTypography(css),
                        textContent: directText,
                        children: [],
                    };
                }

                const children: any[] = [];
                let directTextIndex = 0;
                for (const childNode of Array.from(element.childNodes) as any[]) {
                    if (childNode.nodeType === Node.TEXT_NODE) {
                        const textChild = createTextChild(element, childNode, rootRect, `${element.tagName.toLowerCase()}:text:${directTextIndex}`);
                        directTextIndex += 1;
                        if (textChild) {
                            children.push(textChild);
                        }
                        continue;
                    }
                    if (childNode.nodeType !== Node.ELEMENT_NODE) continue;
                    const nextChild: any = buildSceneNode(childNode, rootRect);
                    if (nextChild) {
                        children.push(nextChild);
                    }
                }

                const layout = buildLayout(css);
                return {
                    id: element.getAttribute('data-uid') || element.getAttribute('id') || `${tagName}-${Math.random().toString(36).slice(2, 10)}`,
                    name: getNodeName(element),
                    nodeType: 'frame',
                    tagName,
                    bounds,
                    layout,
                    border: buildBorder(css),
                    visual: buildVisual(css, element),
                    typography: directText ? buildTypography(css) : undefined,
                    textContent: directText || undefined,
                    children,
                };
            }

            const body = document.body;
            const bodyStyle = window.getComputedStyle(body);
            const rootRect = body.getBoundingClientRect();
            const children = (Array.from(body.children) as any[])
                .map((child: any) => buildSceneNode(child, rootRect))
                .filter(Boolean);

            return {
                format: 'eazyui.figma-scene',
                version: 2,
                generatedAt: new Date().toISOString(),
                notes: [
                    'Generated from saved EazyUI project HTML for plugin import.',
                ],
                designSystem: designSystem || undefined,
                screens: [
                    {
                        screenId,
                        name,
                        width,
                        height,
                        root: {
                            id: `screen:${screenId}`,
                            name,
                            nodeType: 'screen',
                            tagName: 'body',
                            bounds: {
                                x: 0,
                                y: 0,
                                width,
                                height,
                            },
                            layout: buildLayout(bodyStyle),
                            border: buildBorder(bodyStyle),
                            visual: buildVisual(bodyStyle, body),
                            children,
                        },
                    },
                ],
            };
        }, {
            screenId: params.screenId,
            name: params.name,
            width,
            height,
            designSystem: params.designSystem || null,
        });

        return payload as Record<string, unknown>;
    } finally {
        await context.close();
    }
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
    origin: (origin, callback) => {
        if (isAllowedCorsOrigin(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error(`Origin not allowed by CORS: ${origin || 'unknown'}`), false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: [REFERENCE_CONTEXT_HEADER],
});
await fastify.register(fastifyRawBody, {
    field: 'rawBody',
    global: false,
    encoding: false,
    runFirst: true,
});

fastify.addHook('preHandler', async (request) => {
    if (!shouldTrackServerActivity(request.url)) return;
    const body = (request.body && typeof request.body === 'object' && !Array.isArray(request.body))
        ? request.body as Record<string, unknown>
        : {};
    upsertServerActivity(request.id, {
        id: request.id,
        requestKey: resolveBillingRequestId(request),
        route: request.routeOptions?.url || request.url,
        method: request.method,
        status: 'running',
        startedAt: new Date().toISOString(),
        ip: request.ip,
        authType: 'anonymous',
        operation: typeof body.operation === 'string'
            ? body.operation
            : typeof body.screenId === 'string'
                ? 'edit'
                : undefined,
        requestPreview: previewText(
            body.prompt
            || body.instruction
            || body.appPrompt
            || body.query
            || body.screenName
            || ''
        ),
        preferredModel: typeof body.preferredModel === 'string' ? body.preferredModel : undefined,
        expectedScreenCount: Number.isFinite(Number(body.expectedScreenCount)) ? Math.max(0, Math.floor(Number(body.expectedScreenCount))) : undefined,
        expectedImageCount: Number.isFinite(Number(body.expectedImageCount)) ? Math.max(0, Math.floor(Number(body.expectedImageCount))) : undefined,
    });
});

fastify.addHook('onResponse', async (request, reply) => {
    if (!shouldTrackServerActivity(request.url)) return;
    const existing = serverActivityById.get(request.id);
    if (!existing) return;
    const startedMs = new Date(existing.startedAt).getTime();
    const nowMs = Date.now();
    upsertServerActivity(request.id, {
        status: reply.statusCode >= 400 ? 'error' : 'success',
        completedAt: new Date(nowMs).toISOString(),
        durationMs: Number.isFinite(startedMs) ? Math.max(0, nowMs - startedMs) : undefined,
    });
});

// ============================================================================
// Routes
// ============================================================================

fastify.get('/', async (_request, reply) => {
    return reply.type('text/html; charset=utf-8').send(renderRequestActivityDashboardHtml('overview'));
});

fastify.get('/dashboard', async (_request, reply) => {
    return reply.type('text/html; charset=utf-8').send(renderRequestActivityDashboardHtml('overview'));
});

fastify.get('/dashboard/health', async (_request, reply) => {
    return reply.type('text/html; charset=utf-8').send(renderRequestActivityDashboardHtml('health'));
});

fastify.get('/dashboard/activity', async (_request, reply) => {
    return reply.type('text/html; charset=utf-8').send(renderRequestActivityDashboardHtml('activity'));
});

fastify.get('/dashboard/models', async (_request, reply) => {
    return reply.type('text/html; charset=utf-8').send(renderRequestActivityDashboardHtml('models'));
});

fastify.get('/dashboard/users', async (_request, reply) => {
    return reply.type('text/html; charset=utf-8').send(renderRequestActivityDashboardHtml('users'));
});

fastify.get('/dashboard/billing', async (_request, reply) => {
    return reply.type('text/html; charset=utf-8').send(renderRequestActivityDashboardHtml('billing'));
});

fastify.get('/dashboard/stripe', async (_request, reply) => {
    return reply.redirect('/dashboard/billing');
});

fastify.get('/dashboard/settings', async (_request, reply) => {
    return reply.type('text/html; charset=utf-8').send(renderRequestActivityDashboardHtml('settings'));
});

fastify.get<{
    Querystring: {
        limit?: string;
    };
}>('/api/server/activity', async (request, reply) => {
    const limit = Math.max(25, Math.min(1000, Number(request.query.limit || 250) || 250));
    return reply.send(await getRequestActivitySnapshot(limit));
});

fastify.get('/api/server/billing', async (_request, reply) => {
    return reply.send(await buildBillingOperationsSnapshot());
});

fastify.get('/api/server/stripe', async (_request, reply) => {
    return reply.send(await buildBillingOperationsSnapshot());
});

// Health check
fastify.get('/api/health', async (request, reply) => {
    const apiKey = process.env.GEMINI_API_KEY || '';
    const model = normalizeGeminiTextModel(process.env.GEMINI_MODEL || getDefaultGeminiTextModel());
    const groqModels = Object.keys(GROQ_MODELS);
    const nvidiaModels = Object.keys(NVIDIA_MODELS);
    const firebaseServiceAccountPresent = Boolean(
        String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim()
        || String(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || '').trim()
        || String(process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '').trim()
    );
    const databaseUrlPresent = Boolean(String(process.env.DATABASE_URL || '').trim());
    const stripeWebhookSecretPresent = Boolean(String(process.env.STRIPE_WEBHOOK_SECRET || '').trim());
    const stripePublishableKeyPresent = Boolean(getStripePublishableKey());
    const polarWebhookSecretPresent = Boolean(String(process.env.POLAR_WEBHOOK_SECRET || '').trim());
    const billingProvider = getActiveBillingProvider();

    const payload = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        billingProvider,
        frontendUrlConfigured: Boolean(String(process.env.FRONTEND_URL || '').trim()),
        frontendOrigins: allowedFrontendOrigins,
        vercelPreviewOriginsAllowed: allowVercelPreviewOrigins,
        internalAuthConfigured: Boolean(String(process.env.INTERNAL_API_KEY || '').trim()),
        mcpApiKeyPepperConfigured: Boolean(String(process.env.MCP_API_KEY_PEPPER || '').trim() || String(process.env.INTERNAL_API_KEY || '').trim()),
        database: {
            configured: databaseUrlPresent,
        },
        firebase: {
            serviceAccountPresent: firebaseServiceAccountPresent,
        },
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
        firecrawl: {
            apiKeyPresent: Boolean(String(process.env.FIRECRAWL_API_KEY || '').trim()),
        },
        posthog: {
            apiKeyPresent: Boolean(String(process.env.POSTHOG_API_KEY || process.env.VITE_POSTHOG_KEY || '').trim()),
            host: String(process.env.POSTHOG_HOST || process.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com').trim(),
        },
        stripe: {
            configured: isStripeConfigured(),
            publishableKeyPresent: stripePublishableKeyPresent,
            webhookSecretPresent: stripeWebhookSecretPresent,
        },
        polar: {
            configured: isPolarConfigured(),
            webhookSecretPresent: polarWebhookSecretPresent,
            productIdsConfigured: {
                pro: Boolean(resolvePolarProductId('pro')),
                team: Boolean(resolvePolarProductId('team')),
                topup_1000: Boolean(resolvePolarProductId('topup_1000')),
            },
        },
        resend: getResendConfigSummary(),
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

fastify.post('/api/newsletter/subscribe', async (request, reply) => {
    const body = (request.body ?? {}) as { email?: unknown };
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!email) {
        return reply.status(400).send({ error: 'email is required' });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
        return reply.status(400).send({ error: 'Enter a valid email address' });
    }

    try {
        await sendNewsletterSignupEmail(email);
        captureServerAnalyticsEvent({
            distinctId: email,
            event: 'newsletter_subscribed',
            properties: {
                source: 'landing_footer',
                traceId: request.id,
            },
        });
        return reply.send({ success: true });
    } catch (error) {
        fastify.log.error({ traceId: request.id, route: '/api/newsletter/subscribe', err: error }, 'newsletter signup email failed');
        return reply.status(500).send({
            error: 'Failed to send newsletter email',
            message: (error as Error).message,
        });
    }
});

fastify.post('/api/account/welcome-email', async (request, reply) => {
    const body = (request.body ?? {}) as { email?: unknown; uid?: unknown };
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const uid = typeof body.uid === 'string' ? body.uid.trim() : '';

    if (!email) {
        return reply.status(400).send({ error: 'email is required' });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
        return reply.status(400).send({ error: 'Enter a valid email address' });
    }

    try {
        await sendAccountCreationWelcomeEmail(email);
        captureServerAnalyticsEvent({
            distinctId: uid || email,
            event: 'account_created',
            properties: {
                email,
                method: 'email_password',
                welcomeEmailSent: true,
                traceId: request.id,
            },
        });
        return reply.send({ success: true });
    } catch (error) {
        fastify.log.error({ traceId: request.id, route: '/api/account/welcome-email', err: error }, 'account welcome email failed');
        return reply.status(500).send({
            error: 'Failed to send welcome email',
            message: (error as Error).message,
        });
    }
});

fastify.post('/api/contact/request', async (request, reply) => {
    const body = (request.body ?? {}) as {
        name?: unknown;
        email?: unknown;
        company?: unknown;
        reason?: unknown;
        message?: unknown;
    };

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const company = typeof body.company === 'string' ? body.company.trim() : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';

    if (!name) {
        return reply.status(400).send({ error: 'name is required' });
    }
    if (!email) {
        return reply.status(400).send({ error: 'email is required' });
    }
    if (!reason) {
        return reply.status(400).send({ error: 'reason is required' });
    }
    if (!message) {
        return reply.status(400).send({ error: 'message is required' });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
        return reply.status(400).send({ error: 'Enter a valid email address' });
    }

    try {
        await sendContactInquiryEmail({ name, email, company, reason, message });
        captureServerAnalyticsEvent({
            distinctId: email,
            event: 'contact_request_submitted',
            properties: {
                reason,
                company: company || undefined,
                traceId: request.id,
            },
        });
        return reply.send({ success: true });
    } catch (error) {
        fastify.log.error({ traceId: request.id, route: '/api/contact/request', err: error }, 'contact inquiry email failed');
        return reply.status(500).send({
            error: 'Failed to send contact request',
            message: (error as Error).message,
        });
    }
});

fastify.get('/api/billing/summary', async (request, reply) => {
    const user = await requireAuthenticatedUser(request, reply, '/api/billing/summary');
    if (!user) return;
    try {
        const summary = await buildBillingSummaryForApi(user.uid);
        const provider = getActiveBillingProvider();
        return {
            summary,
            provider: {
                name: provider,
                configured: provider === 'polar' ? isPolarConfigured() : provider === 'stripe' ? isStripeConfigured() : false,
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

fastify.get('/api/billing/catalog', async (request, reply) => {
    try {
        const provider = getActiveBillingProvider();
        const prices = provider === 'polar'
            ? await getPolarPricingCatalog()
            : provider === 'stripe'
                ? await getStripePricingCatalog()
                : {
                    pro: {
                        productKey: 'pro' as const,
                        productId: null,
                        priceId: null,
                        configured: false,
                        active: false,
                        currency: null,
                        unitAmount: null,
                        type: null,
                        interval: null,
                        intervalCount: null,
                    },
                    team: {
                        productKey: 'team' as const,
                        productId: null,
                        priceId: null,
                        configured: false,
                        active: false,
                        currency: null,
                        unitAmount: null,
                        type: null,
                        interval: null,
                        intervalCount: null,
                    },
                    topup_1000: {
                        productKey: 'topup_1000' as const,
                        productId: null,
                        priceId: null,
                        configured: false,
                        active: false,
                        currency: null,
                        unitAmount: null,
                        type: null,
                        interval: null,
                        intervalCount: null,
                    },
                };
        return {
            provider: {
                name: provider,
                configured: provider === 'polar' ? isPolarConfigured() : provider === 'stripe' ? isStripeConfigured() : false,
            },
            plans: {
                free: {
                    productKey: 'free',
                    label: 'Free',
                    monthlyCredits: 300,
                },
                pro: {
                    productKey: 'pro',
                    label: 'Pro',
                    monthlyCredits: 3000,
                    price: prices.pro,
                },
                team: {
                    productKey: 'team',
                    label: 'Team',
                    monthlyCredits: 15000,
                    price: prices.team,
                },
                topup_1000: {
                    productKey: 'topup_1000',
                    label: 'Credits',
                    credits: 1000,
                    price: prices.topup_1000,
                },
            },
        };
    } catch (error) {
        fastify.log.error({ traceId: request.id, route: '/api/billing/catalog', err: error }, 'billing catalog failed');
        return reply.status(500).send({
            error: 'Failed to load billing catalog',
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
        const items = await listBillingLedgerForApi(user.uid, limit);
        return { items };
    } catch (error) {
        fastify.log.error({ traceId: request.id, route: '/api/billing/ledger', err: error }, 'billing ledger failed');
        return reply.status(500).send({
            error: 'Failed to load billing ledger',
            message: (error as Error).message,
        });
    }
});

fastify.get<{
    Querystring: { limit?: string };
}>('/api/billing/purchases', async (request, reply) => {
    const user = await requireAuthenticatedUser(request, reply, '/api/billing/purchases');
    if (!user) return;
    try {
        const limit = Math.max(1, Math.min(200, Number(request.query.limit || 50)));
        const items = await listBillingPurchases(user.uid, limit);
        return { items };
    } catch (error) {
        fastify.log.error({ traceId: request.id, route: '/api/billing/purchases', err: error }, 'billing purchases failed');
        return reply.status(500).send({
            error: 'Failed to load purchase history',
            message: (error as Error).message,
        });
    }
});

fastify.get<{
    Params: { purchaseId: string };
}>('/api/billing/purchases/:purchaseId/invoice', async (request, reply) => {
    const user = await requireAuthenticatedUser(request, reply, '/api/billing/purchases/:purchaseId/invoice');
    if (!user) return;
    try {
        const purchase = await getBillingPurchase(user.uid, request.params.purchaseId);
        if (!purchase) {
            return reply.status(404).send({
                error: 'Purchase not found',
                message: 'No purchase was found for this invoice request.',
            });
        }
        const amount = (purchase.amountTotal / 100).toLocaleString(undefined, {
            style: 'currency',
            currency: purchase.currency || 'USD',
        });
        const issueDate = new Date(purchase.createdAt).toLocaleString();
        const invoiceNumber = purchase.invoiceNumber || `EAZY-${purchase.id.slice(0, 8).toUpperCase()}`;
        const lineItemDescription = purchase.description || (purchase.productKey
            ? purchase.productKey.replace(/_/g, ' ')
            : purchase.purchaseKind === 'subscription'
                ? 'Subscription purchase'
                : 'Credits purchase');

        const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Invoice ${invoiceNumber}</title>
  <style>
    body { font-family: Inter, -apple-system, Segoe UI, Roboto, sans-serif; background: #f7f8fb; color: #0f172a; margin: 0; }
    .wrap { max-width: 760px; margin: 28px auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
    .head { padding: 22px 26px; background: #0b1020; color: #fff; }
    .head h1 { margin: 0; font-size: 22px; }
    .head p { margin: 6px 0 0; opacity: .82; font-size: 13px; }
    .section { padding: 20px 26px; border-top: 1px solid #e2e8f0; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; }
    .label { font-size: 12px; color: #475569; text-transform: uppercase; letter-spacing: .06em; }
    .value { margin-top: 4px; font-size: 14px; font-weight: 600; color: #0f172a; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 10px 0; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
    th { color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
    .total { text-align: right; font-size: 18px; font-weight: 700; margin-top: 16px; }
    .muted { color: #64748b; font-size: 12px; }
    a { color: #2563eb; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="head">
      <h1>EazyUI Invoice</h1>
      <p>${invoiceNumber}</p>
    </div>
    <div class="section">
      <div class="grid">
        <div>
          <div class="label">Billed To</div>
          <div class="value">${String(user.email || user.uid)}</div>
        </div>
        <div>
          <div class="label">Issue Date</div>
          <div class="value">${issueDate}</div>
        </div>
        <div>
          <div class="label">Status</div>
          <div class="value">${purchase.status}</div>
        </div>
        <div>
          <div class="label">Purchase Type</div>
          <div class="value">${purchase.purchaseKind}</div>
        </div>
      </div>
    </div>
    <div class="section">
      <table>
        <thead>
          <tr><th>Description</th><th>Qty</th><th>Amount</th></tr>
        </thead>
        <tbody>
          <tr><td>${lineItemDescription}</td><td>${purchase.quantity}</td><td>${amount}</td></tr>
        </tbody>
      </table>
      <div class="total">Total: ${amount}</div>
      <p class="muted">Invoice source: ${purchase.sourceType} / ${purchase.sourceId}</p>
      ${purchase.invoiceUrl ? `<p class="muted">Hosted invoice: <a href="${purchase.invoiceUrl}" target="_blank" rel="noreferrer">Open hosted invoice</a></p>` : ''}
      ${purchase.invoicePdfUrl ? `<p class="muted">Invoice PDF: <a href="${purchase.invoicePdfUrl}" target="_blank" rel="noreferrer">Open PDF</a></p>` : ''}
    </div>
  </div>
</body>
</html>`;

        const filename = `eazyui-invoice-${purchase.id.slice(0, 8)}.html`;
        return reply
            .header('Content-Type', 'text/html; charset=utf-8')
            .header('Content-Disposition', `attachment; filename="${filename}"`)
            .send(html);
    } catch (error) {
        fastify.log.error({ traceId: request.id, route: '/api/billing/purchases/:purchaseId/invoice', err: error }, 'billing invoice generation failed');
        return reply.status(500).send({
            error: 'Failed to generate invoice',
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
        const estimate = estimateReservationCredits({
            operation: request.body.operation,
            modelProfile,
            preferredModel: request.body.preferredModel,
            expectedScreenCount: request.body.expectedScreenCount,
            expectedImageCount: request.body.expectedImageCount,
            expectedMinutes: request.body.expectedMinutes,
            bundleIncludesDesignSystem: Boolean(request.body.bundleIncludesDesignSystem),
        });
        const summary = await buildBillingSummaryForApi(user.uid);
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
        const billingProvider = getActiveBillingProvider();
        if (billingProvider === 'none') {
            return reply.status(503).send({
                error: 'Billing unavailable',
                message: 'No billing provider is configured on the server.',
            });
        }
        annotateServerBillingActivity(request.id, {
            requestPreview: `checkout ${productKey}`,
            metadata: {
                stage: 'checkout_session_create',
                billingProvider,
                productKey,
                successUrl,
                cancelUrl,
            },
        });
        if (billingProvider === 'polar') {
            const productId = resolvePolarProductId(productKey);
            if (!productId) {
                return reply.status(400).send({
                    error: 'Polar product id missing',
                    message: `Polar product id for ${productKey} is not configured.`,
                });
            }
            if (!isPolarConfigured()) {
                return reply.status(503).send({
                    error: 'Billing unavailable',
                    message: 'Polar is not configured on the server.',
                });
            }

            const session = await createPolarCheckoutSession({
                productId,
                successUrl,
                cancelUrl,
                uid: user.uid,
                email: user.email || undefined,
                name: user.email || user.uid,
                ipAddress: String(request.ip || '').trim() || undefined,
                productKey,
            });
            annotateServerBillingActivity(request.id, {
                metadata: {
                    stage: 'checkout_session_ready',
                    billingProvider,
                    productKey,
                    polarCheckoutId: session.id,
                    productId,
                },
            });
            return {
                id: session.id,
                url: session.url,
            };
        }

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

        const price = await stripe.prices.retrieve(planPriceId);
        if (!price || !price.active) {
            return reply.status(400).send({
                error: 'Invalid Stripe price',
                message: `Price ${planPriceId} is missing or inactive.`,
            });
        }
        const inferredMode: 'payment' | 'subscription' = price.type === 'recurring' ? 'subscription' : 'payment';
        if (productKey === 'topup_1000' && inferredMode !== 'payment') {
            return reply.status(400).send({
                error: 'Top-up price misconfigured',
                message: `Top-up price ${planPriceId} must be one-time (Stripe price.type=one_time).`,
            });
        }
        if ((productKey === 'pro' || productKey === 'team') && inferredMode !== 'subscription') {
            return reply.status(400).send({
                error: 'Plan price misconfigured',
                message: `Plan price ${planPriceId} must be recurring (Stripe price.type=recurring).`,
            });
        }

        let customerId = await getStripeCustomerId(user.uid);
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                metadata: { uid: user.uid },
            });
            customerId = customer.id;
            await attachStripeCustomer(user.uid, customerId);
        }

        const mode = inferredMode;
        const session = await createStripeCheckoutSession({
            customerId,
            mode,
            priceId: planPriceId,
            successUrl,
            cancelUrl,
            uid: user.uid,
            productKey,
        });
        annotateServerBillingActivity(request.id, {
            metadata: {
                stage: 'checkout_session_ready',
                billingProvider,
                productKey,
                mode,
                stripeSessionId: session.id,
                priceId: planPriceId,
            },
        });
        return {
            id: session.id,
            url: session.url,
        };
    } catch (error) {
        annotateServerBillingActivity(request.id, {
            errorMessage: (error as Error).message,
            metadata: {
                stage: 'checkout_session_failed',
            },
        });
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
        const billingProvider = getActiveBillingProvider();
        if (billingProvider === 'none') {
            return reply.status(503).send({
                error: 'Billing unavailable',
                message: 'No billing provider is configured on the server.',
            });
        }
        if (billingProvider === 'polar') {
            const session = await createPolarCustomerPortalSession({
                uid: user.uid,
                returnUrl: request.body.returnUrl,
            });
            return { url: session.customerPortalUrl };
        }
        const customerId = await getStripeCustomerId(user.uid);
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

fastify.get<{
    Querystring: {
        sessionId?: string;
        checkoutId?: string;
    };
}>('/api/billing/checkout-status', async (request, reply) => {
    const user = await requireAuthenticatedUser(request, reply, '/api/billing/checkout-status');
    if (!user) return;

    try {
        const billingProvider = getActiveBillingProvider();
        if (billingProvider === 'none') {
            return reply.status(503).send({
                error: 'Billing unavailable',
                message: 'No billing provider is configured on the server.',
            });
        }
        const sessionId = String(request.query?.sessionId || request.query?.checkoutId || '').trim();
        annotateServerBillingActivity(request.id, {
            requestPreview: sessionId ? `checkout session ${sessionId}` : 'checkout session lookup',
            metadata: {
                stage: 'checkout_status_lookup',
                billingProvider,
                sessionId: sessionId || null,
            },
        });
        if (!sessionId) {
            return reply.status(400).send({
                error: 'sessionId is required',
                message: 'Provide the checkout session id returned by the active billing provider.',
            });
        }

        if (billingProvider === 'polar') {
            const checkout = await retrievePolarCheckoutSession(sessionId);
            const sessionUid = String(checkout.externalCustomerId || checkout.metadata?.uid || '').trim();
            if (!sessionUid || sessionUid !== user.uid) {
                return reply.status(403).send({
                    error: 'Forbidden',
                    message: 'This checkout session does not belong to the current user.',
                });
            }

            const paid = checkout.status === 'succeeded' || checkout.status === 'confirmed';
            if (paid) {
                const result = await reconcileCompletedPolarCheckout(checkout, null);
                annotateServerBillingActivity(request.id, {
                    balanceCredits: result.summary?.balanceCredits,
                    metadata: {
                        stage: 'checkout_status_completed',
                        billingProvider,
                        sessionId,
                        polarStatus: checkout.status || null,
                        applied: result.applied,
                        productId: checkout.productId || null,
                    },
                });
                return {
                    status: 'completed',
                    applied: result.applied,
                    summary: result.summary || await buildBillingSummaryForApi(user.uid),
                };
            }

            annotateServerBillingActivity(request.id, {
                metadata: {
                    stage: 'checkout_status_pending',
                    billingProvider,
                    sessionId,
                    polarStatus: checkout.status || null,
                    productId: checkout.productId || null,
                },
            });
            return {
                status: String(checkout.status || 'open'),
                applied: false,
                summary: await buildBillingSummaryForApi(user.uid),
            };
        }

        const session = await retrieveCheckoutSessionWithLineItems(sessionId);
        const customerId = typeof session.customer === 'string'
            ? session.customer
            : session.customer?.id;
        const sessionUid = String(session.metadata?.uid || '').trim() || (customerId ? await findUidByStripeCustomerId(customerId) : null);
        if (!sessionUid || sessionUid !== user.uid) {
            return reply.status(403).send({
                error: 'Forbidden',
                message: 'This checkout session does not belong to the current user.',
            });
        }

        const paid = session.payment_status === 'paid'
            || session.status === 'complete'
            || (typeof session.mode === 'string' && session.mode === 'subscription');
        if (paid) {
            const result = await reconcileCompletedCheckoutSession(session, null);
            annotateServerBillingActivity(request.id, {
                balanceCredits: result.summary?.balanceCredits,
                metadata: {
                    stage: 'checkout_status_completed',
                    billingProvider,
                    sessionId,
                    stripeStatus: session.status || null,
                    paymentStatus: session.payment_status || null,
                    applied: result.applied,
                    mode: session.mode || null,
                },
            });
            return {
                status: 'completed',
                applied: result.applied,
                summary: result.summary || await buildBillingSummaryForApi(user.uid),
            };
        }

        annotateServerBillingActivity(request.id, {
            metadata: {
                stage: 'checkout_status_pending',
                billingProvider,
                sessionId,
                stripeStatus: session.status || null,
                paymentStatus: session.payment_status || null,
                mode: session.mode || null,
            },
        });
        return {
            status: String(session.status || session.payment_status || 'open'),
            applied: false,
            summary: await buildBillingSummaryForApi(user.uid),
        };
    } catch (error) {
        annotateServerBillingActivity(request.id, {
            errorMessage: (error as Error).message,
            metadata: {
                stage: 'checkout_status_failed',
                billingProvider: getActiveBillingProvider(),
                sessionId: String(request.query?.sessionId || '').trim() || null,
            },
        });
        fastify.log.error({ traceId: request.id, route: '/api/billing/checkout-status', err: error }, 'checkout status failed');
        return reply.status(500).send({
            error: 'Failed to confirm checkout session',
            message: (error as Error).message,
        });
    }
});

fastify.get('/api/mcp/api-keys', async (request, reply) => {
    const user = await requireAuthenticatedUser(request, reply, '/api/mcp/api-keys');
    if (!user) return;
    try {
        const keys = await listMcpApiKeys(user.uid);
        return { keys };
    } catch (error) {
        fastify.log.error({ traceId: request.id, route: '/api/mcp/api-keys', err: error }, 'mcp api keys list failed');
        return reply.status(500).send({
            error: 'Failed to list MCP API keys',
            message: (error as Error).message,
        });
    }
});

fastify.post<{
    Body: {
        label?: string;
    };
}>('/api/mcp/api-keys', async (request, reply) => {
    const user = await requireAuthenticatedUser(request, reply, '/api/mcp/api-keys');
    if (!user) return;
    try {
        const created = await createMcpApiKey(user.uid, request.body?.label);
        return {
            key: created,
            warning: 'This API key is only shown once. Copy it now.',
        };
    } catch (error) {
        fastify.log.error({ traceId: request.id, route: '/api/mcp/api-keys', err: error }, 'mcp api key create failed');
        return reply.status(500).send({
            error: 'Failed to create MCP API key',
            message: (error as Error).message,
        });
    }
});

fastify.delete<{
    Params: {
        keyId: string;
    };
}>('/api/mcp/api-keys/:keyId', async (request, reply) => {
    const user = await requireAuthenticatedUser(request, reply, '/api/mcp/api-keys/:keyId');
    if (!user) return;
    try {
        const ok = await revokeMcpApiKey(user.uid, request.params.keyId);
        if (!ok) {
            return reply.status(404).send({
                error: 'API key not found',
                message: 'No matching MCP API key for this account.',
            });
        }
        return { success: true };
    } catch (error) {
        fastify.log.error({ traceId: request.id, route: '/api/mcp/api-keys/:keyId', err: error }, 'mcp api key revoke failed');
        return reply.status(500).send({
            error: 'Failed to revoke MCP API key',
            message: (error as Error).message,
        });
    }
});

fastify.post<{
    Body: {
        apiKey?: string;
    };
}>('/api/mcp/resolve-key', async (request, reply) => {
    if (!requireInternalApiKey(request, reply, '/api/mcp/resolve-key')) return;
    const rawApiKey = String(request.body?.apiKey || '').trim();
    if (!rawApiKey) {
        return reply.status(400).send({
            error: 'apiKey is required',
            message: 'Provide an MCP API key to resolve.',
            code: 'MCP_API_KEY_REQUIRED',
        });
    }
    try {
        const resolved = await resolveMcpApiKey(rawApiKey, {
            ip: String(request.ip || '').slice(0, 80),
            userAgent: resolveHeaderString(request.headers, 'user-agent'),
        });
        if (!resolved) {
            return reply.status(401).send({
                error: 'Unauthorized',
                message: 'Invalid or revoked MCP API key.',
                code: 'MCP_API_KEY_INVALID',
            });
        }
        return resolved;
    } catch (error) {
        fastify.log.error({ traceId: request.id, route: '/api/mcp/resolve-key', err: error }, 'mcp api key resolve failed');
        return reply.status(500).send({
            error: 'Failed to resolve MCP API key',
            message: (error as Error).message,
        });
    }
});

fastify.post<{
    Body: unknown;
}>('/api/polar/webhook', {
    config: {
        rawBody: true,
    },
}, async (request, reply) => {
    if (getActiveBillingProvider() !== 'polar') {
        return reply.status(404).send({
            error: 'Not found',
            message: 'Polar webhook ingestion is disabled for the active billing provider.',
        });
    }
    const traceId = request.id;
    annotateServerBillingActivity(traceId, {
        requestPreview: 'polar webhook delivery',
        metadata: {
            stage: 'polar_webhook_received',
        },
    });
    try {
        const raw = ((request as any).rawBody as Buffer | undefined) || Buffer.from(JSON.stringify(request.body || {}));
        const event = constructPolarWebhookEvent(raw, request.headers as Record<string, unknown>);
        annotateServerBillingActivity(traceId, {
            requestPreview: `polar webhook ${event.type}`,
            metadata: {
                stage: 'polar_webhook_verified',
                eventType: event.type,
            },
        });

        if (event.type === 'checkout.updated' && event.data?.status === 'succeeded') {
            await reconcileCompletedPolarCheckout(event.data, event.type);
        } else if (event.type === 'order.paid') {
            await reconcilePolarPaidOrder(event.data, event.type);
        } else if (event.type === 'subscription.active' || event.type === 'subscription.updated') {
            const subscription = event.data;
            const uid = String(subscription.customer?.externalId || subscription.metadata?.uid || '').trim();
            const planId = resolvePlanFromPolarProductId(subscription.productId || subscription.product?.id);
            if (uid && planId) {
                await setUserPlan({
                    uid,
                    planId,
                    status: 'active',
                    reason: event.type === 'subscription.active' ? 'polar_subscription_active' : 'polar_subscription_update',
                });
            }
        } else if (event.type === 'subscription.canceled' || event.type === 'subscription.revoked') {
            const subscription = event.data;
            const uid = String(subscription.customer?.externalId || subscription.metadata?.uid || '').trim();
            if (uid) {
                await setUserPlan({
                    uid,
                    planId: 'free',
                    status: 'cancelled',
                    reason: 'polar_subscription_cancelled',
                });
            }
        }

        return reply.send({ received: true });
    } catch (error) {
        annotateServerBillingActivity(traceId, {
            errorMessage: (error as Error).message,
            metadata: {
                stage: 'polar_webhook_failed',
            },
        });
        const statusCode = error instanceof PolarWebhookVerificationError ? 403 : 400;
        fastify.log.error({ traceId, route: '/api/polar/webhook', err: error }, 'polar webhook failed');
        return reply.status(statusCode).send({
            error: 'Webhook processing failed',
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
    if (getActiveBillingProvider() !== 'stripe') {
        return reply.status(404).send({
            error: 'Not found',
            message: 'Stripe webhook ingestion is disabled for the active billing provider.',
        });
    }
    const traceId = request.id;
    const signature = String(request.headers['stripe-signature'] || '').trim();
    annotateServerBillingActivity(traceId, {
        requestPreview: 'stripe webhook delivery',
        metadata: {
            stage: 'stripe_webhook_received',
        },
    });
    if (!signature) {
        return reply.status(400).send({ error: 'Missing Stripe signature header' });
    }
    try {
        const raw = ((request as any).rawBody as Buffer | undefined) || Buffer.from(JSON.stringify(request.body || {}));
        const event = constructStripeWebhookEvent(raw, signature);
        annotateServerBillingActivity(traceId, {
            requestPreview: `stripe webhook ${event.type}`,
            metadata: {
                stage: 'stripe_webhook_verified',
                eventId: event.id,
                eventType: event.type,
            },
        });
        const firstSeen = await recordStripeWebhookEvent(event.id, event.type);
        if (!firstSeen) {
            fastify.log.info({
                traceId,
                route: '/api/stripe/webhook',
                eventId: event.id,
                eventType: event.type,
            }, 'stripe webhook duplicate ignored');
            return reply.send({ received: true, duplicate: true });
        }

        if (event.type === 'checkout.session.completed') {
            const checkout = event.data.object as any;
            const session = await retrieveCheckoutSessionWithLineItems(checkout.id);
            await reconcileCompletedCheckoutSession(session, event.id);
        } else if (event.type === 'invoice.paid') {
            const invoice = event.data.object as any;
            const customerId = String(invoice.customer || '').trim();
            const uid = customerId ? await findUidByStripeCustomerId(customerId) : null;
            if (uid) {
                const priceId = invoice.lines?.data?.[0]?.price?.id
                    || invoice.parent?.subscription_details?.metadata?.price_id
                    || '';
                const mappedPlan = resolvePlanFromStripePriceId(priceId);
                const topupCredits = resolveTopupCreditsForPriceId(priceId);
                const line = invoice.lines?.data?.[0];
                const productKeyFromMetadata = String(invoice.metadata?.productKey || '').trim()
                    || String(invoice.parent?.subscription_details?.metadata?.productKey || '').trim();
                const purchaseKind: 'subscription' | 'topup' | 'other' = mappedPlan
                    ? 'subscription'
                    : topupCredits > 0
                        ? 'topup'
                        : 'other';
                await upsertBillingPurchase({
                    uid,
                    sourceType: 'invoice',
                    sourceId: String(invoice.id || '').trim(),
                    purchaseKind,
                    productKey: productKeyFromMetadata || undefined,
                    planId: mappedPlan || undefined,
                    stripeCustomerId: customerId || undefined,
                    stripeSubscriptionId: String(invoice.subscription || '').trim() || undefined,
                    stripeInvoiceId: String(invoice.id || '').trim() || undefined,
                    stripePaymentIntentId: String(invoice.payment_intent || '').trim() || undefined,
                    stripePriceId: priceId || undefined,
                    amountTotal: Number(invoice.amount_paid || invoice.total || 0),
                    currency: String(invoice.currency || 'usd'),
                    quantity: Number(line?.quantity || 1),
                    status: String(invoice.status || 'paid'),
                    description: String(line?.description || 'Invoice payment'),
                    invoiceNumber: String(invoice.number || '').trim() || undefined,
                    invoiceUrl: String(invoice.hosted_invoice_url || '').trim() || undefined,
                    invoicePdfUrl: String(invoice.invoice_pdf || '').trim() || undefined,
                    metadata: {
                        stripeEventId: event.id,
                    },
                    createdAt: new Date((Number(invoice.created || 0) || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
                });
                if (mappedPlan) {
                    await setUserPlan({
                        uid,
                        planId: mappedPlan,
                        status: 'active',
                        stripeSubscriptionId: String(invoice.subscription || '').trim() || null,
                        stripePriceId: priceId || null,
                        reason: 'stripe_invoice_paid',
                    });
                }
            }
        } else if (event.type === 'customer.subscription.deleted' || event.type === 'customer.subscription.updated') {
            const subscription = event.data.object as any;
            const customerId = String(subscription.customer || '').trim();
            const uid = customerId ? await findUidByStripeCustomerId(customerId) : null;
            if (uid) {
                const active = subscription.status === 'active' || subscription.status === 'trialing';
                const priceId = subscription.items?.data?.[0]?.price?.id || '';
                const mappedPlan = resolvePlanFromStripePriceId(priceId);
                await setUserPlan({
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
        annotateServerBillingActivity(traceId, {
            errorMessage: (error as Error).message,
            metadata: {
                stage: 'stripe_webhook_failed',
            },
        });
        fastify.log.error({ traceId, route: '/api/stripe/webhook', err: error }, 'stripe webhook failed');
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
        assetRefs?: RequestAssetReference[];
        referenceUrls?: string[];
        referenceImageUrls?: string[];
        expectedScreenCount?: number;
        preferredModel?: string;
        temperature?: number;
        projectDesignSystem?: ProjectDesignSystem;
        bundleIncludesDesignSystem?: boolean;
        projectId?: string;
    };
}>('/api/generate', async (request, reply) => {
    const { prompt, stylePreset, platform, images, assetRefs, referenceUrls, referenceImageUrls, expectedScreenCount, preferredModel, temperature, projectDesignSystem, bundleIncludesDesignSystem, projectId } = request.body;
    const startedAt = Date.now();
    const traceId = request.id;
    const billingRequestId = resolveBillingRequestId(request);
    const requestPreview = previewText(prompt, 180);

    if (!prompt?.trim()) {
        return reply.status(400).send({ error: 'Prompt is required' });
    }

    const user = await requireAuthenticatedUser(request, reply, '/api/generate');
    if (!user) return;
    const {
        explicitAssetRefs,
        projectBrandAssetRefs,
        mergedAssetRefs,
        projectBrandContext,
    } = await resolveEffectiveAssetReferences({
        uid: user.uid,
        projectId,
        assetRefs,
    });

    const floorEstimate = estimateCredits({
        operation: 'generate',
        modelProfile: toCreditModelProfile(preferredModel),
        expectedScreenCount: Math.max(1, Math.floor(Number(expectedScreenCount || 0))) || 4,
        bundleIncludesDesignSystem: Boolean(bundleIncludesDesignSystem),
    });
    const reservationEstimate = estimateReservationCredits({
        operation: 'generate',
        modelProfile: toCreditModelProfile(preferredModel),
        preferredModel,
        expectedScreenCount: Math.max(1, Math.floor(Number(expectedScreenCount || 0))) || 4,
        bundleIncludesDesignSystem: Boolean(bundleIncludesDesignSystem),
    });
    if (!await ensureBillingEntitlementOrReply({
        reply,
        traceId,
        route: '/api/generate',
        uid: user.uid,
        operation: 'generate',
        estimatedCredits: reservationEstimate.estimatedCredits,
        minimumFloorCredits: floorEstimate.estimatedCredits,
    })) return;
    let reservation: { reservationId: string } | null = null;

    try {
        reservation = await reserveCredits({
            uid: user.uid,
            requestId: billingRequestId,
            operation: 'generate',
            reservedCredits: reservationEstimate.estimatedCredits,
            projectId,
            metadata: {
                route: '/api/generate',
                modelProfile: reservationEstimate.modelProfile,
                expectedScreenCount: Math.max(1, Math.floor(Number(expectedScreenCount || 0))) || undefined,
                bundleIncludesDesignSystem: Boolean(bundleIncludesDesignSystem),
                requestPreview,
            },
        });
        const {
            text: promptWithReferenceContext,
            normalizedUrls: normalizedReferenceUrls,
            webContextApplied,
            scrapedReferenceImages,
            referenceContext,
        } = await applyReferenceUrlContext(prompt, referenceUrls, referenceImageUrls, traceId, '/api/generate');
        const finalImages = mergeReferenceImages(images, scrapedReferenceImages);
        fastify.log.info({
            traceId,
            route: '/api/generate',
            stage: 'start',
            uid: user.uid,
            platform,
            stylePreset,
            imagesCount: images?.length || 0,
            explicitAssetRefCount: explicitAssetRefs.length,
            projectBrandAssetRefCount: projectBrandAssetRefs.length,
            assetRefCount: mergedAssetRefs.length,
            scrapedReferenceImageCount: scrapedReferenceImages.length,
            finalReferenceImageCount: finalImages.length,
            preferredModel,
            temperature,
            hasProjectDesignSystem: Boolean(projectDesignSystem),
            autoUseBrandAssets: projectBrandContext?.autoUseBrandAssets === true,
            referenceUrlsCount: referenceUrls?.length || 0,
            normalizedReferenceUrlsCount: normalizedReferenceUrls.length,
            webContextApplied,
            promptPreview: previewText(prompt),
        }, 'generate: start');
        const generated = await generateDesign({
            prompt: promptWithReferenceContext,
            stylePreset,
            platform,
            images: finalImages,
            assetRefs: mergedAssetRefs,
            preferredModel,
            temperature,
            projectDesignSystem,
        });
        const { designSpec, usage } = generated;
        const versionId = uuidv4();
        const estimateCharge = estimateCredits({
            operation: 'generate',
            modelProfile: toCreditModelProfile(preferredModel),
            expectedScreenCount: designSpec.screens.length,
            bundleIncludesDesignSystem: Boolean(bundleIncludesDesignSystem),
        });
        const usageCharge = resolveUsageCharge({
            operation: 'generate',
            usage,
            fallbackEstimatedCredits: estimateCharge.estimatedCredits,
        });
        const settled = await settleForOutcome(user.uid, reservation.reservationId, 'success', usageCharge.finalCredits, {
            route: '/api/generate',
            screenCount: designSpec.screens.length,
            usage,
            usageQuote: usageCharge.usageQuote,
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
            usageTotals: usage ? usage.totalTokens : 0,
        }, 'generate: complete');

        annotateServerBillingActivity(traceId, {
            operation: 'generate',
            preferredModel,
            requestPreview,
            finalCredits: settled.finalChargedCredits,
            balanceCredits: settled.summary.balanceCredits,
            tokensUsed: usage ? usage.totalTokens : 0,
        });
        return {
            designSpec,
            versionId,
            billing: {
                creditsCharged: settled.finalChargedCredits,
                creditsRemaining: settled.summary.balanceCredits,
                reservationId: reservation.reservationId,
                usage,
                usageQuote: usageCharge.usageQuote,
            },
            referenceContext,
        };
    } catch (error) {
        if (error instanceof InsufficientCreditsError) {
            return sendInsufficientCredits(reply, error);
        }
        if (reservation) {
            await settleForOutcome(user.uid, reservation.reservationId, 'failed', 0, {
                route: '/api/generate',
                error: (error as Error).message,
            });
        }
        annotateServerBillingActivity(traceId, {
            operation: 'generate',
            preferredModel,
            requestPreview,
            errorMessage: (error as Error).message,
        });
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
        assetRefs?: RequestAssetReference[];
        referenceUrls?: string[];
        referenceImageUrls?: string[];
        preferredModel?: string;
        temperature?: number;
        projectDesignSystem?: ProjectDesignSystem;
        bundleWithFirstGeneration?: boolean;
        projectId?: string;
    };
}>('/api/design-system', async (request, reply) => {
    const { prompt, stylePreset, platform, images, assetRefs, referenceUrls, referenceImageUrls, preferredModel, temperature, projectDesignSystem, bundleWithFirstGeneration, projectId } = request.body;
    const startedAt = Date.now();
    const traceId = request.id;
    const billingRequestId = resolveBillingRequestId(request);
    const requestPreview = previewText(prompt, 180);

    if (!prompt?.trim()) {
        return reply.status(400).send({ error: 'Prompt is required' });
    }

    const user = await requireAuthenticatedUser(request, reply, '/api/design-system');
    if (!user) return;
    const {
        explicitAssetRefs,
        projectBrandAssetRefs,
        mergedAssetRefs,
        projectBrandContext,
    } = await resolveEffectiveAssetReferences({
        uid: user.uid,
        projectId,
        assetRefs,
    });
    const bundled = Boolean(bundleWithFirstGeneration);
    const designSystemFloorEstimate = !bundled
        ? estimateCredits({
            operation: 'design_system',
            modelProfile: toCreditModelProfile(preferredModel),
        })
        : null;
    const designSystemEstimate = !bundled
        ? estimateReservationCredits({
            operation: 'design_system',
            modelProfile: toCreditModelProfile(preferredModel),
            preferredModel,
        })
        : null;
    if (designSystemEstimate && !await ensureBillingEntitlementOrReply({
        reply,
        traceId,
        route: '/api/design-system',
        uid: user.uid,
        operation: 'design_system',
        estimatedCredits: designSystemEstimate.estimatedCredits,
        minimumFloorCredits: designSystemFloorEstimate?.estimatedCredits,
    })) return;
    let reservation: { reservationId: string } | null = null;

    try {
        if (!bundled) {
            reservation = await reserveCredits({
                uid: user.uid,
                requestId: billingRequestId,
                operation: 'design_system',
                reservedCredits: designSystemEstimate?.estimatedCredits || 0,
                projectId,
                metadata: {
                    route: '/api/design-system',
                    requestPreview,
                },
            });
        }
        const {
            text: promptWithReferenceContext,
            normalizedUrls: normalizedReferenceUrls,
            webContextApplied,
            scrapedReferenceImages,
            referenceContext,
        } = await applyReferenceUrlContext(prompt, referenceUrls, referenceImageUrls, traceId, '/api/design-system');
        const finalImages = mergeReferenceImages(images, scrapedReferenceImages);
        fastify.log.info({
            traceId,
            route: '/api/design-system',
            stage: 'start',
            uid: user.uid,
            platform,
            stylePreset,
            imagesCount: images?.length || 0,
            explicitAssetRefCount: explicitAssetRefs.length,
            projectBrandAssetRefCount: projectBrandAssetRefs.length,
            assetRefCount: mergedAssetRefs.length,
            scrapedReferenceImageCount: scrapedReferenceImages.length,
            finalReferenceImageCount: finalImages.length,
            preferredModel,
            temperature,
            hasProjectDesignSystem: Boolean(projectDesignSystem),
            autoUseBrandAssets: projectBrandContext?.autoUseBrandAssets === true,
            bundledWithFirstGeneration: bundled,
            referenceUrlsCount: referenceUrls?.length || 0,
            normalizedReferenceUrlsCount: normalizedReferenceUrls.length,
            webContextApplied,
            promptPreview: previewText(prompt),
        }, 'design-system: start');
        const generated = await generateProjectDesignSystem({
            prompt: promptWithReferenceContext,
            stylePreset,
            platform,
            images: finalImages,
            assetRefs: mergedAssetRefs,
            preferredModel,
            temperature,
            projectDesignSystem,
        });
        const { designSystem, usage } = generated;
        let billingMeta: {
            creditsCharged: number;
            creditsRemaining: number;
            reservationId?: string;
            usage?: TokenUsageSummary;
            usageQuote?: UsageCreditQuote;
        } | undefined;
        if (reservation) {
            const estimateCharge = estimateCredits({
                operation: 'design_system',
                modelProfile: toCreditModelProfile(preferredModel),
            });
            const usageCharge = resolveUsageCharge({
                operation: 'design_system',
                usage,
                fallbackEstimatedCredits: estimateCharge.estimatedCredits,
            });
            const settled = await settleForOutcome(user.uid, reservation.reservationId, 'success', usageCharge.finalCredits, {
                route: '/api/design-system',
                bundledWithFirstGeneration: bundled,
                usage,
                usageQuote: usageCharge.usageQuote,
            });
            billingMeta = {
                creditsCharged: settled.finalChargedCredits,
                creditsRemaining: settled.summary.balanceCredits,
                reservationId: reservation.reservationId,
                ...(usage ? { usage } : {}),
                ...(usageCharge.usageQuote ? { usageQuote: usageCharge.usageQuote } : {}),
            };
        } else {
            const summary = await buildBillingSummaryForApi(user.uid);
            billingMeta = {
                creditsCharged: 0,
                creditsRemaining: summary.balanceCredits,
                ...(usage ? { usage } : {}),
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
            usageTotals: usage ? usage.totalTokens : 0,
        }, 'design-system: complete');
        annotateServerBillingActivity(traceId, {
            operation: 'design_system',
            preferredModel,
            requestPreview,
            finalCredits: billingMeta.creditsCharged,
            balanceCredits: billingMeta.creditsRemaining,
            tokensUsed: usage ? usage.totalTokens : 0,
        });
        return { designSystem, billing: billingMeta, referenceContext };
    } catch (error) {
        if (error instanceof InsufficientCreditsError) {
            return sendInsufficientCredits(reply, error);
        }
        if (reservation) {
            await settleForOutcome(user.uid, reservation.reservationId, 'failed', 0, {
                route: '/api/design-system',
                error: (error as Error).message,
            });
        }
        annotateServerBillingActivity(traceId, {
            operation: 'design_system',
            preferredModel,
            requestPreview,
            errorMessage: (error as Error).message,
        });
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
        assetRefs?: RequestAssetReference[];
        referenceUrls?: string[];
        preferredModel?: string;
        temperature?: number;
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
    const { instruction, html, screenId, images, assetRefs, referenceUrls, preferredModel, temperature, projectDesignSystem, projectId, consistencyProfile, referenceScreens } = request.body;
    const startedAt = Date.now();
    const traceId = request.id;
    const billingRequestId = resolveBillingRequestId(request);
    const requestPreview = previewText(instruction, 180);

    if (!instruction?.trim()) {
        return reply.status(400).send({ error: 'Instruction is required' });
    }

    if (!html) {
        return reply.status(400).send({ error: 'HTML is required' });
    }

    const user = await requireAuthenticatedUser(request, reply, '/api/edit');
    if (!user) return;
    const {
        explicitAssetRefs,
        projectBrandAssetRefs,
        mergedAssetRefs,
        projectBrandContext,
    } = await resolveEffectiveAssetReferences({
        uid: user.uid,
        projectId,
        assetRefs,
    });
    const floorEstimate = estimateCredits({
        operation: 'edit',
        modelProfile: toCreditModelProfile(preferredModel),
    });
    const estimate = estimateReservationCredits({
        operation: 'edit',
        modelProfile: toCreditModelProfile(preferredModel),
        preferredModel,
    });
    if (!await ensureBillingEntitlementOrReply({
        reply,
        traceId,
        route: '/api/edit',
        uid: user.uid,
        operation: 'edit',
        estimatedCredits: estimate.estimatedCredits,
        minimumFloorCredits: floorEstimate.estimatedCredits,
    })) return;
    let reservation: { reservationId: string } | null = null;

    try {
        reservation = await reserveCredits({
            uid: user.uid,
            requestId: billingRequestId,
            operation: 'edit',
            reservedCredits: estimate.estimatedCredits,
            projectId,
            metadata: {
                route: '/api/edit',
                screenId,
                requestPreview,
            },
        });
        const {
            text: instructionWithReferenceContext,
            normalizedUrls: normalizedReferenceUrls,
            webContextApplied,
            referenceContext,
        } = await applyReferenceUrlContext(instruction, referenceUrls, undefined, traceId, '/api/edit');
        fastify.log.info({
            traceId,
            route: '/api/edit',
            stage: 'start',
            uid: user.uid,
            screenId,
            htmlChars: html.length,
            imagesCount: images?.length || 0,
            explicitAssetRefCount: explicitAssetRefs.length,
            projectBrandAssetRefCount: projectBrandAssetRefs.length,
            assetRefCount: mergedAssetRefs.length,
            preferredModel,
            temperature,
            hasProjectDesignSystem: Boolean(projectDesignSystem),
            autoUseBrandAssets: projectBrandContext?.autoUseBrandAssets === true,
            consistencyRuleCount: consistencyProfile?.rules?.length || 0,
            canonicalNavbarLabels: consistencyProfile?.canonicalNavbarLabels?.slice(0, 8) || [],
            referenceScreens: (referenceScreens || []).map((screen) => screen.name).slice(0, 4),
            referenceUrlsCount: referenceUrls?.length || 0,
            normalizedReferenceUrlsCount: normalizedReferenceUrls.length,
            webContextApplied,
            instructionPreview: previewText(instruction),
        }, 'edit: start');
        const edited = await editDesign({
            instruction: instructionWithReferenceContext,
            html,
            screenId,
            images,
            assetRefs: mergedAssetRefs,
            preferredModel,
            temperature,
            projectDesignSystem,
            consistencyProfile,
            referenceScreens,
        });
        const versionId = uuidv4();
        const estimateCharge = estimateCredits({
            operation: 'edit',
            modelProfile: toCreditModelProfile(preferredModel),
        });
        const usageCharge = resolveUsageCharge({
            operation: 'edit',
            usage: edited.usage,
            fallbackEstimatedCredits: estimateCharge.estimatedCredits,
        });
        const settled = await settleForOutcome(user.uid, reservation.reservationId, 'success', usageCharge.finalCredits, {
            route: '/api/edit',
            screenId,
            usage: edited.usage,
            usageQuote: usageCharge.usageQuote,
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
            usageTotals: edited.usage ? edited.usage.totalTokens : 0,
        }, 'edit: complete');

        annotateServerBillingActivity(traceId, {
            operation: 'edit',
            preferredModel,
            requestPreview: previewText(instruction, 180),
            finalCredits: settled.finalChargedCredits,
            balanceCredits: settled.summary.balanceCredits,
            tokensUsed: edited.usage ? edited.usage.totalTokens : 0,
        });
        return {
            html: edited.html,
            description: edited.description,
            versionId,
            billing: {
                creditsCharged: settled.finalChargedCredits,
                creditsRemaining: settled.summary.balanceCredits,
                reservationId: reservation.reservationId,
                usage: edited.usage,
                usageQuote: usageCharge.usageQuote,
            },
            referenceContext,
        };
    } catch (error) {
        if (error instanceof InsufficientCreditsError) {
            return sendInsufficientCredits(reply, error);
        }
        if (reservation) {
            await settleForOutcome(user.uid, reservation.reservationId, 'failed', 0, {
                route: '/api/edit',
                error: (error as Error).message,
                screenId,
            });
        }
        annotateServerBillingActivity(traceId, {
            operation: 'edit',
            preferredModel,
            requestPreview,
            errorMessage: (error as Error).message,
        });
        fastify.log.error({ traceId, route: '/api/edit', durationMs: Date.now() - startedAt, screenId, err: error }, 'edit: failed');
        return reply.status(500).send({
            error: 'Failed to edit design',
            message: (error as Error).message,
        });
    }
});

fastify.post<{
    Body: {
        instruction: string;
        html: string;
        screenId: string;
        images?: string[];
        assetRefs?: RequestAssetReference[];
        referenceUrls?: string[];
        preferredModel?: string;
        temperature?: number;
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
}>('/api/edit-stream', async (request, reply) => {
    const { instruction, html, screenId, images, assetRefs, referenceUrls, preferredModel, temperature, projectDesignSystem, projectId, consistencyProfile, referenceScreens } = request.body;
    const startedAt = Date.now();
    const traceId = request.id;
    const billingRequestId = resolveBillingRequestId(request);
    const requestPreview = previewText(instruction, 180);

    if (!instruction?.trim()) {
        return reply.status(400).send({ error: 'Instruction is required' });
    }

    if (!html) {
        return reply.status(400).send({ error: 'HTML is required' });
    }

    const user = await requireAuthenticatedUser(request, reply, '/api/edit-stream');
    if (!user) return;
    const {
        explicitAssetRefs,
        projectBrandAssetRefs,
        mergedAssetRefs,
        projectBrandContext,
    } = await resolveEffectiveAssetReferences({
        uid: user.uid,
        projectId,
        assetRefs,
    });
    const floorEstimate = estimateCredits({
        operation: 'edit',
        modelProfile: toCreditModelProfile(preferredModel),
    });
    const estimate = estimateReservationCredits({
        operation: 'edit',
        modelProfile: toCreditModelProfile(preferredModel),
        preferredModel,
    });
    if (!await ensureBillingEntitlementOrReply({
        reply,
        traceId,
        route: '/api/edit-stream',
        uid: user.uid,
        operation: 'edit',
        estimatedCredits: estimate.estimatedCredits,
        minimumFloorCredits: floorEstimate.estimatedCredits,
    })) return;

    let reservation: { reservationId: string } | null = null;
    let chunkCount = 0;
    let charCount = 0;
    let clientAborted = false;
    let streamBillingMeta: {
        creditsCharged: number;
        creditsRemaining: number;
        reservationId?: string;
        usage?: TokenUsageSummary;
        usageQuote?: UsageCreditQuote;
    } | null = null;
    request.raw.once('aborted', () => {
        clientAborted = true;
    });
    request.raw.once('close', () => {
        if (!reply.raw.writableEnded) {
            clientAborted = true;
        }
    });

    try {
        reservation = await reserveCredits({
            uid: user.uid,
            requestId: billingRequestId,
            operation: 'edit',
            reservedCredits: estimate.estimatedCredits,
            projectId,
            metadata: {
                route: '/api/edit-stream',
                screenId,
                requestPreview,
            },
        });
    } catch (error) {
        if (error instanceof InsufficientCreditsError) {
            return sendInsufficientCredits(reply, error);
        }
        fastify.log.error({ traceId, route: '/api/edit-stream', stage: 'reserve', err: error }, 'edit-stream: reservation failed');
        return reply.status(500).send({
            error: 'Failed to reserve credits',
            message: (error as Error).message,
        });
    }

    let streamKeepaliveTimer: ReturnType<typeof setInterval> | null = null;

    try {
        const {
            text: instructionWithReferenceContext,
            normalizedUrls: normalizedReferenceUrls,
            webContextApplied,
            referenceContext,
        } = await applyReferenceUrlContext(instruction, referenceUrls, undefined, traceId, '/api/edit-stream');
        reply.raw.setHeader(REFERENCE_CONTEXT_HEADER, encodeReferenceContextHeader(referenceContext));
        prepareStreamingResponse(request, reply);
        streamKeepaliveTimer = startStreamKeepalive(reply);
        const { editDesignStreamWithUsage } = await import('./services/gemini.js');
        fastify.log.info({
            traceId,
            route: '/api/edit-stream',
            stage: 'start',
            uid: user.uid,
            screenId,
            htmlChars: html.length,
            imagesCount: images?.length || 0,
            explicitAssetRefCount: explicitAssetRefs.length,
            projectBrandAssetRefCount: projectBrandAssetRefs.length,
            assetRefCount: mergedAssetRefs.length,
            preferredModel,
            temperature,
            hasProjectDesignSystem: Boolean(projectDesignSystem),
            autoUseBrandAssets: projectBrandContext?.autoUseBrandAssets === true,
            consistencyRuleCount: consistencyProfile?.rules?.length || 0,
            referenceScreens: (referenceScreens || []).map((screen) => screen.name).slice(0, 4),
            referenceUrlsCount: referenceUrls?.length || 0,
            normalizedReferenceUrlsCount: normalizedReferenceUrls.length,
            webContextApplied,
            instructionPreview: previewText(instruction),
        }, 'edit-stream: start');

        const { stream, usagePromise } = editDesignStreamWithUsage({
            instruction: instructionWithReferenceContext,
            html,
            screenId,
            images,
            assetRefs: mergedAssetRefs,
            preferredModel,
            temperature,
            projectDesignSystem,
            consistencyProfile,
            referenceScreens,
        });

        for await (const chunk of stream) {
            if (clientAborted) {
                break;
            }
            if (chunkCount === 0) {
                stopStreamKeepalive(streamKeepaliveTimer);
                streamKeepaliveTimer = null;
            }
            chunkCount += 1;
            charCount += chunk.length;
            reply.raw.write(chunk);
        }

        if (reservation) {
            const usage = await usagePromise;
            const estimateCharge = estimateCredits({
                operation: 'edit',
                modelProfile: toCreditModelProfile(preferredModel),
            });
            const usageCharge = resolveUsageCharge({
                operation: 'edit',
                usage,
                fallbackEstimatedCredits: estimateCharge.estimatedCredits,
            });
            const settled = await settleForOutcome(user.uid, reservation.reservationId, 'success', usageCharge.finalCredits, {
                route: '/api/edit-stream',
                screenId,
                chunkCount,
                charCount,
                usage,
                usageQuote: usageCharge.usageQuote,
            });
            streamBillingMeta = {
                creditsCharged: settled.finalChargedCredits,
                creditsRemaining: settled.summary.balanceCredits,
                reservationId: reservation.reservationId,
                usage,
                usageQuote: usageCharge.usageQuote,
            };
            annotateServerBillingActivity(traceId, {
                operation: 'edit',
                preferredModel,
                requestPreview,
                finalCredits: settled.finalChargedCredits,
                balanceCredits: settled.summary.balanceCredits,
                tokensUsed: usage ? usage.totalTokens : 0,
            });
        }
        if (streamBillingMeta) {
            reply.raw.write(encodeStreamBillingMarker(streamBillingMeta));
        }
        fastify.log.info({
            traceId,
            route: '/api/edit-stream',
            stage: 'response',
            uid: user.uid,
            durationMs: Date.now() - startedAt,
            screenId,
            chunkCount,
            charCount,
        }, 'edit-stream: complete');
    } catch (error) {
        stopStreamKeepalive(streamKeepaliveTimer);
        streamKeepaliveTimer = null;
        if (reservation) {
            await settleForOutcome(
                user.uid,
                reservation.reservationId,
                clientAborted ? 'cancelled' : 'failed',
                undefined,
                {
                    route: '/api/edit-stream',
                    error: (error as Error).message,
                    screenId,
                    chunkCount,
                    charCount,
                    clientAborted,
                }
            );
        }
        fastify.log.error({ traceId, route: '/api/edit-stream', durationMs: Date.now() - startedAt, screenId, err: error }, 'edit-stream: failed');
        reply.raw.write(`\nERROR: ${(error as Error).message}\n`);
    } finally {
        stopStreamKeepalive(streamKeepaliveTimer);
        reply.raw.end();
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
    const billingRequestId = resolveBillingRequestId(request);
    const requestPreview = previewText(appPrompt, 180);

    if (!appPrompt?.trim()) {
        return reply.status(400).send({ error: 'appPrompt is required' });
    }
    if (!Array.isArray(screens) || screens.length === 0) {
        return reply.status(400).send({ error: 'screens is required' });
    }

    const user = await requireAuthenticatedUser(request, reply, '/api/synthesize-screen-images');
    if (!user) return;
    const floorEstimate = estimateCredits({
        operation: 'synthesize_screen_images',
        modelProfile: toCreditModelProfile(preferredModel),
        expectedImageCount: screens.length,
    });
    const estimate = estimateReservationCredits({
        operation: 'synthesize_screen_images',
        modelProfile: toCreditModelProfile(preferredModel),
        preferredModel,
        expectedImageCount: screens.length,
    });
    if (!await ensureBillingEntitlementOrReply({
        reply,
        traceId,
        route: '/api/synthesize-screen-images',
        uid: user.uid,
        operation: 'synthesize_screen_images',
        estimatedCredits: estimate.estimatedCredits,
        minimumFloorCredits: floorEstimate.estimatedCredits,
    })) return;
    let reservation: { reservationId: string } | null = null;

    try {
        reservation = await reserveCredits({
            uid: user.uid,
            requestId: billingRequestId,
            operation: 'synthesize_screen_images',
            reservedCredits: estimate.estimatedCredits,
            projectId,
            metadata: {
                route: '/api/synthesize-screen-images',
                screenCount: screens.length,
                requestPreview,
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
        const estimateCharge = estimateCredits({
            operation: 'synthesize_screen_images',
            modelProfile: toCreditModelProfile(preferredModel),
            expectedImageCount: generatedCount,
        });
        const usageCharge = resolveUsageCharge({
            operation: 'synthesize_screen_images',
            usage: result.usage,
            fallbackEstimatedCredits: estimateCharge.estimatedCredits,
        });
        const settled = await settleForOutcome(user.uid, reservation.reservationId, 'success', usageCharge.finalCredits, {
            route: '/api/synthesize-screen-images',
            generatedCount,
            usage: result.usage,
            usageQuote: usageCharge.usageQuote,
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
            usageTotals: result.usage ? result.usage.totalTokens : 0,
        }, 'synthesize-screen-images: complete');
        annotateServerBillingActivity(traceId, {
            operation: 'synthesize_screen_images',
            preferredModel: preferredModel || 'image',
            requestPreview,
            finalCredits: settled.finalChargedCredits,
            balanceCredits: settled.summary.balanceCredits,
            tokensUsed: result.usage ? result.usage.totalTokens : 0,
        });
        return {
            ...result,
            billing: {
                creditsCharged: settled.finalChargedCredits,
                creditsRemaining: settled.summary.balanceCredits,
                reservationId: reservation.reservationId,
                usage: result.usage,
                usageQuote: usageCharge.usageQuote,
            },
        };
    } catch (error) {
        if (error instanceof InsufficientCreditsError) {
            return sendInsufficientCredits(reply, error);
        }
        if (reservation) {
            await settleForOutcome(user.uid, reservation.reservationId, 'failed', 0, {
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
    const billingRequestId = resolveBillingRequestId(request);
    const requestPreview = previewText(instruction || prompt, 180);

    if (!prompt?.trim()) {
        return reply.status(400).send({ error: 'Prompt is required' });
    }

    const user = await requireAuthenticatedUser(request, reply, '/api/generate-image');
    if (!user) return;
    const floorEstimate = estimateCredits({
        operation: 'generate_image',
        modelProfile: toCreditModelProfile(preferredModel),
    });
    const estimate = estimateReservationCredits({
        operation: 'generate_image',
        modelProfile: toCreditModelProfile(preferredModel),
        preferredModel,
    });
    if (!await ensureBillingEntitlementOrReply({
        reply,
        traceId,
        route: '/api/generate-image',
        uid: user.uid,
        operation: 'generate_image',
        estimatedCredits: estimate.estimatedCredits,
        minimumFloorCredits: floorEstimate.estimatedCredits,
    })) return;
    let reservation: { reservationId: string } | null = null;

    try {
        reservation = await reserveCredits({
            uid: user.uid,
            requestId: billingRequestId,
            operation: 'generate_image',
            reservedCredits: estimate.estimatedCredits,
            projectId,
            metadata: {
                route: '/api/generate-image',
                requestPreview,
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
        const estimateCharge = estimateCredits({
            operation: 'generate_image',
            modelProfile: toCreditModelProfile(preferredModel),
        });
        const usageCharge = resolveUsageCharge({
            operation: 'generate_image',
            usage: result.usage,
            fallbackEstimatedCredits: estimateCharge.estimatedCredits,
        });
        const settled = await settleForOutcome(user.uid, reservation.reservationId, 'success', usageCharge.finalCredits, {
            route: '/api/generate-image',
            modelUsed: result.modelUsed,
            usage: result.usage,
            usageQuote: usageCharge.usageQuote,
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
            usageTotals: result.usage ? result.usage.totalTokens : 0,
        }, 'generate-image: complete');
        annotateServerBillingActivity(traceId, {
            operation: 'generate_image',
            preferredModel: preferredModel || 'image',
            requestPreview: previewText(instruction || prompt, 180),
            finalCredits: settled.finalChargedCredits,
            balanceCredits: settled.summary.balanceCredits,
            tokensUsed: result.usage ? result.usage.totalTokens : 0,
        });
        return {
            ...result,
            billing: {
                creditsCharged: settled.finalChargedCredits,
                creditsRemaining: settled.summary.balanceCredits,
                reservationId: reservation.reservationId,
                usage: result.usage,
                usageQuote: usageCharge.usageQuote,
            },
        };
    } catch (error) {
        if (error instanceof InsufficientCreditsError) {
            return sendInsufficientCredits(reply, error);
        }
        if (reservation) {
            await settleForOutcome(user.uid, reservation.reservationId, 'failed', 0, {
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
    const traceId = request.id;
    const billingRequestId = resolveBillingRequestId(request);
    const requestPreview = previewText(`Voice transcription (${language || 'auto'})`, 180);

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
    const floorEstimate = estimateCredits({
        operation: 'transcribe_audio',
        modelProfile: toCreditModelProfile(model),
        expectedMinutes: approxMinutes,
    });
    const estimate = estimateReservationCredits({
        operation: 'transcribe_audio',
        modelProfile: toCreditModelProfile(model),
        preferredModel: model,
        expectedMinutes: approxMinutes,
    });
    if (!await ensureBillingEntitlementOrReply({
        reply,
        traceId,
        route: '/api/transcribe-audio',
        uid: user.uid,
        operation: 'transcribe_audio',
        estimatedCredits: estimate.estimatedCredits,
        minimumFloorCredits: floorEstimate.estimatedCredits,
    })) return;
    let reservation: { reservationId: string } | null = null;

    try {
        reservation = await reserveCredits({
            uid: user.uid,
            requestId: billingRequestId,
            operation: 'transcribe_audio',
            reservedCredits: estimate.estimatedCredits,
            metadata: {
                route: '/api/transcribe-audio',
                approxMinutes,
                requestPreview,
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
        const usageCharge = resolveUsageCharge({
            operation: 'transcribe_audio',
            usage: result.usage ? {
                inputTokens: result.usage.inputTokens,
                outputTokens: result.usage.outputTokens,
                totalTokens: result.usage.totalTokens,
                cachedInputTokens: result.usage.cachedInputTokens || 0,
                entries: [result.usage],
            } : undefined,
            fallbackEstimatedCredits: estimate.estimatedCredits,
        });
        const settled = await settleForOutcome(user.uid, reservation.reservationId, 'success', usageCharge.finalCredits, {
            route: '/api/transcribe-audio',
            textLength: result.text.length,
            usage: result.usage,
            usageQuote: usageCharge.usageQuote,
        });
        fastify.log.info({
            modelUsed: result.modelUsed,
            textLength: result.text.length,
            preview: result.text.slice(0, 120),
            uid: user.uid,
            creditsCharged: settled.finalChargedCredits,
            creditsRemaining: settled.summary.balanceCredits,
            usageTotals: result.usage?.totalTokens || 0,
        }, 'transcribe-audio: complete');
        annotateServerBillingActivity(traceId, {
            operation: 'transcribe_audio',
            preferredModel: model,
            requestPreview,
            finalCredits: settled.finalChargedCredits,
            balanceCredits: settled.summary.balanceCredits,
            tokensUsed: result.usage?.totalTokens || 0,
        });
        return {
            ...result,
            billing: {
                creditsCharged: settled.finalChargedCredits,
                creditsRemaining: settled.summary.balanceCredits,
                reservationId: reservation.reservationId,
                usage: result.usage,
                usageQuote: usageCharge.usageQuote,
            },
        };
    } catch (error) {
        if (error instanceof InsufficientCreditsError) {
            return sendInsufficientCredits(reply, error);
        }
        if (reservation) {
            await settleForOutcome(user.uid, reservation.reservationId, 'failed', 0, {
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
        defaultTextModel: normalizeGeminiTextModel(process.env.GEMINI_MODEL || getDefaultGeminiTextModel()),
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
        referenceUrls?: string[];
        preferredModel?: string;
        temperature?: number;
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
        referenceUrls,
        preferredModel,
        temperature,
    } = request.body;
    const startedAt = Date.now();
    const traceId = request.id;
    const billingRequestId = resolveBillingRequestId(request);
    const requestPreview = previewText(appPrompt, 180);
    const sourceTag = resolveHeaderString(request.headers, 'x-eazyui-source') || 'web';

    if (!appPrompt?.trim()) {
        return reply.status(400).send({ error: 'appPrompt is required' });
    }

    const user = await requireAuthenticatedUser(request, reply, '/api/plan');
    if (!user) return;
    const plannerOperation: BillingOperation = phase === 'route' ? 'plan_route' : 'plan_assist';
    const rawPlannerEstimate = estimateCredits({
        operation: plannerOperation,
        modelProfile: toCreditModelProfile(preferredModel),
    });
    const plannerEstimate = rawPlannerEstimate;
    if (!await ensureBillingEntitlementOrReply({
        reply,
        traceId,
        route: '/api/plan',
        uid: user.uid,
        operation: plannerOperation,
        estimatedCredits: plannerEstimate.estimatedCredits,
    })) return;
    let reservation: { reservationId: string } | null = null;

    try {
        reservation = await reserveCredits({
            uid: user.uid,
            requestId: billingRequestId,
            operation: plannerOperation,
            reservedCredits: plannerEstimate.estimatedCredits,
            metadata: {
                route: '/api/plan',
                phase,
                source: sourceTag,
                requestPreview,
            },
        });
        const {
            text: appPromptWithReferenceContext,
            normalizedUrls: normalizedReferenceUrls,
            webContextApplied,
            referenceContext,
        } = await applyReferenceUrlContext(appPrompt, referenceUrls, undefined, traceId, '/api/plan');
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
            referenceUrlsCount: referenceUrls?.length || 0,
            normalizedReferenceUrlsCount: normalizedReferenceUrls.length,
            preferredModel,
            temperature,
            source: sourceTag,
            webContextApplied,
            appPromptPreview: previewText(appPrompt),
        }, 'plan: start');
        const plannerResult = await runDesignPlannerWithUsage({
            phase,
            appPrompt: appPromptWithReferenceContext.trim(),
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
            temperature,
        });
        const { plan, usage } = plannerResult;
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
                matchedExistingScreenNames: plan.matchedExistingScreenNames,
                targetScreenName: plan.targetScreenName,
                targetScreenNames: plan.targetScreenNames,
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
        const usageCharge = resolveUsageCharge({
            operation: plannerOperation,
            usage,
            fallbackEstimatedCredits: plannerEstimate.estimatedCredits,
        });
        const settled = await settleForOutcome(user.uid, reservation.reservationId, 'success', usageCharge.finalCredits, {
            route: '/api/plan',
            phase,
            source: sourceTag,
            usage,
            usageQuote: usageCharge.usageQuote,
        });
        fastify.log.info({
            traceId,
            route: '/api/plan',
            stage: 'billing',
            uid: user.uid,
            source: sourceTag,
            creditsCharged: settled.finalChargedCredits,
            creditsRemaining: settled.summary.balanceCredits,
            reservationId: reservation.reservationId,
            usageTotals: usage ? usage.totalTokens : 0,
        }, 'plan: settled');
        annotateServerBillingActivity(traceId, {
            operation: plannerOperation,
            preferredModel,
            requestPreview,
            finalCredits: settled.finalChargedCredits,
            balanceCredits: settled.summary.balanceCredits,
            tokensUsed: usage ? usage.totalTokens : 0,
        });
        return {
            ...plan,
            billing: {
                creditsCharged: settled.finalChargedCredits,
                creditsRemaining: settled.summary.balanceCredits,
                reservationId: reservation.reservationId,
                usage,
                usageQuote: usageCharge.usageQuote,
            },
            referenceContext,
        };
    } catch (error) {
        if (error instanceof InsufficientCreditsError) {
            return sendInsufficientCredits(reply, error);
        }
        if (reservation) {
            await settleForOutcome(user.uid, reservation.reservationId, 'failed', 0, {
                route: '/api/plan',
                phase,
                source: sourceTag,
                error: (error as Error).message,
            });
        }
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
        storagePath: string;
        base64DataUrl: string;
        mimeType?: string;
    };
}>('/api/assets/upload', async (request, reply) => {
    const startedAt = Date.now();
    const traceId = request.id;
    const { storagePath, base64DataUrl, mimeType } = request.body;

    if (!storagePath?.trim()) {
        return reply.status(400).send({ error: 'Storage path is required' });
    }
    if (!base64DataUrl?.trim()) {
        return reply.status(400).send({ error: 'Base64 data URL is required' });
    }

    const user = await requireAuthenticatedUser(request, reply, '/api/assets/upload');
    if (!user) return;

    try {
        const normalizedStoragePath = storagePath.trim().replace(/^\/+/, '');
        const expectedPrefix = `users/${user.uid}/`;
        if (!normalizedStoragePath.startsWith(expectedPrefix)) {
            return reply.status(403).send({
                error: 'Forbidden',
                message: 'Asset upload path is outside the authenticated user scope.',
            });
        }
        const parsed = parseDataUrlPayload(base64DataUrl);
        const contentType = String(mimeType || parsed.mimeType || 'application/octet-stream').trim();
        const bucket = getFirebaseStorageBucket();
        const file = bucket.file(normalizedStoragePath);
        const token = uuidv4();

        await file.save(parsed.buffer, {
            resumable: false,
            metadata: {
                contentType,
                cacheControl: 'public, max-age=31536000, immutable',
                metadata: {
                    firebaseStorageDownloadTokens: token,
                    ownerUid: user.uid,
                },
            },
        });

        const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(normalizedStoragePath)}?alt=media&token=${encodeURIComponent(token)}`;
        fastify.log.info({
            traceId,
            route: '/api/assets/upload',
            uid: user.uid,
            storagePath: normalizedStoragePath,
            durationMs: Date.now() - startedAt,
            bytes: parsed.buffer.byteLength,
        }, 'assets/upload: complete');
        return {
            storagePath: normalizedStoragePath,
            downloadUrl,
        };
    } catch (error) {
        fastify.log.error({
            traceId,
            route: '/api/assets/upload',
            uid: user.uid,
            storagePath,
            durationMs: Date.now() - startedAt,
            err: error,
        }, 'assets/upload: failed');
        return reply.status(500).send({
            error: 'Failed to upload asset',
            message: (error as Error).message,
        });
    }
});

fastify.post<{
    Body: {
        html: string;
        width?: number;
        height?: number;
        scale?: number;
        fullPage?: boolean;
        format?: 'png' | 'jpeg';
        quality?: number;
        fitToViewport?: boolean;
    };
}>('/api/render-screen-image', async (request, reply) => {
    try {
        return await renderHtmlToImagePayload({
            html: String(request.body?.html || ''),
            width: request.body?.width,
            height: request.body?.height,
            scale: request.body?.scale,
            fullPage: request.body?.fullPage,
            format: request.body?.format,
            quality: request.body?.quality,
            fitToViewport: request.body?.fitToViewport,
        });
    } catch (error) {
        fastify.log.error({ err: error }, 'render-screen-image: failed');
        if ((error as Error).message === 'html is required') {
            return reply.status(400).send({ error: 'html is required' });
        }
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
        assetRefs?: RequestAssetReference[];
        referenceUrls?: string[];
        referenceImageUrls?: string[];
        expectedScreenCount?: number;
        preferredModel?: string;
        temperature?: number;
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
        assetRefs,
        referenceUrls,
        referenceImageUrls,
        expectedScreenCount,
        preferredModel,
        temperature,
        projectDesignSystem,
        bundleIncludesDesignSystem,
        projectId,
    } = request.body;
    const startedAt = Date.now();
    const traceId = request.id;
    const billingRequestId = resolveBillingRequestId(request);
    const requestPreview = previewText(prompt, 180);

    if (!prompt?.trim()) {
        return reply.status(400).send({ error: 'Prompt is required' });
    }

    const user = await requireAuthenticatedUser(request, reply, '/api/generate-stream');
    if (!user) return;
    const {
        explicitAssetRefs,
        projectBrandAssetRefs,
        mergedAssetRefs,
        projectBrandContext,
    } = await resolveEffectiveAssetReferences({
        uid: user.uid,
        projectId,
        assetRefs,
    });
    const floorEstimate = estimateCredits({
        operation: 'generate_stream',
        modelProfile: toCreditModelProfile(preferredModel),
        expectedScreenCount: Math.max(1, Math.floor(Number(expectedScreenCount || 0))) || 4,
        bundleIncludesDesignSystem: Boolean(bundleIncludesDesignSystem),
    });
    const estimate = estimateReservationCredits({
        operation: 'generate_stream',
        modelProfile: toCreditModelProfile(preferredModel),
        preferredModel,
        expectedScreenCount: Math.max(1, Math.floor(Number(expectedScreenCount || 0))) || 4,
        bundleIncludesDesignSystem: Boolean(bundleIncludesDesignSystem),
    });
    if (!await ensureBillingEntitlementOrReply({
        reply,
        traceId,
        route: '/api/generate-stream',
        uid: user.uid,
        operation: 'generate_stream',
        estimatedCredits: estimate.estimatedCredits,
        minimumFloorCredits: floorEstimate.estimatedCredits,
    })) return;
    let reservation: { reservationId: string } | null = null;
    let chunkCount = 0;
    let charCount = 0;
    let completedScreens = 0;
    let clientAborted = false;
    let streamBillingMeta: {
        creditsCharged: number;
        creditsRemaining: number;
        reservationId?: string;
        usage?: TokenUsageSummary;
        usageQuote?: UsageCreditQuote;
    } | null = null;
    request.raw.once('aborted', () => {
        clientAborted = true;
    });
    request.raw.once('close', () => {
        if (!reply.raw.writableEnded) {
            clientAborted = true;
        }
    });

    try {
        reservation = await reserveCredits({
            uid: user.uid,
            requestId: billingRequestId,
            operation: 'generate_stream',
            reservedCredits: estimate.estimatedCredits,
            projectId,
            metadata: {
                route: '/api/generate-stream',
                expectedScreenCount: Math.max(1, Math.floor(Number(expectedScreenCount || 0))) || undefined,
                bundleIncludesDesignSystem: Boolean(bundleIncludesDesignSystem),
                requestPreview,
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

    let streamKeepaliveTimer: ReturnType<typeof setInterval> | null = null;

    try {
        const {
            text: promptWithReferenceContext,
            normalizedUrls: normalizedReferenceUrls,
            webContextApplied,
            scrapedReferenceImages,
            referenceContext,
        } = await applyReferenceUrlContext(prompt, referenceUrls, referenceImageUrls, traceId, '/api/generate-stream');
        const finalImages = mergeReferenceImages(images, scrapedReferenceImages);
        reply.raw.setHeader(REFERENCE_CONTEXT_HEADER, encodeReferenceContextHeader(referenceContext));
        prepareStreamingResponse(request, reply);
        streamKeepaliveTimer = startStreamKeepalive(reply);
        const { generateDesignStreamWithUsage } = await import('./services/gemini.js');
        fastify.log.info({
            traceId,
            route: '/api/generate-stream',
            stage: 'start',
            uid: user.uid,
            platform,
            stylePreset,
            imagesCount: images?.length || 0,
            explicitAssetRefCount: explicitAssetRefs.length,
            projectBrandAssetRefCount: projectBrandAssetRefs.length,
            assetRefCount: mergedAssetRefs.length,
            scrapedReferenceImageCount: scrapedReferenceImages.length,
            finalReferenceImageCount: finalImages.length,
            preferredModel,
            temperature,
            hasProjectDesignSystem: Boolean(projectDesignSystem),
            autoUseBrandAssets: projectBrandContext?.autoUseBrandAssets === true,
            bundleIncludesDesignSystem: Boolean(bundleIncludesDesignSystem),
            referenceUrlsCount: referenceUrls?.length || 0,
            normalizedReferenceUrlsCount: normalizedReferenceUrls.length,
            webContextApplied,
            promptPreview: previewText(prompt),
        }, 'generate-stream: start');
        const { stream, usagePromise } = generateDesignStreamWithUsage({
            prompt: promptWithReferenceContext,
            stylePreset,
            platform,
            images: finalImages,
            assetRefs: mergedAssetRefs,
            preferredModel,
            temperature,
            projectDesignSystem,
        });

        for await (const chunk of stream) {
            if (chunkCount === 0) {
                stopStreamKeepalive(streamKeepaliveTimer);
                streamKeepaliveTimer = null;
            }
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
            const usage = await usagePromise;
            const estimateCharge = estimateCredits({
                operation: 'generate_stream',
                modelProfile: toCreditModelProfile(preferredModel),
                expectedScreenCount: completedScreens > 0 ? completedScreens : 4,
                bundleIncludesDesignSystem: Boolean(bundleIncludesDesignSystem),
            });
            const usageCharge = resolveUsageCharge({
                operation: 'generate_stream',
                usage,
                fallbackEstimatedCredits: estimateCharge.estimatedCredits,
            });
            const settled = await settleForOutcome(user.uid, reservation.reservationId, 'success', usageCharge.finalCredits, {
                route: '/api/generate-stream',
                chunkCount,
                charCount,
                completedScreens,
                usage,
                usageQuote: usageCharge.usageQuote,
            });
            streamBillingMeta = {
                creditsCharged: settled.finalChargedCredits,
                creditsRemaining: settled.summary.balanceCredits,
                reservationId: reservation.reservationId,
                usage,
                usageQuote: usageCharge.usageQuote,
            };
            annotateServerBillingActivity(traceId, {
                operation: 'generate_stream',
                preferredModel,
                requestPreview,
                finalCredits: settled.finalChargedCredits,
                balanceCredits: settled.summary.balanceCredits,
                tokensUsed: usage ? usage.totalTokens : 0,
            });
            fastify.log.info({
                traceId,
                route: '/api/generate-stream',
                stage: 'billing',
                uid: user.uid,
                creditsCharged: settled.finalChargedCredits,
                creditsRemaining: settled.summary.balanceCredits,
                reservationId: reservation.reservationId,
                usageTotals: usage ? usage.totalTokens : 0,
            }, 'generate-stream: settled');
        }
        if (streamBillingMeta) {
            reply.raw.write(encodeStreamBillingMarker(streamBillingMeta));
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
        stopStreamKeepalive(streamKeepaliveTimer);
        streamKeepaliveTimer = null;
        if (reservation) {
            await settleForOutcome(
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
        annotateServerBillingActivity(traceId, {
            operation: 'generate_stream',
            preferredModel,
            requestPreview,
            errorMessage: (error as Error).message,
        });
        fastify.log.error({ traceId, route: '/api/generate-stream', durationMs: Date.now() - startedAt, err: error }, 'generate-stream: failed');
        reply.raw.write(`\nERROR: ${(error as Error).message}\n`);
    } finally {
        stopStreamKeepalive(streamKeepaliveTimer);
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
        temperature?: number;
        projectId?: string;
    };
}>('/api/complete-screen', async (request, reply) => {
    const { screenName, partialHtml, prompt, platform, stylePreset, projectDesignSystem, preferredModel, temperature, projectId } = request.body;
    const startedAt = Date.now();
    const traceId = request.id;
    const billingRequestId = resolveBillingRequestId(request);
    const requestPreview = previewText(prompt || `Complete ${screenName}`, 180);

    if (!screenName?.trim()) {
        return reply.status(400).send({ error: 'screenName is required' });
    }

    if (!partialHtml?.trim()) {
        return reply.status(400).send({ error: 'partialHtml is required' });
    }

    const user = await requireAuthenticatedUser(request, reply, '/api/complete-screen');
    if (!user) return;
    const floorEstimate = estimateCredits({
        operation: 'complete_screen',
        modelProfile: toCreditModelProfile(preferredModel),
    });
    const estimate = estimateReservationCredits({
        operation: 'complete_screen',
        modelProfile: toCreditModelProfile(preferredModel),
        preferredModel,
    });
    if (!await ensureBillingEntitlementOrReply({
        reply,
        traceId,
        route: '/api/complete-screen',
        uid: user.uid,
        operation: 'complete_screen',
        estimatedCredits: estimate.estimatedCredits,
        minimumFloorCredits: floorEstimate.estimatedCredits,
    })) return;
    let reservation: { reservationId: string } | null = null;

    try {
        reservation = await reserveCredits({
            uid: user.uid,
            requestId: billingRequestId,
            operation: 'complete_screen',
            reservedCredits: estimate.estimatedCredits,
            projectId,
            metadata: {
                route: '/api/complete-screen',
                screenName,
                requestPreview,
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
            temperature,
            hasProjectDesignSystem: Boolean(projectDesignSystem),
            promptPreview: previewText(prompt),
        }, 'complete-screen: start');
        const completed = await completePartialScreen({
            screenName,
            partialHtml,
            prompt,
            platform,
            stylePreset,
            temperature,
            projectDesignSystem,
        });
        const usageCharge = resolveUsageCharge({
            operation: 'complete_screen',
            usage: completed.usage,
            fallbackEstimatedCredits: estimate.estimatedCredits,
        });
        const settled = await settleForOutcome(user.uid, reservation.reservationId, 'success', usageCharge.finalCredits, {
            route: '/api/complete-screen',
            screenName,
            htmlChars: completed.html.length,
            usage: completed.usage,
            usageQuote: usageCharge.usageQuote,
        });
        fastify.log.info({
            traceId,
            route: '/api/complete-screen',
            stage: 'response',
            uid: user.uid,
            durationMs: Date.now() - startedAt,
            screenName,
            htmlChars: completed.html.length,
            creditsCharged: settled.finalChargedCredits,
            creditsRemaining: settled.summary.balanceCredits,
            usageTotals: completed.usage ? completed.usage.totalTokens : 0,
        }, 'complete-screen: complete');
        annotateServerBillingActivity(traceId, {
            operation: 'complete_screen',
            preferredModel,
            requestPreview: previewText(prompt || `Complete ${screenName}`, 180),
            finalCredits: settled.finalChargedCredits,
            balanceCredits: settled.summary.balanceCredits,
            tokensUsed: completed.usage ? completed.usage.totalTokens : 0,
        });
        return {
            html: completed.html,
            billing: {
                creditsCharged: settled.finalChargedCredits,
                creditsRemaining: settled.summary.balanceCredits,
                reservationId: reservation.reservationId,
                usage: completed.usage,
                usageQuote: usageCharge.usageQuote,
            },
        };
    } catch (error) {
        if (error instanceof InsufficientCreditsError) {
            return sendInsufficientCredits(reply, error);
        }
        if (reservation) {
            await settleForOutcome(user.uid, reservation.reservationId, 'failed', 0, {
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
        const result = await saveProject(designSpec, canvasDoc, chatState, projectId);
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
        const project = await getProject(id);

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
    const projects = await listProjects();
    return { projects };
});

fastify.get('/api/plugin/projects', async (request, reply) => {
    const user = await requireAuthenticatedUser(request, reply, '/api/plugin/projects');
    if (!user) return reply;

    try {
        const projects = await listPluginProjects(user.uid);
        return { projects };
    } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
            error: 'Failed to list plugin projects',
            message: (error as Error).message,
        });
    }
});

fastify.post<{
    Body: {
        state?: string;
        user?: {
            uid?: string;
            email?: string;
            displayName?: string;
        };
    };
}>('/api/plugin-auth/session/complete', async (request, reply) => {
    const user = await requireAuthenticatedUser(request, reply, '/api/plugin-auth/session/complete');
    if (!user) return reply;

    const state = String(request.body?.state || '').trim();
    if (!/^[a-f0-9]{24,}$/i.test(state)) {
        return reply.status(400).send({
            error: 'Invalid state',
            message: 'Plugin auth state is missing or invalid.',
        });
    }

    const token = parseBearerToken(resolveAuthHeader(request));
    if (!token) {
        return reply.status(400).send({
            error: 'Missing token',
            message: 'A bearer token is required to complete plugin authentication.',
        });
    }

    try {
        await writePluginAuthSession({
            state,
            token,
            user: {
                uid: user.uid,
                email: String(request.body?.user?.email || user.email || '').trim(),
                displayName: String(request.body?.user?.displayName || '').trim(),
            },
        });
        return { ok: true };
    } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
            error: 'Failed to complete plugin authentication',
            message: (error as Error).message,
        });
    }
});

fastify.get<{
    Params: { state: string };
}>('/api/plugin-auth/session/:state', async (request, reply) => {
    const state = String(request.params.state || '').trim();
    if (!/^[a-f0-9]{24,}$/i.test(state)) {
        return reply.status(400).send({
            error: 'Invalid state',
            message: 'Plugin auth state is missing or invalid.',
        });
    }

    try {
        const session = await consumePluginAuthSession(state);
        if (!session) {
            return reply.status(404).send({
                error: 'Session pending',
                message: 'Plugin authentication has not completed yet.',
            });
        }
        return session;
    } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
            error: 'Failed to fetch plugin auth session',
            message: (error as Error).message,
        });
    }
});

fastify.get<{
    Params: { id: string };
}>('/api/plugin/projects/:id/screens', async (request, reply) => {
    const user = await requireAuthenticatedUser(request, reply, '/api/plugin/projects/:id/screens');
    if (!user) return reply;

    try {
        const result = await getPluginProjectScreens(user.uid, request.params.id);
        if (!result) {
            return reply.status(404).send({ error: 'Project not found' });
        }
        return result;
    } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
            error: 'Failed to load plugin project screens',
            message: (error as Error).message,
        });
    }
});

fastify.get<{
    Params: { id: string; screenId: string };
}>('/api/plugin/projects/:id/screens/:screenId/render', async (request, reply) => {
    const user = await requireAuthenticatedUser(request, reply, '/api/plugin/projects/:id/screens/:screenId/render');
    if (!user) return reply;

    try {
        const source = await getPluginProjectScreenRenderSource(user.uid, request.params.id, request.params.screenId);
        if (!source) {
            return reply.status(404).send({ error: 'Screen not found' });
        }
        const rendered = await renderHtmlToImagePayload({
            html: source.html,
            width: source.screen.width,
            height: source.screen.height,
            scale: 2,
            fullPage: false,
            format: 'png',
            fitToViewport: false,
        });
        return {
            project: {
                id: source.project.id,
                name: source.project.name,
            },
            screen: source.screen,
            pngBase64: rendered.pngBase64,
            width: rendered.width,
            height: rendered.height,
        };
    } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
            error: 'Failed to render project screen',
            message: (error as Error).message,
        });
    }
});

fastify.get<{
    Params: { id: string; screenId: string };
}>('/api/plugin/projects/:id/screens/:screenId/figma-payload', async (request, reply) => {
    const user = await requireAuthenticatedUser(request, reply, '/api/plugin/projects/:id/screens/:screenId/figma-payload');
    if (!user) return reply;

    try {
        const source = await getPluginProjectScreenRenderSource(user.uid, request.params.id, request.params.screenId);
        if (!source) {
            return reply.status(404).send({ error: 'Screen not found' });
        }
        const payload = await buildFigmaScenePayloadFromHtml({
            html: source.html,
            screenId: source.screen.screenId,
            name: source.screen.name,
            width: source.screen.width,
            height: source.screen.height,
            designSystem: source.designSystem,
        });
        return payload;
    } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
            error: 'Failed to build Figma payload',
            message: (error as Error).message,
        });
    }
});

// Delete project
fastify.delete<{
    Params: { id: string };
}>('/api/project/:id', async (request, reply) => {
    const { id } = request.params;

    try {
        const deleted = await deleteProject(id);

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
