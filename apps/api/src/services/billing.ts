import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

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
};

export type BillingEstimateInput = {
    operation: BillingOperation;
    modelProfile?: CreditModelProfile;
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

type DeductBreakdown = {
    monthly: number;
    rollover: number;
    topup: number;
};

const PLAN_DEFINITIONS: Record<BillingPlanId, PlanDefinition> = {
    free: { id: 'free', label: 'Free', monthlyCredits: 300, paid: false },
    pro: { id: 'pro', label: 'Pro', monthlyCredits: 3000, paid: true },
    team: { id: 'team', label: 'Team', monthlyCredits: 15000, paid: true },
};

const COST_TABLE = {
    design_system: 8,
    generate_base: 20,
    generate_per_screen: 8,
    edit: 14,
    complete_screen: 4,
    generate_image: 18,
    synthesize_base: 10,
    synthesize_per_image: 6,
    transcribe_per_minute: 4,
} as const;

const MODEL_MULTIPLIER: Record<CreditModelProfile, number> = {
    fast: 0.8,
    quality: 1,
    premium: 1.4,
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

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}
const db = new Database(path.join(dataDir, 'eazyui.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS billing_profiles (
    uid TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL DEFAULT 'free',
    status TEXT NOT NULL DEFAULT 'active',
    monthly_credits_remaining INTEGER NOT NULL DEFAULT 0,
    rollover_credits INTEGER NOT NULL DEFAULT 0,
    topup_credits_remaining INTEGER NOT NULL DEFAULT 0,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    stripe_price_id TEXT,
    period_start_at TEXT NOT NULL,
    period_end_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS billing_reservations (
    id TEXT PRIMARY KEY,
    uid TEXT NOT NULL,
    request_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    status TEXT NOT NULL,
    reserved_credits INTEGER NOT NULL,
    final_credits INTEGER,
    consumed_monthly INTEGER NOT NULL DEFAULT 0,
    consumed_rollover INTEGER NOT NULL DEFAULT 0,
    consumed_topup INTEGER NOT NULL DEFAULT 0,
    project_id TEXT,
    metadata TEXT,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_billing_reservations_uid_created_at
    ON billing_reservations(uid, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_billing_reservations_uid_request
    ON billing_reservations(uid, request_id);

  CREATE TABLE IF NOT EXISTS billing_ledger (
    id TEXT PRIMARY KEY,
    uid TEXT NOT NULL,
    type TEXT NOT NULL,
    operation TEXT,
    credits_delta INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    request_id TEXT,
    reservation_id TEXT,
    project_id TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_billing_ledger_uid_created_at
    ON billing_ledger(uid, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_billing_profiles_stripe_customer
    ON billing_profiles(stripe_customer_id);
`);

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

const selectProfileStmt = db.prepare<string, BillingProfileRow>(
    'SELECT * FROM billing_profiles WHERE uid = ?'
);
const upsertProfileStmt = db.prepare(`
  INSERT INTO billing_profiles (
    uid, plan_id, status, monthly_credits_remaining, rollover_credits, topup_credits_remaining,
    stripe_customer_id, stripe_subscription_id, stripe_price_id,
    period_start_at, period_end_at, created_at, updated_at
  ) VALUES (
    @uid, @plan_id, @status, @monthly_credits_remaining, @rollover_credits, @topup_credits_remaining,
    @stripe_customer_id, @stripe_subscription_id, @stripe_price_id,
    @period_start_at, @period_end_at, @created_at, @updated_at
  )
  ON CONFLICT(uid) DO UPDATE SET
    plan_id = @plan_id,
    status = @status,
    monthly_credits_remaining = @monthly_credits_remaining,
    rollover_credits = @rollover_credits,
    topup_credits_remaining = @topup_credits_remaining,
    stripe_customer_id = @stripe_customer_id,
    stripe_subscription_id = @stripe_subscription_id,
    stripe_price_id = @stripe_price_id,
    period_start_at = @period_start_at,
    period_end_at = @period_end_at,
    updated_at = @updated_at
`);

const insertReservationStmt = db.prepare(`
  INSERT INTO billing_reservations (
    id, uid, request_id, operation, status, reserved_credits, final_credits,
    consumed_monthly, consumed_rollover, consumed_topup,
    project_id, metadata, expires_at, created_at, updated_at
  ) VALUES (
    @id, @uid, @request_id, @operation, @status, @reserved_credits, @final_credits,
    @consumed_monthly, @consumed_rollover, @consumed_topup,
    @project_id, @metadata, @expires_at, @created_at, @updated_at
  )
`);

const selectReservationByIdStmt = db.prepare<[string, string], BillingReservationRow>(
    'SELECT * FROM billing_reservations WHERE id = ? AND uid = ?'
);

const updateReservationStmt = db.prepare(`
  UPDATE billing_reservations
  SET status = @status, final_credits = @final_credits, metadata = @metadata, updated_at = @updated_at
  WHERE id = @id AND uid = @uid
`);

const insertLedgerStmt = db.prepare(`
  INSERT INTO billing_ledger (
    id, uid, type, operation, credits_delta, balance_after, request_id, reservation_id, project_id, metadata, created_at
  ) VALUES (
    @id, @uid, @type, @operation, @credits_delta, @balance_after, @request_id, @reservation_id, @project_id, @metadata, @created_at
  )
`);

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

const listLedgerStmt = db.prepare(
    'SELECT id, type, operation, credits_delta, balance_after, request_id, reservation_id, project_id, metadata, created_at FROM billing_ledger WHERE uid = ? ORDER BY created_at DESC LIMIT ?'
);

function hydrateProfile(uid: string, now = new Date()): BillingProfileRow {
    const existing = selectProfileStmt.get(uid);
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
    upsertProfileStmt.run(profile);
    insertLedgerStmt.run({
        id: uuidv4(),
        uid,
        type: 'grant',
        operation: null,
        credits_delta: plan.monthlyCredits,
        balance_after: profileBalance(profile),
        request_id: null,
        reservation_id: null,
        project_id: null,
        metadata: JSON.stringify({ reason: 'initial_monthly_grant', planId: plan.id }),
        created_at: createdAt,
    });
    return profile;
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

function persistProfile(profile: BillingProfileRow) {
    upsertProfileStmt.run(profile);
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

    if (operation === 'plan_route' || operation === 'plan_assist') {
        return {
            operation,
            estimatedCredits: 0,
            modelProfile,
            breakdown: { base: 0, variable: 0, multiplier, bundleDesignSystem: 0 },
        };
    }

    if (operation === 'design_system') {
        base = COST_TABLE.design_system;
    } else if (operation === 'generate' || operation === 'generate_stream') {
        base = COST_TABLE.generate_base;
        variable = expectedScreens * COST_TABLE.generate_per_screen;
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

export function getBillingSummary(uid: string): BillingSummary {
    const tx = db.transaction((userId: string) => {
        const now = new Date();
        const hydrated = hydrateProfile(userId, now);
        const advanced = maybeAdvanceBillingPeriod(hydrated, now);
        if (advanced.updated_at !== hydrated.updated_at) {
            persistProfile(advanced);
        }
        return summarizeProfile(advanced);
    });
    return tx(uid);
}

export function listBillingLedger(uid: string, limit = 40): BillingLedgerItem[] {
    const size = Math.max(1, Math.min(200, Math.floor(limit)));
    const rows = listLedgerStmt.all(uid, size) as BillingLedgerRow[];
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

export function reserveCredits(input: {
    uid: string;
    requestId: string;
    operation: BillingOperation;
    reservedCredits: number;
    projectId?: string;
    metadata?: Record<string, unknown>;
}): BillingReservation {
    const tx = db.transaction((payload: typeof input) => {
        const now = new Date();
        const nowAt = now.toISOString();
        const profileBefore = hydrateProfile(payload.uid, now);
        const profile = maybeAdvanceBillingPeriod(profileBefore, now);

        const amount = clampNonNegative(payload.reservedCredits);
        const available = profileBalance(profile);
        if (available < amount) {
            throw new InsufficientCreditsError({
                operation: payload.operation,
                requiredCredits: amount,
                availableCredits: available,
            });
        }

        const breakdown = applyReservationDeduction(profile, amount);
        profile.updated_at = nowAt;
        persistProfile(profile);

        const reservationId = uuidv4();
        const expiresAt = new Date(now.getTime() + RESERVATION_TTL_MS).toISOString();
        insertReservationStmt.run({
            id: reservationId,
            uid: payload.uid,
            request_id: payload.requestId,
            operation: payload.operation,
            status: 'open',
            reserved_credits: amount,
            final_credits: null,
            consumed_monthly: breakdown.monthly,
            consumed_rollover: breakdown.rollover,
            consumed_topup: breakdown.topup,
            project_id: payload.projectId || null,
            metadata: payload.metadata ? JSON.stringify(payload.metadata) : null,
            expires_at: expiresAt,
            created_at: nowAt,
            updated_at: nowAt,
        });

        const balanceAfter = profileBalance(profile);
        insertLedgerStmt.run({
            id: uuidv4(),
            uid: payload.uid,
            type: 'reserve',
            operation: payload.operation,
            credits_delta: -amount,
            balance_after: balanceAfter,
            request_id: payload.requestId,
            reservation_id: reservationId,
            project_id: payload.projectId || null,
            metadata: JSON.stringify({
                reservedCredits: amount,
                consumed: breakdown,
                ...(payload.metadata || {}),
            }),
            created_at: nowAt,
        });

        return {
            reservationId,
            requestId: payload.requestId,
            operation: payload.operation,
            reservedCredits: amount,
            balanceAfterReserve: balanceAfter,
            expiresAt,
        };
    });

    return tx(input);
}

export function settleReservation(input: {
    uid: string;
    reservationId: string;
    outcome: ReservationOutcome;
    finalCredits?: number;
    metadata?: Record<string, unknown>;
}): { finalChargedCredits: number; summary: BillingSummary; status: BillingReservationRow['status'] } {
    const tx = db.transaction((payload: typeof input) => {
        const now = new Date();
        const nowAt = now.toISOString();
        const reservation = selectReservationByIdStmt.get(payload.reservationId, payload.uid);
        if (!reservation) {
            throw new Error('Billing reservation not found');
        }
        if (reservation.status !== 'open') {
            const summary = getBillingSummary(payload.uid);
            return {
                finalChargedCredits: reservation.final_credits || reservation.reserved_credits,
                summary,
                status: reservation.status,
            };
        }

        const profileBefore = hydrateProfile(payload.uid, now);
        const profile = maybeAdvanceBillingPeriod(profileBefore, now);
        const reserved = reservation.reserved_credits;

        let target = reserved;
        if (payload.outcome === 'failed') {
            target = 0;
        } else if (payload.outcome === 'cancelled') {
            target = Math.ceil(reserved * CANCELLED_JOB_CHARGE_RATIO);
        } else if (typeof payload.finalCredits === 'number' && Number.isFinite(payload.finalCredits)) {
            target = clampNonNegative(payload.finalCredits);
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
        persistProfile(profile);
        const balanceAfter = profileBalance(profile);

        const adjustment = reserved - finalCharged;
        insertLedgerStmt.run({
            id: uuidv4(),
            uid: payload.uid,
            type: adjustment >= 0 ? 'refund' : 'settle',
            operation: reservation.operation,
            credits_delta: adjustment,
            balance_after: balanceAfter,
            request_id: reservation.request_id,
            reservation_id: reservation.id,
            project_id: reservation.project_id,
            metadata: JSON.stringify({
                outcome: payload.outcome,
                reservedCredits: reserved,
                finalChargedCredits: finalCharged,
                ...(payload.metadata || {}),
            }),
            created_at: nowAt,
        });

        updateReservationStmt.run({
            id: reservation.id,
            uid: payload.uid,
            status,
            final_credits: finalCharged,
            metadata: JSON.stringify({
                ...(reservation.metadata ? JSON.parse(reservation.metadata) : {}),
                settlement: {
                    outcome: payload.outcome,
                    finalChargedCredits: finalCharged,
                    requestedFinalCredits: target,
                    settledAt: nowAt,
                    ...(payload.metadata || {}),
                },
            }),
            updated_at: nowAt,
        });

        return {
            finalChargedCredits: finalCharged,
            summary: summarizeProfile(profile),
            status,
        };
    });

    return tx(input);
}

export function setUserPlan(input: {
    uid: string;
    planId: BillingPlanId;
    status?: BillingProfileRow['status'];
    stripeSubscriptionId?: string | null;
    stripePriceId?: string | null;
    reason?: string;
}): BillingSummary {
    const tx = db.transaction((payload: typeof input) => {
        const now = new Date();
        const nowAt = now.toISOString();
        const profileBefore = hydrateProfile(payload.uid, now);
        const profile = maybeAdvanceBillingPeriod(profileBefore, now);
        const previousBalance = profileBalance(profile);

        const plan = getPlan(payload.planId);
        profile.plan_id = plan.id;
        profile.status = payload.status || 'active';
        profile.monthly_credits_remaining = plan.monthlyCredits;
        profile.stripe_subscription_id = payload.stripeSubscriptionId ?? profile.stripe_subscription_id;
        profile.stripe_price_id = payload.stripePriceId ?? profile.stripe_price_id;
        profile.updated_at = nowAt;
        persistProfile(profile);

        const newBalance = profileBalance(profile);
        const delta = newBalance - previousBalance;
        if (delta !== 0) {
            insertLedgerStmt.run({
                id: uuidv4(),
                uid: payload.uid,
                type: 'adjustment',
                operation: null,
                credits_delta: delta,
                balance_after: newBalance,
                request_id: null,
                reservation_id: null,
                project_id: null,
                metadata: JSON.stringify({
                    reason: payload.reason || 'plan_change',
                    planId: plan.id,
                }),
                created_at: nowAt,
            });
        }
        return summarizeProfile(profile);
    });
    return tx(input);
}

export function grantTopupCredits(input: {
    uid: string;
    credits: number;
    reason?: string;
    metadata?: Record<string, unknown>;
}): BillingSummary {
    const tx = db.transaction((payload: typeof input) => {
        const now = new Date();
        const nowAt = now.toISOString();
        const profileBefore = hydrateProfile(payload.uid, now);
        const profile = maybeAdvanceBillingPeriod(profileBefore, now);
        const grant = clampNonNegative(payload.credits);
        profile.topup_credits_remaining += grant;
        profile.updated_at = nowAt;
        persistProfile(profile);
        const balanceAfter = profileBalance(profile);
        insertLedgerStmt.run({
            id: uuidv4(),
            uid: payload.uid,
            type: 'grant',
            operation: null,
            credits_delta: grant,
            balance_after: balanceAfter,
            request_id: null,
            reservation_id: null,
            project_id: null,
            metadata: JSON.stringify({
                reason: payload.reason || 'topup',
                ...(payload.metadata || {}),
            }),
            created_at: nowAt,
        });
        return summarizeProfile(profile);
    });
    return tx(input);
}

export function attachStripeCustomer(uid: string, stripeCustomerId: string): BillingSummary {
    const tx = db.transaction((userId: string, customerId: string) => {
        const now = new Date();
        const profileBefore = hydrateProfile(userId, now);
        const profile = maybeAdvanceBillingPeriod(profileBefore, now);
        profile.stripe_customer_id = customerId;
        profile.updated_at = now.toISOString();
        persistProfile(profile);
        return summarizeProfile(profile);
    });
    return tx(uid, stripeCustomerId);
}

export function getStripeCustomerId(uid: string): string | null {
    const profile = selectProfileStmt.get(uid);
    return profile?.stripe_customer_id || null;
}

export function findUidByStripeCustomerId(stripeCustomerId: string): string | null {
    if (!stripeCustomerId.trim()) return null;
    const row = db
        .prepare<string, { uid: string }>('SELECT uid FROM billing_profiles WHERE stripe_customer_id = ? LIMIT 1')
        .get(stripeCustomerId.trim());
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

export function buildBillingSummaryForApi(uid: string): BillingSummary {
    return getBillingSummary(uid);
}

export function listBillingLedgerForApi(uid: string, limit = 40): BillingLedgerItem[] {
    return listBillingLedger(uid, limit);
}
