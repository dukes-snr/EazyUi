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
import { deleteObject, getBytes, getDownloadURL, ref, uploadString } from "firebase/storage";
import type { HtmlDesignSpec } from "@/api/client";
import { db, storage } from "./firebase";

const ENABLE_STORAGE_RESTORE = import.meta.env.VITE_ENABLE_STORAGE_RESTORE !== "0";
const ENABLE_STORAGE_UPLOADS = import.meta.env.VITE_ENABLE_STORAGE_UPLOADS !== "0";
let storageUploadsTemporarilyDisabled = false;
const STORAGE_UPLOAD_TIMEOUT_MS = 10_000;
const PROJECT_COVER_VERSION = 3;

type SaveProjectInput = {
  uid: string;
  projectId?: string;
  designSpec: HtmlDesignSpec;
  canvasDoc?: unknown;
  chatState?: unknown;
  mode?: "manual" | "autosave";
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
const MAX_INLINE_CHAT_IMAGE_DATA_URL_LENGTH = 350_000;
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

function sanitizeChatImagesForPersistence(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = item.trim();
    if (!normalized) continue;
    if (normalized.startsWith("data:")) {
      if (normalized.length <= MAX_INLINE_CHAT_IMAGE_DATA_URL_LENGTH) {
        out.push(normalized);
      }
    } else if (normalized.length <= MAX_PERSISTED_IMAGE_URL_LENGTH) {
      out.push(normalized);
    }
    if (out.length >= MAX_PERSISTED_IMAGE_COUNT) break;
  }
  return out;
}

function sanitizeChatStateForSnapshot(chatState: unknown): unknown {
  if (!chatState || typeof chatState !== "object") return null;
  const state = chatState as { messages?: Array<Record<string, unknown>> };
  if (!Array.isArray(state.messages)) return null;
  return {
    messages: state.messages.slice(-250).map((msg, index) => ({
      id: String(msg.id || makeId()),
      role: msg.role || "assistant",
      content: sanitizeMessageContent(msg.content),
      status: msg.status || "complete",
      timestamp: normalizeTimestampMs(msg.timestamp, Date.now() + index),
      images: [],
      meta: sanitizePersistedMeta(msg.meta),
    })),
  };
}

function normalizeTimestampMs(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value);
  if (typeof value === "string") {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && asNumber > 0) return Math.floor(asNumber);
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  }
  return fallback;
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

