import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  type Unsubscribe,
  writeBatch,
} from "firebase/firestore";
import { deleteObject, getBytes, getDownloadURL, ref, uploadString } from "firebase/storage";
import type { HtmlDesignSpec, ProjectMemory, ReferenceContextMeta } from "@/api/client";
import { db, storage } from "./firebase";

const IS_LOCAL_DEV_HOST = typeof window !== "undefined" && /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
const RENDER_IMAGE_API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || "/api";
const ENABLE_STORAGE_RESTORE = import.meta.env.VITE_ENABLE_STORAGE_RESTORE === "1"
  || (!IS_LOCAL_DEV_HOST && import.meta.env.VITE_ENABLE_STORAGE_RESTORE !== "0");
const ENABLE_STORAGE_UPLOADS = import.meta.env.VITE_ENABLE_STORAGE_UPLOADS === "1"
  || (!IS_LOCAL_DEV_HOST && import.meta.env.VITE_ENABLE_STORAGE_UPLOADS !== "0");
let storageUploadsTemporarilyDisabled = false;
const backgroundCoverRefreshByProject = new Map<string, Promise<void>>();
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
  htmlHash?: string;
  persistSignature?: string;
};
type WorkspaceSnapshot = {
  designSpec: HtmlDesignSpec;
  canvasDoc: unknown | null;
  chatState: unknown | null;
  projectMemory?: ProjectMemory | null;
};

export type FirestoreProjectRecord = {
  projectId: string;
  designSpec: HtmlDesignSpec;
  canvasDoc: unknown;
  chatState: unknown;
  projectMemory?: ProjectMemory;
  createdAt: string;
  updatedAt: string;
};

type ProjectMetaData = {
  id: string;
  designSpec?: HtmlDesignSpec;
  designSpecMeta?: {
    id?: string;
    name?: string;
    description?: string;
    designSystem?: HtmlDesignSpec["designSystem"];
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
  projectMemory?: ProjectMemory;
  snapshotPath?: string;
  coverImagePath?: string;
  coverImageUrl?: string;
  coverImageDataUrl?: string;
  coverImagePaths?: string[];
  coverImageUrls?: string[];
  coverImageDataUrls?: string[];
  coverScreenIds?: string[];
  coverSignature?: string;
  coverVersion?: number;
  createdAt: string;
  updatedAt: string;
};

const MAX_PERSISTED_MESSAGE_CONTENT_LENGTH = 24_000;
const MAX_PERSISTED_IMAGE_URL_LENGTH = 2_048;
const MAX_INLINE_CHAT_IMAGE_DATA_URL_LENGTH = 350_000;
const MAX_PERSISTED_IMAGE_COUNT = 8;
const MAX_PERSISTED_SCREEN_ID_COUNT = 32;
const MAX_PERSISTED_REFERENCE_URL_COUNT = 8;
const MAX_PERSISTED_REFERENCE_WARNING_COUNT = 4;
const MAX_PERSISTED_SCREEN_SNAPSHOT_COUNT = 8;
const MAX_PERSISTED_SCREEN_SNAPSHOT_HTML_LENGTH = 12_000;
const MAX_PERSISTED_DESIGN_SYSTEM_RULE_COUNT = 10;
const MAX_PERSISTED_DESIGN_SYSTEM_REFERENCE_SCREENS = 12;
const MAX_PROJECT_MEMORY_SCREEN_COUNT = 24;
const MAX_PROJECT_MEMORY_SCREEN_NAME_LENGTH = 88;
const MAX_PROJECT_MEMORY_USER_REQUESTS = 16;
const MAX_PROJECT_MEMORY_USER_REQUEST_LENGTH = 220;
const MAX_PROJECT_MEMORY_NAV_LABELS = 8;
const FIRESTORE_PROJECT_DOC_SOFT_LIMIT_BYTES = 920_000;
const FIRESTORE_DESCRIPTION_MAX_LENGTH = 6_000;

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

function sanitizeMetaString(value: unknown, fallback: string, max = 256): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return fallback;
  return text.length <= max ? text : text.slice(0, max);
}

function sanitizeMetaNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function sanitizeMetaStringArray(value: unknown, maxItems: number, maxLength = 220): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, maxItems)
    .map((item) => (item.length <= maxLength ? item : item.slice(0, maxLength)));
}

function sanitizeReferenceContextForMeta(value: unknown): ReferenceContextMeta | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const requestedUrls = sanitizeMetaStringArray(raw.requestedUrls, MAX_PERSISTED_REFERENCE_URL_COUNT, MAX_PERSISTED_IMAGE_URL_LENGTH);
  const normalizedUrls = sanitizeMetaStringArray(raw.normalizedUrls, MAX_PERSISTED_REFERENCE_URL_COUNT, MAX_PERSISTED_IMAGE_URL_LENGTH);
  const warnings = sanitizeMetaStringArray(raw.warnings, MAX_PERSISTED_REFERENCE_WARNING_COUNT, 240);
  const webContextApplied = raw.webContextApplied === true;
  const skippedReason = raw.skippedReason === "missing_api_key" || raw.skippedReason === "no_valid_urls" || raw.skippedReason === "all_failed"
    ? raw.skippedReason
    : undefined;
  const sourceCount = sanitizeMetaNumber(raw.sourceCount, 0, 0, MAX_PERSISTED_REFERENCE_URL_COUNT);
  const referenceImageCount = sanitizeMetaNumber(raw.referenceImageCount, 0, 0, MAX_PERSISTED_IMAGE_COUNT);

  if (
    requestedUrls.length === 0
    && normalizedUrls.length === 0
    && warnings.length === 0
    && !webContextApplied
    && !skippedReason
    && sourceCount === 0
    && referenceImageCount === 0
  ) {
    return null;
  }

  return {
    requestedUrls,
    normalizedUrls,
    webContextApplied,
    warnings,
    ...(skippedReason ? { skippedReason } : {}),
    sourceCount,
    referenceImageCount,
  };
}

