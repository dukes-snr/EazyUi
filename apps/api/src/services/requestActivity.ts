import { ensurePersistenceSchema, getDbPool, queryOne, queryRows } from './postgres.js';

export type RequestActivityStatus = 'running' | 'success' | 'error';

export type RequestActivityItem = {
    id: string;
    requestKey?: string;
    uid?: string;
    userEmail?: string;
    authType?: 'firebase' | 'mcp' | 'internal' | 'anonymous';
    route: string;
    method: string;
    status: RequestActivityStatus;
    startedAt: string;
    completedAt?: string;
    durationMs?: number;
    ip?: string;
    operation?: string;
    requestPreview?: string;
    preferredModel?: string;
    expectedScreenCount?: number;
    expectedImageCount?: number;
    estimatedCredits?: number;
    reserveCredits?: number;
    minimumFloorCredits?: number;
    finalCredits?: number;
    balanceCredits?: number;
    tokensUsed?: number;
    metadata?: Record<string, unknown>;
    errorMessage?: string;
};

type RequestActivityRow = {
    id: string;
    request_key: string | null;
    uid: string | null;
    user_email: string | null;
    auth_type: string | null;
    route: string;
    method: string;
    status: RequestActivityStatus;
    started_at: string;
    completed_at: string | null;
    duration_ms: number | null;
    ip: string | null;
    operation: string | null;
    request_preview: string | null;
    preferred_model: string | null;
    expected_screen_count: number | null;
    expected_image_count: number | null;
    estimated_credits: number | null;
    reserve_credits: number | null;
    minimum_floor_credits: number | null;
    final_credits: number | null;
    balance_credits: number | null;
    tokens_used: number | null;
    metadata: string | null;
    error_message: string | null;
    updated_at: string;
};

export type RequestActivitySummary = {
    total: number;
    running: number;
    errors: number;
    authenticatedUsers: number;
    avgDurationMs: number | null;
};

export type RequestActivityUserSummary = {
    uid: string | null;
    userEmail: string | null;
    authType: string | null;
    requests: number;
    running: number;
    errors: number;
    lastSeenAt: string;
};

export type RequestActivityRouteSummary = {
    route: string;
    requests: number;
    running: number;
    errors: number;
    lastSeenAt: string;
};

const SNAPSHOT_LIMIT = 250;
const SUMMARY_WINDOW_LIMIT = 1000;
const USER_SUMMARY_LIMIT = 12;
const ROUTE_SUMMARY_LIMIT = 10;
const ACTIVITY_RETENTION = Math.max(250, Math.min(20_000, Number(process.env.API_ACTIVITY_RETENTION || '5000') || 5000));

let trimCounter = 0;

function safeParseMetadata(raw: string | null): Record<string, unknown> | undefined {
    if (!raw) return undefined;
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : undefined;
    } catch {
        return undefined;
    }
}

function mapRow(row: RequestActivityRow): RequestActivityItem {
    return {
        id: row.id,
        ...(row.request_key ? { requestKey: row.request_key } : {}),
        ...(row.uid ? { uid: row.uid } : {}),
        ...(row.user_email ? { userEmail: row.user_email } : {}),
        ...(row.auth_type ? { authType: row.auth_type as RequestActivityItem['authType'] } : {}),
        route: row.route,
        method: row.method,
        status: row.status,
        startedAt: row.started_at,
        ...(row.completed_at ? { completedAt: row.completed_at } : {}),
        ...(typeof row.duration_ms === 'number' ? { durationMs: row.duration_ms } : {}),
        ...(row.ip ? { ip: row.ip } : {}),
        ...(row.operation ? { operation: row.operation } : {}),
        ...(row.request_preview ? { requestPreview: row.request_preview } : {}),
        ...(row.preferred_model ? { preferredModel: row.preferred_model } : {}),
        ...(typeof row.expected_screen_count === 'number' ? { expectedScreenCount: row.expected_screen_count } : {}),
        ...(typeof row.expected_image_count === 'number' ? { expectedImageCount: row.expected_image_count } : {}),
        ...(typeof row.estimated_credits === 'number' ? { estimatedCredits: row.estimated_credits } : {}),
        ...(typeof row.reserve_credits === 'number' ? { reserveCredits: row.reserve_credits } : {}),
        ...(typeof row.minimum_floor_credits === 'number' ? { minimumFloorCredits: row.minimum_floor_credits } : {}),
        ...(typeof row.final_credits === 'number' ? { finalCredits: row.final_credits } : {}),
        ...(typeof row.balance_credits === 'number' ? { balanceCredits: row.balance_credits } : {}),
        ...(typeof row.tokens_used === 'number' ? { tokensUsed: row.tokens_used } : {}),
        ...(safeParseMetadata(row.metadata) ? { metadata: safeParseMetadata(row.metadata) } : {}),
        ...(row.error_message ? { errorMessage: row.error_message } : {}),
    };
}

