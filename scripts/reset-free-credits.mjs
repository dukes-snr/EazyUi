#!/usr/bin/env node

import 'dotenv/config';
import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const TARGET_MONTHLY_CREDITS = 300;
const APPLY = process.argv.includes('--apply');

function requireDatabaseUrl() {
    const value = String(process.env.DATABASE_URL || '').trim();
    if (!value) {
        throw new Error('DATABASE_URL is required.');
    }
    return value;
}

function createPool() {
    return new Pool({
        connectionString: requireDatabaseUrl(),
        max: 2,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
        ssl: process.env.PGSSLMODE === 'disable'
            ? false
            : String(process.env.PGSSL || '').trim() === '0'
                ? false
                : undefined,
    });
}

function toNumber(value) {
    const numeric = Number(value || 0);
    return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
}

function formatCredits(value) {
    return `${toNumber(value).toLocaleString()} credits`;
}

async function main() {
    const pool = createPool();
    const client = await pool.connect();
    const now = new Date().toISOString();

    try {
        await client.query('BEGIN');

        const result = await client.query(
            `
            SELECT uid, plan_id, monthly_credits_remaining, rollover_credits, topup_credits_remaining
            FROM billing_profiles
            WHERE plan_id = 'free'
            FOR UPDATE
            `,
        );

        const users = result.rows.map((row) => {
            const monthly = toNumber(row.monthly_credits_remaining);
            const rollover = toNumber(row.rollover_credits);
            const topup = toNumber(row.topup_credits_remaining);
            const previousBalance = monthly + rollover + topup;
            const nextBalance = TARGET_MONTHLY_CREDITS + topup;
            return {
                uid: String(row.uid),
                previousMonthly: monthly,
                previousRollover: rollover,
                topup,
                previousBalance,
                nextBalance,
                delta: nextBalance - previousBalance,
            };
        });

        const totalDelta = users.reduce((sum, user) => sum + user.delta, 0);

        console.log(`Matched ${users.length} free-plan users.`);
        console.log(`Target monthly credits: ${TARGET_MONTHLY_CREDITS}`);
        console.log(`Net balance delta: ${totalDelta >= 0 ? '+' : ''}${totalDelta.toLocaleString()} credits`);

        if (users.length > 0) {
            console.table(
                users.slice(0, 10).map((user) => ({
                    uid: user.uid,
                    before: formatCredits(user.previousBalance),
                    after: formatCredits(user.nextBalance),
                    delta: `${user.delta >= 0 ? '+' : ''}${user.delta.toLocaleString()}`,
                })),
            );
        }

        if (!APPLY) {
            console.log('Dry run only. Re-run with --apply to commit the reset.');
            await client.query('ROLLBACK');
            return;
        }

        for (const user of users) {
            await client.query(
                `
                UPDATE billing_profiles
                SET monthly_credits_remaining = $2,
                    rollover_credits = 0,
                    updated_at = $3
                WHERE uid = $1
                `,
                [user.uid, TARGET_MONTHLY_CREDITS, now],
            );

            if (user.delta !== 0) {
                await client.query(
                    `
                    INSERT INTO billing_ledger (
                        id, uid, type, operation, credits_delta, balance_after, request_id, reservation_id, project_id, metadata, created_at
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
                    )
                    `,
                    [
                        crypto.randomUUID(),
                        user.uid,
                        'adjustment',
                        null,
                        user.delta,
                        user.nextBalance,
                        null,
                        null,
                        null,
                        JSON.stringify({
                            reason: 'admin_reset_free_monthly_credits_to_300',
                            previousMonthlyCredits: user.previousMonthly,
                            previousRolloverCredits: user.previousRollover,
                            preservedTopupCredits: user.topup,
                            targetMonthlyCredits: TARGET_MONTHLY_CREDITS,
                        }),
                        now,
                    ],
                );
            }
        }

        await client.query('COMMIT');
        console.log(`Applied reset for ${users.length} free-plan users.`);
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
