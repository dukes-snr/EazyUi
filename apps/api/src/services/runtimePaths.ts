import fs from 'fs';
import path from 'path';

function resolveDefaultDataDir(): string {
    const configured = String(process.env.DATA_DIR || '').trim();
    if (configured) {
        return path.resolve(configured);
    }
    return path.resolve(process.cwd(), 'data');
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
