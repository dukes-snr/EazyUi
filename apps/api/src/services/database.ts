// ============================================================================
// Database Service - Postgres persistence
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import type { HtmlDesignSpec } from './gemini.js';
import { ensurePersistenceSchema, getDbPool, queryOne, queryRows } from './postgres.js';

interface ProjectRow {
    id: string;
    name: string;
    design_spec: string;
    canvas_doc: string | null;
    chat_state: string | null;
    created_at: string;
    updated_at: string;
}

export interface Project {
    id: string;
    name: string;
    designSpec: HtmlDesignSpec;
    canvasDoc: unknown | null;
    chatState: unknown | null;
    createdAt: string;
    updatedAt: string;
}

function mapProjectRow(row: ProjectRow): Project {
    return {
        id: row.id,
        name: row.name,
        designSpec: JSON.parse(row.design_spec),
        canvasDoc: row.canvas_doc ? JSON.parse(row.canvas_doc) : null,
        chatState: row.chat_state ? JSON.parse(row.chat_state) : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export async function saveProject(
    designSpec: HtmlDesignSpec,
    canvasDoc?: unknown,
    chatState?: unknown,
    projectId?: string,
): Promise<{ projectId: string; savedAt: string }> {
    await ensurePersistenceSchema();
    const db = getDbPool();
    const id = projectId || uuidv4();
    const now = new Date().toISOString();
    const existing = projectId
        ? await queryOne<Pick<ProjectRow, 'created_at'>>(db, 'SELECT created_at FROM projects WHERE id = $1', [projectId])
        : null;
    const createdAt = existing?.created_at || now;

    await db.query(
        `
        INSERT INTO projects (id, name, design_spec, canvas_doc, chat_state, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            design_spec = EXCLUDED.design_spec,
            canvas_doc = EXCLUDED.canvas_doc,
            chat_state = EXCLUDED.chat_state,
            updated_at = EXCLUDED.updated_at
        `,
        [
            id,
            designSpec.name,
            JSON.stringify(designSpec),
            canvasDoc ? JSON.stringify(canvasDoc) : null,
            chatState ? JSON.stringify(chatState) : null,
            createdAt,
            now,
        ],
    );

    return { projectId: id, savedAt: now };
}

export async function getProject(projectId: string): Promise<Project | null> {
    await ensurePersistenceSchema();
    const db = getDbPool();
    const row = await queryOne<ProjectRow>(db, 'SELECT * FROM projects WHERE id = $1', [projectId]);
    return row ? mapProjectRow(row) : null;
}

export async function listProjects(): Promise<{ id: string; name: string; updatedAt: string }[]> {
    await ensurePersistenceSchema();
    const db = getDbPool();
    const rows = await queryRows<Pick<ProjectRow, 'id' | 'name' | 'updated_at'>>(
        db,
        'SELECT id, name, updated_at FROM projects ORDER BY updated_at DESC LIMIT 50',
    );

    return rows.map((row) => ({
        id: row.id,
        name: row.name,
        updatedAt: row.updated_at,
    }));
}

export async function deleteProject(projectId: string): Promise<boolean> {
    await ensurePersistenceSchema();
    const db = getDbPool();
    const result = await db.query('DELETE FROM projects WHERE id = $1', [projectId]);
    return (result.rowCount || 0) > 0;
}
