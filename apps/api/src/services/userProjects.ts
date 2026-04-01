import { getFirebaseDb, getFirebaseStorageBucket } from './firebaseAuth.js';
import type { HtmlDesignSpec } from './gemini.js';

type ProjectMetaData = {
    id?: string;
    name?: string;
    designSpec?: HtmlDesignSpec;
    designSpecMeta?: {
        id?: string;
        name?: string;
        description?: string;
        designSystem?: HtmlDesignSpec['designSystem'];
        screens?: Array<{
            screenId?: string;
            name?: string;
            width?: number;
            height?: number;
            status?: 'streaming' | 'complete';
        }>;
    };
    canvasDoc?: unknown;
    chatState?: unknown;
    projectMemory?: unknown;
    projectAssetContext?: unknown;
    snapshotPath?: string;
    createdAt?: string;
    updatedAt?: string;
};

type StoredScreenDoc = {
    screenId?: string;
    name?: string;
    width?: number;
    height?: number;
    status?: 'streaming' | 'complete';
    html?: string;
    htmlSnippet?: string;
    htmlPath?: string;
};

type PersistedMessage = Record<string, unknown>;

type WorkspaceSnapshot = {
    designSpec: HtmlDesignSpec;
    canvasDoc?: unknown | null;
    chatState?: unknown | null;
    projectMemory?: unknown | null;
};

export type UserProjectRecord = {
    projectId: string;
    designSpec: HtmlDesignSpec;
    canvasDoc: unknown;
    chatState: unknown;
    projectMemory?: unknown;
    projectAssetContext?: unknown;
    createdAt: string;
    updatedAt: string;
};

