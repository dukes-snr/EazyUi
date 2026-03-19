import { v4 as uuidv4 } from 'uuid';
import type { Pool, PoolClient } from 'pg';
import type { TokenUsageEntry, TokenUsageSummary } from './tokenUsage.js';
import { ensurePersistenceSchema, getDbPool, queryOne, queryRows, withTransaction } from './postgres.js';
import { getDefaultGeminiImageModel, getDefaultGeminiTextModel, normalizeGeminiImageModel, normalizeGeminiTextModel } from './modelConfig.js';

export type BillingPlanId = 'free' | 'pro' | 'team';
export type BillingOperation =
    | 'design_system'
    | 'generate'
    | 'generate_stream'
    | 'edit'
    | 'complete_screen'
    | 'generate_image'
    | 'synthesize_screen_images'
    | 'transcribe_audio'
    | 'plan_route'
    | 'plan_assist';
export type CreditModelProfile = 'fast' | 'quality' | 'premium';
export type ReservationOutcome = 'success' | 'cancelled' | 'failed';

type PlanDefinition = {
    id: BillingPlanId;
    label: string;
    monthlyCredits: number;
    paid: boolean;
};

type BillingProfileRow = {
    uid: string;
    plan_id: BillingPlanId;
    status: 'active' | 'past_due' | 'cancelled';
    monthly_credits_remaining: number;
    rollover_credits: number;
    topup_credits_remaining: number;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    stripe_price_id: string | null;
    period_start_at: string;
    period_end_at: string;
    created_at: string;
    updated_at: string;
};

type BillingReservationRow = {
    id: string;
    uid: string;
    request_id: string;
    operation: BillingOperation;
    status: 'open' | 'settled' | 'released' | 'partially_settled';
    reserved_credits: number;
    final_credits: number | null;
    consumed_monthly: number;
    consumed_rollover: number;
    consumed_topup: number;
    project_id: string | null;
    metadata: string | null;
    expires_at: string;
    created_at: string;
    updated_at: string;
};

export type BillingLedgerItem = {
    id: string;
    type: 'grant' | 'reserve' | 'settle' | 'refund' | 'expire' | 'adjustment';
    operation?: BillingOperation;
    creditsDelta: number;
    balanceAfter: number;
    requestId?: string;
    reservationId?: string;
    projectId?: string;
    metadata?: Record<string, unknown> | null;
    createdAt: string;
};

export type BillingPurchase = {
    id: string;
    purchaseKind: 'subscription' | 'topup' | 'other';
    productKey?: string;
    planId?: BillingPlanId;
    amountTotal: number;
    currency: string;
    quantity: number;
    status: string;
    description?: string;
    invoiceNumber?: string;
    invoiceUrl?: string;
    invoicePdfUrl?: string;
    stripePriceId?: string;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    stripeInvoiceId?: string;
    stripePaymentIntentId?: string;
    fulfillmentStatus: 'pending' | 'applied' | 'failed';
    creditsAppliedAt?: string;
    sourceType: 'checkout' | 'invoice';
    sourceId: string;
    metadata?: Record<string, unknown> | null;
    createdAt: string;
    updatedAt: string;
};

export type StripeWebhookEventRecord = {
    id: string;
    eventType: string;
    receivedAt: string;
};

export type BillingSummary = {
    uid: string;
    planId: BillingPlanId;
    planLabel: string;
    status: 'active' | 'past_due' | 'cancelled';
    periodStartAt: string;
    periodEndAt: string;
    monthlyCreditsRemaining: number;
    rolloverCredits: number;
    topupCreditsRemaining: number;
    balanceCredits: number;
    lowCredits: boolean;
    suggestedTopupCredits: number;
};

export type BillingReservation = {
    reservationId: string;
    requestId: string;
    operation: BillingOperation;
    reservedCredits: number;
    balanceAfterReserve: number;
    expiresAt: string;
    status?: 'open' | 'settled' | 'released' | 'partially_settled';
    reused?: boolean;
};

export type BillingEstimateInput = {
    operation: BillingOperation;
    modelProfile?: CreditModelProfile;
    preferredModel?: string;
    expectedScreenCount?: number;
    expectedImageCount?: number;
    expectedMinutes?: number;
    bundleIncludesDesignSystem?: boolean;
};

export type BillingEstimate = {
    operation: BillingOperation;
    estimatedCredits: number;
    modelProfile: CreditModelProfile;
    breakdown: {
        base: number;
        variable: number;
        multiplier: number;
        bundleDesignSystem: number;
    };
};

type TokenPricingRate = {
    inputUsdPer1M: number;
    outputUsdPer1M: number;
    cachedInputUsdPer1M?: number;
};

export type UsageCreditLineItem = {
    provider: string;
    model: string;
    modelKeyMatched: string;
    pricingSource: 'catalog' | 'fallback';
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cachedInputTokens: number;
    inputUsdPer1M: number;
    outputUsdPer1M: number;
    cachedInputUsdPer1M: number;
    inputCostUsd: number;
    outputCostUsd: number;
    cachedInputCostUsd: number;
    totalCostUsd: number;
};

export type UsageCreditQuote = {
    operation: BillingOperation;
    credits: number;
    costUsdRaw: number;
    costUsdWithMarkup: number;
    creditsPerUsd: number;
    markupMultiplier: number;
    minimumCreditsApplied: number;
    totals: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        cachedInputTokens: number;
    };
    lineItems: UsageCreditLineItem[];
};

type DeductBreakdown = {
    monthly: number;
    rollover: number;
    topup: number;
};

type BillingLedgerRow = {
    id: string;
    type: 'grant' | 'reserve' | 'settle' | 'refund' | 'expire' | 'adjustment';
    operation: BillingOperation | null;
    credits_delta: number;
    balance_after: number;
    request_id: string | null;
    reservation_id: string | null;
    project_id: string | null;
    metadata: string | null;
    created_at: string;
};

type BillingPurchaseRow = {
    id: string;
    uid: string;
    source_key: string;
    source_type: string;
    source_id: string;
    purchase_kind: string;
    product_key: string | null;
    plan_id: string | null;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    stripe_invoice_id: string | null;
    stripe_payment_intent_id: string | null;
    stripe_price_id: string | null;
    amount_total: number;
    currency: string;
    quantity: number;
    status: string;
    description: string | null;
    invoice_number: string | null;
    invoice_url: string | null;
    invoice_pdf_url: string | null;
    fulfillment_status: string | null;
    credits_applied_at: string | null;
    metadata: string | null;
    created_at: string;
    updated_at: string;
};

type StripeWebhookEventRow = {
    id: string;
    event_type: string;
    received_at: string;
};

type BillingExecutor = Pool | PoolClient;

const PLAN_DEFINITIONS: Record<BillingPlanId, PlanDefinition> = {
    free: { id: 'free', label: 'Free', monthlyCredits: 300, paid: false },
    pro: { id: 'pro', label: 'Pro', monthlyCredits: 3000, paid: true },
    team: { id: 'team', label: 'Team', monthlyCredits: 15000, paid: true },
};

