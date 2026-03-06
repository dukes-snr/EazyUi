import { randomUUID } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getFirebaseDb, getFirebaseStorage } from './firebase-admin.js';
import type { EazyUiHtmlScreen, EazyUiProjectPayload } from './types.js';

type SaveProjectInput = {
  uid: string;
  projectId?: string;
  designSpec: Record<string, unknown>;
  canvasDoc?: unknown;
  chatState?: unknown;
  mcpMeta?: Record<string, unknown> | null;
  expectedUpdatedAt?: string;
  idempotencyKey?: string;
};

type ProjectMetaScreen = {
  screenId: string;
  name?: string;
  width?: number;
  height?: number;
  status?: string;
};

type StoredScreenDoc = {
  screenId?: string;
  name?: string;
  width?: number;
  height?: number;
  status?: string;
  html?: string;
  htmlSnippet?: string;
  updatedAt?: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeIso(value: unknown, fallback: string): string {
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  if (value instanceof Timestamp) return value.toDate().toISOString();
  return fallback;
}

function sanitizeMessageId(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return randomUUID();
  return raw.replace(/[^\w.-]/g, '_').slice(0, 128) || randomUUID();
}

function toJsonSafe(value: unknown): unknown {
  const normalized = value === undefined ? null : value;
  try {
    return JSON.parse(JSON.stringify(normalized));
  } catch {
    return null;
  }
}

function buildWorkspaceSnapshot(input: {
  designSpec: Record<string, unknown>;
  canvasDoc?: unknown;
  chatState?: unknown;
}): Record<string, unknown> {
  return {
    designSpec: toJsonSafe(input.designSpec),
    canvasDoc: toJsonSafe(input.canvasDoc ?? null),
    chatState: toJsonSafe(input.chatState ?? null),
  };
}

function ensureScreensFromSpec(designSpec: Record<string, unknown>): EazyUiHtmlScreen[] {
  const rawScreens = Array.isArray(designSpec.screens) ? designSpec.screens : [];
  return rawScreens.map((raw, index) => {
    const source = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
    return {
      screenId: typeof source.screenId === 'string' && source.screenId.trim() ? source.screenId.trim() : `screen-${index + 1}`,
      name: typeof source.name === 'string' && source.name.trim() ? source.name.trim() : `Screen ${index + 1}`,
      html: typeof source.html === 'string' ? source.html : '',
      width: Number.isFinite(Number(source.width)) ? Number(source.width) : 402,
      height: Number.isFinite(Number(source.height)) ? Number(source.height) : 874,
      status: source.status === 'streaming' ? 'streaming' : 'complete',
    };
  });
}

function normalizeMessages(chatState: unknown): Array<Record<string, unknown>> {
  if (!chatState || typeof chatState !== 'object') return [];
  const raw = (chatState as { messages?: unknown }).messages;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item, index) => ({
      id: sanitizeMessageId(item.id),
      role: item.role === 'assistant' ? 'assistant' : item.role === 'system' ? 'system' : 'user',
      content: typeof item.content === 'string' ? item.content.slice(0, 24000) : '',
      status: typeof item.status === 'string' ? item.status.slice(0, 32) : 'complete',
      timestamp: Number.isFinite(Number(item.timestamp)) ? Number(item.timestamp) : Date.now() + index,
      orderIndex: index,
      meta: item.meta && typeof item.meta === 'object' ? item.meta : null,
      images: Array.isArray(item.images) ? item.images.filter((img): img is string => typeof img === 'string').slice(0, 8) : [],
    }));
}