function sanitizeScreenSnapshotsForMeta(value: unknown): Record<string, { screenId: string; name: string; html: string; width: number; height: number }> | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const next: Record<string, { screenId: string; name: string; html: string; width: number; height: number }> = {};

  for (const [key, item] of Object.entries(raw)) {
    if (Object.keys(next).length >= MAX_PERSISTED_SCREEN_SNAPSHOT_COUNT) break;
    if (!item || typeof item !== "object") continue;

    const snapshot = item as Record<string, unknown>;
    const screenId = sanitizeMetaString(snapshot.screenId ?? key, "", 128);
    if (!screenId) continue;

    const html = typeof snapshot.html === "string"
      ? snapshot.html.slice(0, MAX_PERSISTED_SCREEN_SNAPSHOT_HTML_LENGTH)
      : "";

    next[screenId] = {
      screenId,
      name: sanitizeMetaString(snapshot.name, "Screen", 120),
      html,
      width: sanitizeMetaNumber(snapshot.width, 390, 120, 2048),
      height: sanitizeMetaNumber(snapshot.height, 844, 120, 4096),
    };
  }

  return Object.keys(next).length > 0 ? next : null;
}

function sanitizeDesignSystemProposalForMeta(value: unknown): NonNullable<HtmlDesignSpec["designSystem"]> | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const rawTokens = (raw.tokens && typeof raw.tokens === "object") ? raw.tokens as Record<string, unknown> : {};
  const rawTokenModes = (raw.tokenModes && typeof raw.tokenModes === "object") ? raw.tokenModes as Record<string, unknown> : {};
  const rawModeLight = (rawTokenModes.light && typeof rawTokenModes.light === "object") ? rawTokenModes.light as Record<string, unknown> : {};
  const rawModeDark = (rawTokenModes.dark && typeof rawTokenModes.dark === "object") ? rawTokenModes.dark as Record<string, unknown> : {};
  const rawTypography = (raw.typography && typeof raw.typography === "object") ? raw.typography as Record<string, unknown> : {};
  const rawScale = (rawTypography.scale && typeof rawTypography.scale === "object") ? rawTypography.scale as Record<string, unknown> : {};
  const rawSpacing = (raw.spacing && typeof raw.spacing === "object") ? raw.spacing as Record<string, unknown> : {};
  const rawRadius = (raw.radius && typeof raw.radius === "object") ? raw.radius as Record<string, unknown> : {};
  const rawShadows = (raw.shadows && typeof raw.shadows === "object") ? raw.shadows as Record<string, unknown> : {};
  const rawComponentLanguage = (raw.componentLanguage && typeof raw.componentLanguage === "object") ? raw.componentLanguage as Record<string, unknown> : {};
  const rawMotion = (raw.motion && typeof raw.motion === "object") ? raw.motion as Record<string, unknown> : {};
  const rawRules = (raw.rules && typeof raw.rules === "object") ? raw.rules as Record<string, unknown> : {};

  const themeMode = raw.themeMode === "light" || raw.themeMode === "dark" || raw.themeMode === "mixed"
    ? raw.themeMode
    : "mixed";
  const spacingDensity = sanitizeMetaString(rawSpacing.density, "balanced", 80);
  const sanitizeTokenSet = (source: Record<string, unknown>, fallback: Record<string, string>) => ({
    bg: sanitizeMetaString(source.bg, fallback.bg, 40),
    surface: sanitizeMetaString(source.surface, fallback.surface, 40),
    surface2: sanitizeMetaString(source.surface2, fallback.surface2, 40),
    text: sanitizeMetaString(source.text, fallback.text, 40),
    muted: sanitizeMetaString(source.muted, fallback.muted, 40),
    stroke: sanitizeMetaString(source.stroke, fallback.stroke, 40),
    accent: sanitizeMetaString(source.accent, fallback.accent, 40),
    accent2: sanitizeMetaString(source.accent2, fallback.accent2, 40),
  });

  const tokens = sanitizeTokenSet(rawTokens, {
    bg: "#000000",
    surface: "#111111",
    surface2: "#222222",
    text: "#ffffff",
    muted: "#9ca3af",
    stroke: "#374151",
    accent: "#4f46e5",
    accent2: "#22d3ee",
  });
  const tokenModes = {
    light: sanitizeTokenSet(rawModeLight, tokens),
    dark: sanitizeTokenSet(rawModeDark, tokens),
  };

  return {
    version: 1,
    systemName: sanitizeMetaString(raw.systemName, "Design System", 120),
    intentSummary: sanitizeMetaString(raw.intentSummary, "", 260),
    stylePreset: sanitizeMetaString(raw.stylePreset, "modern", 32),
    platform: sanitizeMetaString(raw.platform, "mobile", 32),
    themeMode,
    tokens,
    tokenModes,
    typography: {
      displayFont: sanitizeMetaString(rawTypography.displayFont, "Plus Jakarta Sans", 80),
      bodyFont: sanitizeMetaString(rawTypography.bodyFont, "Plus Jakarta Sans", 80),
      scale: {
        display: sanitizeMetaString(rawScale.display, "text-4xl font-bold", 90),
        h1: sanitizeMetaString(rawScale.h1, "text-2xl font-semibold", 90),
        h2: sanitizeMetaString(rawScale.h2, "text-xl font-semibold", 90),
        body: sanitizeMetaString(rawScale.body, "text-base", 90),
        caption: sanitizeMetaString(rawScale.caption, "text-sm", 90),
      },
      tone: sanitizeMetaString(rawTypography.tone, "", 180),
    },
    spacing: {
      baseUnit: sanitizeMetaNumber(rawSpacing.baseUnit, 4, 1, 64),
      density: spacingDensity,
      rhythm: sanitizeMetaString(rawSpacing.rhythm, "", 200),
    },
    radius: {
      card: sanitizeMetaString(rawRadius.card, "24px", 40),
      control: sanitizeMetaString(rawRadius.control, "14px", 40),
      pill: sanitizeMetaString(rawRadius.pill, "999px", 40),
    },
    shadows: {
      soft: sanitizeMetaString(rawShadows.soft, "", 120),
      glow: sanitizeMetaString(rawShadows.glow, "", 120),
    },
    componentLanguage: {
      button: sanitizeMetaString(rawComponentLanguage.button, "", 220),
      card: sanitizeMetaString(rawComponentLanguage.card, "", 220),
      input: sanitizeMetaString(rawComponentLanguage.input, "", 220),
      nav: sanitizeMetaString(rawComponentLanguage.nav, "", 220),
      chips: sanitizeMetaString(rawComponentLanguage.chips, "", 220),
    },
    motion: {
      style: sanitizeMetaString(rawMotion.style, "", 180),
      durationFastMs: sanitizeMetaNumber(rawMotion.durationFastMs, 140, 60, 1000),
      durationBaseMs: sanitizeMetaNumber(rawMotion.durationBaseMs, 220, 80, 1400),
    },
    rules: {
      do: sanitizeMetaStringArray(rawRules.do, MAX_PERSISTED_DESIGN_SYSTEM_RULE_COUNT, 220),
      dont: sanitizeMetaStringArray(rawRules.dont, MAX_PERSISTED_DESIGN_SYSTEM_RULE_COUNT, 220),
    },
  };
}