const COST_TABLE = {
    design_system: 20,
    generate_base: 20,
    generate_per_screen: 13,
    plan_assist: 1,
    edit: 20,
    complete_screen: 15,
    generate_image: 30,
    synthesize_base: 20,
    synthesize_per_image: 10,
    transcribe_per_minute: 5,
} as const;

const MODEL_MULTIPLIER: Record<CreditModelProfile, number> = {
    fast: 1,
    quality: 1,
    premium: 1,
};

const USAGE_BILLING_CREDITS_PER_USD = Number(process.env.BILLING_CREDITS_PER_USD || '100');
const USAGE_BILLING_MARKUP_MULTIPLIER = Number(process.env.BILLING_USAGE_MARKUP_MULTIPLIER || '3');
const USAGE_BILLING_MIN_CREDITS = Number(process.env.BILLING_USAGE_MIN_CREDITS || '1');
const USAGE_BILLING_FALLBACK_INPUT_USD_PER_1M = Number(process.env.BILLING_USAGE_FALLBACK_INPUT_USD_PER_1M || '0.8');
const USAGE_BILLING_FALLBACK_OUTPUT_USD_PER_1M = Number(process.env.BILLING_USAGE_FALLBACK_OUTPUT_USD_PER_1M || '2.4');
const DEFAULT_TEXT_BILLING_MODEL = normalizeGeminiTextModel(String(process.env.GEMINI_MODEL || getDefaultGeminiTextModel()).trim());
const DEFAULT_IMAGE_BILLING_MODEL = normalizeGeminiImageModel(String(process.env.GEMINI_IMAGE_MODEL || process.env.GEMINI_IMAGE_FALLBACK_MODEL || getDefaultGeminiImageModel()).trim());

const TOKEN_PRICING_CATALOG_USD_PER_1M: Record<string, TokenPricingRate> = {
    'gemini-3.1-pro-preview': { inputUsdPer1M: 2, outputUsdPer1M: 12 },
    'gemini-3.1-pro-preview-customtools': { inputUsdPer1M: 2, outputUsdPer1M: 12 },
    'gemini-3-pro-preview': { inputUsdPer1M: 2, outputUsdPer1M: 12 },
    'gemini-3-pro-preview-customtools': { inputUsdPer1M: 2, outputUsdPer1M: 12 },
    'gemini-3-flash-preview': { inputUsdPer1M: 0.5, outputUsdPer1M: 3 },
    'gemini-3.1-flash-lite-preview': { inputUsdPer1M: 0.25, outputUsdPer1M: 1.5 },
    'gemini-3.1-flash-image-preview': { inputUsdPer1M: 0.5, outputUsdPer1M: 60 },
    'gemini-3-pro-image-preview': { inputUsdPer1M: 2, outputUsdPer1M: 120 },
    'gemini-2.5-pro': { inputUsdPer1M: 1.25, outputUsdPer1M: 10 },
    'gemini-2.5-flash': { inputUsdPer1M: 0.3, outputUsdPer1M: 2.5 },
    'gemini-2.5-flash-image': { inputUsdPer1M: 0.3, outputUsdPer1M: 30 },
    'gemini-2.5-flash-lite': { inputUsdPer1M: 0.1, outputUsdPer1M: 0.4 },
    'gemini-2.5-flash-lite-preview-09-2025': { inputUsdPer1M: 0.1, outputUsdPer1M: 0.4 },
    'gemini-1.5-pro': { inputUsdPer1M: 1.25, outputUsdPer1M: 5 },
    'gemini-1.5-flash': { inputUsdPer1M: 0.35, outputUsdPer1M: 0.53 },
    'llama-3.1-8b-instant': { inputUsdPer1M: 0.05, outputUsdPer1M: 0.08 },
    'llama-3.3-70b-versatile': { inputUsdPer1M: 0.59, outputUsdPer1M: 0.79 },
    'meta-llama/llama-4-scout-17b-16e-instruct': { inputUsdPer1M: 0.45, outputUsdPer1M: 0.75 },
    'meta-llama/llama-4-maverick-17b-128e-instruct': { inputUsdPer1M: 0.45, outputUsdPer1M: 0.75 },
    'moonshotai/kimi-k2-instruct': { inputUsdPer1M: 0.6, outputUsdPer1M: 2.5 },
    'moonshotai/kimi-k2-instruct-0905': { inputUsdPer1M: 0.6, outputUsdPer1M: 2.5 },
    'moonshotai/kimi-k2.5': { inputUsdPer1M: 1.0, outputUsdPer1M: 3.0 },
    'qwen/qwen3-32b': { inputUsdPer1M: 0.3, outputUsdPer1M: 0.6 },
    'qwen/qwen2.5-coder-32b-instruct': { inputUsdPer1M: 0.3, outputUsdPer1M: 0.6 },
    'openai/gpt-oss-120b': { inputUsdPer1M: 0.8, outputUsdPer1M: 1.2 },
};

const LOW_CREDIT_THRESHOLD = 40;
const RESERVATION_TTL_MS = 15 * 60 * 1000;
const CANCELLED_JOB_CHARGE_RATIO = 0.5;

export class InsufficientCreditsError extends Error {
    requiredCredits: number;
    availableCredits: number;
    operation: BillingOperation;

    constructor(params: { operation: BillingOperation; requiredCredits: number; availableCredits: number }) {
        super(`Insufficient credits: required ${params.requiredCredits}, available ${params.availableCredits}`);
        this.name = 'InsufficientCreditsError';
        this.operation = params.operation;
        this.requiredCredits = params.requiredCredits;
        this.availableCredits = params.availableCredits;
    }
}

function parseIso(value: string): Date {
    return new Date(value);
}

function getUtcMonthBounds(date = new Date()): { start: string; end: string } {
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0));
    return { start: start.toISOString(), end: end.toISOString() };
}

function getNextMonthStart(iso: string): string {
    const date = parseIso(iso);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0)).toISOString();
}

function clampNonNegative(n: number): number {
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.round(n));
}

function profileBalance(profile: BillingProfileRow): number {
    return clampNonNegative(profile.monthly_credits_remaining)
        + clampNonNegative(profile.rollover_credits)
        + clampNonNegative(profile.topup_credits_remaining);
}

function normalizePlanId(value: string | null | undefined): BillingPlanId {
    if (value === 'pro' || value === 'team' || value === 'free') return value;
    return 'free';
}

function getPlan(planId: BillingPlanId): PlanDefinition {
    return PLAN_DEFINITIONS[planId] || PLAN_DEFINITIONS.free;
}

