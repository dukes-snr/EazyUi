import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { deleteObject, getBytes, getDownloadURL, listAll, ref, uploadString } from "firebase/storage";
import type { HtmlDesignSpec } from "@/api/client";
import { db, storage } from "./firebase";

const ENABLE_STORAGE_RESTORE = import.meta.env.VITE_ENABLE_STORAGE_RESTORE === "1";
const ENABLE_STORAGE_UPLOADS = import.meta.env.VITE_ENABLE_STORAGE_UPLOADS === "1";
let storageUploadsTemporarilyDisabled = false;
const STORAGE_UPLOAD_TIMEOUT_MS = 10_000;
const PROJECT_COVER_VERSION = 3;

type SaveProjectInput = {
  uid: string;
  projectId?: string;
  designSpec: HtmlDesignSpec;
  canvasDoc?: unknown;
  chatState?: unknown;
};

type StoredScreenDoc = {
  screenId: string;
  name?: string;
  width?: number;
  height?: number;
  status?: "streaming" | "complete";
  html?: string;
  htmlSnippet?: string;
  htmlStorage?: "full" | "snippet";
  htmlPath?: string;
};
type WorkspaceSnapshot = {
  designSpec: HtmlDesignSpec;
  canvasDoc: unknown | null;
  chatState: unknown | null;
};

type ProjectMetaData = {
  id: string;
  designSpec?: HtmlDesignSpec;
  designSpecMeta?: {
    id?: string;
    name?: string;
    description?: string;
    screens?: Array<{
      screenId: string;
      name: string;
      width: number;
      height: number;
      status?: "streaming" | "complete";
    }>;
  };
  canvasDoc?: unknown;
  chatState?: unknown;
  snapshotPath?: string;
  coverImagePath?: string;
  coverImageUrl?: string;
  coverImageDataUrl?: string;
  coverImagePaths?: string[];
  coverImageUrls?: string[];
  coverImageDataUrls?: string[];
  coverScreenIds?: string[];
  coverVersion?: number;
  createdAt: string;
  updatedAt: string;
};

const MAX_PERSISTED_MESSAGE_CONTENT_LENGTH = 24_000;
const MAX_PERSISTED_IMAGE_URL_LENGTH = 2_048;
const MAX_PERSISTED_IMAGE_COUNT = 8;
const MAX_PERSISTED_SCREEN_ID_COUNT = 32;

function isValidDesignSpec(value: unknown): value is HtmlDesignSpec {
  if (!value || typeof value !== "object") return false;
  const candidate = value as HtmlDesignSpec;
  return Array.isArray(candidate.screens) && typeof candidate.name === "string";
}

function sanitizeMessageContent(value: unknown): string {
  const text = typeof value === "string" ? value : "";
  if (text.length <= MAX_PERSISTED_MESSAGE_CONTENT_LENGTH) return text;
  return text.slice(0, MAX_PERSISTED_MESSAGE_CONTENT_LENGTH);
}

function sanitizePersistedImages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = item.trim();
    if (!normalized) continue;
    // Inline data URLs can be very large and break Firestore document limits.
    if (normalized.startsWith("data:")) continue;
    if (normalized.length > MAX_PERSISTED_IMAGE_URL_LENGTH) continue;
    out.push(normalized);
    if (out.length >= MAX_PERSISTED_IMAGE_COUNT) break;
  }
  return out;
}

function sanitizePersistedMeta(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};

  const copyString = (key: string, max = 256) => {
    const v = raw[key];
    if (typeof v !== "string") return;
    next[key] = v.length <= max ? v : v.slice(0, max);
  };
  const copyBoolean = (key: string) => {
    const v = raw[key];
    if (typeof v === "boolean") next[key] = v;
  };
  const copyNumber = (key: string) => {
    const v = raw[key];
    if (typeof v === "number" && Number.isFinite(v)) next[key] = v;
  };

  copyString("requestKind", 64);
  copyString("parentUserId", 128);
  copyString("modelProfile", 128);
  copyBoolean("typedComplete");
  copyBoolean("livePreview");
  copyNumber("thinkingMs");
  copyNumber("feedbackStart");

  if (Array.isArray(raw.screenIds)) {
    next.screenIds = raw.screenIds
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      .slice(0, MAX_PERSISTED_SCREEN_ID_COUNT);
  }

  return Object.keys(next).length > 0 ? next : null;
}

function makeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = stripUndefinedDeep(v);
    }
    return out as T;
  }
  return value;
}

function isStorageCorsOrNetworkError(error: unknown): boolean {
  const message = String((error as { message?: string })?.message || "").toLowerCase();
  const code = String((error as { code?: string })?.code || "").toLowerCase();
  return (
    message.includes("cors") ||
    message.includes("preflight") ||
    message.includes("xmlhttprequest") ||
    message.includes("network") ||
    message.includes("err_failed") ||
    message.includes("timed out") ||
    code.includes("storage/unknown")
  );
}

async function renderScreenImageBase64(params: {
  html: string;
  width: number;
  height: number;
}): Promise<string | null> {
  try {
    const response = await fetch("/api/render-screen-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        html: params.html,
        width: params.width,
        height: params.height,
        scale: 1,
      }),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { pngBase64?: string };
    const base64 = String(payload.pngBase64 || "").trim();
    return base64 || null;
  } catch {
    return null;
  }
}

async function buildProjectCoverDataUrls(screens: HtmlDesignSpec["screens"]): Promise<string[]> {
  const targets = (screens || []).slice(0, 2);
  if (targets.length === 0) return [];
  const rendered = await Promise.all(
    targets.map(async (screen) => {
      const base64 = await renderScreenImageBase64({
        html: screen.html,
        width: Math.max(280, Math.min(420, screen.width || 375)),
        height: Math.max(560, Math.min(920, screen.height || 812)),
      });
      return base64 ? `data:image/png;base64,${base64}` : null;
    })
  );
  return rendered.filter((item): item is string => Boolean(item));
}