async function trimOldActivitiesIfNeeded(): Promise<void> {
    trimCounter += 1;
    if (trimCounter % 50 !== 0) return;
    await getDbPool().query(`
        DELETE FROM api_request_activity
        WHERE id IN (
            SELECT id FROM api_request_activity
            ORDER BY started_at DESC
            OFFSET $1
        )
    `, [ACTIVITY_RETENTION]);
}

export async function upsertRequestActivity(item: RequestActivityItem): Promise<void> {
    await ensurePersistenceSchema();
    const db = getDbPool();
    const now = new Date().toISOString();
    await db.query(`
        INSERT INTO api_request_activity (
            id, request_key, uid, user_email, auth_type,
            route, method, status, started_at, completed_at, duration_ms,
            ip, operation, request_preview, preferred_model,
            expected_screen_count, expected_image_count,
            estimated_credits, reserve_credits, minimum_floor_credits,
            final_credits, balance_credits, tokens_used,
            metadata, error_message, updated_at
        ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10, $11,
            $12, $13, $14, $15,
            $16, $17,
            $18, $19, $20,
            $21, $22, $23,
            $24, $25, $26
        )
        ON CONFLICT (id) DO UPDATE SET
            request_key = EXCLUDED.request_key,
            uid = EXCLUDED.uid,
            user_email = EXCLUDED.user_email,
            auth_type = EXCLUDED.auth_type,
            route = EXCLUDED.route,
            method = EXCLUDED.method,
            status = EXCLUDED.status,
            started_at = EXCLUDED.started_at,
            completed_at = EXCLUDED.completed_at,
            duration_ms = EXCLUDED.duration_ms,
            ip = EXCLUDED.ip,
            operation = EXCLUDED.operation,
            request_preview = EXCLUDED.request_preview,
            preferred_model = EXCLUDED.preferred_model,
            expected_screen_count = EXCLUDED.expected_screen_count,
            expected_image_count = EXCLUDED.expected_image_count,
            estimated_credits = EXCLUDED.estimated_credits,
            reserve_credits = EXCLUDED.reserve_credits,
            minimum_floor_credits = EXCLUDED.minimum_floor_credits,
            final_credits = EXCLUDED.final_credits,
            balance_credits = EXCLUDED.balance_credits,
            tokens_used = EXCLUDED.tokens_used,
            metadata = EXCLUDED.metadata,
            error_message = EXCLUDED.error_message,
            updated_at = EXCLUDED.updated_at
    `, [
        item.id,
        item.requestKey || null,
        item.uid || null,
        item.userEmail || null,
        item.authType || null,
        item.route,
        item.method,
        item.status,
        item.startedAt,
        item.completedAt || null,
        typeof item.durationMs === 'number' ? item.durationMs : null,
        item.ip || null,
        item.operation || null,
        item.requestPreview || null,
        item.preferredModel || null,
        typeof item.expectedScreenCount === 'number' ? item.expectedScreenCount : null,
        typeof item.expectedImageCount === 'number' ? item.expectedImageCount : null,
        typeof item.estimatedCredits === 'number' ? item.estimatedCredits : null,
        typeof item.reserveCredits === 'number' ? item.reserveCredits : null,
        typeof item.minimumFloorCredits === 'number' ? item.minimumFloorCredits : null,
        typeof item.finalCredits === 'number' ? item.finalCredits : null,
        typeof item.balanceCredits === 'number' ? item.balanceCredits : null,
        typeof item.tokensUsed === 'number' ? item.tokensUsed : null,
        item.metadata ? JSON.stringify(item.metadata) : null,
        item.errorMessage || null,
        now,
    ]);
    await trimOldActivitiesIfNeeded();
}