function mapPurchaseRow(row: BillingPurchaseRow): BillingPurchase {
    return {
        id: row.id,
        purchaseKind: (row.purchase_kind === 'subscription' || row.purchase_kind === 'topup') ? row.purchase_kind : 'other',
        productKey: row.product_key || undefined,
        planId: row.plan_id ? normalizePlanId(row.plan_id) : undefined,
        amountTotal: row.amount_total,
        currency: String(row.currency || 'usd').toUpperCase(),
        quantity: Math.max(1, Number(row.quantity || 1)),
        status: row.status || 'paid',
        description: row.description || undefined,
        invoiceNumber: row.invoice_number || undefined,
        invoiceUrl: row.invoice_url || undefined,
        invoicePdfUrl: row.invoice_pdf_url || undefined,
        stripePriceId: row.stripe_price_id || undefined,
        stripeCustomerId: row.stripe_customer_id || undefined,
        stripeSubscriptionId: row.stripe_subscription_id || undefined,
        stripeInvoiceId: row.stripe_invoice_id || undefined,
        stripePaymentIntentId: row.stripe_payment_intent_id || undefined,
        fulfillmentStatus: row.fulfillment_status === 'applied' || row.fulfillment_status === 'failed'
            ? row.fulfillment_status
            : 'pending',
        creditsAppliedAt: row.credits_applied_at || undefined,
        sourceType: row.source_type === 'invoice' ? 'invoice' : 'checkout',
        sourceId: row.source_id,
        metadata: (() => {
            const parsed = parseMetadataObject(row.metadata);
            return Object.keys(parsed).length ? parsed : undefined;
        })(),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function parseMetadataObject(raw: string | null | undefined): Record<string, unknown> {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
    } catch {
        // ignore malformed metadata payload
    }
    return {};
}

async function selectProfile(executor: BillingExecutor, uid: string, forUpdate = false): Promise<BillingProfileRow | null> {
    return queryOne<BillingProfileRow>(
        executor,
        `SELECT * FROM billing_profiles WHERE uid = $1${forUpdate ? ' FOR UPDATE' : ''}`,
        [uid],
    );
}

async function insertLedger(executor: BillingExecutor, input: {
    uid: string;
    type: BillingLedgerItem['type'];
    operation?: BillingOperation | null;
    creditsDelta: number;
    balanceAfter: number;
    requestId?: string | null;
    reservationId?: string | null;
    projectId?: string | null;
    metadata?: Record<string, unknown> | null;
    createdAt: string;
}): Promise<void> {
    await executor.query(
        `
        INSERT INTO billing_ledger (
            id, uid, type, operation, credits_delta, balance_after, request_id, reservation_id, project_id, metadata, created_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
        )
        `,
        [
            uuidv4(),
            input.uid,
            input.type,
            input.operation || null,
            input.creditsDelta,
            input.balanceAfter,
            input.requestId || null,
            input.reservationId || null,
            input.projectId || null,
            input.metadata ? JSON.stringify(input.metadata) : null,
            input.createdAt,
        ],
    );
}

async function persistProfile(executor: BillingExecutor, profile: BillingProfileRow): Promise<void> {
    await executor.query(
        `
        INSERT INTO billing_profiles (
            uid, plan_id, status, monthly_credits_remaining, rollover_credits, topup_credits_remaining,
            stripe_customer_id, stripe_subscription_id, stripe_price_id,
            period_start_at, period_end_at, created_at, updated_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9,
            $10, $11, $12, $13
        )
        ON CONFLICT(uid) DO UPDATE SET
            plan_id = EXCLUDED.plan_id,
            status = EXCLUDED.status,
            monthly_credits_remaining = EXCLUDED.monthly_credits_remaining,
            rollover_credits = EXCLUDED.rollover_credits,
            topup_credits_remaining = EXCLUDED.topup_credits_remaining,
            stripe_customer_id = EXCLUDED.stripe_customer_id,
            stripe_subscription_id = EXCLUDED.stripe_subscription_id,
            stripe_price_id = EXCLUDED.stripe_price_id,
            period_start_at = EXCLUDED.period_start_at,
            period_end_at = EXCLUDED.period_end_at,
            created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at
        `,
        [
            profile.uid,
            profile.plan_id,
            profile.status,
            profile.monthly_credits_remaining,
            profile.rollover_credits,
            profile.topup_credits_remaining,
            profile.stripe_customer_id,
            profile.stripe_subscription_id,
            profile.stripe_price_id,
            profile.period_start_at,
            profile.period_end_at,
            profile.created_at,
            profile.updated_at,
        ],
    );
}

async function hydrateProfile(executor: BillingExecutor, uid: string, now = new Date()): Promise<BillingProfileRow> {
    const existing = await selectProfile(executor, uid, true);
    if (existing) {
        return existing;
    }

    const plan = PLAN_DEFINITIONS.free;
    const bounds = getUtcMonthBounds(now);
    const createdAt = now.toISOString();
    const profile: BillingProfileRow = {
        uid,
        plan_id: plan.id,
        status: 'active',
        monthly_credits_remaining: plan.monthlyCredits,
        rollover_credits: 0,
        topup_credits_remaining: 0,
        stripe_customer_id: null,
        stripe_subscription_id: null,
        stripe_price_id: null,
        period_start_at: bounds.start,
        period_end_at: bounds.end,
        created_at: createdAt,
        updated_at: createdAt,
    };

    const insertResult = await executor.query(
        `
        INSERT INTO billing_profiles (
            uid, plan_id, status, monthly_credits_remaining, rollover_credits, topup_credits_remaining,
            stripe_customer_id, stripe_subscription_id, stripe_price_id,
            period_start_at, period_end_at, created_at, updated_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9,
            $10, $11, $12, $13
        )
        ON CONFLICT(uid) DO NOTHING
        `,
        [
            profile.uid,
            profile.plan_id,
            profile.status,
            profile.monthly_credits_remaining,
            profile.rollover_credits,
            profile.topup_credits_remaining,
            profile.stripe_customer_id,
            profile.stripe_subscription_id,
            profile.stripe_price_id,
            profile.period_start_at,
            profile.period_end_at,
            profile.created_at,
            profile.updated_at,
        ],
    );

    if ((insertResult.rowCount || 0) > 0) {
        await insertLedger(executor, {
            uid,
            type: 'grant',
            creditsDelta: plan.monthlyCredits,
            balanceAfter: profileBalance(profile),
            metadata: { reason: 'initial_monthly_grant', planId: plan.id },
            createdAt,
        });
        return profile;
    }

    const locked = await selectProfile(executor, uid, true);
    if (!locked) {
        throw new Error('Failed to hydrate billing profile');
    }
    return locked;
}

function maybeAdvanceBillingPeriod(profile: BillingProfileRow, now = new Date()): BillingProfileRow {
    let next = { ...profile };
    let changed = false;
    const nowMs = now.getTime();

    while (parseIso(next.period_end_at).getTime() <= nowMs) {
        const plan = getPlan(normalizePlanId(next.plan_id));
        if (plan.paid) {
            next.rollover_credits += Math.max(0, next.monthly_credits_remaining);
        }
        next.monthly_credits_remaining = plan.monthlyCredits;
        next.period_start_at = next.period_end_at;
        next.period_end_at = getNextMonthStart(next.period_end_at);
        changed = true;
    }

    if (!changed) return next;
    next.updated_at = now.toISOString();
    return next;
}

function applyReservationDeduction(profile: BillingProfileRow, credits: number): DeductBreakdown {
    const required = clampNonNegative(credits);
    let remaining = required;
    const breakdown: DeductBreakdown = { monthly: 0, rollover: 0, topup: 0 };

    const availableBefore = profileBalance(profile);
    if (availableBefore < required) {
        throw new InsufficientCreditsError({
            operation: 'generate',
            requiredCredits: required,
            availableCredits: availableBefore,
        });
    }

    if (remaining > 0) {
        const fromMonthly = Math.min(profile.monthly_credits_remaining, remaining);
        breakdown.monthly = fromMonthly;
        profile.monthly_credits_remaining -= fromMonthly;
        remaining -= fromMonthly;
    }
    if (remaining > 0) {
        const fromRollover = Math.min(profile.rollover_credits, remaining);
        breakdown.rollover = fromRollover;
        profile.rollover_credits -= fromRollover;
        remaining -= fromRollover;
    }
    if (remaining > 0) {
        const fromTopup = Math.min(profile.topup_credits_remaining, remaining);
        breakdown.topup = fromTopup;
        profile.topup_credits_remaining -= fromTopup;
        remaining -= fromTopup;
    }
    if (remaining > 0) {
        throw new Error('Internal billing error: could not deduct full reservation');
    }

    return breakdown;
}

function refundToBuckets(profile: BillingProfileRow, amount: number, source: DeductBreakdown) {
    let remaining = clampNonNegative(amount);
    if (remaining <= 0) return;

    const toMonthly = Math.min(remaining, source.monthly);
    profile.monthly_credits_remaining += toMonthly;
    remaining -= toMonthly;

    const toRollover = Math.min(remaining, source.rollover);
    profile.rollover_credits += toRollover;
    remaining -= toRollover;

    const toTopup = Math.min(remaining, source.topup);
    profile.topup_credits_remaining += toTopup;
    remaining -= toTopup;

    if (remaining > 0) {
        profile.topup_credits_remaining += remaining;
    }
}

function inferModelProfile(model?: string): CreditModelProfile {
    const lower = String(model || '').toLowerCase();
    if (!lower) return 'quality';
    if (lower.includes('8b') || lower.includes('flash') || lower.includes('instant')) return 'fast';
    if (lower.includes('pro') || lower.includes('70b') || lower.includes('sonnet')) return 'premium';
    return 'quality';
}

export function inferCreditModelProfile(preferredModel?: string | null): CreditModelProfile {
    return inferModelProfile(preferredModel || '');
}

function sanitizeRate(value: number, fallback: number): number {
    if (!Number.isFinite(value) || value <= 0) return fallback;
    return value;
}

function toTokenInt(value: unknown): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.floor(numeric));
}