async function deleteStorageTree(rootPath: string): Promise<void> {
  const rootRef = ref(storage, rootPath);
  const queue = [rootRef];
  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) continue;
    try {
      const listed = await listAll(current);
      queue.push(...listed.prefixes);
      await Promise.all(
        listed.items.map(async (item) => {
          try {
            await deleteObject(item);
          } catch {
            // ignore missing object cleanup errors
          }
        })
      );
    } catch {
      // ignore list failures to keep delete best-effort
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label} timed out`));
    }, ms);
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

export async function saveProjectFirestore(input: SaveProjectInput): Promise<{ projectId: string; savedAt: string }> {
  const { uid, projectId, designSpec, canvasDoc, chatState } = input;
  const id = projectId || makeId();
  const now = new Date().toISOString();
  const safeDesignSpec = stripUndefinedDeep(designSpec);
  const safeCanvasDoc = canvasDoc == null ? null : stripUndefinedDeep(canvasDoc);
  const safeChatState = chatState == null ? null : stripUndefinedDeep(chatState);
  const snapshot: WorkspaceSnapshot = {
    designSpec: safeDesignSpec,
    canvasDoc: safeCanvasDoc,
    chatState: safeChatState,
  };
  const snapshotPath = `snapshots/latest.json`;
  let resolvedSnapshotPath: string | null = null;
  if (ENABLE_STORAGE_UPLOADS && !storageUploadsTemporarilyDisabled) {
    try {
      const snapshotRef = ref(storage, `users/${uid}/projects/${id}/${snapshotPath}`);
      await withTimeout(
        uploadString(snapshotRef, JSON.stringify(snapshot), "raw", {
          contentType: "application/json",
        }),
        STORAGE_UPLOAD_TIMEOUT_MS,
        "Snapshot upload"
      );
      resolvedSnapshotPath = snapshotPath;
    } catch (error) {
      if (isStorageCorsOrNetworkError(error)) {
        storageUploadsTemporarilyDisabled = true;
      } else {
        throw error;
      }
    }
  }
  const projectRef = doc(db, "users", uid, "projects", id);
  const existing = await getDoc(projectRef);
  const existingData = existing.exists() ? (existing.data() as ProjectMetaData) : null;
  const createdAt = existing.exists() ? (existing.data().createdAt as string) || now : now;
  const nextCoverScreenIds = (safeDesignSpec.screens || []).slice(0, 2).map((screen) => screen.screenId);
  const existingCoverScreenIds = Array.isArray(existingData?.coverScreenIds) ? existingData!.coverScreenIds! : [];
  const existingCoverImagePaths = Array.isArray(existingData?.coverImagePaths)
    ? existingData!.coverImagePaths!.filter((value): value is string => typeof value === "string" && value.trim().length > 0).slice(0, 2)
    : (existingData?.coverImagePath ? [existingData.coverImagePath] : []);
  const existingCoverImageUrls = Array.isArray(existingData?.coverImageUrls)
    ? existingData!.coverImageUrls!.filter((value): value is string => typeof value === "string" && value.trim().length > 0).slice(0, 2)
    : (existingData?.coverImageUrl ? [existingData.coverImageUrl] : []);
  const existingCoverImageDataUrls = Array.isArray(existingData?.coverImageDataUrls)
    ? existingData!.coverImageDataUrls!.filter((value): value is string => typeof value === "string" && value.trim().length > 0).slice(0, 2)
    : (existingData?.coverImageDataUrl ? [existingData.coverImageDataUrl] : []);
  let resolvedCoverImagePaths: string[] = existingCoverImagePaths;
  let resolvedCoverImageUrls: string[] = existingCoverImageUrls;
  let resolvedCoverImageDataUrls: string[] = existingCoverImageDataUrls;
  const shouldRefreshCover = nextCoverScreenIds.length > 0 && (
    (resolvedCoverImageUrls.length === 0 && resolvedCoverImageDataUrls.length === 0 && !existingData?.coverImageUrl && !existingData?.coverImageDataUrl)
    || existingCoverScreenIds.join("|") !== nextCoverScreenIds.join("|")
    || Number(existingData?.coverVersion || 0) !== PROJECT_COVER_VERSION
  );

  if (shouldRefreshCover) {
    const coverDataUrls = await buildProjectCoverDataUrls(safeDesignSpec.screens || []);
    if (coverDataUrls.length > 0) {
      resolvedCoverImageDataUrls = coverDataUrls;
      resolvedCoverImagePaths = [];
      resolvedCoverImageUrls = [];
      if (ENABLE_STORAGE_UPLOADS && !storageUploadsTemporarilyDisabled) {
        try {
          const uploadedPaths: string[] = [];
          const uploadedUrls: string[] = [];
          for (let index = 0; index < coverDataUrls.length; index += 1) {
            const coverPath = `previews/cover-${index}.jpg`;
            const coverRef = ref(storage, `users/${uid}/projects/${id}/${coverPath}`);
            await withTimeout(
              uploadString(coverRef, coverDataUrls[index], "data_url"),
              STORAGE_UPLOAD_TIMEOUT_MS,
              `Project cover upload (${index + 1})`
            );
            uploadedPaths.push(coverPath);
            uploadedUrls.push(await getDownloadURL(coverRef));
          }
          resolvedCoverImagePaths = uploadedPaths;
          resolvedCoverImageUrls = uploadedUrls;
          resolvedCoverImageDataUrls = [];
        } catch (error) {
          if (isStorageCorsOrNetworkError(error)) {
            storageUploadsTemporarilyDisabled = true;
          } else {
            throw error;
          }
        }
      }
    }
  }

  if (ENABLE_STORAGE_UPLOADS && !storageUploadsTemporarilyDisabled) {
    const staleCoverPaths = existingCoverImagePaths.filter((path) => !resolvedCoverImagePaths.includes(path));
    await Promise.all(
      staleCoverPaths.map(async (path) => {
        try {
          await deleteObject(ref(storage, `users/${uid}/projects/${id}/${path}`));
        } catch {
          // ignore missing cover cleanup errors
        }
      })
    );
  }

  await setDoc(
    projectRef,
    {
      id,
      ownerId: uid,
      name: safeDesignSpec.name || "Untitled project",
      snapshotPath: resolvedSnapshotPath,
      coverImagePath: resolvedCoverImagePaths[0] || null,
      coverImageUrl: resolvedCoverImageUrls[0] || null,
      coverImageDataUrl: resolvedCoverImageDataUrls[0] || null,
      coverImagePaths: resolvedCoverImagePaths,
      coverImageUrls: resolvedCoverImageUrls,
      coverImageDataUrls: resolvedCoverImageDataUrls,
      coverScreenIds: nextCoverScreenIds,
      coverVersion: PROJECT_COVER_VERSION,
      designSpecMeta: {
        id: safeDesignSpec.id,
        name: safeDesignSpec.name,
        description: safeDesignSpec.description || "",
        screens: (safeDesignSpec.screens || []).map((s) => ({
          screenId: s.screenId,
          name: s.name,
          width: s.width,
          height: s.height,
          status: s.status || "complete",
        })),
      },
      createdAt,
      updatedAt: now,
    },
    { merge: true }
  );

  // Save screen snapshots separately for future collaboration granularity.
  const currentScreenIds = new Set((safeDesignSpec.screens || []).map((screen) => screen.screenId));
  const existingScreensSnap = await getDocs(collection(db, "users", uid, "projects", id, "screens"));
  const staleScreenBatch = writeBatch(db);
  const staleScreenHtmlPaths: string[] = [];
  let staleScreenCount = 0;
  existingScreensSnap.forEach((screenDoc) => {
    if (currentScreenIds.has(screenDoc.id)) return;
    const staleScreen = screenDoc.data() as { htmlPath?: string };
    if (staleScreen.htmlPath) staleScreenHtmlPaths.push(staleScreen.htmlPath);
    staleScreenBatch.delete(screenDoc.ref);
    staleScreenCount += 1;
  });
  if (staleScreenCount > 0) {
    await staleScreenBatch.commit();
  }
  if (ENABLE_STORAGE_UPLOADS && !storageUploadsTemporarilyDisabled && staleScreenHtmlPaths.length > 0) {
    await Promise.all(
      staleScreenHtmlPaths.map(async (htmlPath) => {
        try {
          await deleteObject(ref(storage, `users/${uid}/projects/${id}/${htmlPath}`));
        } catch {
          // ignore missing screen html cleanup errors
        }
      })
    );
  }

  const screensBatch = writeBatch(db);
  for (const screen of safeDesignSpec.screens || []) {
    const screenRef = doc(db, "users", uid, "projects", id, "screens", screen.screenId);
    const fullHtml = typeof screen.html === "string" ? screen.html : "";
    const canStoreFullHtml = fullHtml.length > 0 && fullHtml.length <= 800_000;
    let htmlPath: string | undefined;
    if (fullHtml.length > 0 && ENABLE_STORAGE_UPLOADS && !storageUploadsTemporarilyDisabled) {
      htmlPath = `screens/${screen.screenId}.html`;
      try {
        await withTimeout(
          uploadString(ref(storage, `users/${uid}/projects/${id}/${htmlPath}`), fullHtml, "raw", {
            contentType: "text/html",
          }),
          STORAGE_UPLOAD_TIMEOUT_MS,
          `Screen HTML upload (${screen.screenId})`
        );
      } catch (error) {
        htmlPath = undefined;
        if (isStorageCorsOrNetworkError(error)) {
          storageUploadsTemporarilyDisabled = true;
        } else {
          throw error;
        }
      }
    }
    screensBatch.set(screenRef, stripUndefinedDeep({
      screenId: screen.screenId,
      name: screen.name,
      width: screen.width,
      height: screen.height,
      status: screen.status || "complete",
      html: canStoreFullHtml ? fullHtml : undefined,
      htmlSnippet: fullHtml.slice(0, 4000),
      htmlStorage: canStoreFullHtml ? "full" : "snippet",
      htmlPath,
      updatedAt: now,
    }));
  }
  await screensBatch.commit();

  // Persist chat messages in a subcollection for scalable querying.
  const messages = (safeChatState as { messages?: Array<Record<string, unknown>> } | undefined)?.messages || [];
  if (messages.length > 0) {
    const chatRef = doc(db, "users", uid, "projects", id, "chats", "default");
    await setDoc(chatRef, { id: "default", updatedAt: now }, { merge: true });
    const messageBatch = writeBatch(db);
    for (const msg of messages.slice(-250)) {
      const msgId = String(msg.id || makeId());
      const msgRef = doc(db, "users", uid, "projects", id, "chats", "default", "messages", msgId);
      const persistedImages = sanitizePersistedImages(msg.images);
      const persistedMeta = sanitizePersistedMeta(msg.meta);
      messageBatch.set(msgRef, stripUndefinedDeep({
        id: msgId,
        role: msg.role || "assistant",
        content: sanitizeMessageContent(msg.content),
        status: msg.status || "complete",
        timestamp: msg.timestamp || now,
        images: persistedImages,
        meta: persistedMeta,
      }));
    }
    await messageBatch.commit();
  }

  // Track the latest workspace session metadata.
  const sessionRef = doc(db, "users", uid, "projects", id, "sessions", "latest");
  await setDoc(
    sessionRef,
    {
      id: "latest",
      kind: "workspace",
      updatedAt: now,
      screenCount: designSpec.screens?.length || 0,
      canvasDoc: safeCanvasDoc,
    },
    { merge: true }
  );

  return { projectId: id, savedAt: now };
}

async function buildProjectFromSubcollections(uid: string, projectId: string, data: ProjectMetaData) {
  const screensSnap = await getDocs(collection(db, "users", uid, "projects", projectId, "screens"));
  const screensById = new Map<string, StoredScreenDoc>();
  screensSnap.forEach((d) => {
    const s = d.data() as StoredScreenDoc;
    const key = s.screenId || d.id;
    screensById.set(key, {
      screenId: key,
      name: s.name,
      width: s.width,
      height: s.height,
      status: s.status,
      html: s.html,
      htmlSnippet: s.htmlSnippet,
      htmlStorage: s.htmlStorage,
      htmlPath: s.htmlPath,
    });
  });

  const metaScreens = data.designSpecMeta?.screens || [];
  const baseScreens = metaScreens.length
    ? metaScreens
    : Array.from(screensById.values()).map((s) => ({
      screenId: s.screenId,
      name: s.name || "Untitled Screen",
      width: s.width || 375,
      height: s.height || 812,
      status: s.status || "complete",
    }));

  if (baseScreens.length === 0) return null;

  const screens = await Promise.all(
    baseScreens.map(async (s) => {
      const fromDoc = screensById.get(s.screenId);
      let html = fromDoc?.html || fromDoc?.htmlSnippet || "";
      if (!html && fromDoc?.htmlPath && ENABLE_STORAGE_RESTORE) {
        try {
          const bytes = await getBytes(ref(storage, `users/${uid}/projects/${projectId}/${fromDoc.htmlPath}`), 5 * 1024 * 1024);
          html = new TextDecoder().decode(bytes);
        } catch {
          html = "";
        }
      }
      return {
        screenId: s.screenId,
        name: s.name,
        width: s.width,
        height: s.height,
        status: s.status || "complete",
        html: html || "<div></div>",
      };
    })
  );

  let canvasDoc: unknown = data.canvasDoc ?? null;
  try {
    const latestSessionSnap = await getDoc(doc(db, "users", uid, "projects", projectId, "sessions", "latest"));
    if (latestSessionSnap.exists()) {
      const sessionData = latestSessionSnap.data() as { canvasDoc?: unknown };
      if (sessionData.canvasDoc !== undefined) {
        canvasDoc = sessionData.canvasDoc;
      }
    }
  } catch {
    // ignore session read issues and fallback to existing doc-level canvas data
  }

  let messages: Array<Record<string, unknown>> = [];
  try {
    const messagesSnap = await getDocs(collection(db, "users", uid, "projects", projectId, "chats", "default", "messages"));
    messages = messagesSnap.docs
      .map((d) => d.data() as Record<string, unknown>)
      .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
  } catch {
    messages = [];
  }

  return {
    projectId: data.id || projectId,
    designSpec: {
      id: data.designSpecMeta?.id || projectId,
      name: data.designSpecMeta?.name || "Untitled project",
      description: data.designSpecMeta?.description || "",
      screens,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    },
    canvasDoc,
    chatState: messages.length > 0 ? { messages } : (data.chatState ?? null),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

async function loadSnapshotPayload(uid: string, projectId: string, snapshotPath: string): Promise<WorkspaceSnapshot> {
  const snapshotRef = ref(storage, `users/${uid}/projects/${projectId}/${snapshotPath}`);
  const bytes = await getBytes(snapshotRef, 50 * 1024 * 1024);
  const json = new TextDecoder().decode(bytes);
  const parsed = JSON.parse(json) as WorkspaceSnapshot;
  if (!isValidDesignSpec(parsed.designSpec)) throw new Error("Invalid snapshot payload");
  return parsed;
}

export async function getProjectFirestore(uid: string, projectId: string) {
  const projectRef = doc(db, "users", uid, "projects", projectId);
  const snap = await getDoc(projectRef);
  if (!snap.exists()) return null;
  const data = snap.data() as ProjectMetaData;
  if (data.snapshotPath && ENABLE_STORAGE_RESTORE) {
    try {
      const parsed = await loadSnapshotPayload(uid, projectId, data.snapshotPath);
      return {
        projectId: data.id || projectId,
        designSpec: parsed.designSpec,
        canvasDoc: parsed.canvasDoc ?? null,
        chatState: parsed.chatState ?? null,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
    } catch {
      // fall through to metadata/subcollection fallback for backward compatibility
    }
  }
  if (isValidDesignSpec(data.designSpec)) {
    return {
      projectId: data.id || projectId,
      designSpec: data.designSpec as HtmlDesignSpec,
      canvasDoc: data.canvasDoc ?? null,
      chatState: data.chatState ?? null,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }

  return buildProjectFromSubcollections(uid, projectId, data);
}

export async function listProjectsFirestore(uid: string): Promise<{ id: string; name: string; updatedAt: string; screenCount: number; hasSnapshot: boolean; coverImageUrl?: string; coverImageUrls?: string[] }[]> {
  const q = query(collection(db, "users", uid, "projects"), orderBy("updatedAt", "desc"), limit(50));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data() as {
      name?: string;
      updatedAt?: string;
      snapshotPath?: string;
      coverImageUrl?: string;
      coverImageDataUrl?: string;
      coverImageUrls?: string[];
      coverImageDataUrls?: string[];
      designSpecMeta?: { screens?: Array<unknown> };
    };
    const persistedCoverUrls = Array.isArray(data.coverImageUrls)
      ? data.coverImageUrls.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
    const persistedCoverDataUrls = Array.isArray(data.coverImageDataUrls)
      ? data.coverImageDataUrls.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
    const coverImageUrls = [...persistedCoverUrls, ...persistedCoverDataUrls];
    const fallbackCover = data.coverImageUrl || data.coverImageDataUrl || undefined;
    return {
      id: d.id,
      name: data.name || "Untitled project",
      updatedAt: data.updatedAt || "",
      screenCount: Array.isArray(data.designSpecMeta?.screens) ? data.designSpecMeta!.screens!.length : 0,
      hasSnapshot: Boolean(data.snapshotPath),
      coverImageUrl: coverImageUrls[0] || fallbackCover,
      coverImageUrls: coverImageUrls.length > 0 ? coverImageUrls : (fallbackCover ? [fallbackCover] : undefined),
    };
  });
}

async function deleteCollectionDocs(pathSegments: string[]) {
  const snap = await getDocs(collection(db, pathSegments.join("/")));
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

export async function deleteProjectFirestore(uid: string, projectId: string): Promise<boolean> {
  const projectRef = doc(db, "users", uid, "projects", projectId);
  const snap = await getDoc(projectRef);
  if (!snap.exists()) return false;
  const data = snap.data() as { snapshotPath?: string };

  await deleteStorageTree(`users/${uid}/projects/${projectId}`);

  // Best-effort subcollection cleanup.
  await deleteCollectionDocs(["users", uid, "projects", projectId, "screens"]);
  const chats = await getDocs(collection(db, "users", uid, "projects", projectId, "chats"));
  for (const chat of chats.docs) {
    await deleteCollectionDocs(["users", uid, "projects", projectId, "chats", chat.id, "messages"]);
    await deleteDoc(chat.ref);
  }
  await deleteCollectionDocs(["users", uid, "projects", projectId, "sessions"]);
  void data; // metadata kept for compatibility; storage cleanup now uses full tree delete
  await deleteDoc(projectRef);
  return true;
}

export async function uploadProjectAssetBase64(params: {
  uid: string;
  projectId: string;
  assetPath: string;
  base64DataUrl: string;
}) {
  const { uid, projectId, assetPath, base64DataUrl } = params;
  const storageRef = ref(storage, `users/${uid}/projects/${projectId}/${assetPath}`);
  await uploadString(storageRef, base64DataUrl, "data_url");
  return getDownloadURL(storageRef);
}

export async function deleteProjectAsset(params: { uid: string; projectId: string; assetPath: string }) {
  const { uid, projectId, assetPath } = params;
  const storageRef = ref(storage, `users/${uid}/projects/${projectId}/${assetPath}`);
  await deleteObject(storageRef);
}