function asString(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isValidDesignSpec(value: unknown): value is HtmlDesignSpec {
    return Boolean(
        value
        && typeof value === 'object'
        && Array.isArray((value as { screens?: unknown[] }).screens),
    );
}

function normalizeTimestampMs(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
        const parsed = Date.parse(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return fallback;
}

function normalizePersistedMessages(raw: PersistedMessage[]): PersistedMessage[] {
    return raw
        .sort((left, right) => {
            const leftOrder = typeof left.orderIndex === 'number' && Number.isFinite(left.orderIndex) ? left.orderIndex : null;
            const rightOrder = typeof right.orderIndex === 'number' && Number.isFinite(right.orderIndex) ? right.orderIndex : null;
            if (leftOrder !== null && rightOrder !== null && leftOrder !== rightOrder) {
                return leftOrder - rightOrder;
            }
            const leftTime = normalizeTimestampMs(left.timestamp, 0);
            const rightTime = normalizeTimestampMs(right.timestamp, 0);
            if (leftTime !== rightTime) return leftTime - rightTime;
            return asString(left.id).localeCompare(asString(right.id));
        })
        .map((message) => ({
            ...message,
            timestamp: normalizeTimestampMs(message.timestamp, 0),
            images: Array.isArray(message.images)
                ? message.images.filter((image): image is string => typeof image === 'string' && image.trim().length > 0)
                : [],
        }));
}

async function loadPersistedProjectMessages(uid: string, projectId: string): Promise<PersistedMessage[]> {
    const db = getFirebaseDb();
    const messagesSnap = await db
        .collection('users')
        .doc(uid)
        .collection('projects')
        .doc(projectId)
        .collection('chats')
        .doc('default')
        .collection('messages')
        .get();

    return normalizePersistedMessages(messagesSnap.docs.map((doc) => (doc.data() || {}) as PersistedMessage));
}

async function loadLatestSessionCanvasDoc(uid: string, projectId: string): Promise<unknown | undefined> {
    const db = getFirebaseDb();
    const latestSessionSnap = await db
        .collection('users')
        .doc(uid)
        .collection('projects')
        .doc(projectId)
        .collection('sessions')
        .doc('latest')
        .get();

    if (!latestSessionSnap.exists) return undefined;
    const sessionData = (latestSessionSnap.data() || {}) as { canvasDoc?: unknown };
    return sessionData.canvasDoc;
}

async function loadSnapshotPayload(uid: string, projectId: string, snapshotPath: string): Promise<WorkspaceSnapshot> {
    const bucket = getFirebaseStorageBucket();
    const [buffer] = await bucket.file(`users/${uid}/projects/${projectId}/${snapshotPath}`).download();
    const parsed = JSON.parse(buffer.toString('utf8')) as WorkspaceSnapshot;
    if (!isValidDesignSpec(parsed.designSpec)) {
        throw new Error('Invalid snapshot payload');
    }
    return parsed;
}

async function loadScreenHtml(uid: string, projectId: string, htmlPath: string): Promise<string> {
    const bucket = getFirebaseStorageBucket();
    const [buffer] = await bucket.file(`users/${uid}/projects/${projectId}/${htmlPath}`).download();
    return buffer.toString('utf8').trim();
}

async function buildProjectFromSubcollections(
    uid: string,
    projectId: string,
    data: ProjectMetaData,
): Promise<UserProjectRecord | null> {
    const db = getFirebaseDb();
    const screensSnap = await db
        .collection('users')
        .doc(uid)
        .collection('projects')
        .doc(projectId)
        .collection('screens')
        .get();

    const screensById = new Map<string, StoredScreenDoc>();
    screensSnap.forEach((doc) => {
        const screen = (doc.data() || {}) as StoredScreenDoc;
        const key = asString(screen.screenId, doc.id);
        screensById.set(key, {
            screenId: key,
            name: screen.name,
            width: screen.width,
            height: screen.height,
            status: screen.status,
            html: screen.html,
            htmlSnippet: screen.htmlSnippet,
            htmlPath: screen.htmlPath,
        });
    });

    const metaScreens = Array.isArray(data.designSpecMeta?.screens) ? data.designSpecMeta.screens : [];
    const baseScreens = metaScreens.length > 0
        ? metaScreens
        : Array.from(screensById.values()).map((screen) => ({
            screenId: asString(screen.screenId),
            name: asString(screen.name, 'Untitled screen'),
            width: asNumber(screen.width, 402),
            height: asNumber(screen.height, 874),
            status: screen.status === 'streaming' ? 'streaming' : 'complete',
        }));

    if (baseScreens.length === 0) return null;

    const screens = await Promise.all(
        baseScreens.map(async (screen) => {
            const fromDoc = screensById.get(asString(screen.screenId));
            let html = asString(fromDoc?.html).trim() || asString(fromDoc?.htmlSnippet).trim();
            const htmlPath = asString(fromDoc?.htmlPath).trim();
            if (!html && htmlPath) {
                try {
                    html = await loadScreenHtml(uid, projectId, htmlPath);
                } catch {
                    html = '';
                }
            }

            return {
                screenId: asString(screen.screenId),
                name: asString(screen.name, 'Untitled screen'),
                width: asNumber(screen.width, 402),
                height: asNumber(screen.height, 874),
                status: screen.status === 'streaming' ? 'streaming' : 'complete',
                html: html || '<div></div>',
            };
        }),
    );

    const [sessionCanvasDoc, messages] = await Promise.all([
        loadLatestSessionCanvasDoc(uid, projectId).catch(() => undefined),
        loadPersistedProjectMessages(uid, projectId).catch(() => []),
    ]);

    return {
        projectId: asString(data.id, projectId),
        designSpec: {
            id: asString(data.designSpecMeta?.id, projectId),
            name: asString(data.designSpecMeta?.name, asString(data.name, 'Untitled project')),
            description: asString(data.designSpecMeta?.description),
            designSystem: data.designSpecMeta?.designSystem,
            screens,
            createdAt: asString(data.createdAt),
            updatedAt: asString(data.updatedAt),
        },
        canvasDoc: sessionCanvasDoc !== undefined ? sessionCanvasDoc : (data.canvasDoc ?? null),
        chatState: messages.length > 0 ? { messages } : (data.chatState ?? null),
        projectMemory: data.projectMemory,
        projectAssetContext: data.projectAssetContext,
        createdAt: asString(data.createdAt),
        updatedAt: asString(data.updatedAt),
    };
}

export async function getUserProject(uid: string, projectId: string): Promise<UserProjectRecord | null> {
    const db = getFirebaseDb();
    const projectSnap = await db
        .collection('users')
        .doc(uid)
        .collection('projects')
        .doc(projectId)
        .get();

    if (!projectSnap.exists) return null;

    const data = (projectSnap.data() || {}) as ProjectMetaData;
    const [sessionCanvasDoc, messages] = await Promise.all([
        loadLatestSessionCanvasDoc(uid, projectId).catch(() => undefined),
        loadPersistedProjectMessages(uid, projectId).catch(() => []),
    ]);

    if (data.snapshotPath) {
        try {
            const snapshot = await loadSnapshotPayload(uid, projectId, data.snapshotPath);
            return {
                projectId: asString(data.id, projectId),
                designSpec: snapshot.designSpec,
                canvasDoc: sessionCanvasDoc !== undefined ? sessionCanvasDoc : (snapshot.canvasDoc ?? null),
                chatState: messages.length > 0 ? { messages } : (snapshot.chatState ?? null),
                projectMemory: data.projectMemory ?? snapshot.projectMemory ?? undefined,
                projectAssetContext: data.projectAssetContext,
                createdAt: asString(data.createdAt),
                updatedAt: asString(data.updatedAt),
            };
        } catch {
            // Fall through to document and subcollection restore paths.
        }
    }

    if (isValidDesignSpec(data.designSpec)) {
        return {
            projectId: asString(data.id, projectId),
            designSpec: data.designSpec,
            canvasDoc: sessionCanvasDoc !== undefined ? sessionCanvasDoc : (data.canvasDoc ?? null),
            chatState: messages.length > 0 ? { messages } : (data.chatState ?? null),
            projectMemory: data.projectMemory,
            projectAssetContext: data.projectAssetContext,
            createdAt: asString(data.createdAt),
            updatedAt: asString(data.updatedAt),
        };
    }

    return buildProjectFromSubcollections(uid, projectId, data);
}
