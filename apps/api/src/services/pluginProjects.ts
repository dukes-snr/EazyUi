import { getFirebaseDb, getFirebaseStorageBucket } from './firebaseAuth.js';

export type PluginProjectListItem = {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    screenCount: number;
    hasSnapshot: boolean;
    description?: string;
    coverImageUrl?: string;
};

export type PluginProjectScreenItem = {
    screenId: string;
    name: string;
    width: number;
    height: number;
    status: 'streaming' | 'complete';
    updatedAt?: string;
};

export type PluginProjectScreenRenderSource = {
    project: PluginProjectListItem;
    screen: PluginProjectScreenItem;
    html: string;
    designSystem?: unknown;
};

function asString(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeCoverImage(docData: Record<string, unknown>): string | undefined {
    const direct = asString(docData.coverImageUrl).trim();
    if (direct) return direct;
    const urls = Array.isArray(docData.coverImageUrls) ? docData.coverImageUrls : [];
    const first = urls.find((value) => typeof value === 'string' && value.trim());
    return typeof first === 'string' ? first.trim() : undefined;
}

export async function listPluginProjects(uid: string): Promise<PluginProjectListItem[]> {
    const db = getFirebaseDb();
    const snap = await db
        .collection('users')
        .doc(uid)
        .collection('projects')
        .orderBy('updatedAt', 'desc')
        .limit(50)
        .get();

    return snap.docs.map((doc) => {
        const data = (doc.data() || {}) as Record<string, unknown>;
        const designSpecMeta = ((data.designSpecMeta || {}) as Record<string, unknown>);
        const metaScreens = Array.isArray(designSpecMeta.screens) ? designSpecMeta.screens : [];

        return {
            id: doc.id,
            name: asString(data.name, 'Untitled project'),
            createdAt: asString(data.createdAt, asString(data.updatedAt)),
            updatedAt: asString(data.updatedAt),
            screenCount: asNumber(data.screenCount, metaScreens.length),
            hasSnapshot: Boolean(data.snapshotPath),
            description: asString(designSpecMeta.description) || undefined,
            coverImageUrl: normalizeCoverImage(data),
        };
    });
}

export async function getPluginProjectScreens(uid: string, projectId: string): Promise<{
    project: PluginProjectListItem;
    screens: PluginProjectScreenItem[];
} | null> {
    const db = getFirebaseDb();
    const projectRef = db.collection('users').doc(uid).collection('projects').doc(projectId);
    const projectSnap = await projectRef.get();
    if (!projectSnap.exists) return null;

    const data = (projectSnap.data() || {}) as Record<string, unknown>;
    const designSpecMeta = ((data.designSpecMeta || {}) as Record<string, unknown>);
    const project: PluginProjectListItem = {
        id: projectSnap.id,
        name: asString(data.name, 'Untitled project'),
        createdAt: asString(data.createdAt, asString(data.updatedAt)),
        updatedAt: asString(data.updatedAt),
        screenCount: asNumber(data.screenCount, Array.isArray(designSpecMeta.screens) ? designSpecMeta.screens.length : 0),
        hasSnapshot: Boolean(data.snapshotPath),
        description: asString(designSpecMeta.description) || undefined,
        coverImageUrl: normalizeCoverImage(data),
    };

    const screensSnap = await projectRef.collection('screens').get();
    const screens = screensSnap.docs.map((screenDoc) => {
        const screen = (screenDoc.data() || {}) as Record<string, unknown>;
        return {
            screenId: asString(screen.screenId, screenDoc.id),
            name: asString(screen.name, 'Untitled screen'),
            width: asNumber(screen.width, 402),
            height: asNumber(screen.height, 874),
            status: asString(screen.status, 'complete') === 'streaming' ? 'streaming' : 'complete',
            updatedAt: asString(screen.updatedAt) || undefined,
        } satisfies PluginProjectScreenItem;
    });

    screens.sort((left, right) => left.name.localeCompare(right.name));
    return { project, screens };
}

export async function getPluginProjectScreenRenderSource(
    uid: string,
    projectId: string,
    screenId: string,
): Promise<PluginProjectScreenRenderSource | null> {
    const db = getFirebaseDb();
    const projectRef = db.collection('users').doc(uid).collection('projects').doc(projectId);
    const [projectSnap, screenSnap] = await Promise.all([
        projectRef.get(),
        projectRef.collection('screens').doc(screenId).get(),
    ]);

    if (!projectSnap.exists || !screenSnap.exists) return null;

    const projectData = (projectSnap.data() || {}) as Record<string, unknown>;
    const projectDesignSpecMeta = ((projectData.designSpecMeta || {}) as Record<string, unknown>);
    const project: PluginProjectListItem = {
        id: projectSnap.id,
        name: asString(projectData.name, 'Untitled project'),
        createdAt: asString(projectData.createdAt, asString(projectData.updatedAt)),
        updatedAt: asString(projectData.updatedAt),
        screenCount: asNumber(
            projectData.screenCount,
            Array.isArray(projectDesignSpecMeta.screens) ? projectDesignSpecMeta.screens.length : 0,
        ),
        hasSnapshot: Boolean(projectData.snapshotPath),
        description: asString(projectDesignSpecMeta.description) || undefined,
        coverImageUrl: normalizeCoverImage(projectData),
    };

    const screenData = (screenSnap.data() || {}) as Record<string, unknown>;
    const screen: PluginProjectScreenItem = {
        screenId: asString(screenData.screenId, screenSnap.id),
        name: asString(screenData.name, 'Untitled screen'),
        width: asNumber(screenData.width, 402),
        height: asNumber(screenData.height, 874),
        status: asString(screenData.status, 'complete') === 'streaming' ? 'streaming' : 'complete',
        updatedAt: asString(screenData.updatedAt) || undefined,
    };

    let html = asString(screenData.html).trim();
    const htmlPath = asString(screenData.htmlPath).trim();
    if (!html && htmlPath) {
        const bucket = getFirebaseStorageBucket();
        const [buffer] = await bucket.file(`users/${uid}/projects/${projectId}/${htmlPath}`).download();
        html = buffer.toString('utf8').trim();
    }
    if (!html) {
        html = asString(screenData.htmlSnippet).trim();
    }
    if (!html) {
        throw new Error('The requested screen does not have importable HTML content.');
    }

    return {
        project,
        screen,
        html,
        designSystem: projectDesignSpecMeta.designSystem,
    };
}