function extractProjectDocMeta(data: Record<string, unknown>, projectId: string) {
  const designSpecMeta = (data.designSpecMeta && typeof data.designSpecMeta === 'object')
    ? (data.designSpecMeta as Record<string, unknown>)
    : {};
  const rawMetaScreens = Array.isArray(designSpecMeta.screens)
    ? (designSpecMeta.screens as Array<Record<string, unknown>>)
    : [];
  const metaScreens: ProjectMetaScreen[] = rawMetaScreens.map((screen) => ({
    screenId: typeof screen.screenId === 'string' ? screen.screenId : '',
    name: typeof screen.name === 'string' ? screen.name : undefined,
    width: Number.isFinite(Number(screen.width)) ? Number(screen.width) : undefined,
    height: Number.isFinite(Number(screen.height)) ? Number(screen.height) : undefined,
    status: typeof screen.status === 'string' ? screen.status : undefined,
  })).filter((screen) => screen.screenId);

  return {
    projectName: typeof designSpecMeta.name === 'string' ? designSpecMeta.name : (typeof data.name === 'string' ? data.name : 'Untitled project'),
    projectDescription: typeof designSpecMeta.description === 'string' ? designSpecMeta.description : '',
    projectDesignSystem: designSpecMeta.designSystem && typeof designSpecMeta.designSystem === 'object'
      ? (designSpecMeta.designSystem as Record<string, unknown>)
      : null,
    metaScreens,
    createdAt: normalizeIso(data.createdAt, nowIso()),
    updatedAt: normalizeIso(data.updatedAt, nowIso()),
    designSpecId: typeof designSpecMeta.id === 'string' ? designSpecMeta.id : projectId,
  };
}

export class ProjectRepository {
  private readonly db = getFirebaseDb();
  private readonly storage = getFirebaseStorage();

  async getProject(uid: string, projectId: string): Promise<EazyUiProjectPayload> {
    const projectRef = this.db.doc(`users/${uid}/projects/${projectId}`);
    const projectSnap = await projectRef.get();
    if (!projectSnap.exists) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const projectData = (projectSnap.data() || {}) as Record<string, unknown>;
    const ownerId = typeof projectData.ownerId === 'string' ? projectData.ownerId : uid;
    if (ownerId !== uid) {
      throw new Error('Forbidden: project is not owned by current user.');
    }

    const meta = extractProjectDocMeta(projectData, projectId);

    const screensSnap = await this.db.collection(`users/${uid}/projects/${projectId}/screens`).get();
    const screensById = new Map<string, StoredScreenDoc>();
    screensSnap.forEach((docSnap) => {
      const data = docSnap.data() as StoredScreenDoc;
      const screenId = data.screenId || docSnap.id;
      screensById.set(screenId, {
        screenId,
        name: data.name,
        width: data.width,
        height: data.height,
        status: data.status,
        html: typeof data.html === 'string' ? data.html : undefined,
        htmlSnippet: typeof data.htmlSnippet === 'string' ? data.htmlSnippet : undefined,
        updatedAt: data.updatedAt,
      });
    });

    const mergedScreens: EazyUiHtmlScreen[] = [];
    const seen = new Set<string>();
    for (const metaScreen of meta.metaScreens) {
      const fromStore = screensById.get(metaScreen.screenId);
      mergedScreens.push({
        screenId: metaScreen.screenId,
        name: metaScreen.name || fromStore?.name || 'Untitled Screen',
        width: metaScreen.width || fromStore?.width || 402,
        height: metaScreen.height || fromStore?.height || 874,
        status: (metaScreen.status || fromStore?.status || 'complete') as 'streaming' | 'complete',
        html: fromStore?.html || fromStore?.htmlSnippet || '',
      });
      seen.add(metaScreen.screenId);
    }
    for (const [screenId, fromStore] of screensById.entries()) {
      if (seen.has(screenId)) continue;
      mergedScreens.push({
        screenId,
        name: fromStore.name || 'Untitled Screen',
        width: fromStore.width || 402,
        height: fromStore.height || 874,
        status: (fromStore.status || 'complete') as 'streaming' | 'complete',
        html: fromStore.html || fromStore.htmlSnippet || '',
      });
    }

    const messagesSnap = await this.db.collection(`users/${uid}/projects/${projectId}/chats/default/messages`).get();
    const messages = messagesSnap.docs
      .map((docSnap) => docSnap.data() as Record<string, unknown>)
      .sort((a, b) => {
        const aOrder = Number.isFinite(Number(a.orderIndex)) ? Number(a.orderIndex) : 0;
        const bOrder = Number.isFinite(Number(b.orderIndex)) ? Number(b.orderIndex) : 0;
        if (aOrder !== bOrder) return aOrder - bOrder;
        const aTime = Number.isFinite(Number(a.timestamp)) ? Number(a.timestamp) : 0;
        const bTime = Number.isFinite(Number(b.timestamp)) ? Number(b.timestamp) : 0;
        return aTime - bTime;
      });

    const sessionSnap = await this.db.doc(`users/${uid}/projects/${projectId}/sessions/latest`).get();
    const sessionData = sessionSnap.exists ? (sessionSnap.data() as Record<string, unknown>) : null;

    return {
      projectId,
      designSpec: {
        id: meta.designSpecId,
        name: meta.projectName,
        description: meta.projectDescription,
        designSystem: meta.projectDesignSystem || undefined,
        metadata: (projectData.mcpMeta && typeof projectData.mcpMeta === 'object')
          ? (projectData.mcpMeta as Record<string, unknown>)
          : undefined,
        screens: mergedScreens,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
      },
      canvasDoc: sessionData?.canvasDoc || null,
      chatState: messages.length > 0 ? { messages } : null,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
    };
  }