function stripHeavyInlineAssetsForRender(html: string): string {
  if (!html) return html;
  const tinyDataUrl = "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=";
  return html
    .replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]{20000,}/g, tinyDataUrl)
    .replace(/url\(\s*["']?data:image\/[a-zA-Z0-9.+-]+;base64,[^)]+["']?\s*\)/g, `url('${tinyDataUrl}')`);
}

function buildFallbackCoverDataUrl(params: { screenName: string; width: number; height: number; index: number }): string {
  const safeWidth = Math.max(280, Math.min(420, params.width || 375));
  const safeHeight = Math.max(560, Math.min(920, params.height || 812));
  const title = (params.screenName || "Screen").replace(/[<>&"]/g, "").slice(0, 36);
  const hue = (params.index * 37) % 360;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${safeWidth}" height="${safeHeight}" viewBox="0 0 ${safeWidth} ${safeHeight}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue}, 65%, 24%)"/>
      <stop offset="100%" stop-color="hsl(${(hue + 40) % 360}, 70%, 12%)"/>
    </linearGradient>
  </defs>
  <rect width="${safeWidth}" height="${safeHeight}" fill="url(#bg)"/>
  <rect x="18" y="18" width="${safeWidth - 36}" height="${safeHeight - 36}" rx="28" fill="rgba(8,10,18,0.45)" stroke="rgba(255,255,255,0.2)"/>
  <rect x="${Math.round((safeWidth - 120) / 2)}" y="34" width="120" height="10" rx="5" fill="rgba(255,255,255,0.25)"/>
  <text x="40" y="${Math.round(safeHeight * 0.58)}" fill="rgba(255,255,255,0.95)" font-family="Arial, sans-serif" font-size="24" font-weight="700">${title}</text>
  <text x="40" y="${Math.round(safeHeight * 0.65)}" fill="rgba(255,255,255,0.7)" font-family="Arial, sans-serif" font-size="13">Preview placeholder</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function buildProjectCoverDataUrls(screens: HtmlDesignSpec["screens"]): Promise<string[]> {
  const targets = (screens || []).slice(0, 2);
  if (targets.length === 0) return [];
  const rendered: string[] = [];
  for (let index = 0; index < targets.length; index += 1) {
    const screen = targets[index];
    const width = Math.max(280, Math.min(420, screen.width || 375));
    const height = Math.max(560, Math.min(920, screen.height || 812));
    let base64 = await renderScreenImageBase64({
      html: screen.html,
      width,
      height,
    });
    // Retry once with a smaller viewport for heavy/complex screens.
    if (!base64) {
      base64 = await renderScreenImageBase64({
        html: screen.html,
        width: Math.max(280, Math.floor(width * 0.9)),
        height: Math.max(560, Math.floor(height * 0.9)),
      });
    }
    // Final retry with stripped inline assets to avoid oversized payload/render failures.
    if (!base64) {
      base64 = await renderScreenImageBase64({
        html: stripHeavyInlineAssetsForRender(screen.html || ""),
        width: Math.max(280, Math.floor(width * 0.9)),
        height: Math.max(560, Math.floor(height * 0.9)),
      });
    }
    if (base64) {
      rendered.push(`data:image/png;base64,${base64}`);
      continue;
    }
    rendered.push(buildFallbackCoverDataUrl({
      screenName: String(screen.name || "Screen"),
      width: Number(screen.width || 375),
      height: Number(screen.height || 812),
      index,
    }));
  }
  return rendered;
}

function resolveStorageRefFromImageValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    if (trimmed.startsWith("gs://") || trimmed.startsWith("https://firebasestorage.googleapis.com/")) {
      return ref(storage, trimmed);
    }
  } catch {
    // ignore invalid URL refs
  }
  return null;
}

async function persistChatImageRefs(params: {
  uid: string;
  projectId: string;
  messageId: string;
  images: unknown;
}): Promise<string[]> {
  const { uid, projectId, messageId, images } = params;
  if (!ENABLE_STORAGE_UPLOADS || storageUploadsTemporarilyDisabled) return [];
  if (!Array.isArray(images)) return [];
  const out: string[] = [];
  let uploadIndex = 0;
  for (const raw of images) {
    if (out.length >= MAX_PERSISTED_IMAGE_COUNT) break;
    if (typeof raw !== "string") continue;
    const image = raw.trim();
    if (!image) continue;
    if (!image.startsWith("data:")) {
      if (image.length <= MAX_PERSISTED_IMAGE_URL_LENGTH) {
        out.push(image);
      }
      continue;
    }
    const extMatch = image.match(/^data:image\/([a-z0-9.+-]+);base64,/i);
    const ext = (extMatch?.[1] || "png").replace(/[^a-z0-9]/gi, "").toLowerCase() || "png";
    const assetPath = `chat-attachments/${messageId}-${uploadIndex}.${ext}`;
    uploadIndex += 1;
    try {
      const storageRef = ref(storage, `users/${uid}/projects/${projectId}/${assetPath}`);
      await withTimeout(
        uploadString(storageRef, image, "data_url"),
        STORAGE_UPLOAD_TIMEOUT_MS,
        `Chat attachment upload (${messageId})`
      );
      out.push(await getDownloadURL(storageRef));
    } catch (error) {
      // Skip failed attachment upload so one bad file doesn't block project save.
    }
  }
  return out;
}

function normalizePersistedMessages(raw: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return raw
    .sort((a, b) => {
      const orderA = typeof a.orderIndex === "number" && Number.isFinite(a.orderIndex) ? a.orderIndex : null;
      const orderB = typeof b.orderIndex === "number" && Number.isFinite(b.orderIndex) ? b.orderIndex : null;
      if (orderA !== null && orderB !== null && orderA !== orderB) return orderA - orderB;
      const timeA = normalizeTimestampMs(a.timestamp, 0);
      const timeB = normalizeTimestampMs(b.timestamp, 0);
      if (timeA !== timeB) return timeA - timeB;
      return String(a.id || "").localeCompare(String(b.id || ""));
    })
    .map((message) => ({
      ...message,
      timestamp: normalizeTimestampMs(message.timestamp, 0),
      images: Array.isArray(message.images) ? message.images.filter((img): img is string => typeof img === "string" && img.trim().length > 0) : [],
    }));
}

async function loadPersistedProjectMessages(uid: string, projectId: string): Promise<Array<Record<string, unknown>>> {
  const messagesSnap = await getDocs(collection(db, "users", uid, "projects", projectId, "chats", "default", "messages"));
  const raw = messagesSnap.docs.map((d) => d.data() as Record<string, unknown>);
  return normalizePersistedMessages(raw);
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
  const { uid, projectId, designSpec, canvasDoc, chatState, mode } = input;
  const isAutosave = mode === "autosave";
  const id = projectId || makeId();
  const now = new Date().toISOString();
  const safeDesignSpec = stripUndefinedDeep(designSpec);
  const safeCanvasDoc = canvasDoc == null ? null : stripUndefinedDeep(canvasDoc);
  const safeChatState = chatState == null ? null : stripUndefinedDeep(chatState);
  const snapshotChatState = sanitizeChatStateForSnapshot(safeChatState);
  const snapshot: WorkspaceSnapshot = {
    designSpec: safeDesignSpec,
    canvasDoc: safeCanvasDoc,
    chatState: snapshotChatState,
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
  if (!resolvedSnapshotPath && existingData?.snapshotPath) {
    resolvedSnapshotPath = existingData.snapshotPath;
  }
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
  let regeneratedCover = false;
  const shouldRefreshCover = nextCoverScreenIds.length > 0 && (
    (resolvedCoverImageUrls.length === 0 && resolvedCoverImageDataUrls.length === 0 && !existingData?.coverImageUrl && !existingData?.coverImageDataUrl)
    || existingCoverScreenIds.join("|") !== nextCoverScreenIds.join("|")
    || Number(existingData?.coverVersion || 0) !== PROJECT_COVER_VERSION
  );

  if (!isAutosave && shouldRefreshCover) {
    const coverDataUrls = await buildProjectCoverDataUrls(safeDesignSpec.screens || []);
    if (coverDataUrls.length > 0) {
      regeneratedCover = true;
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
    const staleCoverPaths = regeneratedCover
      ? existingCoverImagePaths.filter((path) => !resolvedCoverImagePaths.includes(path))
      : [];
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
  if (!isAutosave) {
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
  }

  const screensBatch = writeBatch(db);
  const screenPayloads = await Promise.all(
    (safeDesignSpec.screens || []).map(async (screen) => {
      const fullHtml = typeof screen.html === "string" ? screen.html : "";
      const canStoreFullHtml = fullHtml.length > 0 && fullHtml.length <= 800_000;
      let htmlPath: string | undefined;
      if (!isAutosave && fullHtml.length > 0 && ENABLE_STORAGE_UPLOADS && !storageUploadsTemporarilyDisabled) {
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
      return {
        screenId: screen.screenId,
        payload: stripUndefinedDeep({
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
        }),
      };
    })
  );
  screenPayloads.forEach(({ screenId, payload }) => {
    const screenRef = doc(db, "users", uid, "projects", id, "screens", screenId);
    screensBatch.set(screenRef, payload);
  });
  await screensBatch.commit();

  // Persist chat messages in a subcollection for scalable querying.
  const messages = (safeChatState as { messages?: Array<Record<string, unknown>> } | undefined)?.messages || [];
  const chatRef = doc(db, "users", uid, "projects", id, "chats", "default");
  await setDoc(chatRef, { id: "default", updatedAt: now }, { merge: true });
  if (isAutosave) {
    if (messages.length > 0) {
      const messageBatch = writeBatch(db);
      const sourceMessages = messages.slice(-250);
      sourceMessages.forEach((msg, index) => {
        const msgId = String(msg.id || makeId());
        const images = sanitizeChatImagesForPersistence(msg.images);
        const msgRef = doc(db, "users", uid, "projects", id, "chats", "default", "messages", msgId);
        const persistedMeta = sanitizePersistedMeta(msg.meta);
        const timestampMs = normalizeTimestampMs(msg.timestamp, Date.now());
        messageBatch.set(msgRef, stripUndefinedDeep({
          id: msgId,
          role: msg.role || "assistant",
          content: sanitizeMessageContent(msg.content),
          status: msg.status || "complete",
          timestamp: timestampMs,
          timestampIso: new Date(timestampMs).toISOString(),
          orderIndex: index,
          images,
          meta: persistedMeta,
        }));
      });
      await messageBatch.commit();
    }
  } else {
    const existingMessagesSnap = await getDocs(collection(db, "users", uid, "projects", id, "chats", "default", "messages"));
    const staleAttachmentRefs = new Map<string, ReturnType<typeof ref>>();
    existingMessagesSnap.forEach((docSnap) => {
      const persisted = docSnap.data() as { images?: unknown };
      if (!Array.isArray(persisted.images)) return;
      for (const image of persisted.images) {
        if (typeof image !== "string") continue;
        if (!image.includes("/chat-attachments/")) continue;
        const storageRef = resolveStorageRefFromImageValue(image);
        if (!storageRef) continue;
        staleAttachmentRefs.set(storageRef.fullPath, storageRef);
      }
    });
    if (!existingMessagesSnap.empty) {
      const oldMessagesBatch = writeBatch(db);
      existingMessagesSnap.forEach((docSnap) => oldMessagesBatch.delete(docSnap.ref));
      await oldMessagesBatch.commit();
    }
    if (staleAttachmentRefs.size > 0) {
      await Promise.all(
        Array.from(staleAttachmentRefs.values()).map(async (attachmentRef) => {
          try {
            await deleteObject(attachmentRef);
          } catch {
            // ignore missing attachment cleanup errors
          }
        })
      );
    }
    if (messages.length > 0) {
      const messageBatch = writeBatch(db);
      const sourceMessages = messages.slice(-250);
      const persistedImageMatrix = await Promise.all(
        sourceMessages.map(async (msg, index) => {
          const msgId = String(msg.id || makeId());
          const directUrls = sanitizeChatImagesForPersistence(msg.images);
          const uploadedUrls = await persistChatImageRefs({
            uid,
            projectId: id,
            messageId: msgId,
            images: msg.images,
          });
          const mergedImages = Array.from(new Set([...directUrls, ...uploadedUrls]));
          return {
            msgId,
            orderIndex: index,
            images: mergedImages.slice(0, MAX_PERSISTED_IMAGE_COUNT),
            msg,
          };
        })
      );
      persistedImageMatrix.forEach(({ msgId, orderIndex, images, msg }) => {
        const msgRef = doc(db, "users", uid, "projects", id, "chats", "default", "messages", msgId);
        const persistedMeta = sanitizePersistedMeta(msg.meta);
        const timestampMs = normalizeTimestampMs(msg.timestamp, Date.now());
        messageBatch.set(msgRef, stripUndefinedDeep({
          id: msgId,
          role: msg.role || "assistant",
          content: sanitizeMessageContent(msg.content),
          status: msg.status || "complete",
          timestamp: timestampMs,
          timestampIso: new Date(timestampMs).toISOString(),
          orderIndex,
          images,
          meta: persistedMeta,
        }));
      });
      await messageBatch.commit();
    }
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
    messages = await loadPersistedProjectMessages(uid, projectId);
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
      let persistedMessages: Array<Record<string, unknown>> = [];
      try {
        persistedMessages = await loadPersistedProjectMessages(uid, projectId);
      } catch {
        persistedMessages = [];
      }
      return {
        projectId: data.id || projectId,
        designSpec: parsed.designSpec,
        canvasDoc: parsed.canvasDoc ?? null,
        chatState: persistedMessages.length > 0 ? { messages: persistedMessages } : (parsed.chatState ?? null),
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
  const screensSnap = await getDocs(collection(db, "users", uid, "projects", projectId, "screens"));

  // Best-effort subcollection cleanup.
  await deleteCollectionDocs(["users", uid, "projects", projectId, "screens"]);
  const chats = await getDocs(collection(db, "users", uid, "projects", projectId, "chats"));
  const chatAttachmentRefs = new Map<string, ReturnType<typeof ref>>();
  for (const chat of chats.docs) {
    const messagesSnap = await getDocs(collection(db, "users", uid, "projects", projectId, "chats", chat.id, "messages"));
    messagesSnap.forEach((msgDoc) => {
      const msg = msgDoc.data() as { images?: unknown };
      if (!Array.isArray(msg.images)) return;
      for (const image of msg.images) {
        if (typeof image !== "string") continue;
        if (!image.includes(`/users/${uid}/projects/${projectId}/`)) continue;
        const storageRef = resolveStorageRefFromImageValue(image);
        if (!storageRef) continue;
        chatAttachmentRefs.set(storageRef.fullPath, storageRef);
      }
    });
    await deleteCollectionDocs(["users", uid, "projects", projectId, "chats", chat.id, "messages"]);
    await deleteDoc(chat.ref);
  }
  await deleteCollectionDocs(["users", uid, "projects", projectId, "sessions"]);
  if (data.snapshotPath) {
    try {
      await deleteObject(ref(storage, `users/${uid}/projects/${projectId}/${data.snapshotPath}`));
    } catch {
      // ignore missing snapshot cleanup errors
    }
  }
  const projectMeta = snap.data() as { coverImagePath?: string; coverImagePaths?: string[] };
  const coverPaths = Array.isArray(projectMeta.coverImagePaths)
    ? projectMeta.coverImagePaths
    : (projectMeta.coverImagePath ? [projectMeta.coverImagePath] : []);
  for (const coverPath of coverPaths) {
    if (!coverPath) continue;
    try {
      await deleteObject(ref(storage, `users/${uid}/projects/${projectId}/${coverPath}`));
    } catch {
      // ignore missing cover cleanup errors
    }
  }
  for (const d of screensSnap.docs) {
    const s = d.data() as { htmlPath?: string };
    if (s.htmlPath) {
      try {
        await deleteObject(ref(storage, `users/${uid}/projects/${projectId}/${s.htmlPath}`));
      } catch {
        // ignore missing screen html cleanup errors
      }
    }
  }
  for (const attachmentRef of chatAttachmentRefs.values()) {
    try {
      await deleteObject(attachmentRef);
    } catch {
      // ignore missing attachment cleanup errors
    }
  }
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
