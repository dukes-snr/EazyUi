import { Pool, type PoolClient, type QueryResultRow } from 'pg';

type DbExecutor = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;

let pool: Pool | null = null;
let schemaReadyPromise: Promise<void> | null = null;

function requireDatabaseUrl(): string {
    const value = String(process.env.DATABASE_URL || '').trim();
    if (!value) {
        throw new Error('DATABASE_URL is required for Postgres persistence.');
    }
    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error(
            'DATABASE_URL must be a full Postgres URL like postgresql://postgres:postgres@localhost:5432/eazyui.'
        );
    }
    if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
        throw new Error(
            'DATABASE_URL must use the postgres:// or postgresql:// protocol.'
        );
    }
    if (!parsed.hostname) {
        throw new Error('DATABASE_URL must include a Postgres hostname.');
    }
    return value;
}

export function getDbPool(): Pool {
    if (!pool) {
        pool = new Pool({
            connectionString: requireDatabaseUrl(),
            max: 10,
            idleTimeoutMillis: 30_000,
            connectionTimeoutMillis: 10_000,
            ssl: process.env.PGSSLMODE === 'disable'
                ? false
                : String(process.env.PGSSL || '').trim() === '0'
                    ? false
                    : undefined,
        });
    }
    return pool;
}

export async function ensurePersistenceSchema(): Promise<void> {
    if (!schemaReadyPromise) {
        schemaReadyPromise = (async () => {
            const db = getDbPool();
            await db.query(`
                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    design_spec TEXT NOT NULL,
                    canvas_doc TEXT,
                    chat_state TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
            `);
            await db.query(`
                ALTER TABLE projects
                ADD COLUMN IF NOT EXISTS chat_state TEXT;
            `);
            await db.query(`
                CREATE INDEX IF NOT EXISTS idx_projects_updated_at
                ON projects(updated_at DESC);
            `);
            await db.query(`
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
            `);
            await db.query(`
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
            `);
            await db.query(`
                CREATE INDEX IF NOT EXISTS idx_billing_reservations_uid_created_at
                ON billing_reservations(uid, created_at DESC);
            `);
            await db.query(`
                CREATE INDEX IF NOT EXISTS idx_billing_reservations_uid_request
                ON billing_reservations(uid, request_id);
            `);
            await db.query(`
                CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_reservations_uid_operation_request
                ON billing_reservations(uid, operation, request_id);
            `);
            await db.query(`
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
            `);
            await db.query(`
                CREATE INDEX IF NOT EXISTS idx_billing_ledger_uid_created_at
                ON billing_ledger(uid, created_at DESC);
            `);
            await db.query(`
                CREATE INDEX IF NOT EXISTS idx_billing_profiles_stripe_customer
                ON billing_profiles(stripe_customer_id);
            `);
            await db.query(`
                CREATE TABLE IF NOT EXISTS stripe_webhook_events (
                    id TEXT PRIMARY KEY,
                    event_type TEXT NOT NULL,
                    received_at TEXT NOT NULL
                );
            `);
            await db.query(`
                CREATE TABLE IF NOT EXISTS billing_purchases (
                    id TEXT PRIMARY KEY,
                    uid TEXT NOT NULL,
                    source_key TEXT NOT NULL UNIQUE,
                    source_type TEXT NOT NULL,
                    source_id TEXT NOT NULL,
                    purchase_kind TEXT NOT NULL,
                    product_key TEXT,
                    plan_id TEXT,
                    stripe_customer_id TEXT,
                    stripe_subscription_id TEXT,
                    stripe_invoice_id TEXT,
                    stripe_payment_intent_id TEXT,
                    stripe_price_id TEXT,
                    amount_total INTEGER NOT NULL DEFAULT 0,
                    currency TEXT NOT NULL DEFAULT 'usd',
                    quantity INTEGER NOT NULL DEFAULT 1,
                    status TEXT NOT NULL DEFAULT 'paid',
                    description TEXT,
                    invoice_number TEXT,
                    invoice_url TEXT,
                    invoice_pdf_url TEXT,
                    metadata TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
            `);
            await db.query(`
                CREATE INDEX IF NOT EXISTS idx_billing_purchases_uid_created_at
                ON billing_purchases(uid, created_at DESC);
            `);
            await db.query(`
                CREATE TABLE IF NOT EXISTS api_request_activity (
                    id TEXT PRIMARY KEY,
                    request_key TEXT,
                    uid TEXT,
                    user_email TEXT,
                    auth_type TEXT,
                    route TEXT NOT NULL,
                    method TEXT NOT NULL,
                    status TEXT NOT NULL,
                    started_at TEXT NOT NULL,
                    completed_at TEXT,
                    duration_ms INTEGER,
                    ip TEXT,
                    operation TEXT,
                    request_preview TEXT,
                    preferred_model TEXT,
                    expected_screen_count INTEGER,
                    expected_image_count INTEGER,
                    estimated_credits INTEGER,
                    reserve_credits INTEGER,
                    minimum_floor_credits INTEGER,
                    final_credits INTEGER,
                    balance_credits INTEGER,
                    tokens_used INTEGER,
                    metadata TEXT,
                    error_message TEXT,
                    updated_at TEXT NOT NULL
                );
            `);
            await db.query(`
                CREATE INDEX IF NOT EXISTS idx_api_request_activity_started_at
                ON api_request_activity(started_at DESC);
            `);
            await db.query(`
                CREATE INDEX IF NOT EXISTS idx_api_request_activity_uid_started_at
                ON api_request_activity(uid, started_at DESC);
            `);
            await db.query(`
                CREATE INDEX IF NOT EXISTS idx_api_request_activity_status_started_at
                ON api_request_activity(status, started_at DESC);
            `);
            await db.query(`
                CREATE INDEX IF NOT EXISTS idx_api_request_activity_route_started_at
                ON api_request_activity(route, started_at DESC);
            `);
        })().catch((error) => {
            schemaReadyPromise = null;
            throw error;
        });
    }

    await schemaReadyPromise;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    await ensurePersistenceSchema();
    const client = await getDbPool().connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

export async function queryRows<Row extends QueryResultRow = QueryResultRow>(
    executor: DbExecutor,
    text: string,
    values?: readonly unknown[],
): Promise<Row[]> {
    const result = await executor.query<Row>(text, values as any[]);
    return result.rows;
}

export async function queryOne<Row extends QueryResultRow = QueryResultRow>(
    executor: DbExecutor,
    text: string,
    values?: readonly unknown[],
): Promise<Row | null> {
    const rows = await queryRows<Row>(executor, text, values);
    return rows[0] || null;
}
