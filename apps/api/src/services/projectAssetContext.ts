import { getFirebaseDb } from './firebaseAuth.js';

export type AssetScope = 'project' | 'account';
export type AssetKind = 'image' | 'logo' | 'component';
export type AssetRole = 'logo' | 'product-shot' | 'illustration' | 'photo' | 'brand-texture';

export interface ProjectAssetLink {
    assetId: string;
    scope: AssetScope;
    projectId?: string;
    role?: AssetRole;
    pinned?: boolean;
    isPreferredLogo?: boolean;
    isKeyBrandAsset?: boolean;
}

export interface ProjectAssetContext {
    version: number;
    autoUseBrandAssets: boolean;
    links: ProjectAssetLink[];
    updatedAt: string;
}

export interface AssetReference {
    assetId: string;
    name: string;
    scope: AssetScope;
    kind: AssetKind;
    downloadUrl: string;
    mimeType: string;
    projectId?: string;
    width?: number;
    height?: number;
    role?: AssetRole;
    pinned?: boolean;
    isPreferredLogo?: boolean;
    isKeyBrandAsset?: boolean;
    source: 'saved_attachment' | 'project_brand';
}

type StoredProjectAssetContext = {
    version?: unknown;
    autoUseBrandAssets?: unknown;
    links?: unknown;
    updatedAt?: unknown;
};

type StoredAssetDoc = {
    id?: unknown;
    name?: unknown;
    scope?: unknown;
    kind?: unknown;
    downloadUrl?: unknown;
    mimeType?: unknown;
    projectId?: unknown;
    width?: unknown;
    height?: unknown;
};

function pickIsoTime(value: unknown): string {
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
    }
    return new Date().toISOString();
}

function sanitizeProjectAssetLink(value: unknown): ProjectAssetLink | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Record<string, unknown>;
    const assetId = typeof raw.assetId === 'string' ? raw.assetId.trim() : '';
    const scope = raw.scope === 'project' || raw.scope === 'account' ? raw.scope : null;
    if (!assetId || !scope) return null;
    const role = raw.role === 'logo'
        || raw.role === 'product-shot'
        || raw.role === 'illustration'
        || raw.role === 'photo'
        || raw.role === 'brand-texture'
        ? raw.role
        : undefined;
    return {
        assetId,
        scope,
        ...(typeof raw.projectId === 'string' && raw.projectId.trim() ? { projectId: raw.projectId.trim() } : {}),
        ...(role ? { role } : {}),
        ...(raw.pinned === true ? { pinned: true } : {}),
        ...(raw.isPreferredLogo === true ? { isPreferredLogo: true } : {}),
        ...(raw.isKeyBrandAsset === true ? { isKeyBrandAsset: true } : {}),
    };
}

export function sanitizeProjectAssetContext(value: unknown): ProjectAssetContext | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as StoredProjectAssetContext;
    const links = Array.isArray(raw.links)
        ? raw.links
            .map((item) => sanitizeProjectAssetLink(item))
            .filter((item): item is ProjectAssetLink => Boolean(item))
            .slice(0, 24)
        : [];
    return {
        version: 1,
        autoUseBrandAssets: raw.autoUseBrandAssets === true,
        links,
        updatedAt: pickIsoTime(raw.updatedAt),
    };
}

function sanitizeAssetReference(value: unknown): AssetReference | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Record<string, unknown>;
    const assetId = typeof raw.assetId === 'string' ? raw.assetId.trim() : '';
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    const scope = raw.scope === 'project' || raw.scope === 'account' ? raw.scope : null;
    const kind = raw.kind === 'image' || raw.kind === 'logo' || raw.kind === 'component' ? raw.kind : null;
    const downloadUrl = typeof raw.downloadUrl === 'string' ? raw.downloadUrl.trim() : '';
    const mimeType = typeof raw.mimeType === 'string' ? raw.mimeType.trim() : '';
    const source = raw.source === 'saved_attachment' || raw.source === 'project_brand' ? raw.source : null;
    const role = raw.role === 'logo'
        || raw.role === 'product-shot'
        || raw.role === 'illustration'
        || raw.role === 'photo'
        || raw.role === 'brand-texture'
        ? raw.role
        : undefined;
    if (!assetId || !name || !scope || !kind || !downloadUrl || !mimeType || !source) return null;
    return {
        assetId,
        name,
        scope,
        kind,
        downloadUrl,
        mimeType,
        ...(typeof raw.projectId === 'string' && raw.projectId.trim() ? { projectId: raw.projectId.trim() } : {}),
        ...(typeof raw.width === 'number' && Number.isFinite(raw.width) ? { width: raw.width } : {}),
        ...(typeof raw.height === 'number' && Number.isFinite(raw.height) ? { height: raw.height } : {}),
        ...(role ? { role } : {}),
        ...(raw.pinned === true ? { pinned: true } : {}),
        ...(raw.isPreferredLogo === true ? { isPreferredLogo: true } : {}),
        ...(raw.isKeyBrandAsset === true ? { isKeyBrandAsset: true } : {}),
        source,
    };
}

