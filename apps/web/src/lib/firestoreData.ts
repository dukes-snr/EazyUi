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

const ENABLE_STORAGE_RESTORE = import.meta.env.VITE_ENABLE_STORAGE_RESTORE === "1";

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
  createdAt: string;
  updatedAt: string;
};

function isValidDesignSpec(value: unknown): value is HtmlDesignSpec {
  if (!value || typeof value !== "object") return false;
  const candidate = value as HtmlDesignSpec;
  return Array.isArray(candidate.screens) && typeof candidate.name === "string";
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
  const snapshotRef = ref(storage, `users/${uid}/projects/${id}/${snapshotPath}`);
  await uploadString(snapshotRef, JSON.stringify(snapshot), "raw", {
    contentType: "application/json",
  });
  const projectRef = doc(db, "users", uid, "projects", id);
  const existing = await getDoc(projectRef);
  const createdAt = existing.exists() ? (existing.data().createdAt as string) || now : now;

  await setDoc(
    projectRef,
    {
      id,
      ownerId: uid,
      name: safeDesignSpec.name || "Untitled project",
      snapshotPath,
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
  const screensBatch = writeBatch(db);
  for (const screen of safeDesignSpec.screens || []) {
    const screenRef = doc(db, "users", uid, "projects", id, "screens", screen.screenId);
    const fullHtml = typeof screen.html === "string" ? screen.html : "";
    const canStoreFullHtml = fullHtml.length > 0 && fullHtml.length <= 800_000;
    let htmlPath: string | undefined;
    if (fullHtml.length > 0) {
      htmlPath = `screens/${screen.screenId}.html`;
      await uploadString(ref(storage, `users/${uid}/projects/${id}/${htmlPath}`), fullHtml, "raw", {
        contentType: "text/html",
      });
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
      messageBatch.set(msgRef, stripUndefinedDeep({
        id: msgId,
        role: msg.role || "assistant",
        content: msg.content || "",
        status: msg.status || "complete",
        timestamp: msg.timestamp || now,
        images: Array.isArray(msg.images) ? msg.images : [],
        meta: msg.meta || null,
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

export async function listProjectsFirestore(uid: string): Promise<{ id: string; name: string; updatedAt: string; screenCount: number; hasSnapshot: boolean }[]> {
  const q = query(collection(db, "users", uid, "projects"), orderBy("updatedAt", "desc"), limit(50));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data() as { name?: string; updatedAt?: string; snapshotPath?: string; designSpecMeta?: { screens?: Array<unknown> } };
    return {
      id: d.id,
      name: data.name || "Untitled project",
      updatedAt: data.updatedAt || "",
      screenCount: Array.isArray(data.designSpecMeta?.screens) ? data.designSpecMeta!.screens!.length : 0,
      hasSnapshot: Boolean(data.snapshotPath),
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

  // Best-effort subcollection cleanup.
  await deleteCollectionDocs(["users", uid, "projects", projectId, "screens"]);
  const chats = await getDocs(collection(db, "users", uid, "projects", projectId, "chats"));
  for (const chat of chats.docs) {
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
  const screensSnap = await getDocs(collection(db, "users", uid, "projects", projectId, "screens"));
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