export async function getRequestActivitySnapshot(limit = SNAPSHOT_LIMIT): Promise<{
    items: RequestActivityItem[];
    summary: RequestActivitySummary;
    topUsers: RequestActivityUserSummary[];
    topRoutes: RequestActivityRouteSummary[];
    retention: number;
}> {
    await ensurePersistenceSchema();
    const db = getDbPool();
    const safeLimit = Math.max(25, Math.min(1000, Math.floor(limit)));

    const items = (await queryRows<RequestActivityRow>(db, `
        SELECT *
        FROM api_request_activity
        ORDER BY started_at DESC
        LIMIT $1
    `, [safeLimit])).map(mapRow);

    const summaryRow = await queryOne<{
        total: string;
        running: string;
        errors: string;
        authenticated_users: string;
        avg_duration_ms: string | null;
    }>(db, `
        WITH recent AS (
            SELECT *
            FROM api_request_activity
            ORDER BY started_at DESC
            LIMIT $1
        )
        SELECT
            COUNT(*)::text AS total,
            COALESCE(SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END), 0)::text AS running,
            COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0)::text AS errors,
            COUNT(DISTINCT NULLIF(uid, ''))::text AS authenticated_users,
            ROUND(AVG(duration_ms)::numeric, 0)::text AS avg_duration_ms
        FROM recent
    `, [SUMMARY_WINDOW_LIMIT]);

    const topUsers = await queryRows<{
        uid: string | null;
        user_email: string | null;
        auth_type: string | null;
        requests: string;
        running: string;
        errors: string;
        last_seen_at: string;
    }>(db, `
        WITH recent AS (
            SELECT *
            FROM api_request_activity
            ORDER BY started_at DESC
            LIMIT $1
        ),
        keyed AS (
            SELECT
                COALESCE(NULLIF(uid, ''), CONCAT('anon:', COALESCE(ip, 'unknown'))) AS identity_key,
                NULLIF(uid, '') AS normalized_uid,
                user_email,
                auth_type,
                status,
                started_at
            FROM recent
        )
        SELECT
            MAX(normalized_uid) AS uid,
            MAX(user_email) AS user_email,
            MAX(auth_type) AS auth_type,
            COUNT(*)::text AS requests,
            COALESCE(SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END), 0)::text AS running,
            COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0)::text AS errors,
            MAX(started_at) AS last_seen_at
        FROM keyed
        GROUP BY identity_key
        ORDER BY COUNT(*) DESC, MAX(started_at) DESC
        LIMIT $2
    `, [SUMMARY_WINDOW_LIMIT, USER_SUMMARY_LIMIT]);

    const topRoutes = await queryRows<{
        route: string;
        requests: string;
        running: string;
        errors: string;
        last_seen_at: string;
    }>(db, `
        WITH recent AS (
            SELECT *
            FROM api_request_activity
            ORDER BY started_at DESC
            LIMIT $1
        )
        SELECT
            route,
            COUNT(*)::text AS requests,
            COALESCE(SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END), 0)::text AS running,
            COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0)::text AS errors,
            MAX(started_at) AS last_seen_at
        FROM recent
        GROUP BY route
        ORDER BY COUNT(*) DESC, MAX(started_at) DESC
        LIMIT $2
    `, [SUMMARY_WINDOW_LIMIT, ROUTE_SUMMARY_LIMIT]);

    return {
        items,
        summary: {
            total: Number(summaryRow?.total || 0),
            running: Number(summaryRow?.running || 0),
            errors: Number(summaryRow?.errors || 0),
            authenticatedUsers: Number(summaryRow?.authenticated_users || 0),
            avgDurationMs: summaryRow?.avg_duration_ms ? Number(summaryRow.avg_duration_ms) : null,
        },
        topUsers: topUsers.map((row) => ({
            uid: row.uid,
            userEmail: row.user_email,
            authType: row.auth_type,
            requests: Number(row.requests || 0),
            running: Number(row.running || 0),
            errors: Number(row.errors || 0),
            lastSeenAt: row.last_seen_at,
        })),
        topRoutes: topRoutes.map((row) => ({
            route: row.route,
            requests: Number(row.requests || 0),
            running: Number(row.running || 0),
            errors: Number(row.errors || 0),
            lastSeenAt: row.last_seen_at,
        })),
        retention: ACTIVITY_RETENTION,
    };
}