  async saveProject(input: SaveProjectInput): Promise<{ projectId: string; savedAt: string; updatedAt: string; snapshotPath?: string | null; snapshotWritten?: boolean }> {
    const { uid, projectId, expectedUpdatedAt, idempotencyKey } = input;
    const id = projectId || randomUUID();
    const normalizedKey = idempotencyKey?.trim().replace(/[^\w.-]/g, '_').slice(0, 180);
    if (normalizedKey) {
      const opRef = this.db.doc(`users/${uid}/projects/${id}/mcpOps/${normalizedKey}`);
      const opSnap = await opRef.get();
      if (opSnap.exists) {
        const data = opSnap.data() as Record<string, unknown>;
        const savedAt = typeof data.savedAt === 'string' ? data.savedAt : nowIso();
        const updatedAt = typeof data.updatedAt === 'string' ? data.updatedAt : savedAt;
        const projectSnap = await this.db.doc(`users/${uid}/projects/${id}`).get();
        const projectData = projectSnap.exists ? (projectSnap.data() as Record<string, unknown>) : null;
        const persistedSnapshotPath = typeof projectData?.snapshotPath === 'string' ? projectData.snapshotPath : null;
        return { projectId: id, savedAt, updatedAt, snapshotPath: persistedSnapshotPath, snapshotWritten: false };
      }
    }

    const now = nowIso();
    const designSpec = input.designSpec;
    const screens = ensureScreensFromSpec(designSpec);
    const chatMessages = normalizeMessages(input.chatState);
    const projectRef = this.db.doc(`users/${uid}/projects/${id}`);
    const existing = await projectRef.get();
    const existingData = existing.exists ? (existing.data() as Record<string, unknown>) : null;
    const currentUpdatedAt = existingData ? normalizeIso(existingData.updatedAt, now) : null;
    if (expectedUpdatedAt && currentUpdatedAt && expectedUpdatedAt !== currentUpdatedAt) {
      throw new Error(`Conflict: expectedUpdatedAt=${expectedUpdatedAt}, current=${currentUpdatedAt}`);
    }

    const createdAt = existingData ? normalizeIso(existingData.createdAt, now) : now;
    const name = typeof designSpec.name === 'string' ? designSpec.name : (typeof existingData?.name === 'string' ? existingData.name : 'Untitled project');
    const description = typeof designSpec.description === 'string' ? designSpec.description : '';
    const snapshotPath = await this.persistSnapshot({
      uid,
      projectId: id,
      snapshot: buildWorkspaceSnapshot({
        designSpec,
        canvasDoc: input.canvasDoc ?? null,
        chatState: input.chatState ?? null,
      }),
    });

    const projectPatch: Record<string, unknown> = {
      id,
      ownerId: uid,
      name,
      mcpMeta: input.mcpMeta ?? ((existingData?.mcpMeta && typeof existingData.mcpMeta === 'object') ? existingData.mcpMeta : null),
      designSpecMeta: {
        id: typeof designSpec.id === 'string' ? designSpec.id : id,
        name,
        description,
        designSystem: designSpec.designSystem && typeof designSpec.designSystem === 'object' ? designSpec.designSystem : null,
        screens: screens.map((screen) => ({
          screenId: screen.screenId,
          name: screen.name,
          width: screen.width || 402,
          height: screen.height || 874,
          status: screen.status || 'complete',
        })),
      },
      createdAt,
      updatedAt: now,
    };
    if (snapshotPath) {
      projectPatch.snapshotPath = snapshotPath;
    }
    await projectRef.set(projectPatch, { merge: true });

    const existingScreensSnap = await this.db.collection(`users/${uid}/projects/${id}/screens`).get();
    const nextIds = new Set(screens.map((screen) => screen.screenId));
    const screensBatch = this.db.batch();
    existingScreensSnap.forEach((docSnap) => {
      if (!nextIds.has(docSnap.id)) {
        screensBatch.delete(docSnap.ref);
      }
    });
    for (const screen of screens) {
      const screenRef = this.db.doc(`users/${uid}/projects/${id}/screens/${screen.screenId}`);
      screensBatch.set(screenRef, {
        screenId: screen.screenId,
        name: screen.name,
        width: screen.width || 402,
        height: screen.height || 874,
        status: screen.status || 'complete',
        html: screen.html || '',
        htmlSnippet: (screen.html || '').slice(0, 4000),
        htmlStorage: 'full',
        updatedAt: now,
      }, { merge: true });
    }
    await screensBatch.commit();

    const chatRef = this.db.doc(`users/${uid}/projects/${id}/chats/default`);
    await chatRef.set({
      id: 'default',
      updatedAt: now,
    }, { merge: true });
    const existingMessagesSnap = await this.db.collection(`users/${uid}/projects/${id}/chats/default/messages`).get();
    const chatBatch = this.db.batch();
    existingMessagesSnap.forEach((docSnap) => {
      chatBatch.delete(docSnap.ref);
    });
    chatMessages.slice(-250).forEach((message, index) => {
      const messageRef = this.db.doc(`users/${uid}/projects/${id}/chats/default/messages/${sanitizeMessageId(message.id)}`);
      chatBatch.set(messageRef, {
        id: sanitizeMessageId(message.id),
        role: message.role,
        content: message.content,
        status: message.status,
        timestamp: message.timestamp,
        timestampIso: new Date(Number(message.timestamp) || Date.now()).toISOString(),
        orderIndex: index,
        images: Array.isArray(message.images) ? message.images : [],
        meta: message.meta || null,
        updatedAt: now,
      });
    });
    await chatBatch.commit();

    const sessionRef = this.db.doc(`users/${uid}/projects/${id}/sessions/latest`);
    await sessionRef.set({
      id: 'latest',
      kind: 'workspace',
      updatedAt: now,
      screenCount: screens.length,
      canvasDoc: input.canvasDoc ?? null,
      mcpSavedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    if (normalizedKey) {
      const opRef = this.db.doc(`users/${uid}/projects/${id}/mcpOps/${normalizedKey}`);
      await opRef.set({
        idempotencyKey: normalizedKey,
        projectId: id,
        savedAt: now,
        updatedAt: now,
        createdAt: now,
      }, { merge: true });
    }

    return {
      projectId: id,
      savedAt: now,
      updatedAt: now,
      snapshotPath: snapshotPath || (typeof existingData?.snapshotPath === 'string' ? existingData.snapshotPath : null),
      snapshotWritten: Boolean(snapshotPath),
    };
  }

  private async persistSnapshot(input: {
    uid: string;
    projectId: string;
    snapshot: Record<string, unknown>;
  }): Promise<string | null> {
    const snapshotPath = 'snapshots/latest.json';
    const fullPath = `users/${input.uid}/projects/${input.projectId}/${snapshotPath}`;
    try {
      const bucket = this.storage.bucket();
      const file = bucket.file(fullPath);
      await file.save(JSON.stringify(input.snapshot), {
        contentType: 'application/json; charset=utf-8',
        resumable: false,
        metadata: {
          cacheControl: 'no-cache',
        },
      });
      return snapshotPath;
    } catch {
      return null;
    }
  }

  async listProjects(uid: string): Promise<Array<{ id: string; name: string; updatedAt: string }>> {
    const snap = await this.db.collection(`users/${uid}/projects`)
      .orderBy('updatedAt', 'desc')
      .limit(50)
      .get();

    return snap.docs.map((docSnap) => {
      const data = docSnap.data() as Record<string, unknown>;
      const designSpecMeta = (data.designSpecMeta && typeof data.designSpecMeta === 'object')
        ? (data.designSpecMeta as Record<string, unknown>)
        : {};
      return {
        id: docSnap.id,
        name: typeof designSpecMeta.name === 'string'
          ? designSpecMeta.name
          : (typeof data.name === 'string' ? data.name : 'Untitled project'),
        updatedAt: normalizeIso(data.updatedAt, nowIso()),
      };
    });
  }
}
