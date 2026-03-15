import fs from 'fs';
import path from 'path';

function normalizeDatabasePath(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('file:')) {
        return decodeURIComponent(trimmed.slice('file:'.length));
    }
    return trimmed;
}

function resolveDefaultDataDir(): string {
    const configured = String(process.env.DATA_DIR || '').trim();
    if (configured) {
        return path.resolve(configured);
    }
    return path.resolve(process.cwd(), 'data');
}

export function resolveSqliteDatabasePath(filename = 'eazyui.db'): string {
    const configured = normalizeDatabasePath(String(process.env.DATABASE_URL || ''));
    if (configured) {
        return path.isAbsolute(configured)
            ? configured
            : path.resolve(process.cwd(), configured);
    }
    return path.join(resolveDefaultDataDir(), filename);
}

export function resolveDataFilePath(filename: string): string {
    return path.join(resolveDefaultDataDir(), filename);
}

export function ensureParentDir(filePath: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}