export function sanitizeAssetReferences(value: unknown): AssetReference[] {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const refs: AssetReference[] = [];
    for (const item of value) {
        const assetRef = sanitizeAssetReference(item);
        if (!assetRef) continue;
        const key = `${assetRef.assetId}:${assetRef.scope}:${assetRef.projectId || ''}:${assetRef.source}`;
        if (seen.has(key)) continue;
        seen.add(key);
        refs.push(assetRef);
        if (refs.length >= 16) break;
    }
    return refs;
}

function buildProjectBrandAssetReference(assetDocId: string, asset: StoredAssetDoc, link: ProjectAssetLink, fallbackProjectId: string): AssetReference | null {
    const assetId = typeof asset.id === 'string' && asset.id.trim() ? asset.id.trim() : assetDocId;
    const name = typeof asset.name === 'string' ? asset.name.trim() : '';
    const scope = asset.scope === 'project' || asset.scope === 'account' ? asset.scope : link.scope;
    const kind = asset.kind === 'image' || asset.kind === 'logo' || asset.kind === 'component' ? asset.kind : null;
    const downloadUrl = typeof asset.downloadUrl === 'string' ? asset.downloadUrl.trim() : '';
    const mimeType = typeof asset.mimeType === 'string' ? asset.mimeType.trim() : '';
    if (!assetId || !name || !scope || !kind || !downloadUrl || !mimeType) return null;
    return {
        assetId,
        name,
        scope,
        kind,
        downloadUrl,
        mimeType,
        ...(scope === 'project' ? { projectId: (typeof asset.projectId === 'string' && asset.projectId.trim()) ? asset.projectId.trim() : (link.projectId || fallbackProjectId) } : {}),
        ...(typeof asset.width === 'number' && Number.isFinite(asset.width) ? { width: asset.width } : {}),
        ...(typeof asset.height === 'number' && Number.isFinite(asset.height) ? { height: asset.height } : {}),
        ...(link.role ? { role: link.role } : {}),
        ...(link.pinned ? { pinned: true } : {}),
        ...(link.isPreferredLogo ? { isPreferredLogo: true } : {}),
        ...(link.isKeyBrandAsset ? { isKeyBrandAsset: true } : {}),
        source: 'project_brand',
    };
}

export async function resolveProjectBrandAssetContext(input: {
    uid: string;
    projectId?: string;
}): Promise<{ context: ProjectAssetContext | null; assetRefs: AssetReference[] }> {
    const projectId = typeof input.projectId === 'string' ? input.projectId.trim() : '';
    if (!projectId) {
        return { context: null, assetRefs: [] };
    }

    const db = getFirebaseDb();
    const projectRef = db.doc(`users/${input.uid}/projects/${projectId}`);
    const projectSnap = await projectRef.get();
    if (!projectSnap.exists) {
        return { context: null, assetRefs: [] };
    }

    const context = sanitizeProjectAssetContext(projectSnap.data()?.projectAssetContext);
    if (!context || context.links.length === 0) {
        return { context, assetRefs: [] };
    }

    const assetRefs = (await Promise.all(context.links.map(async (link) => {
        const assetProjectId = link.scope === 'project' ? (link.projectId || projectId) : undefined;
        const assetPath = link.scope === 'project'
            ? `users/${input.uid}/projects/${assetProjectId}/assets/${link.assetId}`
            : `users/${input.uid}/assets/${link.assetId}`;
        const assetSnap = await db.doc(assetPath).get();
        if (!assetSnap.exists) return null;
        return buildProjectBrandAssetReference(assetSnap.id, assetSnap.data() as StoredAssetDoc, link, projectId);
    }))).filter((item): item is AssetReference => Boolean(item));

    return {
        context,
        assetRefs: sanitizeAssetReferences(assetRefs),
    };
}