function modelLookupCandidates(model: string): string[] {
    const normalized = String(model || '').trim().toLowerCase();
    if (!normalized) return [];
    const slashIndex = normalized.indexOf('/');
    if (slashIndex <= 0 || slashIndex >= normalized.length - 1) {
        return [normalized];
    }
    const tail = normalized.slice(slashIndex + 1);
    return [normalized, tail];
}

function resolveTokenPricingRate(model: string): { key: string; rate: TokenPricingRate; source: 'catalog' | 'fallback' } {
    const candidates = modelLookupCandidates(model);
    for (const key of candidates) {
        const matched = TOKEN_PRICING_CATALOG_USD_PER_1M[key];
        if (matched) {
            return { key, rate: matched, source: 'catalog' };
        }
    }
    return {
        key: 'fallback',
        rate: {
            inputUsdPer1M: sanitizeRate(USAGE_BILLING_FALLBACK_INPUT_USD_PER_1M, 0.8),
            outputUsdPer1M: sanitizeRate(USAGE_BILLING_FALLBACK_OUTPUT_USD_PER_1M, 2.4),
        },
        source: 'fallback',
    };
}

export function quoteCreditsFromTokenUsage(input: {
    operation: BillingOperation;
    usage: TokenUsageSummary | TokenUsageEntry[];
    minimumCredits?: number;
}): UsageCreditQuote {
    const usageSummary: TokenUsageSummary = Array.isArray(input.usage)
        ? {
            inputTokens: input.usage.reduce((acc, item) => acc + toTokenInt(item?.inputTokens), 0),
            outputTokens: input.usage.reduce((acc, item) => acc + toTokenInt(item?.outputTokens), 0),
            totalTokens: input.usage.reduce((acc, item) => acc + toTokenInt(item?.totalTokens), 0),
            cachedInputTokens: input.usage.reduce((acc, item) => acc + toTokenInt(item?.cachedInputTokens), 0),
            entries: input.usage.filter(Boolean),
        }
        : input.usage;

    const creditsPerUsd = sanitizeRate(USAGE_BILLING_CREDITS_PER_USD, 100);
    const markupMultiplier = sanitizeRate(USAGE_BILLING_MARKUP_MULTIPLIER, 1.3);
    const minimumCredits = Math.max(0, Math.floor(
        Number.isFinite(input.minimumCredits || NaN)
            ? Number(input.minimumCredits)
            : sanitizeRate(USAGE_BILLING_MIN_CREDITS, 1),
    ));

    const normalizedEntries = (usageSummary.entries || []).filter(Boolean);
    const hasEntryRows = normalizedEntries.length > 0;
    const syntheticEntries: TokenUsageEntry[] = !hasEntryRows && (
        toTokenInt(usageSummary.totalTokens) > 0 ||
        toTokenInt(usageSummary.inputTokens) > 0 ||
        toTokenInt(usageSummary.outputTokens) > 0
    )
        ? [{
            provider: 'unknown',
            model: 'unknown',
            inputTokens: toTokenInt(usageSummary.inputTokens),
            outputTokens: toTokenInt(usageSummary.outputTokens),
            totalTokens: Math.max(
                toTokenInt(usageSummary.totalTokens),
                toTokenInt(usageSummary.inputTokens) + toTokenInt(usageSummary.outputTokens),
            ),
            ...(toTokenInt(usageSummary.cachedInputTokens) > 0
                ? { cachedInputTokens: toTokenInt(usageSummary.cachedInputTokens) }
                : {}),
        }]
        : [];

    const pricedEntries = hasEntryRows ? normalizedEntries : syntheticEntries;

    const lineItems: UsageCreditLineItem[] = pricedEntries.map((entry) => {
        const inputTokens = toTokenInt(entry.inputTokens);
        const outputTokens = toTokenInt(entry.outputTokens);
        const totalTokens = Math.max(toTokenInt(entry.totalTokens), inputTokens + outputTokens);
        const cachedInputTokens = toTokenInt(entry.cachedInputTokens || 0);
        const pricing = resolveTokenPricingRate(entry.model);
        const inputUsdPer1M = sanitizeRate(pricing.rate.inputUsdPer1M, 0.8);
        const outputUsdPer1M = sanitizeRate(pricing.rate.outputUsdPer1M, 2.4);
        const cachedInputUsdPer1M = sanitizeRate(pricing.rate.cachedInputUsdPer1M || inputUsdPer1M, inputUsdPer1M);
        const inputCostUsd = (inputTokens / 1_000_000) * inputUsdPer1M;
        const outputCostUsd = (outputTokens / 1_000_000) * outputUsdPer1M;
        const cachedInputCostUsd = (cachedInputTokens / 1_000_000) * cachedInputUsdPer1M;
        const totalCostUsd = inputCostUsd + outputCostUsd + cachedInputCostUsd;
        return {
            provider: String(entry.provider || 'unknown'),
            model: String(entry.model || ''),
            modelKeyMatched: pricing.key,
            pricingSource: pricing.source,
            inputTokens,
            outputTokens,
            totalTokens,
            cachedInputTokens,
            inputUsdPer1M,
            outputUsdPer1M,
            cachedInputUsdPer1M,
            inputCostUsd,
            outputCostUsd,
            cachedInputCostUsd,
            totalCostUsd,
        };
    });

    const costUsdRaw = lineItems.reduce((acc, item) => acc + item.totalCostUsd, 0);
    const costUsdWithMarkup = costUsdRaw * markupMultiplier;
    const rawCredits = Math.ceil(costUsdWithMarkup * creditsPerUsd);
    const hasBillableUsage = usageSummary.totalTokens > 0 || usageSummary.inputTokens > 0 || usageSummary.outputTokens > 0;
    const credits = hasBillableUsage ? Math.max(minimumCredits, Math.max(0, rawCredits)) : 0;

    return {
        operation: input.operation,
        credits,
        costUsdRaw,
        costUsdWithMarkup,
        creditsPerUsd,
        markupMultiplier,
        minimumCreditsApplied: hasBillableUsage ? minimumCredits : 0,
        totals: {
            inputTokens: toTokenInt(usageSummary.inputTokens),
            outputTokens: toTokenInt(usageSummary.outputTokens),
            totalTokens: toTokenInt(usageSummary.totalTokens),
            cachedInputTokens: toTokenInt(usageSummary.cachedInputTokens),
        },
        lineItems,
    };
}