function sanitizeDesignSystemProposalContextForMeta(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const out: Record<string, unknown> = {
    prompt: sanitizeMetaString(raw.prompt, "", 1800),
    appPromptForPlanning: sanitizeMetaString(raw.appPromptForPlanning, "", 2200),
    platform: sanitizeMetaString(raw.platform, "mobile", 32),
    stylePreset: sanitizeMetaString(raw.stylePreset, "modern", 32),
    modelProfile: sanitizeMetaString(raw.modelProfile, "quality", 32),
    parentUserId: sanitizeMetaString(raw.parentUserId, "", 128),
  };

  const referenceScreens = Array.isArray(raw.referenceScreens)
    ? (raw.referenceScreens as Array<Record<string, unknown>>)
      .map((item) => ({
        screenId: sanitizeMetaString(item?.screenId, "", 128),
        name: sanitizeMetaString(item?.name, "", 120),
      }))
      .filter((item) => item.screenId)
      .slice(0, MAX_PERSISTED_DESIGN_SYSTEM_REFERENCE_SCREENS)
    : [];

  if (referenceScreens.length > 0) {
    out.referenceScreens = referenceScreens;
  }

  const images = sanitizeChatImagesForPersistence(raw.images)
    .filter((img) => !img.startsWith("data:"))
    .slice(0, 3);
  if (images.length > 0) {
    out.images = images;
  }

  const referenceUrls = sanitizeMetaStringArray(raw.referenceUrls, MAX_PERSISTED_REFERENCE_URL_COUNT, MAX_PERSISTED_IMAGE_URL_LENGTH);
  if (referenceUrls.length > 0) {
    out.referenceUrls = referenceUrls;
  }

  const referenceImageUrls = sanitizeMetaStringArray(raw.referenceImageUrls, 3, MAX_PERSISTED_IMAGE_URL_LENGTH);
  if (referenceImageUrls.length > 0) {
    out.referenceImageUrls = referenceImageUrls;
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
  copyNumber("designSystemProceedAt");

  if (raw.referencePreviewMode === "screen" || raw.referencePreviewMode === "palette") {
    next.referencePreviewMode = raw.referencePreviewMode;
  }

  const referenceUrls = sanitizeMetaStringArray(raw.referenceUrls, MAX_PERSISTED_REFERENCE_URL_COUNT, MAX_PERSISTED_IMAGE_URL_LENGTH);
  if (referenceUrls.length > 0) {
    next.referenceUrls = referenceUrls;
  }

  const designSystemProposal = sanitizeDesignSystemProposalForMeta(raw.designSystemProposal);
  if (designSystemProposal) {
    next.designSystemProposal = designSystemProposal;
  }
  const designSystemProposalContext = sanitizeDesignSystemProposalContextForMeta(raw.designSystemProposalContext);
  if (designSystemProposalContext) {
    next.designSystemProposalContext = designSystemProposalContext;
  }

  const referenceContext = sanitizeReferenceContextForMeta(raw.referenceContext);
  if (referenceContext) {
    next.referenceContext = referenceContext;
  }

  if (Array.isArray(raw.screenIds)) {
    next.screenIds = raw.screenIds
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      .slice(0, MAX_PERSISTED_SCREEN_ID_COUNT);
  }

  const screenSnapshots = sanitizeScreenSnapshotsForMeta(raw.screenSnapshots);
  if (screenSnapshots) {
    next.screenSnapshots = screenSnapshots;
  }

  return Object.keys(next).length > 0 ? next : null;
}

function normalizeMemoryText(value: unknown, maxLength: number): string {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!text) return "";
  return text.length <= maxLength ? text : text.slice(0, maxLength);
}

function pickIsoTime(value: unknown): string {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return new Date().toISOString();
}

function extractTextLabelsFromHtmlBlock(block: string): string[] {
  if (!block) return [];
  const labels: string[] = [];
  const seen = new Set<string>();
  const regex = />([^<>]{1,48})</g;
  let match: RegExpExecArray | null = regex.exec(block);
  while (match) {
    const raw = normalizeMemoryText(match[1], 48);
    const collapsed = raw.replace(/[^\p{L}\p{N}\s/&+-]/gu, "").trim();
    const normalized = collapsed.toLowerCase();
    const useful = normalized.length >= 2 && !/^(home page|click|tap|button)$/i.test(normalized);
    if (useful && !seen.has(normalized)) {
      labels.push(collapsed);
      seen.add(normalized);
    }
    if (labels.length >= MAX_PROJECT_MEMORY_NAV_LABELS) break;
    match = regex.exec(block);
  }
  return labels;
}

function extractNavbarContractFromHtml(html: string): { labels: string[]; signature: string } | null {
  if (!html) return null;
  const navMatch = html.match(/<nav\b[\s\S]*?<\/nav>/i);
  const navBlock = navMatch?.[0] || "";
  const labels = extractTextLabelsFromHtmlBlock(navBlock);
  if (labels.length < 2) return null;
  const signature = labels
    .map((label) => label.toLowerCase().replace(/\s+/g, " ").trim())
    .slice(0, MAX_PROJECT_MEMORY_NAV_LABELS)
    .join("|");
  if (!signature) return null;
  return { labels, signature };
}

