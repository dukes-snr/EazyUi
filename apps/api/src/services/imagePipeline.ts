import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { generateImageAsset } from './gemini.js';
import { planImagePrompts } from './designPlanner.js';

export interface ImageSynthesisInputScreen {
  screenId?: string;
  name: string;
  html: string;
  width?: number;
  height?: number;
}

export interface ImageSynthesisOptions {
  appPrompt: string;
  stylePreset?: 'modern' | 'minimal' | 'vibrant' | 'luxury' | 'playful';
  platform?: 'mobile' | 'tablet' | 'desktop';
  preferredModel?: string;
  maxImages?: number;
  concurrency?: number;
}

export interface ImageSynthesisResult {
  screens: ImageSynthesisInputScreen[];
  stats: {
    totalSlots: number;
    uniqueIntents: number;
    generated: number;
    reusedFromCache: number;
    reusedWithinRun: number;
    skipped: number;
  };
}

type CacheShape = {
  version: number;
  items: Record<string, { src: string; createdAt: string; uses: number; prompt: string }>;
};

type ImageSlot = {
  slotId: string;
  screenIndex: number;
  imgIndex: number;
  screenName: string;
  src: string;
  alt: string;
  aspect: string;
  intentKey: string;
  prompt: string;
  generate: boolean;
};

const CACHE_FILE = path.resolve(process.cwd(), 'data', 'generated-image-cache.json');

