// ============================================================================
// Database Service - SQLite persistence
// ============================================================================

import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type { HtmlDesignSpec } from './gemini.js';
import path from 'path';
import fs from 'fs';

// Ensure data directory exists
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'eazyui.db'));

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    design_spec TEXT NOT NULL,
    canvas_doc TEXT,
    chat_state TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  
  CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at DESC);
`);

const projectColumns = db.prepare<[], { name: string }>('PRAGMA table_info(projects)').all().map((row) => row.name);
if (!projectColumns.includes('chat_state')) {
    db.exec('ALTER TABLE projects ADD COLUMN chat_state TEXT');
}

// ============================================================================
// Project Operations
// ============================================================================

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

export function saveProject(
    designSpec: HtmlDesignSpec,
    canvasDoc?: unknown,
    chatState?: unknown,
    projectId?: string
): { projectId: string; savedAt: string } {
    const id = projectId || uuidv4();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
    INSERT INTO projects (id, name, design_spec, canvas_doc, chat_state, created_at, updated_at)
    VALUES (@id, @name, @designSpec, @canvasDoc, @chatState, @createdAt, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      name = @name,
      design_spec = @designSpec,
      canvas_doc = @canvasDoc,
      chat_state = @chatState,
      updated_at = @updatedAt
  `);

    stmt.run({
        id,
        name: designSpec.name,
        designSpec: JSON.stringify(designSpec),
        canvasDoc: canvasDoc ? JSON.stringify(canvasDoc) : null,
        chatState: chatState ? JSON.stringify(chatState) : null,
        createdAt: projectId ? (db.prepare<string, Pick<ProjectRow, 'created_at'>>('SELECT created_at FROM projects WHERE id = ?').get(projectId)?.created_at || now) : now,
        updatedAt: now,
    });

    return { projectId: id, savedAt: now };
}

export function getProject(projectId: string): Project | null {
    const row = db.prepare<string, ProjectRow>('SELECT * FROM projects WHERE id = ?').get(projectId);

    if (!row) return null;

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

export function listProjects(): { id: string; name: string; updatedAt: string }[] {
    const rows = db.prepare<[], Pick<ProjectRow, 'id' | 'name' | 'updated_at'>>(
        'SELECT id, name, updated_at FROM projects ORDER BY updated_at DESC LIMIT 50'
    ).all();

    return rows.map(row => ({
        id: row.id,
        name: row.name,
        updatedAt: row.updated_at,
    }));
}

export function deleteProject(projectId: string): boolean {
    const result = db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
    return result.changes > 0;
}