function buildProjectMemorySnapshot(designSpec: HtmlDesignSpec, chatState: unknown): ProjectMemory {
  const screenNames = (designSpec.screens || [])
    .map((screen) => normalizeMemoryText(screen.name, MAX_PROJECT_MEMORY_SCREEN_NAME_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_PROJECT_MEMORY_SCREEN_COUNT);
  const userRequests = Array.isArray((chatState as { messages?: Array<Record<string, unknown>> } | null | undefined)?.messages)
    ? ((chatState as { messages?: Array<Record<string, unknown>> }).messages || [])
      .filter((message) => message?.role === "user")
      .map((message) => normalizeMemoryText(message?.content, MAX_PROJECT_MEMORY_USER_REQUEST_LENGTH))
      .filter(Boolean)
      .slice(-MAX_PROJECT_MEMORY_USER_REQUESTS)
    : [];

  const navbarCandidates = (designSpec.screens || [])
    .map((screen) => {
      const contract = extractNavbarContractFromHtml(screen.html || "");
      if (!contract) return null;
      return {
        ...contract,
        screenId: screen.screenId,
        screenName: normalizeMemoryText(screen.name, MAX_PROJECT_MEMORY_SCREEN_NAME_LENGTH) || "Screen",
      };
    })
    .filter((item): item is { labels: string[]; signature: string; screenId: string; screenName: string } => Boolean(item));

  const canonicalNavbar = navbarCandidates.length > 0 ? navbarCandidates[0] : null;
  const tokenKeys = designSpec.designSystem?.tokens
    ? Object.keys(designSpec.designSystem.tokens).slice(0, 12)
    : [];

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    summary: {
      screenCount: (designSpec.screens || []).length,
      screenNames,
      lastUserRequests: userRequests,
    },
    components: canonicalNavbar ? {
      navbar: {
        sourceScreenId: canonicalNavbar.screenId,
        sourceScreenName: canonicalNavbar.screenName,
        labels: canonicalNavbar.labels.slice(0, MAX_PROJECT_MEMORY_NAV_LABELS),
        signature: canonicalNavbar.signature,
      },
    } : undefined,
    style: {
      themeMode: designSpec.designSystem?.themeMode,
      displayFont: normalizeMemoryText(designSpec.designSystem?.typography?.displayFont, 90) || undefined,
      bodyFont: normalizeMemoryText(designSpec.designSystem?.typography?.bodyFont, 90) || undefined,
      tokenKeys,
    },
  };
}

function sanitizeProjectMemoryForPersistence(value: unknown): ProjectMemory | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const rawSummary = (raw.summary && typeof raw.summary === "object") ? raw.summary as Record<string, unknown> : {};
  const rawComponents = (raw.components && typeof raw.components === "object") ? raw.components as Record<string, unknown> : {};
  const rawNavbar = (rawComponents.navbar && typeof rawComponents.navbar === "object") ? rawComponents.navbar as Record<string, unknown> : null;
  const rawStyle = (raw.style && typeof raw.style === "object") ? raw.style as Record<string, unknown> : {};

  const summary = {
    screenCount: sanitizeMetaNumber(rawSummary.screenCount, 0, 0, 999),
    screenNames: sanitizeMetaStringArray(rawSummary.screenNames, MAX_PROJECT_MEMORY_SCREEN_COUNT, MAX_PROJECT_MEMORY_SCREEN_NAME_LENGTH),
    lastUserRequests: sanitizeMetaStringArray(rawSummary.lastUserRequests, MAX_PROJECT_MEMORY_USER_REQUESTS, MAX_PROJECT_MEMORY_USER_REQUEST_LENGTH),
  };

  const styleThemeMode = rawStyle.themeMode === "light" || rawStyle.themeMode === "dark" || rawStyle.themeMode === "mixed"
    ? rawStyle.themeMode
    : undefined;

  const memory: ProjectMemory = {
    version: 1,
    updatedAt: pickIsoTime(raw.updatedAt),
    summary,
    style: {
      themeMode: styleThemeMode,
      displayFont: normalizeMemoryText(rawStyle.displayFont, 90) || undefined,
      bodyFont: normalizeMemoryText(rawStyle.bodyFont, 90) || undefined,
      tokenKeys: sanitizeMetaStringArray(rawStyle.tokenKeys, 12, 40),
    },
  };

  if (rawNavbar) {
    const labels = sanitizeMetaStringArray(rawNavbar.labels, MAX_PROJECT_MEMORY_NAV_LABELS, 48);
    const signature = normalizeMemoryText(rawNavbar.signature, 280);
    if (labels.length > 0 || signature) {
      memory.components = {
        navbar: {
          sourceScreenId: normalizeMemoryText(rawNavbar.sourceScreenId, 128),
          sourceScreenName: normalizeMemoryText(rawNavbar.sourceScreenName, MAX_PROJECT_MEMORY_SCREEN_NAME_LENGTH) || "Screen",
          labels,
          signature,
        },
      };
    }
  }

  return memory;
}

function makeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
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

function estimateJsonSizeBytes(value: unknown): number {
  try {
    const json = JSON.stringify(value ?? null);
    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(json).length;
    }
    return json.length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function isFirestoreDocSizeError(error: unknown): boolean {
  const message = String((error as { message?: string })?.message || "").toLowerCase();
  return message.includes("maximum allowed size") || message.includes("exceeds the maximum allowed size");
}

function compactProjectMetaPayloadForFirestore(payload: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...payload };
  const meta = (next.designSpecMeta && typeof next.designSpecMeta === "object")
    ? { ...(next.designSpecMeta as Record<string, unknown>) }
    : null;
  if (meta) {
    next.designSpecMeta = meta;
    const description = typeof meta.description === "string" ? meta.description : "";
    if (description.length > FIRESTORE_DESCRIPTION_MAX_LENGTH) {
      meta.description = description.slice(0, FIRESTORE_DESCRIPTION_MAX_LENGTH);
    }
  }

  const coverUrls = Array.isArray(next.coverImageUrls)
    ? next.coverImageUrls.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  let coverDataUrls = Array.isArray(next.coverImageDataUrls)
    ? next.coverImageDataUrls.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  if (coverUrls.length > 0) {
    coverDataUrls = [];
  } else {
    coverDataUrls = coverDataUrls.slice(0, 2);
  }
  next.coverImageDataUrls = coverDataUrls;
  next.coverImageDataUrl = coverDataUrls[0] || null;

  const fits = () => estimateJsonSizeBytes(stripUndefinedDeep(next)) <= FIRESTORE_PROJECT_DOC_SOFT_LIMIT_BYTES;
  if (fits()) return stripUndefinedDeep(next) as Record<string, unknown>;

  if (meta) {
    meta.designSystem = null;
  }
  if (fits()) return stripUndefinedDeep(next) as Record<string, unknown>;

  const memory = (next.projectMemory && typeof next.projectMemory === "object")
    ? { ...(next.projectMemory as Record<string, unknown>) }
    : null;
  if (memory) {
    const summary = (memory.summary && typeof memory.summary === "object")
      ? { ...(memory.summary as Record<string, unknown>) }
      : null;
    if (summary) {
      summary.lastUserRequests = [];
      memory.summary = summary;
      next.projectMemory = memory;
    }
  }
  if (fits()) return stripUndefinedDeep(next) as Record<string, unknown>;

  next.projectMemory = null;
  next.coverImageDataUrls = coverDataUrls.slice(0, 1);
  next.coverImageDataUrl = coverDataUrls[0] || null;
  if (meta) {
    meta.description = "";
    meta.designSystem = null;
  }

  return stripUndefinedDeep(next) as Record<string, unknown>;
}