function ensureCacheDir() {
  const dir = path.dirname(CACHE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadCache(): CacheShape {
  ensureCacheDir();
  if (!fs.existsSync(CACHE_FILE)) {
    return { version: 1, items: {} };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) as CacheShape;
    if (!parsed || typeof parsed !== 'object' || !parsed.items) return { version: 1, items: {} };
    return parsed;
  } catch {
    return { version: 1, items: {} };
  }
}

function saveCache(cache: CacheShape) {
  ensureCacheDir();
  const tmp = `${CACHE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), 'utf8');
  fs.renameSync(tmp, CACHE_FILE);
}

function normalizeText(input: string): string {
  return (input || '')
    .toLowerCase()
    .replace(/https?:\/\//g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function getAppSignature(appPrompt: string): string {
  return normalizeText(appPrompt).split(' ').slice(0, 10).join(' ');
}

function parseTagAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = attrRegex.exec(tag)) !== null) {
    const key = (m[1] || '').toLowerCase();
    if (!key || key === 'img') continue;
    const value = m[2] ?? m[3] ?? m[4] ?? '';
    attrs[key] = value;
  }
  return attrs;
}

function aspectFromRatio(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return '1:1';
  if (ratio >= 1.7) return '16:9';
  if (ratio >= 1.3) return '4:3';
  if (ratio >= 1.1) return '3:2';
  if (ratio >= 0.9) return '1:1';
  if (ratio >= 0.72) return '4:5';
  return '9:16';
}

function parseAspectFromAttrs(attrs: Record<string, string>): string {
  const width = Number(attrs.width || '');
  const height = Number(attrs.height || '');
  if (width > 0 && height > 0) {
    return aspectFromRatio(width / height);
  }

  const src = attrs.src || '';
  try {
    const url = new URL(src);
    const w = Number(url.searchParams.get('w') || '');
    const h = Number(url.searchParams.get('h') || '');
    if (w > 0 && h > 0) return aspectFromRatio(w / h);
  } catch {
    // ignore non-url src
  }

  const cls = attrs.class || '';
  const aspectClass = cls.match(/aspect-\[(\d+)\/(\d+)\]/i);
  if (aspectClass) {
    const w = Number(aspectClass[1]);
    const h = Number(aspectClass[2]);
    if (w > 0 && h > 0) return aspectFromRatio(w / h);
  }

  return '1:1';
}

function buildIntentKey(
  appSignature: string,
  stylePreset: string,
  platform: string,
  alt: string,
  src: string,
  aspect: string,
): string {
  const normalizedAlt = normalizeText(alt);
  const normalizedSrc = normalizeText(src).slice(0, 80);
  const basis = normalizedAlt || normalizedSrc || 'generic image';
  const joined = `${appSignature}|${stylePreset}|${platform}|${basis}|${aspect}`;
  return createHash('sha1').update(joined).digest('hex');
}

function buildImagePrompt(
  _appPrompt: string,
  stylePreset: string,
  _platform: string,
  _screenName: string,
  alt: string,
  _aspect: string,
): string {
  const subject = alt?.trim() || 'portrait scene';
  const style = stylePreset || 'modern';
  return [
    `${subject}, ${style} visual style, soft natural lighting, clean composition, high detail, high-resolution, no text, no watermark, no logos.`,
  ].join(' ');
}

function shouldGenerate(attrs: Record<string, string>): boolean {
  const src = (attrs.src || '').trim();
  if (!src) return true;
  if (src.startsWith('data:image/')) return false;
  if (src.startsWith('blob:')) return false;
  return true;
}

function replaceImgSrc(tag: string, newSrc: string): string {
  const safe = newSrc.replace(/"/g, '&quot;');
  let next = tag.replace(/\s+srcset\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  if (/\bsrc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i.test(next)) {
    return next.replace(/\bsrc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, `src="${safe}"`);
  }
  return next.replace(/<img\b/i, `<img src="${safe}"`);
}

function extractImageSlots(
  screens: ImageSynthesisInputScreen[],
  options: Required<Pick<ImageSynthesisOptions, 'appPrompt' | 'stylePreset' | 'platform'>>,
): ImageSlot[] {
  const appSignature = getAppSignature(options.appPrompt);
  const slots: ImageSlot[] = [];

  screens.forEach((screen, screenIndex) => {
    const html = String(screen.html || '');
    const imgRegex = /<img\b[^>]*>/gi;
    let m: RegExpExecArray | null;
    let imgIndex = 0;

    while ((m = imgRegex.exec(html)) !== null) {
      const tag = m[0];
      const attrs = parseTagAttributes(tag);
      const src = attrs.src || '';
      const alt = attrs.alt || '';
      const aspect = parseAspectFromAttrs(attrs);
      const intentKey = buildIntentKey(
        appSignature,
        options.stylePreset,
        options.platform,
        alt,
        src,
        aspect,
      );

      slots.push({
        slotId: `${screenIndex}:${imgIndex}`,
        screenIndex,
        imgIndex,
        screenName: screen.name,
        src,
        alt,
        aspect,
        intentKey,
        prompt: buildImagePrompt(options.appPrompt, options.stylePreset, options.platform, screen.name, alt, aspect),
        generate: shouldGenerate(attrs),
      });

      imgIndex += 1;
    }
  });

  return slots;
}

function rewriteScreenHtml(screenHtml: string, replacementsByIndex: Map<number, string>): string {
  let imgIndex = 0;
  return screenHtml.replace(/<img\b[^>]*>/gi, (tag) => {
    const replacement = replacementsByIndex.get(imgIndex);
    imgIndex += 1;
    if (!replacement) return tag;
    return replaceImgSrc(tag, replacement);
  });
}

async function mapWithConcurrency<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>) {
  if (!items.length) return;
  const limit = Math.max(1, concurrency);
  let cursor = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) break;
      await fn(items[index]);
    }
  });
  await Promise.all(workers);
}

export async function synthesizeImagesForScreens(
  screens: ImageSynthesisInputScreen[],
  options: ImageSynthesisOptions,
): Promise<ImageSynthesisResult> {
  const stylePreset = options.stylePreset || 'modern';
  const platform = options.platform || 'mobile';
  const maxImages = Math.max(1, Math.min(30, options.maxImages || 12));
  const concurrency = Math.max(1, Math.min(6, options.concurrency || 2));

  const preparedScreens = screens.map((screen) => ({ ...screen, html: String(screen.html || '') }));
  const slots = extractImageSlots(preparedScreens, {
    appPrompt: options.appPrompt,
    stylePreset,
    platform,
  });

  const cache = loadCache();
  const intentToSrc = new Map<string, string>();
  let generated = 0;
  let reusedFromCache = 0;
  let skipped = 0;

  const uniqueIntents: Array<{ intentKey: string; prompt: string; generate: boolean; originalSrc: string }> = [];
  const seen = new Set<string>();
  for (const slot of slots) {
    if (seen.has(slot.intentKey)) continue;
    seen.add(slot.intentKey);
    uniqueIntents.push({
      intentKey: slot.intentKey,
      prompt: slot.prompt,
      generate: slot.generate,
      originalSrc: slot.src,
    });
  }
  const reusedWithinRun = Math.max(0, slots.length - uniqueIntents.length);

  try {
    const plannerInputIntents = uniqueIntents.slice(0, maxImages).map((intent) => {
      const slot = slots.find((s) => s.intentKey === intent.intentKey);
      return {
        id: intent.intentKey,
        screenName: slot?.screenName || 'Screen',
        alt: slot?.alt || '',
        aspect: slot?.aspect || '1:1',
        srcHint: slot?.src || '',
      };
    });
    const plannerModel = options.preferredModel && options.preferredModel !== 'image'
      ? options.preferredModel
      : 'llama-3.3-70b-versatile';
    const planned = await planImagePrompts({
      appPrompt: options.appPrompt,
      platform,
      stylePreset,
      intents: plannerInputIntents,
      preferredModel: plannerModel,
    });
    uniqueIntents.forEach((intent) => {
      const plannedPrompt = planned.get(intent.intentKey);
      if (plannedPrompt) intent.prompt = plannedPrompt;
    });
  } catch {
    // Fallback to local prompt construction if planner is unavailable.
  }

  await mapWithConcurrency(uniqueIntents.slice(0, maxImages), concurrency, async (intent) => {
    if (!intent.generate) {
      if (intent.originalSrc) {
        intentToSrc.set(intent.intentKey, intent.originalSrc);
      }
      skipped += 1;
      return;
    }

    const cached = cache.items[intent.intentKey];
    if (cached?.src) {
      cached.uses = (cached.uses || 0) + 1;
      intentToSrc.set(intent.intentKey, cached.src);
      reusedFromCache += 1;
      return;
    }

    try {
      const generatedImage = await generateImageAsset({
        prompt: intent.prompt,
        preferredModel: options.preferredModel || 'image',
      });

      intentToSrc.set(intent.intentKey, generatedImage.src);
      cache.items[intent.intentKey] = {
        src: generatedImage.src,
        createdAt: new Date().toISOString(),
        uses: 1,
        prompt: intent.prompt,
      };
      generated += 1;
    } catch {
      if (intent.originalSrc) {
        intentToSrc.set(intent.intentKey, intent.originalSrc);
      }
      skipped += 1;
    }
  });

  if (uniqueIntents.length > maxImages) {
    for (const intent of uniqueIntents.slice(maxImages)) {
      const cached = cache.items[intent.intentKey];
      if (cached?.src) {
        cached.uses = (cached.uses || 0) + 1;
        intentToSrc.set(intent.intentKey, cached.src);
        reusedFromCache += 1;
      } else if (intent.originalSrc) {
        intentToSrc.set(intent.intentKey, intent.originalSrc);
        skipped += 1;
      }
    }
  }

  const slotsByScreen = new Map<number, Array<{ imgIndex: number; src: string }>>();

  for (const slot of slots) {
    const src = intentToSrc.get(slot.intentKey) || slot.src;
    if (!src) {
      skipped += 1;
      continue;
    }
    if (!slotsByScreen.has(slot.screenIndex)) slotsByScreen.set(slot.screenIndex, []);
    slotsByScreen.get(slot.screenIndex)!.push({ imgIndex: slot.imgIndex, src });
  }

  const nextScreens = preparedScreens.map((screen, screenIndex) => {
    const entries = slotsByScreen.get(screenIndex) || [];
    const map = new Map<number, string>();
    entries.forEach((entry) => map.set(entry.imgIndex, entry.src));
    return {
      ...screen,
      html: rewriteScreenHtml(screen.html, map),
    };
  });

  saveCache(cache);

  return {
    screens: nextScreens,
    stats: {
      totalSlots: slots.length,
      uniqueIntents: uniqueIntents.length,
      generated,
      reusedFromCache,
      reusedWithinRun,
      skipped,
    },
  };
}