function resolveEstimateModelName(operation: BillingOperation, preferredModel?: string): string {
    const requested = String(preferredModel || '').trim();
    if (requested) {
        if (requested === 'image') return DEFAULT_IMAGE_BILLING_MODEL;
        return requested;
    }
    if (operation === 'generate_image') return DEFAULT_IMAGE_BILLING_MODEL;
    return DEFAULT_TEXT_BILLING_MODEL;
}

function buildReservationUsageHeuristic(input: BillingEstimateInput): TokenUsageEntry[] {
    const operation = input.operation;
    const screens = Math.max(1, clampNonNegative(input.expectedScreenCount || 1));
    const images = Math.max(1, clampNonNegative(input.expectedImageCount || 1));
    const minutes = Math.max(1, clampNonNegative(input.expectedMinutes || 1));
    const model = resolveEstimateModelName(operation, input.preferredModel);

    let inputTokens = 0;
    let outputTokens = 0;

    if (operation === 'design_system') {
        inputTokens = 7000;
        outputTokens = 2500;
    } else if (operation === 'generate' || operation === 'generate_stream') {
        inputTokens = 12000 + Math.max(0, screens - 1) * 2500 + (input.bundleIncludesDesignSystem ? 4000 : 0);
        outputTokens = 7500 + Math.max(0, screens - 1) * 5500 + (input.bundleIncludesDesignSystem ? 2000 : 0);
    } else if (operation === 'edit') {
        inputTokens = 18000;
        outputTokens = 8000;
    } else if (operation === 'complete_screen') {
        inputTokens = 12000;
        outputTokens = 5000;
    } else if (operation === 'generate_image') {
        inputTokens = 5000;
        outputTokens = 1000;
    } else if (operation === 'synthesize_screen_images') {
        inputTokens = 8000 + Math.max(0, images - 1) * 1500;
        outputTokens = 1400 * images;
    } else if (operation === 'transcribe_audio') {
        inputTokens = 2500 * minutes;
        outputTokens = 0;
    } else {
        return [];
    }

    return [{
        provider: model.toLowerCase().includes('gemini') ? 'gemini' : 'unknown',
        model,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        cachedInputTokens: 0,
    }];
}

export function estimateCredits(input: BillingEstimateInput): BillingEstimate {
    const operation = input.operation;
    const modelProfile = input.modelProfile || 'quality';
    const multiplier = MODEL_MULTIPLIER[modelProfile] || 1;
    const expectedScreens = clampNonNegative(input.expectedScreenCount || 0);
    const expectedImages = clampNonNegative(input.expectedImageCount || 0);
    const expectedMinutes = Math.max(1, clampNonNegative(input.expectedMinutes || 1));

    let base = 0;
    let variable = 0;
    let bundleDesignSystem = 0;

    if (operation === 'plan_route') {
        return {
            operation,
            estimatedCredits: 0,
            modelProfile,
            breakdown: { base: 0, variable: 0, multiplier, bundleDesignSystem: 0 },
        };
    }

    if (operation === 'plan_assist') {
        base = COST_TABLE.plan_assist;
    } else if (operation === 'design_system') {
        base = COST_TABLE.design_system;
    } else if (operation === 'generate' || operation === 'generate_stream') {
        base = COST_TABLE.generate_base;
        variable = Math.max(0, expectedScreens - 1) * COST_TABLE.generate_per_screen;
        bundleDesignSystem = input.bundleIncludesDesignSystem ? COST_TABLE.design_system : 0;
    } else if (operation === 'edit') {
        base = COST_TABLE.edit;
    } else if (operation === 'complete_screen') {
        base = COST_TABLE.complete_screen;
    } else if (operation === 'generate_image') {
        base = COST_TABLE.generate_image;
    } else if (operation === 'synthesize_screen_images') {
        base = COST_TABLE.synthesize_base;
        variable = expectedImages * COST_TABLE.synthesize_per_image;
    } else if (operation === 'transcribe_audio') {
        base = COST_TABLE.transcribe_per_minute * expectedMinutes;
    }

    const raw = (base + variable + bundleDesignSystem) * multiplier;
    const estimatedCredits = Math.max(0, Math.ceil(raw));
    return {
        operation,
        estimatedCredits,
        modelProfile,
        breakdown: {
            base,
            variable,
            multiplier,
            bundleDesignSystem,
        },
    };
}

export function estimateReservationCredits(input: BillingEstimateInput): BillingEstimate {
    const floorEstimate = estimateCredits(input);
    if (input.operation === 'plan_route' || input.operation === 'plan_assist') {
        return floorEstimate;
    }

    const heuristicUsage = buildReservationUsageHeuristic(input);
    if (!heuristicUsage.length) {
        return floorEstimate;
    }

    const usageQuote = quoteCreditsFromTokenUsage({
        operation: input.operation,
        usage: heuristicUsage,
        minimumCredits: 0,
    });

    return {
        ...floorEstimate,
        estimatedCredits: Math.max(floorEstimate.estimatedCredits, usageQuote.credits),
    };
}

function summarizeProfile(profile: BillingProfileRow): BillingSummary {
    const plan = getPlan(profile.plan_id);
    const balanceCredits = profileBalance(profile);
    return {
        uid: profile.uid,
        planId: plan.id,
        planLabel: plan.label,
        status: profile.status,
        periodStartAt: profile.period_start_at,
        periodEndAt: profile.period_end_at,
        monthlyCreditsRemaining: profile.monthly_credits_remaining,
        rolloverCredits: profile.rollover_credits,
        topupCreditsRemaining: profile.topup_credits_remaining,
        balanceCredits,
        lowCredits: balanceCredits <= LOW_CREDIT_THRESHOLD,
        suggestedTopupCredits: 1000,
    };
}