function isStorageCorsOrNetworkError(error: unknown): boolean {
  const message = String((error as { message?: string })?.message || "").toLowerCase();
  const code = String((error as { code?: string })?.code || "").toLowerCase();
  return (
    message.includes("cors") ||
    message.includes("blocked by cors policy") ||
    message.includes("access control check") ||
    message.includes("http status") ||
    message.includes("failed to fetch") ||
    message.includes("preflight") ||
    message.includes("xmlhttprequest") ||
    message.includes("network") ||
    message.includes("err_failed") ||
    message.includes("timed out") ||
    code.includes("storage/unknown") ||
    code.includes("storage/unauthorized")
  );
}

async function renderScreenImageBase64(params: {
  html: string;
  width: number;
  height: number;
  fullPage?: boolean;
  format?: "png" | "jpeg";
  quality?: number;
  fitToViewport?: boolean;
}): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const response = await fetch(`${RENDER_IMAGE_API_BASE}/render-screen-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        html: params.html,
        width: params.width,
        height: params.height,
        scale: 1,
        fullPage: params.fullPage,
        format: params.format,
        quality: params.quality,
        fitToViewport: params.fitToViewport === true,
      }),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { imageBase64?: string; pngBase64?: string; mimeType?: string };
    const base64 = String(payload.imageBase64 || payload.pngBase64 || "").trim();
    if (!base64) return null;
    const mimeType = String(payload.mimeType || "image/png").trim() || "image/png";
    return { base64, mimeType };
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
  const safeWidth = Math.max(280, Math.min(420, params.width || 402));
  const safeHeight = Math.max(560, Math.min(920, params.height || 874));
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
  return Promise.all(targets.map(async (screen, index) => {
    const width = Math.max(280, Math.min(402, screen.width || 402));
    const height = Math.max(560, Math.min(874, screen.height || 874));
    let rendered = await renderScreenImageBase64({
      html: screen.html,
      width,
      height,
      fullPage: false,
      format: "jpeg",
      quality: 68,
      fitToViewport: false,
    });
    // Retry once with a smaller viewport for heavy/complex screens.
    if (!rendered) {
      rendered = await renderScreenImageBase64({
        html: screen.html,
        width: Math.max(280, Math.floor(width * 0.9)),
        height: Math.max(560, Math.floor(height * 0.9)),
        fullPage: false,
        format: "jpeg",
        quality: 60,
        fitToViewport: false,
      });
    }
    // Final retry with stripped inline assets to avoid oversized payload/render failures.
    if (!rendered) {
      rendered = await renderScreenImageBase64({
        html: stripHeavyInlineAssetsForRender(screen.html || ""),
        width: Math.max(280, Math.floor(width * 0.9)),
        height: Math.max(560, Math.floor(height * 0.9)),
        fullPage: false,
        format: "jpeg",
        quality: 54,
        fitToViewport: false,
      });
    }
    if (rendered) {
      return `data:${rendered.mimeType};base64,${rendered.base64}`;
    }
    return buildFallbackCoverDataUrl({
      screenName: String(screen.name || "Screen"),
      width: Number(screen.width || 402),
      height: Number(screen.height || 874),
      index,
    });
  }));
}

function resolveProjectCoverTargetScreens(
  screens: HtmlDesignSpec["screens"],
  canvasDoc: unknown
): HtmlDesignSpec["screens"] {
  const sourceScreens = Array.isArray(screens) ? screens : [];
  if (sourceScreens.length <= 1) return sourceScreens.slice(0, 2);

  const screensById = new Map(sourceScreens.map((screen) => [screen.screenId, screen]));
  const seen = new Set<string>();
  const orderedTargets: HtmlDesignSpec["screens"] = [];
  const rawBoards = (
    canvasDoc
    && typeof canvasDoc === "object"
    && Array.isArray((canvasDoc as { boards?: unknown[] }).boards)
  ) ? (canvasDoc as { boards: Array<{ screenId?: unknown; x?: unknown; y?: unknown; visible?: unknown }> }).boards : [];

  const sortedBoards = rawBoards
    .filter((board) => board && board.visible !== false && typeof board.screenId === "string" && board.screenId.trim().length > 0)
    .sort((left, right) => {
      const topDiff = Number(left.y || 0) - Number(right.y || 0);
      if (Math.abs(topDiff) > 24) return topDiff;
      return Number(left.x || 0) - Number(right.x || 0);
    });

  sortedBoards.forEach((board) => {
    const screenId = String(board.screenId || "");
    if (!screenId || seen.has(screenId)) return;
    const match = screensById.get(screenId);
    if (!match) return;
    seen.add(screenId);
    orderedTargets.push(match);
  });

  sourceScreens.forEach((screen) => {
    if (!screen?.screenId || seen.has(screen.screenId)) return;
    seen.add(screen.screenId);
    orderedTargets.push(screen);
  });

  return orderedTargets.slice(0, 2);
}

function buildProjectCoverSignature(screens: HtmlDesignSpec["screens"]): string {
  const signatureSource = (screens || []).slice(0, 2).map((screen) => ({
    screenId: screen.screenId,
    width: screen.width,
    height: screen.height,
    htmlHash: hashString(String(screen.html || "")),
  }));
  return hashString(JSON.stringify(signatureSource));
}

async function refreshProjectCoverMetadataInBackground(params: {
  uid: string;
  projectId: string;
  coverTargetScreens: HtmlDesignSpec["screens"];
  coverScreenIds: string[];
  coverSignature: string;
  existingCoverImagePaths: string[];
}): Promise<void> {
  const { uid, projectId, coverTargetScreens, coverScreenIds, coverSignature, existingCoverImagePaths } = params;
  if (coverTargetScreens.length === 0) return;

  const taskKey = `${uid}:${projectId}`;
  if (backgroundCoverRefreshByProject.has(taskKey)) return;

  const task = (async () => {
    try {
      const coverDataUrls = await buildProjectCoverDataUrls(coverTargetScreens);
      if (coverDataUrls.length === 0) return;

      let resolvedCoverImagePaths: string[] = [];
      let resolvedCoverImageUrls: string[] = [];
      let resolvedCoverImageDataUrls: string[] = coverDataUrls;

      if (ENABLE_STORAGE_UPLOADS && !storageUploadsTemporarilyDisabled) {
        try {
          const uploaded = await Promise.all(coverDataUrls.map(async (coverDataUrl, index) => {
            const coverPath = `previews/cover-${index}.jpg`;
            const coverRef = ref(storage, `users/${uid}/projects/${projectId}/${coverPath}`);
            await withTimeout(
              uploadString(coverRef, coverDataUrl, "data_url"),
              STORAGE_UPLOAD_TIMEOUT_MS,
              `Project cover upload (${index + 1})`
            );
            return {
              path: coverPath,
              url: await getDownloadURL(coverRef),
            };
          }));
          resolvedCoverImagePaths = uploaded.map((item) => item.path);
          resolvedCoverImageUrls = uploaded.map((item) => item.url);
          resolvedCoverImageDataUrls = [];
        } catch (error) {
          if (isStorageCorsOrNetworkError(error)) {
            storageUploadsTemporarilyDisabled = true;
          } else {
            throw error;
          }
        }
      }

      if (ENABLE_STORAGE_UPLOADS && !storageUploadsTemporarilyDisabled && resolvedCoverImagePaths.length > 0) {
        const staleCoverPaths = existingCoverImagePaths.filter((path) => !resolvedCoverImagePaths.includes(path));
        await Promise.all(
          staleCoverPaths.map(async (path) => {
            try {
              await deleteObject(ref(storage, `users/${uid}/projects/${projectId}/${path}`));
            } catch {
              // ignore missing cover cleanup errors
            }
          })
        );
      }

      const projectRef = doc(db, "users", uid, "projects", projectId);
      const coverPayload = compactProjectMetaPayloadForFirestore(stripUndefinedDeep({
        coverImagePath: resolvedCoverImagePaths[0] || null,
        coverImageUrl: resolvedCoverImageUrls[0] || null,
        coverImageDataUrl: resolvedCoverImageDataUrls[0] || null,
        coverImagePaths: resolvedCoverImagePaths,
        coverImageUrls: resolvedCoverImageUrls,
        coverImageDataUrls: resolvedCoverImageDataUrls,
        coverScreenIds,
        coverSignature,
        coverVersion: PROJECT_COVER_VERSION,
      }) as Record<string, unknown>);
      await setDoc(projectRef, coverPayload, { merge: true });
    } catch (error) {
      console.warn("[saveProjectFirestore] background cover refresh failed", error);
    }
  })().finally(() => {
    backgroundCoverRefreshByProject.delete(taskKey);
  });

  backgroundCoverRefreshByProject.set(taskKey, task);
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
      if (isStorageCorsOrNetworkError(error)) {
        storageUploadsTemporarilyDisabled = true;
      }
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
  const projectMemory = sanitizeProjectMemoryForPersistence(
    buildProjectMemorySnapshot(safeDesignSpec as HtmlDesignSpec, safeChatState)
  );
  const snapshotChatState = sanitizeChatStateForSnapshot(safeChatState);
  const snapshot: WorkspaceSnapshot = {
    designSpec: safeDesignSpec,
    canvasDoc: safeCanvasDoc,
    chatState: snapshotChatState,
    projectMemory,
  };
  const snapshotPath = `snapshots/latest.json`;
  let resolvedSnapshotPath: string | null = null;
  const canAttemptSnapshotUpload = ENABLE_STORAGE_UPLOADS && !storageUploadsTemporarilyDisabled;
  if (canAttemptSnapshotUpload) {
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
      if (!isAutosave) {
        storageUploadsTemporarilyDisabled = false;
      }
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
  const coverTargetScreens = resolveProjectCoverTargetScreens(safeDesignSpec.screens || [], safeCanvasDoc);
  const nextCoverScreenIds = coverTargetScreens.map((screen) => screen.screenId);
  const nextCoverSignature = buildProjectCoverSignature(coverTargetScreens);
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
    || String(existingData?.coverSignature || "") !== nextCoverSignature
    || Number(existingData?.coverVersion || 0) !== PROJECT_COVER_VERSION
  );
  // Manual/project-level saves should persist fresh previews before navigation.
  // Autosave can defer cover generation to avoid blocking typing/edit flows.
  const shouldRefreshCoverInBackground = shouldRefreshCover && isAutosave;

  if (shouldRefreshCover && !shouldRefreshCoverInBackground) {
    const coverDataUrls = await buildProjectCoverDataUrls(coverTargetScreens);
    if (coverDataUrls.length > 0) {
      regeneratedCover = true;
      resolvedCoverImageDataUrls = coverDataUrls;
      resolvedCoverImagePaths = [];
      resolvedCoverImageUrls = [];
      if (ENABLE_STORAGE_UPLOADS && !storageUploadsTemporarilyDisabled) {
        try {
          const uploaded = await Promise.all(coverDataUrls.map(async (coverDataUrl, index) => {
            const coverPath = `previews/cover-${index}.jpg`;
            const coverRef = ref(storage, `users/${uid}/projects/${id}/${coverPath}`);
            await withTimeout(
              uploadString(coverRef, coverDataUrl, "data_url"),
              STORAGE_UPLOAD_TIMEOUT_MS,
              `Project cover upload (${index + 1})`
            );
            return {
              path: coverPath,
              url: await getDownloadURL(coverRef),
            };
          }));
          const uploadedPaths = uploaded.map((item) => item.path);
          const uploadedUrls = uploaded.map((item) => item.url);
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

  let existingScreensById = new Map<string, StoredScreenDoc>();
  // Save screen snapshots separately for future collaboration granularity.
  if (!isAutosave) {
    const currentScreenIds = new Set((safeDesignSpec.screens || []).map((screen) => screen.screenId));
    const existingScreensSnap = await getDocs(collection(db, "users", uid, "projects", id, "screens"));
    existingScreensById = new Map(
      existingScreensSnap.docs.map((screenDoc) => {
        const persisted = screenDoc.data() as StoredScreenDoc;
        return [screenDoc.id, { ...persisted, screenId: persisted.screenId || screenDoc.id }] as const;
      })
    );
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
      const htmlHash = hashString(fullHtml);
      const persistSignature = hashString(JSON.stringify({
        name: screen.name,
        width: screen.width,
        height: screen.height,
        status: screen.status || "complete",
        htmlHash,
      }));
      const canStoreFullHtml = fullHtml.length > 0 && fullHtml.length <= 800_000;
      const existingScreen = existingScreensById.get(screen.screenId);
      const screenUnchanged = !isAutosave && existingScreen?.persistSignature === persistSignature;
      let htmlPath: string | undefined;
      if (screenUnchanged) {
        htmlPath = existingScreen?.htmlPath;
      } else if (!isAutosave && fullHtml.length > 0 && ENABLE_STORAGE_UPLOADS && !storageUploadsTemporarilyDisabled) {
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
      if (screenUnchanged) {
        return null;
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
          htmlHash,
          persistSignature,
          updatedAt: now,
        }),
      };
    })
  );
  let changedScreenCount = 0;
  screenPayloads.forEach((entry) => {
    if (!entry) return;
    const { screenId, payload } = entry;
    const screenRef = doc(db, "users", uid, "projects", id, "screens", screenId);
    screensBatch.set(screenRef, payload);
    changedScreenCount += 1;
  });
  if (changedScreenCount > 0) {
    await screensBatch.commit();
  }

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

    if (persistedImageMatrix.length > 0) {
      const messageBatch = writeBatch(db);
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

    const currentMessageIds = new Set(persistedImageMatrix.map((entry) => entry.msgId));
    const existingMessagesSnap = await getDocs(collection(db, "users", uid, "projects", id, "chats", "default", "messages"));
    const staleDocRefs: Array<(typeof existingMessagesSnap.docs)[number]["ref"]> = [];
    const staleAttachmentRefs = new Map<string, ReturnType<typeof ref>>();
    existingMessagesSnap.forEach((docSnap) => {
      if (currentMessageIds.has(docSnap.id)) return;
      staleDocRefs.push(docSnap.ref);
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

    if (staleDocRefs.length > 0) {
      const CHUNK_SIZE = 400;
      for (let offset = 0; offset < staleDocRefs.length; offset += CHUNK_SIZE) {
        const batch = writeBatch(db);
        staleDocRefs.slice(offset, offset + CHUNK_SIZE).forEach((refToDelete) => batch.delete(refToDelete));
        await batch.commit();
      }
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

  // Publish project metadata LAST so realtime consumers see a coherent save boundary.
  const fullProjectMetaPayload = stripUndefinedDeep({
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
    coverScreenIds: shouldRefreshCoverInBackground ? existingCoverScreenIds : nextCoverScreenIds,
    coverSignature: shouldRefreshCoverInBackground ? existingData?.coverSignature || null : nextCoverSignature,
    coverVersion: shouldRefreshCoverInBackground ? existingData?.coverVersion || null : PROJECT_COVER_VERSION,
    screenCount: (safeDesignSpec.screens || []).length,
    designSpecMeta: {
      id: safeDesignSpec.id,
      name: safeDesignSpec.name,
      description: safeDesignSpec.description || "",
      designSystem: safeDesignSpec.designSystem,
      screens: (safeDesignSpec.screens || []).map((s) => ({
        screenId: s.screenId,
        name: s.name,
        width: s.width,
        height: s.height,
        status: s.status || "complete",
      })),
    },
    projectMemory,
    createdAt,
    updatedAt: now,
  }) as Record<string, unknown>;

  const compactProjectMetaPayload = compactProjectMetaPayloadForFirestore(fullProjectMetaPayload);
  try {
    await setDoc(projectRef, compactProjectMetaPayload, { merge: true });
  } catch (error) {
    if (!isFirestoreDocSizeError(error)) throw error;
    const emergencyProjectMetaPayload = stripUndefinedDeep({
      id,
      ownerId: uid,
      name: safeDesignSpec.name || "Untitled project",
      snapshotPath: resolvedSnapshotPath,
      coverImagePath: resolvedCoverImagePaths[0] || null,
      coverImageUrl: resolvedCoverImageUrls[0] || null,
      coverImageDataUrl: null,
      coverImagePaths: resolvedCoverImagePaths,
      coverImageUrls: resolvedCoverImageUrls,
      coverImageDataUrls: [],
      coverScreenIds: shouldRefreshCoverInBackground ? existingCoverScreenIds : nextCoverScreenIds,
      coverSignature: shouldRefreshCoverInBackground ? existingData?.coverSignature || null : nextCoverSignature,
      coverVersion: shouldRefreshCoverInBackground ? existingData?.coverVersion || null : PROJECT_COVER_VERSION,
      screenCount: (safeDesignSpec.screens || []).length,
      designSpecMeta: {
        id: safeDesignSpec.id,
        name: safeDesignSpec.name,
        description: "",
        designSystem: null,
      },
      projectMemory: null,
      createdAt,
      updatedAt: now,
    });
    await setDoc(projectRef, emergencyProjectMetaPayload, { merge: true });
  }

  if (shouldRefreshCoverInBackground) {
    void refreshProjectCoverMetadataInBackground({
      uid,
      projectId: id,
      coverTargetScreens,
      coverScreenIds: nextCoverScreenIds,
      coverSignature: nextCoverSignature,
      existingCoverImagePaths,
    });
  }

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
      width: s.width || 402,
      height: s.height || 874,
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

  const resolvedDesignSpec: HtmlDesignSpec = {
    id: data.designSpecMeta?.id || projectId,
    name: data.designSpecMeta?.name || "Untitled project",
    description: data.designSpecMeta?.description || "",
    designSystem: data.designSpecMeta?.designSystem,
    screens,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
  const persistedProjectMemory = sanitizeProjectMemoryForPersistence(data.projectMemory);
  const derivedProjectMemory = sanitizeProjectMemoryForPersistence(
    buildProjectMemorySnapshot(resolvedDesignSpec, { messages })
  );

  return {
    projectId: data.id || projectId,
    designSpec: resolvedDesignSpec,
    canvasDoc,
    chatState: messages.length > 0 ? { messages } : (data.chatState ?? null),
    projectMemory: persistedProjectMemory || derivedProjectMemory || undefined,
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

export async function getProjectFirestore(uid: string, projectId: string): Promise<FirestoreProjectRecord | null> {
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
      const persistedProjectMemory = sanitizeProjectMemoryForPersistence(data.projectMemory);
      const snapshotProjectMemory = sanitizeProjectMemoryForPersistence(parsed.projectMemory);
      const derivedProjectMemory = sanitizeProjectMemoryForPersistence(
        buildProjectMemorySnapshot(parsed.designSpec, { messages: persistedMessages })
      );
      return {
        projectId: data.id || projectId,
        designSpec: parsed.designSpec,
        canvasDoc: parsed.canvasDoc ?? null,
        chatState: persistedMessages.length > 0 ? { messages: persistedMessages } : (parsed.chatState ?? null),
        projectMemory: persistedProjectMemory || snapshotProjectMemory || derivedProjectMemory || undefined,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
    } catch {
      // fall through to metadata/subcollection fallback for backward compatibility
    }
  }
  if (isValidDesignSpec(data.designSpec)) {
    const persistedProjectMemory = sanitizeProjectMemoryForPersistence(data.projectMemory);
    const derivedProjectMemory = sanitizeProjectMemoryForPersistence(
      buildProjectMemorySnapshot(data.designSpec as HtmlDesignSpec, data.chatState)
    );
    return {
      projectId: data.id || projectId,
      designSpec: data.designSpec as HtmlDesignSpec,
      canvasDoc: data.canvasDoc ?? null,
      chatState: data.chatState ?? null,
      projectMemory: persistedProjectMemory || derivedProjectMemory || undefined,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }

  return buildProjectFromSubcollections(uid, projectId, data);
}

export function subscribeProjectRealtime(input: {
  uid: string;
  projectId: string;
  onUpdate: (project: FirestoreProjectRecord) => void;
  onError?: (error: Error) => void;
  debounceMs?: number;
}): () => void {
  const { uid, projectId, onUpdate, onError } = input;
  const debounceMs = Math.max(80, Math.min(2000, Number(input.debounceMs || 220)));

  let disposed = false;
  let timer: number | null = null;
  let inFlight = false;
  let queued = false;

  const reportError = (error: unknown) => {
    if (disposed) return;
    if (onError) {
      onError(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    console.error('[firestore] project realtime listener failed', error);
  };

  const flush = async () => {
    if (disposed) return;
    if (inFlight) {
      queued = true;
      return;
    }
    inFlight = true;
    try {
      const project = await getProjectFirestore(uid, projectId);
      if (!project || disposed) return;
      onUpdate(project);
    } catch (error) {
      reportError(error);
    } finally {
      inFlight = false;
      if (queued && !disposed) {
        queued = false;
        scheduleRefresh();
      }
    }
  };

  const scheduleRefresh = () => {
    if (disposed) return;
    if (timer !== null) {
      window.clearTimeout(timer);
    }
    timer = window.setTimeout(() => {
      timer = null;
      void flush();
    }, debounceMs);
  };

  const unsubs: Unsubscribe[] = [
    onSnapshot(
      doc(db, "users", uid, "projects", projectId),
      (snap) => {
        if (snap.metadata.hasPendingWrites) return;
        scheduleRefresh();
      },
      (error) => reportError(error)
    ),
    onSnapshot(
      collection(db, "users", uid, "projects", projectId, "screens"),
      (snap) => {
        if (snap.metadata.hasPendingWrites) return;
        scheduleRefresh();
      },
      (error) => reportError(error)
    ),
    onSnapshot(
      collection(db, "users", uid, "projects", projectId, "chats", "default", "messages"),
      (snap) => {
        if (snap.metadata.hasPendingWrites) return;
        scheduleRefresh();
      },
      (error) => reportError(error)
    ),
    onSnapshot(
      doc(db, "users", uid, "projects", projectId, "sessions", "latest"),
      (snap) => {
        if (snap.metadata.hasPendingWrites) return;
        scheduleRefresh();
      },
      (error) => reportError(error)
    ),
  ];

  scheduleRefresh();

  return () => {
    disposed = true;
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    unsubs.forEach((unsubscribe) => {
      try {
        unsubscribe();
      } catch {
        // no-op
      }
    });
  };
}

export async function listProjectsFirestore(uid: string): Promise<{ id: string; name: string; createdAt: string; updatedAt: string; screenCount: number; hasSnapshot: boolean; description?: string; designSystem?: HtmlDesignSpec["designSystem"]; coverImageUrl?: string; coverImageUrls?: string[] }[]> {
  const q = query(collection(db, "users", uid, "projects"), orderBy("updatedAt", "desc"), limit(50));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data() as {
      name?: string;
      createdAt?: string;
      updatedAt?: string;
      snapshotPath?: string;
      coverImageUrl?: string;
      coverImageDataUrl?: string;
      coverImageUrls?: string[];
      coverImageDataUrls?: string[];
      screenCount?: number;
      designSpecMeta?: {
        description?: string;
        designSystem?: HtmlDesignSpec["designSystem"];
        screens?: Array<unknown>;
      };
    };
    const persistedCoverUrls = Array.isArray(data.coverImageUrls)
      ? data.coverImageUrls.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
    const persistedCoverDataUrls = Array.isArray(data.coverImageDataUrls)
      ? data.coverImageDataUrls.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
    const coverImageUrls = Array.from(new Set([
      ...persistedCoverUrls,
      ...persistedCoverDataUrls,
      typeof data.coverImageUrl === "string" ? data.coverImageUrl.trim() : "",
      typeof data.coverImageDataUrl === "string" ? data.coverImageDataUrl.trim() : "",
    ].filter((value): value is string => value.length > 0))).slice(0, 2);
    const fallbackCover = coverImageUrls[0] || data.coverImageUrl || data.coverImageDataUrl || undefined;
    return {
      id: d.id,
      name: data.name || "Untitled project",
      createdAt: data.createdAt || data.updatedAt || "",
      updatedAt: data.updatedAt || "",
      screenCount: typeof data.screenCount === "number"
        ? data.screenCount
        : (Array.isArray(data.designSpecMeta?.screens) ? data.designSpecMeta!.screens!.length : 0),
      hasSnapshot: Boolean(data.snapshotPath),
      description: data.designSpecMeta?.description || "",
      designSystem: data.designSpecMeta?.designSystem,
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