async function getBillingSummaryWithClient(executor: BillingExecutor, uid: string): Promise<BillingSummary> {
    const now = new Date();
    const hydrated = await hydrateProfile(executor, uid, now);
    const advanced = maybeAdvanceBillingPeriod(hydrated, now);
    if (advanced.updated_at !== hydrated.updated_at) {
        await persistProfile(executor, advanced);
    }
    return summarizeProfile(advanced);
}

export async function getBillingSummary(uid: string): Promise<BillingSummary> {
    return withTransaction((client) => getBillingSummaryWithClient(client, uid));
}

export async function listBillingLedger(uid: string, limit = 40): Promise<BillingLedgerItem[]> {
    await ensurePersistenceSchema();
    const size = Math.max(1, Math.min(200, Math.floor(limit)));
    const rows = await queryRows<BillingLedgerRow>(
        getDbPool(),
        `
        SELECT id, type, operation, credits_delta, balance_after, request_id, reservation_id, project_id, metadata, created_at
        FROM billing_ledger
        WHERE uid = $1
        ORDER BY created_at DESC
        LIMIT $2
        `,
        [uid, size],
    );

    return rows.map((row) => ({
        id: row.id,
        type: row.type,
        operation: row.operation || undefined,
        creditsDelta: row.credits_delta,
        balanceAfter: row.balance_after,
        requestId: row.request_id || undefined,
        reservationId: row.reservation_id || undefined,
        projectId: row.project_id || undefined,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        createdAt: row.created_at,
    }));
}

export async function reserveCredits(input: {
    uid: string;
    requestId: string;
    operation: BillingOperation;
    reservedCredits: number;
    projectId?: string;
    metadata?: Record<string, unknown>;
}): Promise<BillingReservation> {
    return withTransaction(async (client) => {
        const now = new Date();
        const nowAt = now.toISOString();
        const profileBefore = await hydrateProfile(client, input.uid, now);
        const profile = maybeAdvanceBillingPeriod(profileBefore, now);

        const existing = await queryOne<BillingReservationRow>(
            client,
            `
            SELECT *
            FROM billing_reservations
            WHERE uid = $1 AND operation = $2 AND request_id = $3
            ORDER BY created_at DESC
            LIMIT 1
            FOR UPDATE
            `,
            [input.uid, input.operation, input.requestId],
        );
        if (existing) {
            if (profile.updated_at !== profileBefore.updated_at) {
                await persistProfile(client, profile);
            }
            return {
                reservationId: existing.id,
                requestId: existing.request_id,
                operation: existing.operation,
                reservedCredits: existing.reserved_credits,
                balanceAfterReserve: profileBalance(profile),
                expiresAt: existing.expires_at,
                status: existing.status,
                reused: true,
            };
        }

        const amount = clampNonNegative(input.reservedCredits);
        const available = profileBalance(profile);
        if (available < amount) {
            throw new InsufficientCreditsError({
                operation: input.operation,
                requiredCredits: amount,
                availableCredits: available,
            });
        }

        const breakdown = applyReservationDeduction(profile, amount);
        profile.updated_at = nowAt;
        await persistProfile(client, profile);

        const reservationId = uuidv4();
        const expiresAt = new Date(now.getTime() + RESERVATION_TTL_MS).toISOString();
        await client.query(
            `
            INSERT INTO billing_reservations (
                id, uid, request_id, operation, status, reserved_credits, final_credits,
                consumed_monthly, consumed_rollover, consumed_topup,
                project_id, metadata, expires_at, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7,
                $8, $9, $10,
                $11, $12, $13, $14, $15
            )
            `,
            [
                reservationId,
                input.uid,
                input.requestId,
                input.operation,
                'open',
                amount,
                null,
                breakdown.monthly,
                breakdown.rollover,
                breakdown.topup,
                input.projectId || null,
                input.metadata ? JSON.stringify(input.metadata) : null,
                expiresAt,
                nowAt,
                nowAt,
            ],
        );

        const balanceAfter = profileBalance(profile);
        await insertLedger(client, {
            uid: input.uid,
            type: 'reserve',
            operation: input.operation,
            creditsDelta: -amount,
            balanceAfter,
            requestId: input.requestId,
            reservationId,
            projectId: input.projectId || null,
            metadata: {
                reservedCredits: amount,
                consumed: breakdown,
                ...(input.metadata || {}),
            },
            createdAt: nowAt,
        });

        return {
            reservationId,
            requestId: input.requestId,
            operation: input.operation,
            reservedCredits: amount,
            balanceAfterReserve: balanceAfter,
            expiresAt,
            status: 'open',
            reused: false,
        };
    });
}

export async function settleReservation(input: {
    uid: string;
    reservationId: string;
    outcome: ReservationOutcome;
    finalCredits?: number;
    metadata?: Record<string, unknown>;
}): Promise<{ finalChargedCredits: number; summary: BillingSummary; status: BillingReservationRow['status'] }> {
    return withTransaction(async (client) => {
        const now = new Date();
        const nowAt = now.toISOString();
        const reservation = await queryOne<BillingReservationRow>(
            client,
            'SELECT * FROM billing_reservations WHERE id = $1 AND uid = $2 FOR UPDATE',
            [input.reservationId, input.uid],
        );
        if (!reservation) {
            throw new Error('Billing reservation not found');
        }
        if (reservation.status !== 'open') {
            const summary = await getBillingSummaryWithClient(client, input.uid);
            return {
                finalChargedCredits: reservation.final_credits || reservation.reserved_credits,
                summary,
                status: reservation.status,
            };
        }

        const profileBefore = await hydrateProfile(client, input.uid, now);
        const profile = maybeAdvanceBillingPeriod(profileBefore, now);
        const reserved = reservation.reserved_credits;
        const reservationMetadata = parseMetadataObject(reservation.metadata);
        const reservationRequestPreview = typeof reservationMetadata.requestPreview === 'string'
            ? reservationMetadata.requestPreview
            : undefined;

        let target = reserved;
        if (input.outcome === 'failed') {
            target = 0;
        } else if (input.outcome === 'cancelled') {
            target = Math.ceil(reserved * CANCELLED_JOB_CHARGE_RATIO);
        } else if (typeof input.finalCredits === 'number' && Number.isFinite(input.finalCredits)) {
            target = clampNonNegative(input.finalCredits);
        }

        const delta = target - reserved;
        let finalCharged = target;
        let status: BillingReservationRow['status'] = 'settled';

        if (delta < 0) {
            refundToBuckets(profile, -delta, {
                monthly: reservation.consumed_monthly,
                rollover: reservation.consumed_rollover,
                topup: reservation.consumed_topup,
            });
            status = target === 0 ? 'released' : 'settled';
        } else if (delta > 0) {
            const available = profileBalance(profile);
            const canCharge = Math.min(available, delta);
            if (canCharge > 0) {
                applyReservationDeduction(profile, canCharge);
            }
            finalCharged = reserved + canCharge;
            status = canCharge === delta ? 'settled' : 'partially_settled';
        }

        profile.updated_at = nowAt;
        await persistProfile(client, profile);
        const balanceAfter = profileBalance(profile);

        const adjustment = reserved - finalCharged;
        await insertLedger(client, {
            uid: input.uid,
            type: adjustment >= 0 ? 'refund' : 'settle',
            operation: reservation.operation,
            creditsDelta: adjustment,
            balanceAfter,
            requestId: reservation.request_id,
            reservationId: reservation.id,
            projectId: reservation.project_id,
            metadata: {
                outcome: input.outcome,
                reservedCredits: reserved,
                finalChargedCredits: finalCharged,
                ...(reservationRequestPreview ? { requestPreview: reservationRequestPreview } : {}),
                ...(input.metadata || {}),
            },
            createdAt: nowAt,
        });

        await client.query(
            `
            UPDATE billing_reservations
            SET status = $3, final_credits = $4, metadata = $5, updated_at = $6
            WHERE id = $1 AND uid = $2
            `,
            [
                reservation.id,
                input.uid,
                status,
                finalCharged,
                JSON.stringify({
                    ...reservationMetadata,
                    settlement: {
                        outcome: input.outcome,
                        finalChargedCredits: finalCharged,
                        requestedFinalCredits: target,
                        settledAt: nowAt,
                        ...(input.metadata || {}),
                    },
                }),
                nowAt,
            ],
        );

        return {
            finalChargedCredits: finalCharged,
            summary: summarizeProfile(profile),
            status,
        };
    });
}

export async function setUserPlan(input: {
    uid: string;
    planId: BillingPlanId;
    status?: BillingProfileRow['status'];
    stripeSubscriptionId?: string | null;
    stripePriceId?: string | null;
    reason?: string;
}): Promise<BillingSummary> {
    return withTransaction(async (client) => {
        const now = new Date();
        const nowAt = now.toISOString();
        const profileBefore = await hydrateProfile(client, input.uid, now);
        const profile = maybeAdvanceBillingPeriod(profileBefore, now);
        const previousBalance = profileBalance(profile);

        const plan = getPlan(input.planId);
        profile.plan_id = plan.id;
        profile.status = input.status || 'active';
        profile.monthly_credits_remaining = plan.monthlyCredits;
        profile.stripe_subscription_id = input.stripeSubscriptionId ?? profile.stripe_subscription_id;
        profile.stripe_price_id = input.stripePriceId ?? profile.stripe_price_id;
        profile.updated_at = nowAt;
        await persistProfile(client, profile);

        const newBalance = profileBalance(profile);
        const delta = newBalance - previousBalance;
        if (delta !== 0) {
            await insertLedger(client, {
                uid: input.uid,
                type: 'adjustment',
                creditsDelta: delta,
                balanceAfter: newBalance,
                metadata: {
                    reason: input.reason || 'plan_change',
                    planId: plan.id,
                },
                createdAt: nowAt,
            });
        }
        return summarizeProfile(profile);
    });
}

export async function grantTopupCredits(input: {
    uid: string;
    credits: number;
    reason?: string;
    metadata?: Record<string, unknown>;
}): Promise<BillingSummary> {
    return withTransaction(async (client) => {
        const now = new Date();
        const nowAt = now.toISOString();
        const profileBefore = await hydrateProfile(client, input.uid, now);
        const profile = maybeAdvanceBillingPeriod(profileBefore, now);
        const grant = clampNonNegative(input.credits);
        profile.topup_credits_remaining += grant;
        profile.updated_at = nowAt;
        await persistProfile(client, profile);
        const balanceAfter = profileBalance(profile);
        await insertLedger(client, {
            uid: input.uid,
            type: 'grant',
            creditsDelta: grant,
            balanceAfter,
            metadata: {
                reason: input.reason || 'topup',
                ...(input.metadata || {}),
            },
            createdAt: nowAt,
        });
        return summarizeProfile(profile);
    });
}

export async function attachStripeCustomer(uid: string, stripeCustomerId: string): Promise<BillingSummary> {
    return withTransaction(async (client) => {
        const now = new Date();
        const profileBefore = await hydrateProfile(client, uid, now);
        const profile = maybeAdvanceBillingPeriod(profileBefore, now);
        profile.stripe_customer_id = stripeCustomerId;
        profile.updated_at = now.toISOString();
        await persistProfile(client, profile);
        return summarizeProfile(profile);
    });
}

export async function getStripeCustomerId(uid: string): Promise<string | null> {
    await ensurePersistenceSchema();
    const profile = await selectProfile(getDbPool(), uid, false);
    return profile?.stripe_customer_id || null;
}

export async function findUidByStripeCustomerId(stripeCustomerId: string): Promise<string | null> {
    const normalized = stripeCustomerId.trim();
    if (!normalized) return null;
    await ensurePersistenceSchema();
    const row = await queryOne<{ uid: string }>(
        getDbPool(),
        'SELECT uid FROM billing_profiles WHERE stripe_customer_id = $1 LIMIT 1',
        [normalized],
    );
    return row?.uid || null;
}

export function resolvePlanFromStripePriceId(priceId: string | null | undefined): BillingPlanId | null {
    const normalized = String(priceId || '').trim();
    if (!normalized) return null;
    const proPriceId = String(process.env.STRIPE_PRICE_PRO_MONTHLY || '').trim();
    const teamPriceId = String(process.env.STRIPE_PRICE_TEAM_MONTHLY || '').trim();
    if (proPriceId && normalized === proPriceId) return 'pro';
    if (teamPriceId && normalized === teamPriceId) return 'team';
    return null;
}

export function resolveStripePriceIdForPlan(planId: BillingPlanId): string {
    if (planId === 'pro') return String(process.env.STRIPE_PRICE_PRO_MONTHLY || '').trim();
    if (planId === 'team') return String(process.env.STRIPE_PRICE_TEAM_MONTHLY || '').trim();
    return '';
}

export function resolveTopupCreditsForPriceId(priceId: string | null | undefined): number {
    const normalized = String(priceId || '').trim();
    if (!normalized) return 0;
    const topup1000 = String(process.env.STRIPE_PRICE_TOPUP_1000 || '').trim();
    if (topup1000 && normalized === topup1000) return 1000;
    return 0;
}

export async function recordStripeWebhookEvent(eventId: string, eventType: string): Promise<boolean> {
    const id = String(eventId || '').trim();
    if (!id) return false;
    await ensurePersistenceSchema();
    const result = await getDbPool().query(
        `
        INSERT INTO stripe_webhook_events (id, event_type, received_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (id) DO NOTHING
        RETURNING id
        `,
        [id, String(eventType || '').trim() || 'unknown', new Date().toISOString()],
    );
    return (result.rowCount || 0) > 0;
}

export async function upsertBillingPurchase(input: {
    uid: string;
    sourceType: 'checkout' | 'invoice';
    sourceId: string;
    purchaseKind: 'subscription' | 'topup' | 'other';
    productKey?: string;
    planId?: BillingPlanId | null;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    stripeInvoiceId?: string | null;
    stripePaymentIntentId?: string | null;
    stripePriceId?: string | null;
    amountTotal: number;
    currency?: string;
    quantity?: number;
    status?: string;
    description?: string;
    invoiceNumber?: string | null;
    invoiceUrl?: string | null;
    invoicePdfUrl?: string | null;
    fulfillmentStatus?: 'pending' | 'applied' | 'failed';
    creditsAppliedAt?: string | null;
    metadata?: Record<string, unknown>;
    createdAt?: string;
}): Promise<BillingPurchase> {
    return withTransaction(async (client) => {
        const sourceId = String(input.sourceId || '').trim();
        if (!sourceId) {
            throw new Error('Purchase sourceId is required');
        }

        const sourceKey = `${input.sourceType}:${sourceId}`;
        const nowAt = new Date().toISOString();
        const existing = await queryOne<BillingPurchaseRow>(
            client,
            'SELECT * FROM billing_purchases WHERE source_key = $1 LIMIT 1 FOR UPDATE',
            [sourceKey],
        );
        const id = existing?.id || uuidv4();
        const createdAt = input.createdAt || existing?.created_at || nowAt;
        const existingMetadata = parseMetadataObject(existing?.metadata);
        const mergedMetadata = {
            ...existingMetadata,
            ...(input.metadata || {}),
        };

        const row = await queryOne<BillingPurchaseRow>(
            client,
            `
            INSERT INTO billing_purchases (
                id, uid, source_key, source_type, source_id, purchase_kind, product_key, plan_id,
                stripe_customer_id, stripe_subscription_id, stripe_invoice_id, stripe_payment_intent_id, stripe_price_id,
                amount_total, currency, quantity, status, description, invoice_number, invoice_url, invoice_pdf_url,
                fulfillment_status, credits_applied_at,
                metadata, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8,
                $9, $10, $11, $12, $13,
                $14, $15, $16, $17, $18, $19, $20, $21,
                $22, $23,
                $24, $25, $26
            )
            ON CONFLICT(source_key) DO UPDATE SET
                uid = EXCLUDED.uid,
                source_type = EXCLUDED.source_type,
                source_id = EXCLUDED.source_id,
                purchase_kind = EXCLUDED.purchase_kind,
                product_key = EXCLUDED.product_key,
                plan_id = EXCLUDED.plan_id,
                stripe_customer_id = EXCLUDED.stripe_customer_id,
                stripe_subscription_id = EXCLUDED.stripe_subscription_id,
                stripe_invoice_id = EXCLUDED.stripe_invoice_id,
                stripe_payment_intent_id = EXCLUDED.stripe_payment_intent_id,
                stripe_price_id = EXCLUDED.stripe_price_id,
                amount_total = EXCLUDED.amount_total,
                currency = EXCLUDED.currency,
                quantity = EXCLUDED.quantity,
                status = EXCLUDED.status,
                description = EXCLUDED.description,
                invoice_number = EXCLUDED.invoice_number,
                invoice_url = EXCLUDED.invoice_url,
                invoice_pdf_url = EXCLUDED.invoice_pdf_url,
                fulfillment_status = EXCLUDED.fulfillment_status,
                credits_applied_at = EXCLUDED.credits_applied_at,
                metadata = EXCLUDED.metadata,
                updated_at = EXCLUDED.updated_at
            RETURNING *
            `,
            [
                id,
                input.uid,
                sourceKey,
                input.sourceType,
                sourceId,
                input.purchaseKind,
                input.productKey || null,
                input.planId || null,
                input.stripeCustomerId || null,
                input.stripeSubscriptionId || null,
                input.stripeInvoiceId || null,
                input.stripePaymentIntentId || null,
                input.stripePriceId || null,
                clampNonNegative(input.amountTotal),
                String(input.currency || 'usd').toLowerCase(),
                Math.max(1, clampNonNegative(input.quantity || 1)),
                String(input.status || 'paid'),
                input.description || null,
                input.invoiceNumber || null,
                input.invoiceUrl || null,
                input.invoicePdfUrl || null,
                input.fulfillmentStatus || existing?.fulfillment_status || (input.purchaseKind === 'topup' ? 'pending' : 'applied'),
                input.creditsAppliedAt ?? existing?.credits_applied_at ?? null,
                Object.keys(mergedMetadata).length > 0 ? JSON.stringify(mergedMetadata) : null,
                createdAt,
                nowAt,
            ],
        );

        if (!row) {
            throw new Error('Failed to persist purchase');
        }
        return mapPurchaseRow(row);
    });
}

export async function getBillingPurchaseBySource(
    sourceType: 'checkout' | 'invoice',
    sourceId: string,
): Promise<BillingPurchase | null> {
    const normalizedSourceId = String(sourceId || '').trim();
    if (!normalizedSourceId) return null;
    await ensurePersistenceSchema();
    const row = await queryOne<BillingPurchaseRow>(
        getDbPool(),
        'SELECT * FROM billing_purchases WHERE source_key = $1 LIMIT 1',
        [`${sourceType}:${normalizedSourceId}`],
    );
    return row ? mapPurchaseRow(row) : null;
}

export async function listBillingPurchases(uid: string, limit = 40): Promise<BillingPurchase[]> {
    await ensurePersistenceSchema();
    const size = Math.max(1, Math.min(200, Math.floor(limit)));
    const rows = await queryRows<BillingPurchaseRow>(
        getDbPool(),
        'SELECT * FROM billing_purchases WHERE uid = $1 ORDER BY created_at DESC LIMIT $2',
        [uid, size],
    );
    return rows.map(mapPurchaseRow);
}

export async function listRecentBillingPurchases(limit = 40): Promise<BillingPurchase[]> {
    await ensurePersistenceSchema();
    const size = Math.max(1, Math.min(200, Math.floor(limit)));
    const rows = await queryRows<BillingPurchaseRow>(
        getDbPool(),
        'SELECT * FROM billing_purchases ORDER BY created_at DESC LIMIT $1',
        [size],
    );
    return rows.map(mapPurchaseRow);
}

export async function listRecentStripeWebhookEvents(limit = 40): Promise<StripeWebhookEventRecord[]> {
    await ensurePersistenceSchema();
    const size = Math.max(1, Math.min(200, Math.floor(limit)));
    const rows = await queryRows<StripeWebhookEventRow>(
        getDbPool(),
        'SELECT id, event_type, received_at FROM stripe_webhook_events ORDER BY received_at DESC LIMIT $1',
        [size],
    );
    return rows.map((row) => ({
        id: row.id,
        eventType: row.event_type,
        receivedAt: row.received_at,
    }));
}

export async function getBillingPurchase(uid: string, purchaseId: string): Promise<BillingPurchase | null> {
    await ensurePersistenceSchema();
    const row = await queryOne<BillingPurchaseRow>(
        getDbPool(),
        'SELECT * FROM billing_purchases WHERE uid = $1 AND id = $2 LIMIT 1',
        [uid, purchaseId],
    );
    return row ? mapPurchaseRow(row) : null;
}

export async function buildBillingSummaryForApi(uid: string): Promise<BillingSummary> {
    return getBillingSummary(uid);
}

export async function listBillingLedgerForApi(uid: string, limit = 40): Promise<BillingLedgerItem[]> {
    return listBillingLedger(uid, limit);
}
