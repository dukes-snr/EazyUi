// ============================================================================
// Gemini Service - HTML-Based UI Generation (Google Stitch Approach)
// ============================================================================

import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { v4 as uuidv4 } from 'uuid';
import { groqChatCompletion, isGroqModel } from './groq.provider.js';
import { isNvidiaModel, nvidiaChatCompletion } from './nvidia.provider.js';
import {
    getDefaultGeminiImageModel,
    getDefaultGeminiTextModel,
    isGeminiModelResolutionError,
    normalizeGeminiImageModel,
    normalizeGeminiTextModel,
    resolveGeminiTextFallbackModel,
} from './modelConfig.js';
import { summarizeTokenUsage, type TokenUsageEntry, type TokenUsageSummary } from './tokenUsage.js';

const envCandidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '..', '.env'),
    process.env.INIT_CWD ? path.resolve(process.env.INIT_CWD, '.env') : '',
].filter(Boolean);

const envPath = envCandidates.find(p => fs.existsSync(p));
if (envPath) {
    dotenv.config({ override: true, path: envPath });
    console.info(`[Gemini] Loaded env file: ${envPath}`);
} else {
    console.warn('[Gemini] No .env file found in expected locations');
}

// Initialize the Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const envModel = (process.env.GEMINI_MODEL || '').trim();
const modelName = normalizeGeminiTextModel(envModel || getDefaultGeminiTextModel());
const model = genAI.getGenerativeModel({
    model: modelName,
});
console.info(`[Gemini] Using model: ${modelName} (env: ${envModel || 'unset'})`);

function getGenerativeModel(preferredModel?: string) {
    const requested = (preferredModel || '').trim();
    const resolved = requested.length > 0 ? normalizeGeminiTextModel(requested) : modelName;
    return {
        name: resolved,
        model: genAI.getGenerativeModel({ model: resolved }),
    };
}

function isQuotaOrRateLimitError(error: unknown): boolean {
    const message = (error as Error)?.message || '';
    return (
        message.includes('429') ||
        message.includes('Too Many Requests') ||
        message.includes('quota') ||
        message.includes('Quota exceeded') ||
        message.includes('rate limit') ||
        message.includes('Rate limit')
    );
}

const imagePrimaryEnvModel = (process.env.GEMINI_IMAGE_MODEL || '').trim();
const imageFallbackEnvModel = (process.env.GEMINI_IMAGE_FALLBACK_MODEL || '').trim();
const IMAGE_PRIMARY_MODEL = normalizeGeminiImageModel(imagePrimaryEnvModel || 'gemini-3-pro-image-preview');
const IMAGE_FALLBACK_MODEL = normalizeGeminiImageModel(imageFallbackEnvModel || getDefaultGeminiImageModel());
console.info(`[Gemini] Image edit model: ${IMAGE_PRIMARY_MODEL} (env: ${imagePrimaryEnvModel || 'unset'})`);
console.info(`[Gemini] Image fallback model: ${IMAGE_FALLBACK_MODEL} (env: ${imageFallbackEnvModel || 'unset'})`);

function resolvePreferredModel(preferredModel?: string): string | undefined {
    const requested = (preferredModel || '').trim();
    if (!requested) return undefined;
    if (requested === 'image') return IMAGE_PRIMARY_MODEL;
    return requested;
}

function toNonNegativeInt(value: unknown): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.floor(numeric));
}

function parseGeminiUsageMetadata(
    usageMetadata: any,
    modelUsed: string,
): TokenUsageEntry | undefined {
    if (!usageMetadata || typeof usageMetadata !== 'object') return undefined;
    const inputTokens = toNonNegativeInt(
        usageMetadata.promptTokenCount
        ?? usageMetadata.inputTokenCount
        ?? usageMetadata.inputTokens
    );
    const outputTokens = toNonNegativeInt(
        usageMetadata.candidatesTokenCount
        ?? usageMetadata.outputTokenCount
        ?? usageMetadata.outputTokens
    );
    const totalFromPayload = toNonNegativeInt(
        usageMetadata.totalTokenCount
        ?? usageMetadata.totalTokens
    );
    const totalTokens = totalFromPayload > 0 ? totalFromPayload : inputTokens + outputTokens;
    const cachedInputTokens = toNonNegativeInt(
        usageMetadata.cachedContentTokenCount
        ?? usageMetadata.cachedInputTokenCount
        ?? usageMetadata.cachedTokens
    );
    if (inputTokens <= 0 && outputTokens <= 0 && totalTokens <= 0) return undefined;
    return {
        provider: 'gemini',
        model: String(modelUsed || modelName).trim(),
        inputTokens,
        outputTokens,
        totalTokens,
        ...(cachedInputTokens > 0 ? { cachedInputTokens } : {}),
    };
}

function parseGeminiUsageFromResponse(response: any, modelUsed: string): TokenUsageEntry | undefined {
    return parseGeminiUsageMetadata(
        response?.usageMetadata
        ?? response?.response?.usageMetadata
        ?? response?.candidates?.[0]?.usageMetadata,
        modelUsed,
    );
}


const GENERATION_CONFIG = {
    temperature: 1.0,
    topP: 0.9,
    maxOutputTokens: 16384,
};

function resolveModelTemperature(value: unknown, fallback: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(0, Math.min(2, numeric));
}

function getGenerationConfig(hasReferenceImages: boolean, temperature?: number) {
    const fallbackTemperature = 1;
    const resolvedTemperature = resolveModelTemperature(temperature, fallbackTemperature);
    if (!hasReferenceImages) {
        return {
            ...GENERATION_CONFIG,
            temperature: resolvedTemperature,
        };
    }
    return {
        ...GENERATION_CONFIG,
        temperature: resolvedTemperature,
        topP: 0.85,
    };
}

function resolveDesignSystemPreferredModel(preferredModel?: string): string | undefined {
    const resolved = resolvePreferredModel(preferredModel);
    if (!resolved) return undefined;
    return resolved;
}

function buildDesignSystemGenerationConfig(activeModelName: string, temperature: number, retry = false): any {
    const resolvedTemperature = resolveModelTemperature(temperature, retry ? 0.7 : 0.9);
    const config: any = {
        temperature: retry ? Math.min(resolvedTemperature, 0.7) : Math.min(resolvedTemperature, 0.9),
        topP: 0.85,
        maxOutputTokens: retry ? 4096 : 3200,
        responseMimeType: 'application/json',
    };
    const normalizedName = String(activeModelName || '').toLowerCase();
    if (normalizedName.includes('gemini-3')) {
        config.thinkingConfig = { thinkingBudget: retry ? 128 : 256 };
    } else if (normalizedName.includes('gemini-2.5')) {
        config.thinkingConfig = { thinkingBudget: retry ? 0 : 128 };
    }
    return config;
}

function isUsableDesignSystemPayload(raw: unknown): boolean {
    if (!raw || typeof raw !== 'object') return false;
    const value = raw as Record<string, any>;
    const tokens = value.tokens && typeof value.tokens === 'object' ? value.tokens : null;
    const tokenModes = value.tokenModes && typeof value.tokenModes === 'object' ? value.tokenModes : null;
    const typography = value.typography && typeof value.typography === 'object' ? value.typography : null;
    return Boolean(
        value.systemName &&
        value.intentSummary &&
        tokens?.bg &&
        tokens?.surface &&
        tokens?.accent &&
        tokenModes?.light &&
        tokenModes?.dark &&
        typography?.displayFont &&
        typography?.bodyFont
    );
}

// ============================================================================
// Types
// ============================================================================

export interface StreamChunk {
    type: 'text' | 'screen_start' | 'screen_end' | 'done' | 'error';
    content?: string;
    screenName?: string;
    screenId?: string;
}

export interface HtmlScreen {
    screenId: string;
    name: string;
    html: string;
    width: number;
    height: number;
}

export interface ProjectDesignSystem {
    version: number;
    systemName: string;
    intentSummary: string;
    stylePreset: string;
    platform: string;
    themeMode: 'light' | 'dark' | 'mixed';
    tokens: {
        bg: string;
        surface: string;
        surface2: string;
        text: string;
        muted: string;
        stroke: string;
        accent: string;
        accent2: string;
    };
    tokenModes?: {
        light: {
            bg: string;
            surface: string;
            surface2: string;
            text: string;
            muted: string;
            stroke: string;
            accent: string;
            accent2: string;
        };
        dark: {
            bg: string;
            surface: string;
            surface2: string;
            text: string;
            muted: string;
            stroke: string;
            accent: string;
            accent2: string;
        };
    };
    typography: {
        displayFont: string;
        bodyFont: string;
        scale: {
            display: string;
            h1: string;
            h2: string;
            body: string;
            caption: string;
        };
        tone: string;
    };
    spacing: {
        baseUnit: number;
        density: string;
        rhythm: string;
    };
    radius: {
        card: string;
        control: string;
        pill: string;
    };
    shadows: {
        soft: string;
        glow: string;
    };
    componentLanguage: {
        button: string;
        card: string;
        input: string;
        nav: string;
        chips: string;
    };
    motion: {
        style: string;
        durationFastMs: number;
        durationBaseMs: number;
    };
    rules: {
        do: string[];
        dont: string[];
    };
}

export interface HtmlDesignSpec {
    id: string;
    name: string;
    screens: HtmlScreen[];
    description?: string;
    designSystem?: ProjectDesignSystem;
    createdAt: string;
    updatedAt: string;
}

function normalizeUiDescriptionTags(input?: string): string | undefined {
    if (!input) return input;
    return input
        .replace(/<\s*h2[^>]*>/gi, '[h2]')
        .replace(/<\s*\/\s*h2\s*>/gi, '[/h2]')
        .replace(/<\s*h3[^>]*>/gi, '[h3]')
        .replace(/<\s*\/\s*h3\s*>/gi, '[/h3]')
        .replace(/<\s*p[^>]*>/gi, '[p]')
        .replace(/<\s*\/\s*p\s*>/gi, '[/p]')
        .replace(/<\s*li[^>]*>/gi, '[li]')
        .replace(/<\s*\/\s*li\s*>/gi, '[/li]')
        .replace(/<\s*b[^>]*>/gi, '[b]')
        .replace(/<\s*\/\s*b\s*>/gi, '[/b]')
        .replace(/<\s*i[^>]*>/gi, '[i]')
        .replace(/<\s*\/\s*i\s*>/gi, '[/i]')
        // Remove wrapper list tags; chat renderer only needs [li] blocks.
        .replace(/<\s*\/?\s*ul[^>]*>/gi, '')
        .replace(/<\s*\/?\s*ol[^>]*>/gi, '')
        .trim();
}

// ============================================================================
// System Prompts
// ============================================================================

const TOKEN_CONTRACT = `
TOKENS (MANDATORY):
Each screen MUST include the project Tailwind token palette INSIDE <head>:

<script>
  tailwind.config = {
    darkMode: "class",
    theme: {
      extend: {
        colors: {
          bg:     "#........",
          surface:"#........",
          surface2:"#........",
          text:   "#........",
          muted:  "#........",
          stroke: "#........",
          accent: "#........",
          accent2:"#........"
        },
        fontFamily: {
          display: ["...", "Plus Jakarta Sans", "sans-serif"],
          sans: ["Plus Jakarta Sans", "sans-serif"]
        },
        borderRadius: {
          xl: "18px",
          "2xl": "24px"
        },
        boxShadow: {
          soft: "0 12px 34px rgba(0,0,0,.28)",
          glow: "0 20px 60px rgba(0,0,0,.22)"
        }
      }
    }
  }
</script>

TOKEN USAGE RULES:
- Do NOT use Tailwind default grays (no text-gray-*, bg-gray-*, slate-*, zinc-*).
- Use semantic tokens instead: bg-bg, bg-surface, text-text, text-muted, border-stroke, bg-accent, etc.
- Reuse one coherent project design system across all screens in the same generation. Do NOT invent unrelated palettes per screen.
- Accent usage must be restrained: only primary CTAs, key highlights, and active states.
- Do NOT define nested 'colors.dark = {...}' objects inside tailwind.config colors; this causes broken theme behavior.
- Prefer semantic token classes with dark variants that map to dark token values; avoid brittle hardcoded dark hex classes.
- Put critical first-paint theme CSS in a normal <style> tag inside <head>:
  - define :root token variables there
  - define .dark overrides there when needed
  - define body background/text/font defaults there
- Do NOT rely only on <style type="text/tailwindcss"> for token variables or body base styles.
`;

const THEME_AWARENESS_RULES = `
THEME AWARENESS (MANDATORY):
- Designs must remain readable in both light and dark mode variants.
- Do NOT hardcode fragile pairs like text-white on white surfaces or text-black on near-black surfaces.
- Avoid fixed icon/text colors on buttons unless contrast is verified; prefer semantic token-based foregrounds.
- For controls/chips/buttons, explicitly ensure icon + label contrast against their background in both modes.
- Only use raw white/black text for intentional overlays on media (hero images/video), not for core controls.
`;

const IMAGE_WHITELIST = `
IMAGES (WEB URL POLICY):
- If explicit scraped/reference image URLs are provided in the prompt, you may use those exact URLs directly for matching <img src> values.
- Prefer scraped/reference image URLs over generic Unsplash substitutions when the request is based on a referenced site and the image matches the screen context.
- If no explicit reference image URL is suitable for a non-map visual, then use Unsplash image URLs (https://images.unsplash.com/photo-...).
- Do NOT use placeholder.net for non-map content.
- Keep image choices tightly aligned to UI context (domain, component purpose, and nearby copy).
- Prefer stable Unsplash photo URLs (not random endpoints) and include quality params like:
  ?auto=format&fit=crop&w=1200&q=80
- If an <img> has alt text, the selected image subject must closely match that alt text.
- Avoid visually generic or mismatched photos (e.g., random office scenes in food/travel/fitness flows).
- For maps/location visuals only, use placeholder map URLs from placehold.net:
  - https://placehold.net/map-400x400.png
  - https://placehold.net/map-600x600.png
  - https://placehold.net/map-400x600.png
  - https://placehold.net/map-600x400.png
  - https://placehold.net/map-1200x600.png
`;

const ANTI_GENERIC_RULES = `
ANTI-GENERIC DESIGN RULES (MANDATORY):
- Each screen must include ONE signature motif repeated at least 4 times (choose 1):
  (A) glass panels (bg-white/5 + backdrop-blur)
  (B) outline cards (border border-stroke + subtle inner shadow)
  (C) angled separators / diagonal section edges
  (D) capsule chips with icon + label
  (E) "sticker" badges pinned to corners

- At least 2 screens must use asymmetry (e.g. 7/5 split, offset collage, overlapping elements).
- Typography must show editorial hierarchy: at least 5 distinct sizes (e.g. 48/32/24/18/14) and tight tracking on headings.
- Use an 8pt spacing system: only multiples of 2 in Tailwind spacing (p-4, p-6, p-8, gap-4, gap-6, etc.).
- Avoid "header + list + grid" templates. Use a focal hero with layered depth on each main screen.
`;

const COMPONENT_CRAFT_RULES = `
COMPONENT CRAFTSMANSHIP (MANDATORY):
- Build each screen with a deliberate 4-zone scaffold:
  1) top utility/header zone
  2) primary focal module (hero/stat/media)
  3) supporting modules (cards/list/chips)
  4) persistent action zone (CTA/nav/sheet) when applicable
- Use mixed module scales (hero + standard + compact), not a uniform stack of equal cards.
- Reuse a consistent component anatomy across modules (meta/eyebrow, title/value, support text, utility affordance).
- Keep a clear 3-second scan path: headline -> primary metric/CTA -> supporting context.
- Keep accent use restrained and meaningful: one main accent + one secondary accent max for emphasis.
- Header-like top overlays must be marked with data-eazyui-safe-top="force" even when the element is a div.
- Major wrappers should be purpose-labeled (id/data-uid names like "top-controls", "hero-card", "primary-cta"), not anonymous repeated containers.
`;

const NO_IMAGE_REFERENCE_QUALITY_RULES = `
NO-REFERENCE MODE QUALITY BAR (MANDATORY WHEN NO IMAGES ARE ATTACHED):
- Even without reference images, produce reference-grade craft comparable to top portfolio/mobile design showcases.
- Choose one strong visual direction and execute it consistently; avoid safe/generic defaults.
- Prioritize component architecture quality over decoration: focal module, supporting modules, and clear action hierarchy.
- Do not fall back to generic "header + equal cards + bottom nav" templates.
- Ensure each screen has one memorable focal moment (hero metric/media/feature card) plus clean supporting structure.
`;

const EDIT_TAGGING_RULES = `
EDIT MODE TAGGING (MANDATORY):
- Add data-editable="true" and data-uid="unique_id" to ALL major UI elements.
- Major elements include: header, nav, main, section, article, aside, footer, div, p, span, h1-h6, button, a, img, input, textarea, select, label, ul, ol, li, figure, figcaption, form, table, thead, tbody, tr, td, th.
- data-uid values must be unique within each screen (any stable unique string is fine).
- Every <img> MUST include a meaningful, contextual alt attribute (this would serve as propmts for image generation).
- Alt text quality rules:
  1) Include app/domain context + screen context + visual subject.
  2) 6-16 words preferred.
  3) Do NOT use one-word or vague alts like "image", "photo", "cook", "salad", "recipe view".
  4) Good format example: "Meal planning app recipe detail hero image with fresh salad bowl".
`;

const MAP_SCREEN_RULES = `
MAP SCREENS (MANDATORY RULES):
- Do NOT use Google Maps/Mapbox scripts or API keys.
- Do NOT use external map SDK scripts in generated HTML.
- Use a map placeholder image for initial render, e.g.:
  - https://placehold.net/map-600x400.png
  - https://placehold.net/map-1200x600.png
- You may overlay pins/routes/chips/search UI over the placeholder map.
- Include at least 1-3 pins, one search UI, and a bottom sheet or pinned place card where relevant.
- Ensure proper contrast over map surfaces (cards/chips/text must remain legible).
`;

const ICON_POLICY_RULES = `
ICONS (MANDATORY):
- For brand icons (Google, Facebook, Apple, GitHub, X/Twitter, LinkedIn, Instagram), use Iconify with Simple Icons.
- Include this script in <head> when brand icons are present:
  <script src="https://code.iconify.design/iconify-icon/2.1.0/iconify-icon.min.js"></script>
- Brand icon example:
  <iconify-icon icon="simple-icons:google" width="20" height="20"></iconify-icon>
- Do NOT output text placeholders like LOGO_GOOGLE, LOGO_FACEBOOK, BRAND_ICON, or icon names as plain text.
- For non-brand interface icons, use Material Symbols Rounded.
`;

const DEVICE_CHROME_RULES = `
DEVICE CHROME (MANDATORY):
- Do NOT design or render a mobile OS status bar inside screen HTML.
- Prohibited status-bar elements include: time text (e.g., 9:41), signal/wifi/battery icons, notch-only rows, or any top strip that mimics OS chrome.
- The runtime device node renders a transparent status bar overlay globally. Your HTML must start with app content only.
- Do NOT add fake status-bar backgrounds or top strips.
`;

const SAFE_TOP_LAYOUT_RULES = `
SAFE TOP LAYOUT (MANDATORY):
- Assume a transparent status bar overlay sits on top of content.
- Keep hero/image backgrounds full-bleed to the top edge when needed.
- Put top controls (back/search/menu/header actions) inside a dedicated top controls container near the top.
- Mark that container with: data-eazyui-safe-top="force"
- If an element must never be shifted by runtime safe-top handling, mark it with: data-eazyui-safe-top="off"
- Do NOT hardcode brittle fixed top offsets that fight runtime safe-area handling.
- If you use a fixed or sticky top header/nav/app-bar, the main content MUST start below it.
- Add top offset on the first content wrapper using padding or margin at least equal to header height
  (e.g., header h-14/h-16 => content pt-28/pt-32 or mt-28/mt-32).
- Never let first visible content render under a fixed header.
`;

const GENERATE_HTML_PROMPT = `You are a senior product UI designer and front-end UI engineer creating reference-grade HTML UI screens.

PRIMARY GOAL:
Generate a set of complete, professional, human-like product screens with strong visual hierarchy, believable product thinking, and runtime-safe HTML.

REQUIREMENTS:
1. Output a JSON object with the following structure:
{
  "description": "The designs for your [app name] have been generated:\\n- Screen name (use b tags for screen name): [Brief one-sentence summary]\\n- Screen 2 name (use b tags for screen name): [Brief one-sentence summary]",
  "screens": [
    {
      "name": "Screen Name (e.g. Login, Home)",
      "html": "<!DOCTYPE html><html><head>...</head><body>...</body></html>"
    }
  ]
}
2. EVERY HTML screen must be a COMPLETE, standalone HTML document with its opening and closing tags(including <!DOCTYPE html>, <html>, <head>, and <body>).
3. DESCRIPTION FORMAT: The "description" is MANDATORY and must be extremely CONCISE but written as a ui/ux designer (dont be too technical). 
   - Start with: "The designs for your [app name] have been generated:"
   - List each screen as a bullet point: "- [Screen Name]: [One sentence summary]."
   - Also include structured display tags so UI can style content:
     [h2]Section title[/h2], [p]Paragraph[/p], [li]List item[/li], [b]Bold[/b], [i]Italic[/i]
   - Keep tags balanced and valid. Prefer [h2] + multiple [li] lines for summaries.
   - PROHIBITED: Do NOT write long prose, "walkthroughs", or logic explanations.
4. Create a maximum of 4 screens for a cohesive user flow.
5. Use Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
6. Use Google Fonts: include Plus Jakarta Sans + ONE display font via Google Fonts.
7. Use Material Symbols: <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0" />
8. Do NOT use SVGs or any other icon system. Material Symbols are MANDATORY: <span class="material-symbols-rounded">icon_name</span>.
9. Return ONLY the JSON object.
10. STRICT: Do NOT wrap JSON in markdown code fences. No \`\`\`json and no \`\`\`.

QUALITY BAR:
- These screens should feel like they were designed by a strong product designer, not assembled from a generic app template.
- Prioritize clarity, hierarchy, and believable product thinking over decorative noise.
- Each screen must feel purposeful for the requested product domain, with content, modules, and interactions that make sense for that app.

PLAN SILENTLY BEFORE YOU DESIGN:
- Decide what makes this product specific before writing HTML.
- Choose one dominant focal module per screen: hero media, hero stat, hero control, hero card, or hero chart.
- Decide the supporting modules around that focal point.
- Reuse one coherent design system, component language, and visual tone across the whole set.

DESIGN PHILOSOPHY (CRITICAL — follow these strictly):
You are designing screens that would win awards on Dribbble or Behance. Before writing any code, THINK about what makes this specific app unique and design accordingly.

THINK BEFORE YOU DESIGN:
- What is the app's personality? A finance app should feel trustworthy and clean. A music app should feel vibrant and expressive. A food app should feel warm and appetizing.
- What emotions should the user feel? Design around that feeling, not around a generic template.
- A focal point can be hero media, a bold stat, a featured card, a chart, or a control cluster, but it must be obvious at first glance.
- Each screen should have a clear visual focal point — a hero image, a bold stat, a featured card — NOT just a list of items.

NAVIGATION - CONTEXT-AWARE & PLATFORM-SPECIFIC:
- Let the navigation pattern be decided by the product context and each screen's purpose.
- You may use bottom tabs, top tabs, sidebar, top header, contextual back navigation, or no global navigation.
- Keep navigation usable and accessible, and avoid forcing one identical nav pattern on every screen.
- Only vary navigation when it improves UX for the screen's role; do not change navigation styles randomly just to create variety.
- Detail screens usually need contextual back navigation; splash/welcome screens may omit navigation.
- For Desktop/Tablet, avoid mobile-styled floating nav bars unless the user explicitly requests them.

LAYOUT COMPOSITION — NOT TEMPLATES:
- Design each screen like an editorial page, NOT a form or a list.
- Use asymmetric layouts: mix full-width hero sections with offset cards, overlapping elements, and varied column widths.
- Create visual hierarchy with SIZE CONTRAST: one large featured item alongside smaller supporting items, not a grid of identical cards.
- Give one module clear dominance and let supporting modules stay visibly secondary. Do NOT give every card equal size, weight, and emphasis.
- Use full-bleed images with gradient overlays (bg-gradient-to-t from-black/80 via-black/40 to-transparent) as hero sections.
- Stack content in interesting ways: overlap an avatar over a header, float a price badge over an image, use negative margins creatively.
- Vary card sizes within the same screen — one tall card next to two short ones, horizontal scrollable chips, etc.

MODERN DEPTH & GLASSMORPHISM:
- Use backdrop-blur-xl with semi-transparent backgrounds (bg-white/10 dark:bg-black/40) for sticky navs, sidebars, and overlays.
- Add subtle borders to glass elements to make them pop (border border-white/20 or border-white/10).
- Layer elements with colored, soft shadows that match the theme (e.g., shadow-[0_8px_30px_rgb(0,0,0,0.12)] or colored shadows like shadow-accent/20). Avoid default, harsh black shadows unless requested.
- Create visual depth: Background Layer -> Glass/Surface Layer -> Content Layer -> Floating UI Layer.

TYPOGRAPHY & SPACING:
- Use a TWO-FONT pairing: a display font (font-display) for hero headings + Plus Jakarta Sans (font-sans) for body/meta.
- Use bold, large display headings (text-3xl or text-4xl, font-bold) with tracking-tight for screen titles.
- Create clear hierarchy: title → subtitle → body → caption, each with distinct size and opacity.
- Use generous spacing: p-6 minimum on containers, space-y-5 or space-y-6 between sections.
- Add leading-relaxed for body text readability.

CONTENT REALISM:
- Use believable product microcopy, labels, and metadata that match the prompt. Avoid filler names such as "Lorem ipsum", "Product Name", "Item 1", or vague placeholder stats.
- Make modules feel product-aware: finance should show credible financial labels; travel should show destination/date/price patterns; health should show plausible wellness metrics; creative tools should show project-oriented actions.
- Buttons, tabs, filters, chips, and summaries should sound intentional and human, not generic template UI.

VISUAL RICHNESS:
- Use large border-radius: rounded-2xl for cards, rounded-3xl for containers, rounded-full for avatars, pills, and tags.
- Use colored accent borders or rings (e.g. ring-2 ring-purple-500/30) to highlight interactive elements.
- Add subtle state indicators: active dots, progress bars, status badges with colored backgrounds.
- Use emoji or styled badges for engagement (ratings, tags, status).
- Keep the final feel polished and professional; use badges or icon accents only when they fit the product language.

PROHIBITED PATTERNS:
- No plain white or plain gray backgrounds with basic colored buttons.
- No uniform grid of identical cards (vary sizes, add a featured/hero card).
- No basic unstyled list views without imagery or visual hierarchy.
- No screens that look like default Bootstrap, Material Design, or generic HTML templates.
- No identical navigation bars stamped onto every single screen.

STYLING & CONTENT:
- THEME & COLOR: You MUST decide the colors and overall theme (light, dark, or vibrant). Use the token contract.
- Choose a deliberate, domain-appropriate palette with at least one interesting neutral and one purposeful accent direction. Avoid generic startup blue/purple defaults unless they clearly fit the product.
- ALWAYS prefer CSS Gradients for containers and decorative elements.

${TOKEN_CONTRACT}
${THEME_AWARENESS_RULES}
${IMAGE_WHITELIST}
${ANTI_GENERIC_RULES}
${COMPONENT_CRAFT_RULES}
${ICON_POLICY_RULES}
${DEVICE_CHROME_RULES}
${SAFE_TOP_LAYOUT_RULES}
${EDIT_TAGGING_RULES}
${MAP_SCREEN_RULES}

FINAL INTERNAL CHECKS BEFORE OUTPUT:
- Verify every screen has a dominant focal module and does not read like a repeated card stack.
- Verify colors feel intentional for the product domain and are consistent across the full set.
- Verify microcopy is specific, believable, and not generic placeholder text.
- Verify the HTML is complete and the JSON is valid.
`;

const GENERATE_STREAM_PROMPT = `You are a senior product UI designer and front-end UI engineer. Stream the output using XML blocks.

PRIMARY GOAL:
Generate complete, professional, human-like product screens with strong hierarchy, believable microcopy, and runtime-safe HTML.

STRUCTURE RULE (STRICT):
1. You MAY emit short progress updates using <activity> blocks before the first <screen>, between <screen> blocks, and after the final <screen>.
2. Never place <activity> inside a <screen> block or inside the HTML of a screen.
3. Output exactly ONE <description> block after ALL screens.
4. The description must be a concise bulleted summary of ALL screens (e.g. "The designs for [app] have been generated:\\n- Screen 1: [Summary]\\n- Screen 2: [Summary]").
   - Include UI display tags in description for rich rendering:
     [h2]...[/h2], [p]...[/p], [li]...[/li], [b]...[/b], [i]...[/i]
5. DO NOT repeat the <description> block.
6. Every <screen> MUST end with a closing </screen> tag.
7. Do NOT end output until ALL </screen> tags are closed.
8. After the final </description>, output <done/> on its own line.
9. If unsure, repeat the final </screen> and then stop.

ACTIVITY RULES:
- At the very start of the response, emit the full plan as 3-7 <activity> blocks before the first <screen>.
- The initial plan activities should describe every major step you intend to take and should usually be "pending", with the first active step marked "in-progress".
- Reuse the exact same "id" for later updates when a step becomes "completed" or when the next step becomes "in-progress".
- Use <activity> to report meaningful generation progress the UI can show to the user.
- Keep each activity line short, concrete, and human-readable.
- Allowed statuses: pending, in-progress, completed, need-help, failed.
- Allowed types include: analysis, planning, reference, screen, finalize, system.
- Reuse the same type for similar work so the client can style it consistently.
- Prefer updates such as "Analyzing the product direction", "Generating the Home screen", "Finished the Home screen", "Finished screens".
- If the activity refers to a specific screen, include target="Screen Name".
- Include order="1", order="2", etc. on the initial plan so the client can preserve the full sequence.
- Keep activity text outside the HTML document content.

<activity id="analysis-1" order="1" type="analysis" status="completed">Analyzed the product direction</activity>
<activity id="screen-home" order="2" type="screen" status="in-progress" target="Home">Generating the Home screen</activity>
<screen name="Screen Name">
<!DOCTYPE html>
<html>
<head>
    <!-- Include ALL mandatory links (Tailwind, Fonts, Material Symbols) and tailwind.config here -->
</head>
<body>
    <!-- Content must MATCH the screen name -->
</body>
</html>
</screen>
<activity id="screen-home" type="screen" status="completed" target="Home">Finished the Home screen</activity>
<activity id="finalize-all" type="finalize" status="completed">Finished screens</activity>
<description>
[Concise summary of all screens]
</description>

MANDATORY ASSETS:
- Tailwind CDN: <script src="https://cdn.tailwindcss.com"></script>
- Fonts: include Plus Jakarta Sans + one display font via Google Fonts
- Material Symbols Rounded

QUALITY BAR:
- These screens should feel like a considered product design system, not a generic HTML template.
- Prioritize hierarchy, clarity, and product-specific composition over decorative clutter.
- Reuse one coherent visual language across the whole set.

PLAN SILENTLY BEFORE OUTPUT:
- Decide what makes the product specific before writing HTML.
- Choose one dominant focal module per screen: hero media, hero stat, hero control, hero card, or hero chart.
- Decide which modules support that focal point.
- Keep navigation, module anatomy, and color direction coherent across the set.

DESIGN PHILOSOPHY (CRITICAL):
Design award-winning screens. THINK about what makes this app unique before coding.

THINK FIRST:
- What is the app's personality? Finance = trustworthy. Music = vibrant. Food = warm. Design around that feeling.
- A focal point can be hero media, a bold stat, a featured card, a chart, or a control cluster, but it must be obvious at first glance.
- Each screen needs a clear visual focal point — a hero image, a bold stat, a featured card — NOT just a list.

NAVIGATION - CONTEXT-AWARE & PLATFORM-SPECIFIC:
- Let navigation be chosen from product context and each screen's role.
- Allowed patterns include bottom tabs, top tabs, sidebars, top headers, contextual back nav, or no global nav.
- Avoid repeating one identical nav style on every screen.
- Only vary navigation when it improves UX for the screen's role; do not vary it randomly for visual novelty.
- Detail screens usually need back navigation; splash/welcome screens may omit nav.
- For Desktop/Tablet, avoid mobile-styled floating nav bars unless explicitly requested.

LAYOUT COMPOSITION:
- Design like an editorial page, NOT a form or list.
- Use asymmetric layouts: full-width hero + offset cards, overlapping elements, varied card sizes.
- SIZE CONTRAST: one large featured item with smaller supporting items, not identical card grids.
- Give one module clear dominance and let the other modules support it. Do NOT make all modules equal in scale or emphasis.
- Full-bleed images with gradient overlays as hero sections.
- Overlap elements creatively: avatar over header, price badge over image.

MODERN DEPTH & GLASSMORPHISM:
- Use backdrop-blur-xl with semi-transparent backgrounds (bg-white/10 dark:bg-black/40) for sticky navs, sidebars, and overlays.
- Add subtle borders to glass elements to make them pop (border border-white/20 or border-white/10).
- Layer elements with colored, soft shadows that match the theme (e.g., shadow-[0_8px_30px_rgb(0,0,0,0.12)] or colored shadows like shadow-accent/20). Avoid default, harsh black shadows unless requested.
- Create visual depth: Background Layer -> Glass/Surface Layer -> Content Layer -> Floating UI Layer.

TYPOGRAPHY: Use font-display for hero headings and font-sans for body. Bold headings (text-3xl+, tracking-tight), clear hierarchy, generous spacing (p-6+, space-y-5+).

CONTENT REALISM:
- Use believable product microcopy, labels, filters, metadata, and values that match the requested domain.
- Avoid filler names like "Lorem ipsum", "Item 1", "Product Name", or vague placeholder KPIs.
- Buttons, chips, tabs, and summaries should sound intentional and human.

PROHIBITED:
- No plain white/gray backgrounds with basic colored buttons unless needed or requested.
- No uniform grids of identical cards. Vary sizes, add featured items.
- No generic Bootstrap/Material Design templates.
- Avoid generic startup blue/purple palettes unless the product clearly calls for them.

${TOKEN_CONTRACT}
${THEME_AWARENESS_RULES}
${IMAGE_WHITELIST}
${ANTI_GENERIC_RULES}
${COMPONENT_CRAFT_RULES}
${ICON_POLICY_RULES}
${DEVICE_CHROME_RULES}
${SAFE_TOP_LAYOUT_RULES}
${EDIT_TAGGING_RULES}
${MAP_SCREEN_RULES}

Follow the same STYLING, IMAGE, and MATERIAL SYMBOL rules as the standard generation. 
CRITICAL: The <screen name="..."> attribute MUST match the actual HTML content of that screen!
CRITICAL: Every <screen> block MUST be a COMPLETE HTML document.
FINAL INTERNAL CHECKS BEFORE OUTPUT:
- Verify every screen has a dominant focal module and supporting modules with clear hierarchy.
- Verify colors are coherent across the set and feel intentional for the product domain.
- Verify microcopy is specific and believable.
Do NOT use markdown fences.`;

const COMPLETE_PARTIAL_SCREEN_PROMPT = `You repair and complete partially streamed HTML screens.

TASK:
- You will receive a partial HTML document for one screen.
- Return ONE complete HTML document only.

RULES:
1. Output ONLY HTML (no markdown, no prose).
2. Must include <!DOCTYPE html>, <html>, <head>, <body>, and closing tags.
3. Preserve and continue the existing design direction and content as much as possible.
4. Keep Tailwind CDN, Google Fonts, Material Symbols, and token contract in <head>.
5. Keep critical first-paint theme CSS in a normal <style> tag; do not rely only on <style type="text/tailwindcss"> for :root/.dark/body base styles.
6. For map/location visuals, use placehold.net map URLs. For non-map visuals, use Unsplash URLs only (https://images.unsplash.com/photo-...).
7. Respect runtime transparent status-bar overlay safe-area behavior:
   - no OS status bar row
   - no fake top strip background
   - top controls container should use data-eazyui-safe-top="force" when present.
   - if using fixed/sticky top header/nav, first content block must start below it (use pt/mt offset ~= header height).
`;

const EDIT_HTML_PROMPT = `You are an expert UI designer. Edit the existing HTML.
1. Modify the HTML to satisfy the user instruction.
2. Return:
   <description>[One to two concise sentences summarizing what changed and why]</description>
   followed by the complete, modified HTML document.
3. Preserve all <head> imports and the token contract (tailwind.config with semantic tokens).
4. Keep critical first-paint theme CSS in a normal <style> tag; do not move :root/.dark/body base styles exclusively into <style type="text/tailwindcss">.
5. Preserve data-uid and data-editable attributes on existing elements.
6. You MAY restructure layout to achieve the instruction.
7. For map/location visuals, use placehold.net map URLs. For non-map visuals, use Unsplash URLs only (https://images.unsplash.com/photo-...).
8. Do NOT design or include a mobile OS status bar (time/signal/wifi/battery row). Device chrome is provided by runtime.
9. Do NOT use markdown fences.
10. Keep all interactive controls theme-aware across light/dark; avoid hardcoded white/black icon-text pairs that can become unreadable.
11. Safe-top behavior: assume transparent status-bar overlay; keep hero/media full-bleed and mark top controls wrappers with data-eazyui-safe-top="force". Use data-eazyui-safe-top="off" only where shifting must be disabled.
12. If using fixed/sticky top header/nav, ensure first content section has top padding/margin at least the header height so content is not hidden behind the header.

Current HTML:
`;

const FAST_GENERATE_HTML_PROMPT = `Return STRICT JSON only:
{
  "description":"1 short sentence using [h2]/[li] tags",
  "screens":[{"name":"Screen Name","html":"<!DOCTYPE html>...</html>"}]
}
Rules:
- Exactly 1 main screen only.
- Each screen must be complete HTML with <!DOCTYPE html>, <html>, <head>, <body>.
- MUST include exactly this Tailwind loader in <head>: <script src="https://cdn.tailwindcss.com"></script>
- Include Plus Jakarta Sans + one display font, and Material Symbols Rounded.
- Do NOT use Tailwind stylesheet links like cdn.jsdelivr tailwind.min.css.
- Keep HTML compact but premium (no comments/long paragraphs).
- Build a premium mobile composition with: hero/header, search or filter controls, one featured card, one secondary recommendations module, and sticky CTA.
- Use clear hierarchy with a display heading + supporting text + metadata + emphasized CTA.
- Compose screen structure with explicit zones: top utility, focal hero, supporting modules, persistent action.
- Use mixed module scales (hero + standard + compact). Avoid same-sized card stacks.
- Choose one dominant focal module and keep the rest visibly secondary.
- Use reusable component anatomy (meta/title/value/action) and purpose labels for major wrappers.
- Add depth with at least 2 of: gradient background, glass/blur panel, soft shadow, layered overlap.
- Use prompt-specific labels; no filler copy (no "Lorem ipsum", "Item 1", "Product Name").
- Define tailwind.config theme.extend.colors with semantic tokens: bg, surface, text, muted, accent.
- Put :root/.dark token variables and body base background/text/font defaults in a normal <style> tag in <head>.
- Do NOT rely only on <style type="text/tailwindcss"> for first-paint theme CSS.
- Use those semantic tokens for major surfaces and CTA.
- Keep colors domain-appropriate and avoid generic startup blue/purple defaults unless the prompt clearly supports them.
- Keep icon/text contrast readable in both light and dark modes; avoid brittle text-white/text-black defaults on controls.
- Avoid invented class names that are not valid Tailwind utilities.
- Brand icons must use Iconify + Simple Icons (never placeholder text like LOGO_GOOGLE).
- Do NOT include mobile OS status bar rows (time/signal/wifi/battery); runtime provides this chrome.
- Assume transparent status-bar overlay; do not add fake top strip backgrounds.
- Put top controls/header action wrappers in a container with data-eazyui-safe-top="force".
- If header/nav is fixed or sticky at top, offset first content container with matching top spacing (e.g., pt-14/pt-16 or mt-14/mt-16).
- Do not include reasoning, analysis, notes, or planning text.
- No markdown fences.
`;

const FAST_GENERATE_HTML_PROMPT_COMPACT = `Return STRICT JSON only:
{
  "description":"1 short sentence using [h2]/[li] tags",
  "screens":[{"name":"Screen Name","html":"<!DOCTYPE html>...</html>"}]
}
Rules:
- Exactly 1 main screen only.
- Complete HTML document required.
- Include: <script src="https://cdn.tailwindcss.com"></script>
- Include Plus Jakarta Sans + one display font + Material Symbols Rounded.
- Put :root/.dark token variables and body base background/text/font defaults in a normal <style> tag in <head>.
- Build only core blocks: hero, control row, featured card, secondary list, sticky CTA.
- Keep explicit zone hierarchy: top utility, focal hero, supporting modules, persistent action.
- Mix module scales; avoid equal-height repeated cards.
- Choose one dominant focal module and keep the supporting modules visually secondary.
- Keep markup concise and visually rich; avoid long repeated sections.
- Keep labels and microcopy believable for the requested product; no filler placeholders.
- Do NOT include a mobile OS status bar row (time/signal/wifi/battery).
- Assume transparent status-bar overlay; keep hero/media full-bleed and use data-eazyui-safe-top="force" for top controls container.
- If header/nav is fixed or sticky at top, offset first content container with matching top spacing so content starts below the header.
- No reasoning or markdown.
`;
const FAST_EDIT_HTML_PROMPT = `Edit the HTML to match the user instruction.
Return:
<description>one concise sentence</description>
then the complete updated HTML document.
Rules:
- Keep full valid HTML document.
- Keep critical first-paint theme CSS in a normal <style> tag; do not rely only on <style type="text/tailwindcss"> for :root/.dark/body base styles.
- Keep existing data-uid and data-editable attributes where present.
- Brand icons must use Iconify + Simple Icons (no placeholder text).
- Do NOT include mobile OS status bar UI (time/signal/wifi/battery row).
- Respect transparent status-bar overlay safe-top behavior; top controls wrappers should use data-eazyui-safe-top="force" when appropriate.
- No markdown fences.
`;

const STREAM_EDIT_HTML_PROMPT = `You are an expert UI designer. Edit the existing HTML.
Return ONLY the complete updated HTML document.
Rules:
1. Output HTML only. No description, no prose, no markdown.
2. Keep a full valid HTML document with <!DOCTYPE html>, <html>, <head>, <body>.
3. Preserve all <head> imports and the token contract (tailwind.config with semantic tokens).
4. Keep critical first-paint theme CSS in a normal <style> tag; do not move :root/.dark/body base styles exclusively into <style type="text/tailwindcss">.
5. Preserve data-uid and data-editable attributes on existing elements.
6. You MAY restructure layout to satisfy the user instruction.
7. For map/location visuals, use placehold.net map URLs. For non-map visuals, use Unsplash URLs only (https://images.unsplash.com/photo-...).
8. Do NOT design or include a mobile OS status bar (time/signal/wifi/battery row). Device chrome is provided by runtime.
9. Keep all interactive controls theme-aware across light/dark.
10. Safe-top behavior: assume transparent status-bar overlay; keep hero/media full-bleed and mark top controls wrappers with data-eazyui-safe-top="force". Use data-eazyui-safe-top="off" only where shifting must be disabled.
11. If using fixed/sticky top header/nav, ensure first content section has top padding/margin at least the header height so content is not hidden behind the header.

Current HTML:
`;

const FAST_UNSPLASH_IMAGE_RULES = `
Fast image policy:
- If explicit scraped/reference image URLs are provided in the prompt, you may use those exact URLs directly for matching <img src> values.
- Prefer scraped/reference image URLs over generic Unsplash substitutions when they fit the requested component/screen.
- If no explicit reference image URL fits, use Unsplash image URLs for non-map images (https://images.unsplash.com/photo-...).
- Ensure each chosen photo context matches the component purpose and alt text.
- Prefer stable photo URLs with params like ?auto=format&fit=crop&w=1200&q=80.
- Map placeholders:
  - https://placehold.net/map-400x400.png
  - https://placehold.net/map-600x600.png
  - https://placehold.net/map-400x600.png
  - https://placehold.net/map-600x400.png
  - https://placehold.net/map-1200x600.png
- Do NOT use placeholder.net for non-map content.
`;

const FAST_MAP_IMAGE_FALLBACKS = [
    'https://placehold.net/map-1200x600.png',
    'https://placehold.net/map-600x400.png',
    'https://placehold.net/map-400x600.png',
    'https://placehold.net/map-600x600.png',
    'https://placehold.net/map-400x400.png',
] as const;

const PLACEHOLDER_MAP_ALLOWED = [...FAST_MAP_IMAGE_FALLBACKS] as const;


// ============================================================================
// Platform Dimensions
// ============================================================================

const PLATFORM_DIMENSIONS: Record<string, { width: number; height: number }> = {
    mobile: { width: 402, height: 874 },
    tablet: { width: 768, height: 1024 },
    desktop: { width: 1280, height: 1200 },
    watch: { width: 184, height: 224 },
};

// ============================================================================
// Generation Logic
// ============================================================================

export interface GenerateOptions {
    prompt: string;
    stylePreset?: string;
    platform?: string;
    images?: string[];
    assetRefs?: AssetReference[];
    preferredModel?: string;
    temperature?: number;
    projectDesignSystem?: ProjectDesignSystem;
}

export interface AssetReference {
    assetId: string;
    name: string;
    scope: 'project' | 'account';
    kind: 'image' | 'logo' | 'component';
    downloadUrl: string;
    mimeType: string;
    projectId?: string;
    width?: number;
    height?: number;
    role?: 'logo' | 'product-shot' | 'illustration' | 'photo' | 'brand-texture';
    pinned?: boolean;
    isPreferredLogo?: boolean;
    isKeyBrandAsset?: boolean;
    source: 'saved_attachment' | 'project_brand';
}

export interface GenerateProjectDesignSystemOptions {
    prompt: string;
    stylePreset?: string;
    platform?: string;
    images?: string[];
    assetRefs?: AssetReference[];
    preferredModel?: string;
    temperature?: number;
    projectDesignSystem?: ProjectDesignSystem;
}

type InlineImagePart = { inlineData: { data: string; mimeType: string } };
const MAX_REFERENCE_IMAGE_PARTS = 3;

function extractInlineImageParts(images: string[]): InlineImagePart[] {
    const parts: InlineImagePart[] = [];
    for (const img of images) {
        const matches = img.match(/^data:(.+);base64,(.+)$/);
        if (matches) {
            parts.push({
                inlineData: { data: matches[2], mimeType: matches[1] }
            });
        }
    }
    return parts;
}

async function fetchRemoteImagePart(url: string): Promise<InlineImagePart | null> {
    try {
        const response = await fetch(url, {
            headers: {
                Accept: 'image/*',
                'User-Agent': 'EazyUI/1.0 (+https://eazyui.app)',
            },
        });
        if (!response.ok) return null;
        const mimeType = String(response.headers.get('content-type') || '').split(';')[0].trim();
        if (!/^image\//i.test(mimeType)) return null;
        const buffer = Buffer.from(await response.arrayBuffer());
        return {
            inlineData: {
                data: buffer.toString('base64'),
                mimeType,
            }
        };
    } catch (error) {
        console.warn('[Gemini] fetchRemoteImagePart failed', {
            url,
            error: (error as Error)?.message || String(error),
        });
        return null;
    }
}

async function resolveImageParts(images: string[]): Promise<InlineImagePart[]> {
    const inlineParts = extractInlineImageParts(images);
    const remaining = Math.max(0, MAX_REFERENCE_IMAGE_PARTS - inlineParts.length);
    if (remaining === 0) return inlineParts.slice(0, MAX_REFERENCE_IMAGE_PARTS);

    const remoteUrls = images
        .filter((img) => /^https?:\/\//i.test(String(img || '').trim()))
        .slice(0, remaining);
    if (remoteUrls.length === 0) return inlineParts.slice(0, MAX_REFERENCE_IMAGE_PARTS);

    const remoteParts = (await Promise.all(remoteUrls.map((url) => fetchRemoteImagePart(url))))
        .filter((part): part is InlineImagePart => Boolean(part));
    return [...inlineParts, ...remoteParts].slice(0, MAX_REFERENCE_IMAGE_PARTS);
}

function getRemoteReferenceImageUrls(images: string[], limit = 8): string[] {
    const seen = new Set<string>();
    const urls: string[] = [];
    for (const image of images) {
        const value = String(image || '').trim();
        if (!/^https?:\/\//i.test(value)) continue;
        if (seen.has(value)) continue;
        seen.add(value);
        urls.push(value);
        if (urls.length >= limit) break;
    }
    return urls;
}

function buildReferenceImageUrlGuidance(images: string[]): string {
    const remoteUrls = getRemoteReferenceImageUrls(images);
    if (!remoteUrls.length) return '';
    return `REFERENCE IMAGE URLS (PREFER THESE EXACT URLS FOR MATCHING WEB REFERENCE VISUALS):
${remoteUrls.map((url, index) => `${index + 1}. ${url}`).join('\n')}

Rules:
- These URLs came from the referenced site scrape and are approved to use directly in <img src> attributes.
- When a screen needs hero art, supporting media, or character imagery that matches the referenced site, prefer these exact URLs first.
- Only fall back to Unsplash when none of these reference image URLs fit the specific component context.`;
}

function mergeAssetReferenceImages(images: string[], assetRefs: AssetReference[], limit = 8): string[] {
    const merged: string[] = [];
    const seen = new Set<string>();
    for (const value of [...images, ...assetRefs.map((assetRef) => assetRef.downloadUrl)]) {
        const normalized = String(value || '').trim();
        if (!normalized) continue;
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        merged.push(normalized);
        if (merged.length >= limit) break;
    }
    return merged;
}

function buildAssetReferenceContextPrompt(assetRefs: AssetReference[]): string {
    if (!assetRefs.length) return '';
    const lines = assetRefs
        .slice(0, 12)
        .map((assetRef, index) => {
            const qualifiers = [
                assetRef.source === 'project_brand' ? 'project brand asset' : 'saved prompt asset',
                assetRef.scope === 'project' ? 'project scope' : 'account scope',
                assetRef.role ? `role: ${assetRef.role}` : '',
                assetRef.pinned ? 'pinned' : '',
                assetRef.isPreferredLogo ? 'preferred logo' : '',
                assetRef.isKeyBrandAsset ? 'key brand asset' : '',
                typeof assetRef.width === 'number' && typeof assetRef.height === 'number'
                    ? `${assetRef.width}x${assetRef.height}`
                    : '',
            ].filter(Boolean);
            return `${index + 1}. ${assetRef.name} [${assetRef.kind}] (${qualifiers.join(', ')})\n   URL: ${assetRef.downloadUrl}`;
        });
    return `SAVED ASSET REFERENCES:
${lines.join('\n')}

Rules:
- These saved asset references are distinct from raw prompt attachments.
- Treat them as exact reusable media assets, not loose style inspiration.
- If a relevant saved asset exists, use that asset instead of inventing or substituting a different logo, illustration, product image, or texture.
- For logo assets: keep the exact mark/artwork from the saved asset. Do not redraw, rename, paraphrase, or replace it with placeholder brand text.
- For product-shot, photo, illustration, and brand-texture assets: prefer the exact saved asset URL in hero areas, cards, galleries, and supporting media when it fits the request.
- When editing existing HTML, update the relevant <img> src/srcset usage to the exact saved asset URL when the instruction implies replacement or brand alignment.
- Prefer the preferred logo for brand marks, app bars, splash screens, and auth/header placements.
- Use pinned and key brand assets when the request needs brand imagery, hero art, product photography, or textures.
- Reuse these exact saved assets when relevant instead of inventing different brand imagery.`;
}

async function analyzeReferenceImages(images: string[]): Promise<string> {
    if (!images.length) return '';
    const imageParts = await resolveImageParts(images);
    if (!imageParts.length) return '';

    const analysisPrompt = `Analyze the attached UI reference image(s) for generation guidance.
Return concise JSON only with fields:
{
  "designType": "app/website/dashboard/etc",
  "visualTone": "short phrase",
  "palette": { "primary": "#hex", "secondary": "#hex", "background": "#hex", "surface": "#hex", "text": "#hex", "accent": "#hex" },
  "layoutStructure": ["hero + cards", "sidebar + content", "..."],
  "componentPatterns": ["rounded cards", "pill chips", "minimal nav", "..."],
  "componentArchitecture": {
    "topZone": "how top utility/header is built",
    "focalModule": "hero/featured module pattern",
    "supportingModules": "supporting card/list structure",
    "actionZone": "persistent CTA/nav/bottom-sheet behavior"
  },
  "typographyNotes": "short notes",
  "spacingDensity": "compact|balanced|airy",
  "mustKeepCues": ["list of strongest visual cues to preserve"]
}`;

    try {
        const result = await model.generateContent({
            contents: [{
                role: 'user',
                parts: [{ text: analysisPrompt }, ...imageParts],
            }],
            generationConfig: {
                temperature: 0.2,
                topP: 0.85,
                maxOutputTokens: 1200,
            },
        });
        const raw = (result.response.text() || '').trim();
        if (!raw) return '';
        const compact = raw.replace(/```json|```/gi, '').trim();
        try {
            const parsed = JSON.parse(compact);
            return `IMAGE REFERENCE ANALYSIS (HARD GUIDANCE):\n${JSON.stringify(parsed)}\nUse this analysis to match palette, layout structure, spacing rhythm, component architecture, and visual hierarchy from the reference image(s).`;
        } catch {
            console.warn('[Gemini] analyzeReferenceImages returned invalid JSON; using fallback guidance', {
                preview: compact.slice(0, 240),
            });
            return 'Attached image(s) are PRIMARY reference. Prioritize matching their palette, art direction, layout hierarchy, and component structure over generic stock patterns.';
        }
    } catch (error) {
        console.warn('[Gemini] analyzeReferenceImages failed; continuing without structured image analysis', error);
        return 'Attached image(s) are reference-first. Prioritize matching their palette, layout structure, component style, and visual hierarchy over generic patterns.';
    }
}

type DesignSystemSeed = {
    themeMode: ProjectDesignSystem['themeMode'];
    tokens: ProjectDesignSystem['tokens'];
    typography: Pick<ProjectDesignSystem['typography'], 'displayFont' | 'bodyFont' | 'tone'>;
};

const DESIGN_SYSTEM_SEEDS: Record<string, DesignSystemSeed> = {
    modern: {
        themeMode: 'dark',
        tokens: {
            bg: '#0B1020',
            surface: '#121933',
            surface2: '#1C2444',
            text: '#F3F7FF',
            muted: '#9AA7C7',
            stroke: '#2A3764',
            accent: '#4F8CFF',
            accent2: '#1CC8E8',
        },
        typography: {
            displayFont: 'Space Grotesk',
            bodyFont: 'Plus Jakarta Sans',
            tone: 'Crisp, confident, and utility-forward.',
        },
    },
    minimal: {
        themeMode: 'light',
        tokens: {
            bg: '#F8F9FB',
            surface: '#FFFFFF',
            surface2: '#EEF1F6',
            text: '#14161D',
            muted: '#687082',
            stroke: '#D6DAE4',
            accent: '#2D3A8C',
            accent2: '#5B7BFF',
        },
        typography: {
            displayFont: 'Manrope',
            bodyFont: 'Inter',
            tone: 'Quiet, precise, and highly legible.',
        },
    },
    vibrant: {
        themeMode: 'mixed',
        tokens: {
            bg: '#10091F',
            surface: '#1B1034',
            surface2: '#2B1850',
            text: '#F8F4FF',
            muted: '#C4B7E6',
            stroke: '#4A2C80',
            accent: '#FF4FA3',
            accent2: '#6BE6FF',
        },
        typography: {
            displayFont: 'Clash Display',
            bodyFont: 'Plus Jakarta Sans',
            tone: 'Energetic, expressive, and contrast-rich.',
        },
    },
    luxury: {
        themeMode: 'dark',
        tokens: {
            bg: '#0F0B08',
            surface: '#1B1410',
            surface2: '#2A2019',
            text: '#F6EFE6',
            muted: '#BFAF9A',
            stroke: '#3E3026',
            accent: '#CDA25A',
            accent2: '#E7C88D',
        },
        typography: {
            displayFont: 'Playfair Display',
            bodyFont: 'Source Sans 3',
            tone: 'Premium, restrained, and cinematic.',
        },
    },
    playful: {
        themeMode: 'light',
        tokens: {
            bg: '#FFF7E8',
            surface: '#FFFFFF',
            surface2: '#FFEED0',
            text: '#241E42',
            muted: '#6C5C8B',
            stroke: '#E8D5AF',
            accent: '#FF6A3D',
            accent2: '#20B2AA',
        },
        typography: {
            displayFont: 'Baloo 2',
            bodyFont: 'Nunito',
            tone: 'Friendly, upbeat, and rounded.',
        },
    },
};

function buildStylePresetColorDirection(stylePreset: string): string {
    switch (stylePreset) {
        case 'minimal':
            return 'Minimal palettes should feel refined, editorial, and quietly premium. Use softly tinted neutrals instead of flat grayscale, and pair them with one restrained but intelligent accent.';
        case 'vibrant':
            return 'Vibrant palettes should feel art-directed, not childish. Push chroma in accents and highlights, but keep the underlying surfaces structured, readable, and commercially credible.';
        case 'luxury':
            return 'Luxury palettes should feel expensive through restraint: smoky or mineral neutrals, deep value contrast, and one warm or jewel-toned accent family with deliberate scarcity.';
        case 'playful':
            return 'Playful palettes should feel optimistic and memorable without looking toy-like. Use warmer, friendlier hue relationships and keep the base surfaces clean enough for product UI.';
        case 'modern':
        default:
            return 'Modern palettes should feel sharp and current, with subtle hue-cast neutrals and a confident accent strategy that avoids default startup blue-on-charcoal clichés.';
    }
}

function buildDomainColorDirection(prompt: string): string {
    const value = prompt.toLowerCase();

    if (/(fintech|bank|wallet|finance|trading|crypto|investment|payments?)/i.test(value)) {
        return 'For finance-related products, avoid generic fintech blue gradients. Favor trust-forward palettes with ink, mineral, steel, deep teal, pine, slate, or controlled cobalt; accents should feel precise and premium rather than loud.';
    }
    if (/(health|medical|doctor|clinic|wellness|fitness|therapy|care)/i.test(value)) {
        return 'For health and wellness products, avoid sterile hospital blue or obvious mint defaults. Prefer calming but grown-up tones like eucalyptus, mineral sage, soft marine, warm bone, or clean charcoal with high readability.';
    }
    if (/(fashion|beauty|cosmetic|editorial|magazine|luxury|jewelry)/i.test(value)) {
        return 'For fashion, beauty, or editorial products, bias toward elegant neutrals, inky contrast, espresso, stone, champagne, oxblood, plum, or muted metallic warmth instead of generic app-store colors.';
    }
    if (/(travel|hotel|hospitality|restaurant|food|booking)/i.test(value)) {
        return 'For travel, hospitality, and food products, use atmospheric palettes with a clear sense of place: dusk blues, terracotta, olive, sand, oceanic teal, or sunset warmth, while keeping interfaces polished and readable.';
    }
    if (/(music|media|video|creator|social|community|stream|content)/i.test(value)) {
        return 'For media, creator, or social products, use expressive contrast and a stronger brand voice, but keep it intentional: tinted darks, energetic accent duos, and surfaces that still feel product-grade rather than poster-only.';
    }
    if (/(saas|dashboard|admin|analytics|b2b|productivity|crm|workspace)/i.test(value)) {
        return 'For SaaS and productivity products, avoid the default navy/cyan dashboard treatment. Use more authored neutral families and a single confident accent with a supporting signal hue for hierarchy.';
    }

    return 'Choose a palette that feels specific to the product’s domain and tone. Do not fall back to generic royal blue, random purple gradients, or flat grayscale UI with one token accent.';
}

function safeString(input: unknown, fallback: string, max = 240): string {
    const value = typeof input === 'string' ? input.trim() : '';
    if (!value) return fallback;
    return value.slice(0, max);
}

function safeNumber(input: unknown, fallback: number, min: number, max: number): number {
    const value = Number(input);
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, Math.round(value)));
}

function safeThemeMode(input: unknown, fallback: ProjectDesignSystem['themeMode']): ProjectDesignSystem['themeMode'] {
    return input === 'light' || input === 'dark' || input === 'mixed' ? input : fallback;
}

function safeDensity(input: unknown, fallback: ProjectDesignSystem['spacing']['density']): ProjectDesignSystem['spacing']['density'] {
    return safeString(input, fallback, 80);
}

function safeStringList(input: unknown, fallback: string[], maxItems = 8): string[] {
    if (!Array.isArray(input)) return fallback;
    const next = input
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
        .slice(0, maxItems);
    return next.length > 0 ? next : fallback;
}

function toTitleCaseIfLower(value: string): string {
    if (/[A-Z]/.test(value)) return value;
    return value.replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

function sanitizeProjectNameCandidate(input: string): string {
    const raw = String(input || '').trim();
    if (!raw) return '';

    const firstClause = raw.split(/[|:;,]/)[0] || raw;
    const withoutQuotes = firstClause.replace(/^["'`]+|["'`]+$/g, '').trim();
    const withoutSuffix = withoutQuotes
        .replace(/\bdesign\s+system\b/gi, ' ')
        .replace(/\bproject\s+design\b/gi, ' ')
        .trim();
    const beforeQualifiers = withoutSuffix.split(/\b(with|for|like|featuring|including|that|where)\b/i)[0] || withoutSuffix;
    const withoutLead = beforeQualifiers
        .replace(/^(create|build|design|generate|make|craft|an?|the)\s+/i, '')
        .trim();

    const noise = new Set([
        'app', 'application', 'ui', 'ux', 'screen', 'screens', 'page', 'pages',
        'mobile', 'desktop', 'web', 'website', 'design', 'system', 'project',
        'new', 'beautiful', 'smooth',
    ]);
    const words = withoutLead
        .replace(/[^\w\s&-]/g, ' ')
        .split(/\s+/)
        .map((word) => word.trim())
        .filter(Boolean)
        .filter((word) => !noise.has(word.toLowerCase()));

    const candidateWords = (words.length > 0 ? words : withoutLead.split(/\s+/).filter(Boolean)).slice(0, 4);
    const candidate = toTitleCaseIfLower(candidateWords.join(' ').trim());
    return candidate.slice(0, 48).trim();
}

function extractExplicitProjectNameFromPrompt(prompt: string): string {
    const text = String(prompt || '');
    const explicitMatch = text.match(/(?:called|named|name\s+it|project\s+name(?:\s+is)?|app\s+name(?:\s+is)?)\s*[:\-]?\s*["']?([a-zA-Z0-9][a-zA-Z0-9&\-\s]{1,50})["']?/i);
    if (explicitMatch?.[1]) return sanitizeProjectNameCandidate(explicitMatch[1]);
    const quotedMatch = text.match(/["']([a-zA-Z0-9][a-zA-Z0-9&\-\s]{1,40})["']/);
    if (quotedMatch?.[1]) return sanitizeProjectNameCandidate(quotedMatch[1]);
    return '';
}

function deriveProjectNameFromPrompt(prompt: string): string {
    const explicit = extractExplicitProjectNameFromPrompt(prompt);
    if (explicit) return explicit;
    return sanitizeProjectNameCandidate(prompt);
}

function normalizeProjectSystemName(input: unknown, prompt: string, fallback: string): string {
    const candidates = [
        typeof input === 'string' ? input : '',
        deriveProjectNameFromPrompt(prompt),
        fallback,
    ];

    for (const candidate of candidates) {
        const cleaned = sanitizeProjectNameCandidate(candidate);
        if (!cleaned) continue;
        const normalized = cleaned.toLowerCase();
        if (['untitled', 'untitled project', 'project', 'new project'].includes(normalized)) continue;
        return cleaned;
    }

    const fallbackClean = sanitizeProjectNameCandidate(fallback);
    return fallbackClean || 'New Project';
}

function clampNumber(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function parseHexColor(value: string): { r: number; g: number; b: number } | null {
    const clean = String(value || '').trim().replace('#', '');
    if (!/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(clean)) return null;
    const full = clean.length === 3 ? clean.split('').map((part) => `${part}${part}`).join('') : clean;
    const n = Number.parseInt(full, 16);
    return {
        r: (n >> 16) & 255,
        g: (n >> 8) & 255,
        b: n & 255,
    };
}

function rgbToHex(r: number, g: number, b: number): string {
    return `#${[r, g, b].map((part) => clampNumber(Math.round(part), 0, 255).toString(16).padStart(2, '0')).join('')}`;
}

function relativeLuminance(r: number, g: number, b: number): number {
    const toLinear = (channel: number) => {
        const value = channel / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    const rr = toLinear(r);
    const gg = toLinear(g);
    const bb = toLinear(b);
    return 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
}

function contrastRatio(a: number, b: number): number {
    const light = Math.max(a, b);
    const dark = Math.min(a, b);
    return (light + 0.05) / (dark + 0.05);
}

function pickReadableForeground(background: string): string {
    const parsed = parseHexColor(background);
    if (!parsed) return '#0F172A';
    const bgLum = relativeLuminance(parsed.r, parsed.g, parsed.b);
    const whiteLum = relativeLuminance(255, 255, 255);
    const darkLum = relativeLuminance(15, 23, 42);
    const whiteContrast = contrastRatio(bgLum, whiteLum);
    const darkContrast = contrastRatio(bgLum, darkLum);
    return whiteContrast >= darkContrast ? '#FFFFFF' : '#0F172A';
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
    const rr = r / 255;
    const gg = g / 255;
    const bb = b / 255;
    const max = Math.max(rr, gg, bb);
    const min = Math.min(rr, gg, bb);
    const delta = max - min;
    let h = 0;
    const l = (max + min) / 2;
    const s = delta === 0 ? 0 : delta / (1 - Math.abs((2 * l) - 1));
    if (delta !== 0) {
        if (max === rr) h = ((gg - bb) / delta) % 6;
        else if (max === gg) h = ((bb - rr) / delta) + 2;
        else h = ((rr - gg) / delta) + 4;
    }
    const normalizedHue = Math.round((h * 60 + 360) % 360);
    return {
        h: normalizedHue,
        s: clampNumber(s * 100, 0, 100),
        l: clampNumber(l * 100, 0, 100),
    };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
    const hh = ((h % 360) + 360) % 360;
    const ss = clampNumber(s, 0, 100) / 100;
    const ll = clampNumber(l, 0, 100) / 100;
    const c = (1 - Math.abs((2 * ll) - 1)) * ss;
    const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
    const m = ll - (c / 2);

    let rr = 0;
    let gg = 0;
    let bb = 0;
    if (hh < 60) {
        rr = c; gg = x; bb = 0;
    } else if (hh < 120) {
        rr = x; gg = c; bb = 0;
    } else if (hh < 180) {
        rr = 0; gg = c; bb = x;
    } else if (hh < 240) {
        rr = 0; gg = x; bb = c;
    } else if (hh < 300) {
        rr = x; gg = 0; bb = c;
    } else {
        rr = c; gg = 0; bb = x;
    }

    return {
        r: Math.round((rr + m) * 255),
        g: Math.round((gg + m) * 255),
        b: Math.round((bb + m) * 255),
    };
}

function mapTokenToThemeVariant(
    tokenName: keyof ProjectDesignSystem['tokens'],
    colorValue: string,
    targetMode: 'light' | 'dark'
): string {
    if (tokenName === 'accent' || tokenName === 'accent2') return colorValue;
    const parsed = parseHexColor(colorValue);
    if (!parsed) return colorValue;
    const hsl = rgbToHsl(parsed.r, parsed.g, parsed.b);
    const targetLightnessDark: Record<keyof ProjectDesignSystem['tokens'], number> = {
        bg: 7,
        surface: 12,
        surface2: 17,
        text: 95,
        muted: 68,
        stroke: 30,
        accent: hsl.l,
        accent2: hsl.l,
    };
    const targetLightnessLight: Record<keyof ProjectDesignSystem['tokens'], number> = {
        bg: 97,
        surface: 100,
        surface2: 94,
        text: 10,
        muted: 45,
        stroke: 90,
        accent: hsl.l,
        accent2: hsl.l,
    };
    const targetLightness = targetMode === 'dark'
        ? targetLightnessDark[tokenName]
        : targetLightnessLight[tokenName];
    const targetSaturation = tokenName === 'text' || tokenName === 'muted' || tokenName === 'stroke'
        ? Math.min(hsl.s, 24)
        : Math.min(hsl.s, 18);
    const rgb = hslToRgb(hsl.h, targetSaturation, targetLightness);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
}

function buildThemeVariantTokens(
    tokens: ProjectDesignSystem['tokens'],
    targetMode: 'light' | 'dark'
): ProjectDesignSystem['tokens'] {
    return {
        ...tokens,
        bg: mapTokenToThemeVariant('bg', tokens.bg, targetMode),
        surface: mapTokenToThemeVariant('surface', tokens.surface, targetMode),
        surface2: mapTokenToThemeVariant('surface2', tokens.surface2, targetMode),
        text: mapTokenToThemeVariant('text', tokens.text, targetMode),
        muted: mapTokenToThemeVariant('muted', tokens.muted, targetMode),
        stroke: mapTokenToThemeVariant('stroke', tokens.stroke, targetMode),
        accent: tokens.accent,
        accent2: tokens.accent2,
    };
}

function resolveActiveThemeMode(themeMode: ProjectDesignSystem['themeMode']): 'light' | 'dark' {
    return themeMode === 'dark' ? 'dark' : 'light';
}

function resolveTokenModesFromSource(
    activeTokens: ProjectDesignSystem['tokens'],
    themeMode: ProjectDesignSystem['themeMode']
): { light: ProjectDesignSystem['tokens']; dark: ProjectDesignSystem['tokens'] } {
    const activeMode = resolveActiveThemeMode(themeMode);
    if (activeMode === 'dark') {
        return {
            dark: { ...activeTokens },
            light: buildThemeVariantTokens(activeTokens, 'light'),
        };
    }
    return {
        light: { ...activeTokens },
        dark: buildThemeVariantTokens(activeTokens, 'dark'),
    };
}

type DesignFontPair = {
    displayFont: string;
    bodyFont: string;
    tone: string;
};

const DESIGN_FONT_OPTIONS: Record<string, DesignFontPair[]> = {
    modern: [
        { displayFont: 'Space Grotesk', bodyFont: 'Plus Jakarta Sans', tone: 'Crisp, confident, and utility-forward.' },
        { displayFont: 'Sora', bodyFont: 'DM Sans', tone: 'Modern, precise, and product-led.' },
        { displayFont: 'Outfit', bodyFont: 'Inter', tone: 'Polished, clear, and contemporary.' },
        { displayFont: 'Manrope', bodyFont: 'Public Sans', tone: 'Structured, sharp, and quietly premium.' },
    ],
    minimal: [
        { displayFont: 'Manrope', bodyFont: 'Inter', tone: 'Quiet, precise, and highly legible.' },
        { displayFont: 'Instrument Sans', bodyFont: 'Inter', tone: 'Editorial, restrained, and clean.' },
        { displayFont: 'Sora', bodyFont: 'DM Sans', tone: 'Refined, airy, and modernist.' },
    ],
    vibrant: [
        { displayFont: 'Clash Display', bodyFont: 'Plus Jakarta Sans', tone: 'Energetic, expressive, and contrast-rich.' },
        { displayFont: 'Syne', bodyFont: 'DM Sans', tone: 'Bold, art-directed, and dynamic.' },
        { displayFont: 'Unbounded', bodyFont: 'Manrope', tone: 'Striking, branded, and high-energy.' },
    ],
    luxury: [
        { displayFont: 'Playfair Display', bodyFont: 'Source Sans 3', tone: 'Premium, restrained, and cinematic.' },
        { displayFont: 'Cormorant Garamond', bodyFont: 'Inter', tone: 'Elegant, composed, and editorial.' },
        { displayFont: 'Fraunces', bodyFont: 'DM Sans', tone: 'Rich, tailored, and refined.' },
    ],
    playful: [
        { displayFont: 'Baloo 2', bodyFont: 'Nunito', tone: 'Friendly, upbeat, and rounded.' },
        { displayFont: 'Bricolage Grotesque', bodyFont: 'DM Sans', tone: 'Expressive, warm, and approachable.' },
        { displayFont: 'Fredoka', bodyFont: 'Plus Jakarta Sans', tone: 'Cheerful, soft, and modern.' },
    ],
};

function hashDesignSeed(value: string): number {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function createHexFromHsl(h: number, s: number, l: number): string {
    const rgb = hslToRgb(h, s, l);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
}

function pickSeedHue(color: string, fallbackHue: number): number {
    const parsed = parseHexColor(color);
    if (!parsed) return fallbackHue;
    return rgbToHsl(parsed.r, parsed.g, parsed.b).h;
}

function pickDesignFontPair(stylePreset: string, hash: number, fallback: DesignSystemSeed['typography']): DesignSystemSeed['typography'] {
    const options = DESIGN_FONT_OPTIONS[stylePreset] || DESIGN_FONT_OPTIONS.modern;
    const pair = options[hash % options.length] || options[0];
    return pair || fallback;
}

function buildPromptAwareFallbackSeed(prompt: string, stylePreset: string): DesignSystemSeed {
    const base = DESIGN_SYSTEM_SEEDS[stylePreset] || DESIGN_SYSTEM_SEEDS.modern;
    const hash = hashDesignSeed(`${stylePreset}::${prompt}`);
    const baseThemeMode = base.themeMode === 'mixed' ? (((hash >> 1) & 1) === 0 ? 'dark' : 'light') : base.themeMode;
    const darkMode = baseThemeMode === 'dark';
    const styleConfig = {
        neutralSat: stylePreset === 'luxury' ? 12 : stylePreset === 'minimal' ? 8 : stylePreset === 'playful' ? 14 : 18,
        accentSat: stylePreset === 'luxury' ? 56 : stylePreset === 'minimal' ? 62 : stylePreset === 'playful' ? 78 : 72,
        accent2Sat: stylePreset === 'luxury' ? 48 : stylePreset === 'minimal' ? 56 : stylePreset === 'playful' ? 70 : 66,
        accentLight: darkMode ? (stylePreset === 'luxury' ? 66 : 62) : (stylePreset === 'minimal' ? 42 : 52),
        accent2Light: darkMode ? (stylePreset === 'luxury' ? 74 : 58) : (stylePreset === 'minimal' ? 50 : 48),
    };
    const hueShiftOptions = [-42, -30, -18, -9, 9, 18, 30, 42, 60];
    const secondaryGapOptions = stylePreset === 'luxury' ? [18, 30, 42, 60] : [26, 42, 58, 76, 110, 148];
    const neutralOffsetOptions = [-18, -10, -4, 4, 10, 18];
    const baseAccentHue = pickSeedHue(base.tokens.accent, stylePreset === 'luxury' ? 38 : 220);
    const baseNeutralHue = pickSeedHue(base.tokens.bg, baseAccentHue);
    const accentHue = (baseAccentHue + hueShiftOptions[hash % hueShiftOptions.length] + ((hash >> 3) % 11) - 5 + 360) % 360;
    const accent2Direction = ((hash >> 6) & 1) === 0 ? 1 : -1;
    const accent2Hue = (accentHue + accent2Direction * secondaryGapOptions[(hash >> 4) % secondaryGapOptions.length] + 360) % 360;
    const neutralHue = (baseNeutralHue + neutralOffsetOptions[(hash >> 8) % neutralOffsetOptions.length] + Math.round((accentHue - baseAccentHue) * 0.2) + 360) % 360;
    const neutralSat = styleConfig.neutralSat + ((hash >> 10) % 5);

    const tokens: ProjectDesignSystem['tokens'] = darkMode
        ? {
            bg: createHexFromHsl(neutralHue, neutralSat, 7 + ((hash >> 12) % 3)),
            surface: createHexFromHsl(neutralHue, neutralSat + 2, 11 + ((hash >> 14) % 3)),
            surface2: createHexFromHsl((neutralHue + ((hash >> 16) % 7) - 3 + 360) % 360, neutralSat + 4, 16 + ((hash >> 18) % 4)),
            text: createHexFromHsl(neutralHue, 18, 96),
            muted: createHexFromHsl(neutralHue, 12, 69 + ((hash >> 20) % 5)),
            stroke: createHexFromHsl(neutralHue, neutralSat + 6, 28 + ((hash >> 22) % 4)),
            accent: createHexFromHsl(accentHue, styleConfig.accentSat + ((hash >> 24) % 6), styleConfig.accentLight),
            accent2: createHexFromHsl(accent2Hue, styleConfig.accent2Sat + ((hash >> 26) % 6), styleConfig.accent2Light),
        }
        : {
            bg: createHexFromHsl(neutralHue, Math.max(4, neutralSat - 4), 97),
            surface: createHexFromHsl(neutralHue, Math.max(4, neutralSat - 6), 100),
            surface2: createHexFromHsl((neutralHue + ((hash >> 16) % 7) - 3 + 360) % 360, Math.max(6, neutralSat - 1), 93 + ((hash >> 18) % 2)),
            text: createHexFromHsl(neutralHue, 18, 11),
            muted: createHexFromHsl(neutralHue, 10, 45 + ((hash >> 20) % 6)),
            stroke: createHexFromHsl(neutralHue, Math.max(6, neutralSat), 87 + ((hash >> 22) % 4)),
            accent: createHexFromHsl(accentHue, styleConfig.accentSat + ((hash >> 24) % 6), styleConfig.accentLight),
            accent2: createHexFromHsl(accent2Hue, styleConfig.accent2Sat + ((hash >> 26) % 6), styleConfig.accent2Light),
        };

    return {
        themeMode: baseThemeMode,
        tokens,
        typography: pickDesignFontPair(stylePreset, hash, base.typography),
    };
}

function buildFallbackProjectDesignSystem(
    prompt: string,
    stylePreset: string,
    platform: string
): ProjectDesignSystem {
    const preset = buildPromptAwareFallbackSeed(prompt, stylePreset);
    const projectName = normalizeProjectSystemName('', prompt, 'New Project');
    const appIntent = safeString(prompt, projectName, 80);
    const tokenModes = resolveTokenModesFromSource(preset.tokens, preset.themeMode);
    const activeMode = resolveActiveThemeMode(preset.themeMode);
    return {
        version: 1,
        systemName: projectName,
        intentSummary: `A cohesive ${stylePreset} interface system for ${appIntent}.`,
        stylePreset,
        platform,
        themeMode: preset.themeMode,
        tokens: { ...(activeMode === 'dark' ? tokenModes.dark : tokenModes.light) },
        tokenModes,
        typography: {
            displayFont: preset.typography.displayFont,
            bodyFont: preset.typography.bodyFont,
            scale: {
                display: 'text-4xl font-bold tracking-tight',
                h1: 'text-2xl font-semibold',
                h2: 'text-xl font-semibold',
                body: 'text-base font-normal',
                caption: 'text-sm font-medium',
            },
            tone: preset.typography.tone,
        },
        spacing: {
            baseUnit: 4,
            density: stylePreset === 'minimal' ? 'compact' : 'balanced',
            rhythm: 'Use 8/12/16/24/32 spacing with consistent vertical cadence.',
        },
        radius: {
            card: '24px',
            control: '14px',
            pill: '999px',
        },
        shadows: {
            soft: '0 12px 34px rgba(0,0,0,.16)',
            glow: '0 20px 60px rgba(0,0,0,.22)',
        },
        componentLanguage: {
            button: 'Primary actions use high-contrast filled controls; secondary actions use subtle surface pills with icon+label and clear active/disabled states.',
            card: 'Use a card family with hero, standard, and compact variants; keep shared radius/elevation and consistent internal anatomy (meta/title/value/action).',
            input: 'Inputs should use icon-leading structure, clear labels/helpers, and stable vertical rhythm for quick scanning.',
            nav: 'Navigation should be contextual: top utility actions for detail views, persistent bottom nav only when it supports the core loop.',
            chips: 'Semantic chips should encode state/time/type with concise icon+label pairs and restrained accent fills.',
        },
        motion: {
            style: 'Short ease-out transitions with low-bounce emphasis.',
            durationFastMs: 140,
            durationBaseMs: 220,
        },
        rules: {
            do: [
                'Reuse the same tokens and typography pair on every screen.',
                'Keep spacing rhythm consistent across sections and cards.',
                'Reserve accent colors for CTA, active states, and key highlights.',
                'Build each screen with a clear focal module plus supporting modules of different scales.',
                'Use repeatable component anatomy so cards/rows feel system-designed, not random.',
                'Mark header-like top overlays with data-eazyui-safe-top="force".',
            ],
            dont: [
                'Do not introduce a new theme direction mid-project.',
                'Do not switch font pairing between screens.',
                'Do not overuse accent color on neutral surfaces.',
                'Do not render uniform stacks of same-size cards without a dominant focal module.',
                'Do not rely on anonymous container stacks where component purpose is unclear.',
                'Do not hide key content hierarchy behind decorative effects.',
            ],
        },
    };
}

function normalizeProjectDesignSystem(
    input: unknown,
    prompt: string,
    stylePreset: string,
    platform: string
): ProjectDesignSystem {
    const fallback = buildFallbackProjectDesignSystem(prompt, stylePreset, platform);
    if (!input || typeof input !== 'object') return fallback;
    const raw = input as Record<string, any>;
    const rawTokens = (raw.tokens && typeof raw.tokens === 'object') ? raw.tokens : {};
    const rawTokenModes = (raw.tokenModes && typeof raw.tokenModes === 'object') ? raw.tokenModes : {};
    const rawModeLight = (rawTokenModes.light && typeof rawTokenModes.light === 'object') ? rawTokenModes.light : {};
    const rawModeDark = (rawTokenModes.dark && typeof rawTokenModes.dark === 'object') ? rawTokenModes.dark : {};
    const rawTypography = (raw.typography && typeof raw.typography === 'object') ? raw.typography : {};
    const rawScale = (rawTypography.scale && typeof rawTypography.scale === 'object') ? rawTypography.scale : {};
    const rawSpacing = (raw.spacing && typeof raw.spacing === 'object') ? raw.spacing : {};
    const rawRadius = (raw.radius && typeof raw.radius === 'object') ? raw.radius : {};
    const rawShadows = (raw.shadows && typeof raw.shadows === 'object') ? raw.shadows : {};
    const rawComponents = (raw.componentLanguage && typeof raw.componentLanguage === 'object') ? raw.componentLanguage : {};
    const rawMotion = (raw.motion && typeof raw.motion === 'object') ? raw.motion : {};
    const rawRules = (raw.rules && typeof raw.rules === 'object') ? raw.rules : {};
    const normalizedThemeMode = safeThemeMode(raw.themeMode, fallback.themeMode);

    const sanitizeTokenSet = (source: Record<string, any>, defaults: ProjectDesignSystem['tokens']): ProjectDesignSystem['tokens'] => ({
        bg: safeString(source.bg, defaults.bg, 40),
        surface: safeString(source.surface, defaults.surface, 40),
        surface2: safeString(source.surface2, defaults.surface2, 40),
        text: safeString(source.text, defaults.text, 40),
        muted: safeString(source.muted, defaults.muted, 40),
        stroke: safeString(source.stroke, defaults.stroke, 40),
        accent: safeString(source.accent, defaults.accent, 40),
        accent2: safeString(source.accent2, defaults.accent2, 40),
    });

    const fallbackLight = fallback.tokenModes?.light || fallback.tokens;
    const fallbackDark = fallback.tokenModes?.dark || buildThemeVariantTokens(fallback.tokens, 'dark');
    const lightTokens = sanitizeTokenSet(rawModeLight, fallbackLight);
    const darkTokens = sanitizeTokenSet(rawModeDark, fallbackDark);
    const activeMode = resolveActiveThemeMode(normalizedThemeMode);
    const activeTokensFromModes = activeMode === 'dark' ? darkTokens : lightTokens;
    const hasRawActiveTokens = Object.keys(rawTokens || {}).length > 0;
    const activeTokens = hasRawActiveTokens
        ? sanitizeTokenSet(rawTokens, activeTokensFromModes)
        : activeTokensFromModes;
    const normalizedTokenModes = {
        light: activeMode === 'light' ? { ...activeTokens } : { ...lightTokens },
        dark: activeMode === 'dark' ? { ...activeTokens } : { ...darkTokens },
    };

    return {
        version: 1,
        systemName: normalizeProjectSystemName(raw.systemName, prompt, fallback.systemName),
        intentSummary: safeString(raw.intentSummary, fallback.intentSummary, 220),
        stylePreset: safeString(raw.stylePreset, stylePreset, 32),
        platform: safeString(raw.platform, platform, 32),
        themeMode: normalizedThemeMode,
        tokens: activeTokens,
        tokenModes: normalizedTokenModes,
        typography: {
            displayFont: safeString(rawTypography.displayFont, fallback.typography.displayFont, 80),
            bodyFont: safeString(rawTypography.bodyFont, fallback.typography.bodyFont, 80),
            scale: {
                display: safeString(rawScale.display, fallback.typography.scale.display, 80),
                h1: safeString(rawScale.h1, fallback.typography.scale.h1, 80),
                h2: safeString(rawScale.h2, fallback.typography.scale.h2, 80),
                body: safeString(rawScale.body, fallback.typography.scale.body, 80),
                caption: safeString(rawScale.caption, fallback.typography.scale.caption, 80),
            },
            tone: safeString(rawTypography.tone, fallback.typography.tone, 180),
        },
        spacing: {
            baseUnit: safeNumber(rawSpacing.baseUnit, fallback.spacing.baseUnit, 1, 64),
            density: safeDensity(rawSpacing.density, fallback.spacing.density),
            rhythm: safeString(rawSpacing.rhythm, fallback.spacing.rhythm, 200),
        },
        radius: {
            card: safeString(rawRadius.card, fallback.radius.card, 40),
            control: safeString(rawRadius.control, fallback.radius.control, 40),
            pill: safeString(rawRadius.pill, fallback.radius.pill, 40),
        },
        shadows: {
            soft: safeString(rawShadows.soft, fallback.shadows.soft, 80),
            glow: safeString(rawShadows.glow, fallback.shadows.glow, 80),
        },
        componentLanguage: {
            button: safeString(rawComponents.button, fallback.componentLanguage.button, 220),
            card: safeString(rawComponents.card, fallback.componentLanguage.card, 220),
            input: safeString(rawComponents.input, fallback.componentLanguage.input, 220),
            nav: safeString(rawComponents.nav, fallback.componentLanguage.nav, 220),
            chips: safeString(rawComponents.chips, fallback.componentLanguage.chips, 220),
        },
        motion: {
            style: safeString(rawMotion.style, fallback.motion.style, 160),
            durationFastMs: safeNumber(rawMotion.durationFastMs, fallback.motion.durationFastMs, 80, 400),
            durationBaseMs: safeNumber(rawMotion.durationBaseMs, fallback.motion.durationBaseMs, 120, 600),
        },
        rules: {
            do: safeStringList(rawRules.do, fallback.rules.do),
            dont: safeStringList(rawRules.dont, fallback.rules.dont),
        },
    };
}

function buildDesignSystemGuidance(system: ProjectDesignSystem): string {
    const doRules = system.rules.do.map((item) => `- ${item}`).join('\n');
    const dontRules = system.rules.dont.map((item) => `- ${item}`).join('\n');
    const modeTokens = system.tokenModes || resolveTokenModesFromSource(system.tokens, system.themeMode);
    const activeMode = resolveActiveThemeMode(system.themeMode);
    const activeTokens = activeMode === 'dark' ? modeTokens.dark : modeTokens.light;
    const lightOnAccent = pickReadableForeground(modeTokens.light.accent);
    const darkOnAccent = pickReadableForeground(modeTokens.dark.accent);
    const lightOnSurface = pickReadableForeground(modeTokens.light.surface);
    const darkOnSurface = pickReadableForeground(modeTokens.dark.surface);
    return `
PROJECT DESIGN SYSTEM (STRICT, REUSE THIS ON ALL SCREENS):
System: ${system.systemName}
Intent: ${system.intentSummary}
Preset/Platform: ${system.stylePreset} / ${system.platform}
Theme mode: ${system.themeMode} (active: ${activeMode})

Semantic tokens (ACTIVE mode, map directly in tailwind.config):
- bg: ${activeTokens.bg}
- surface: ${activeTokens.surface}
- surface2: ${activeTokens.surface2}
- text: ${activeTokens.text}
- muted: ${activeTokens.muted}
- stroke: ${activeTokens.stroke}
- accent: ${activeTokens.accent}
- accent2: ${activeTokens.accent2}

Light mode tokens:
- bg: ${modeTokens.light.bg}
- surface: ${modeTokens.light.surface}
- surface2: ${modeTokens.light.surface2}
- text: ${modeTokens.light.text}
- muted: ${modeTokens.light.muted}
- stroke: ${modeTokens.light.stroke}
- accent: ${modeTokens.light.accent}
- accent2: ${modeTokens.light.accent2}

Dark mode tokens:
- bg: ${modeTokens.dark.bg}
- surface: ${modeTokens.dark.surface}
- surface2: ${modeTokens.dark.surface2}
- text: ${modeTokens.dark.text}
- muted: ${modeTokens.dark.muted}
- stroke: ${modeTokens.dark.stroke}
- accent: ${modeTokens.dark.accent}
- accent2: ${modeTokens.dark.accent2}

Theme-awareness rules (MANDATORY in generated HTML):
- Use semantic tokens for all major component colors; avoid hardcoded black/white button/icon combos.
- Keep button/icon/text contrast valid in BOTH modes.
- If a component uses accent backgrounds, prefer these foregrounds:
  - light mode on accent: ${lightOnAccent}
  - dark mode on accent: ${darkOnAccent}
- If a component uses surface backgrounds, prefer these foregrounds:
  - light mode on surface: ${lightOnSurface}
  - dark mode on surface: ${darkOnSurface}
- Never produce unreadable pairs (e.g., white icon on white button, black icon on black background).

Safe-top/status overlay behavior (MANDATORY in generated HTML):
- Runtime injects a transparent status-bar overlay above content.
- Never render OS status-bar rows or fake top strip backgrounds.
- Put top controls wrappers near top in a container with data-eazyui-safe-top="force".
- Use data-eazyui-safe-top="off" only for elements that must not be shifted.

Typography:
- display font: ${system.typography.displayFont}
- body font: ${system.typography.bodyFont}
- display/h1/h2/body/caption guidance: ${system.typography.scale.display} | ${system.typography.scale.h1} | ${system.typography.scale.h2} | ${system.typography.scale.body} | ${system.typography.scale.caption}
- tone: ${system.typography.tone}

Spacing:
- base unit: ${system.spacing.baseUnit}px
- density: ${system.spacing.density}
- rhythm: ${system.spacing.rhythm}

Radii/Shadows:
- card radius: ${system.radius.card}
- control radius: ${system.radius.control}
- pill radius: ${system.radius.pill}
- soft shadow: ${system.shadows.soft}
- glow shadow: ${system.shadows.glow}

Component language:
- button: ${system.componentLanguage.button}
- card: ${system.componentLanguage.card}
- input: ${system.componentLanguage.input}
- nav: ${system.componentLanguage.nav}
- chips: ${system.componentLanguage.chips}

Component craft targets (MANDATORY):
- Screen scaffold: top utility/header -> focal module -> supporting modules -> persistent action area.
- Module scale: mix hero, standard, and compact modules; avoid flat uniform grids/stacks.
- Component anatomy: use repeatable structure (meta/title/value/action) for cards and rows.
- Visual emphasis: one dominant focal point per screen with restrained accent usage.
- Header-like overlays near the top should be tagged data-eazyui-safe-top="force".

Motion:
- style: ${system.motion.style}
- fast/base durations: ${system.motion.durationFastMs}ms / ${system.motion.durationBaseMs}ms

Always do:
${doRules}

Never do:
${dontRules}
`;
}

function buildDesignSystemColorPrompt(prompt: string, stylePreset: string): string {
    return `
COLOR DIRECTION (MANDATORY):
- Palette must feel authored for this product, not like a template.
- Avoid default startup color habits: royal blue with cyan on charcoal, purple gradient on white, or plain grayscale with a random accent.
- Use neutrals with a subtle hue bias. Surfaces should not feel like untouched gray ramps unless the product explicitly calls for that.
- Establish a clear palette hierarchy:
  - one foundational neutral family for bg/surface/surface2
  - one primary accent for CTA, active, focus, and key emphasis
  - one secondary accent for support states, data highlights, or selective contrast
- accent and accent2 must be meaningfully different in role and hue temperature, not near-duplicates.
- Keep the overall result professional and product-ready. Creative does not mean neon chaos.
- If using a saturated accent, counterbalance it with calmer surfaces and disciplined usage.
- Token choices should imply a believable brand personality and product market position.

STYLE-SPECIFIC COLOR DIRECTION:
${buildStylePresetColorDirection(stylePreset)}

DOMAIN COLOR DIRECTION:
${buildDomainColorDirection(prompt)}
`.trim();
}

function buildBrandingPriorityPrompt(prompt: string): string {
    if (!/Branding priority:|Branding:\s*/i.test(prompt)) return '';
    return `
BRANDING PRIORITY (MANDATORY WHEN WEB REFERENCE BRANDING IS PRESENT):
- If Web reference context includes Branding, treat it as the primary visual source of truth over other style heuristics.
- Reuse the exact branded hex values and named fonts when they are available and usable.
- If branding provides a clear primary/background/text palette, map those directly or very closely into tokens and tokenModes instead of inventing a different palette family.
- If branding indicates a dark or light scheme, default themeMode to that scheme unless the user prompt explicitly asks for the opposite.
- If branding only gives one accent hue, keep accent2 close to the same family or derive it subtly from the brand neutrals/links. Do NOT invent an unrelated bright blue, purple, or cyan accent.
- Keep the product name and visual tone aligned to the referenced brand when it is clearly identifiable.
`.trim();
}

export async function generateProjectDesignSystem(options: GenerateProjectDesignSystemOptions): Promise<{
    designSystem: ProjectDesignSystem;
    usage?: TokenUsageSummary;
}> {
    const prompt = safeString(options.prompt, 'Untitled app request', 800);
    const stylePreset = safeString(options.stylePreset, 'modern', 32).toLowerCase();
    const platform = safeString(options.platform, 'mobile', 32).toLowerCase();
    const images = Array.isArray(options.images) ? options.images.filter(Boolean) : [];
    const assetRefs = Array.isArray(options.assetRefs) ? options.assetRefs : [];
    const referenceImages = mergeAssetReferenceImages(images, assetRefs);
    const modelTemperature = resolveModelTemperature(options.temperature, 1);
    console.info('[Gemini] design-system:start', {
        stylePreset,
        platform,
        imagesCount: images.length,
        assetRefCount: assetRefs.length,
        referenceImageCount: referenceImages.length,
        preferredModel: options.preferredModel || null,
        temperature: modelTemperature,
        hasProjectDesignSystem: Boolean(options.projectDesignSystem),
        promptPreview: prompt.slice(0, 180),
    });

    if (options.projectDesignSystem) {
        const normalized = normalizeProjectDesignSystem(options.projectDesignSystem, prompt, stylePreset, platform);
        console.info('[Gemini] design-system:reuse-project-system', {
            systemName: normalized.systemName,
            themeMode: normalized.themeMode,
        });
        return { designSystem: normalized };
    }

    const fallback = buildFallbackProjectDesignSystem(prompt, stylePreset, platform);
    const imageAnalysis = await analyzeReferenceImages(referenceImages);
    const imageGuidance = referenceImages.length > 0
        ? 'Attached image(s) are PRIMARY visual references. Match their brand cues, art direction, contrast, spacing feel, radius language, and typography tone unless they would clearly harm usability.'
        : '';
    const assetReferenceGuidance = buildAssetReferenceContextPrompt(assetRefs);
    const colorPrompt = buildDesignSystemColorPrompt(prompt, stylePreset);
    const brandingPriorityPrompt = buildBrandingPriorityPrompt(prompt);

    const systemPrompt = `You are a senior product designer creating a reusable project design system.
Return strict JSON only.

Output schema:
{
  "version": 1,
  "systemName": "short product/project name only",
  "intentSummary": "string",
  "stylePreset": "modern|minimal|vibrant|luxury|playful",
  "platform": "mobile|tablet|desktop",
  "themeMode": "light|dark",
  "tokens": { "bg": "#...", "surface": "#...", "surface2": "#...", "text": "#...", "muted": "#...", "stroke": "#...", "accent": "#...", "accent2": "#..." },
  "tokenModes": {
    "light": { "bg": "#...", "surface": "#...", "surface2": "#...", "text": "#...", "muted": "#...", "stroke": "#...", "accent": "#...", "accent2": "#..." },
    "dark": { "bg": "#...", "surface": "#...", "surface2": "#...", "text": "#...", "muted": "#...", "stroke": "#...", "accent": "#...", "accent2": "#..." }
  },
  "typography": {
    "displayFont": "string",
    "bodyFont": "string",
    "scale": { "display": "tailwind-like guidance", "h1": "string", "h2": "string", "body": "string", "caption": "string" },
    "tone": "string"
  },
  "spacing": { "baseUnit": "number", "density": "string", "rhythm": "string" },
  "radius": { "card": "string", "control": "string", "pill": "string" },
  "shadows": { "soft": "css shadow", "glow": "css shadow" },
  "componentLanguage": { "button": "string", "card": "string", "input": "string", "nav": "string", "chips": "string" },
  "motion": { "style": "string", "durationFastMs": 140, "durationBaseMs": 220 },
  "rules": { "do": ["rule"], "dont": ["rule"] }
}

Rules:
- Make this system cohesive enough to drive ALL next screens in one project.
- Output practical tokens/rules that are easy to apply in Tailwind HTML generation.
- systemName must be a concise project/product name only (2-4 words). No commas, no full prompt sentence, no "Design System" suffix.
- Always provide both light and dark token sets in tokenModes.
- Use "themeMode" as the active mode ("light" or "dark"), not "mixed".
- Set "tokens" to the active mode palette (matching themeMode), not a third unrelated set.
- Ensure theme-aware contrast decisions for controls/icons in both modes (avoid unreadable white-on-white or black-on-black states).
- Keep rules concrete and short.
- componentLanguage entries must describe concrete component anatomy/variants, not vague style adjectives.
- The rules.do/rules.dont arrays should reinforce non-generic structure: focal module, mixed card scales, and consistent component grammar.
- Prefer semantic colors over arbitrary color names.
- Typography must feel product-specific. Do not default to Space Grotesk + Plus Jakarta Sans unless it is genuinely the best fit.
- Avoid repeating the same dark navy + cyan startup palette unless the prompt clearly calls for that direction.
- The schema literals are examples only. You may use any practical font names, sizing guidance, base units, density labels, radii, and motion values that fit the product.
- If branding provides font sizes, spacing units, or corner radii, carry those through into typography.scale, spacing, and radius instead of replacing them with defaults.

${colorPrompt}
${brandingPriorityPrompt ? `\n\n${brandingPriorityPrompt}` : ''}`;

    const userPrompt = `App request: "${prompt}"
Style preset: ${stylePreset}
Platform: ${platform}
${imageGuidance}
${imageAnalysis || ''}
${assetReferenceGuidance}
Generate the design system that should be reused for this whole project.
Infer and set a clean project/product name in systemName (not a sentence, not "Design System").
Choose a palette that feels creative, product-specific, and professionally art-directed rather than generic.
If Branding is present in the web reference context, prioritize those brand colors/fonts over generic style defaults.
Choose typography that fits the brand personality instead of defaulting to the same safe pair every time.`;

    try {
        const preferredModel = options.preferredModel;
        let raw: unknown = null;
        const usageEntries: Array<TokenUsageEntry | null | undefined> = [];

        if (isNvidiaModel(preferredModel)) {
            const completion = await nvidiaChatCompletion({
                model: preferredModel,
                systemPrompt,
                prompt: userPrompt,
                maxCompletionTokens: 1900,
                temperature: modelTemperature,
                topP: 0.85,
                responseFormat: 'json_object',
                thinking: false,
            });
            usageEntries.push(completion.usage);
            raw = parseJsonSafe(cleanJsonResponse(completion.text));
        } else if (isGroqModel(preferredModel)) {
            const completion = await groqChatCompletion({
                model: preferredModel,
                systemPrompt,
                prompt: userPrompt,
                maxCompletionTokens: 1900,
                temperature: modelTemperature,
                topP: 0.85,
                responseFormat: 'json_object',
                reasoningEffort: 'low',
            });
            usageEntries.push(completion.usage);
            raw = parseJsonSafe(cleanJsonResponse(completion.text));
        } else {
            const preferredGeminiModel = resolveDesignSystemPreferredModel(preferredModel);
            const primaryGeminiModelName = preferredGeminiModel || modelName;
            const imageParts = await resolveImageParts(referenceImages);
            const runGeminiDesignSystemAttempt = async (activeModelName: string, retry = false): Promise<unknown> => {
                const designSystemModel = activeModelName === modelName ? model : getGenerativeModel(activeModelName).model;
                const result = await designSystemModel.generateContent({
                    contents: [{
                        role: 'user',
                        parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }, ...imageParts],
                    }],
                    generationConfig: buildDesignSystemGenerationConfig(activeModelName, modelTemperature, retry),
                });
                usageEntries.push(parseGeminiUsageFromResponse(result.response, activeModelName));
                const responseText = result.response.text() || '';
                const finishReason = result.response?.candidates?.[0]?.finishReason || 'unknown';
                const thoughtsTokenCount = toNonNegativeInt((result.response?.usageMetadata as any)?.thoughtsTokenCount);
                console.info('[Gemini] design-system:attempt', {
                    model: activeModelName,
                    retry,
                    finishReason,
                    responseChars: responseText.length,
                    thoughtsTokenCount,
                });
                try {
                    return parseJsonSafe(cleanJsonResponse(responseText));
                } catch (parseError) {
                    console.warn('[Gemini] design-system:parse-failed', {
                        model: activeModelName,
                        retry,
                        finishReason,
                        responseChars: responseText.length,
                        thoughtsTokenCount,
                        error: (parseError as Error)?.message || String(parseError),
                    });
                    return null;
                }
            };

            raw = await runGeminiDesignSystemAttempt(primaryGeminiModelName, false);
            if (!isUsableDesignSystemPayload(raw)) {
                const retryModelName = primaryGeminiModelName === 'gemini-2.5-pro' ? primaryGeminiModelName : 'gemini-2.5-pro';
                console.warn('[Gemini] design-system:retrying-after-invalid-json', {
                    primaryModel: primaryGeminiModelName,
                    retryModel: retryModelName,
                });
                raw = await runGeminiDesignSystemAttempt(retryModelName, true);
            }
        }

        if (!isUsableDesignSystemPayload(raw)) {
            throw new Error('Design system generation did not return a complete JSON payload.');
        }

        const normalized = normalizeProjectDesignSystem(raw, prompt, stylePreset, platform);
        console.info('[Gemini] design-system:complete', {
            systemName: normalized.systemName,
            themeMode: normalized.themeMode,
            stylePreset: normalized.stylePreset,
            platform: normalized.platform,
        });
        return {
            designSystem: normalized,
            usage: summarizeTokenUsage(usageEntries),
        };
    } catch (error) {
        console.warn('[Gemini] generateProjectDesignSystem failed; using fallback design system', error);
        return { designSystem: fallback };
    }
}

export async function generateDesign(options: GenerateOptions): Promise<{
    designSpec: HtmlDesignSpec;
    usage?: TokenUsageSummary;
}> {
    const { prompt, stylePreset = 'modern', platform = 'mobile', images = [], assetRefs = [], preferredModel } = options;
    const referenceImages = mergeAssetReferenceImages(images, assetRefs);
    const modelTemperature = resolveModelTemperature(options.temperature, 1);
    console.info('[Gemini] generateDesign:start', {
        stylePreset,
        platform,
        imagesCount: images.length,
        assetRefCount: assetRefs.length,
        referenceImageCount: referenceImages.length,
        preferredModel: preferredModel || null,
        temperature: modelTemperature,
        hasProjectDesignSystem: Boolean(options.projectDesignSystem),
        promptPreview: String(prompt || '').slice(0, 180),
    });
    const dimensions = PLATFORM_DIMENSIONS[platform] || PLATFORM_DIMENSIONS.mobile;
    const generationConfig = getGenerationConfig(referenceImages.length > 0, modelTemperature);
    const imageAnalysis = await analyzeReferenceImages(referenceImages);
    const usageEntries: Array<TokenUsageEntry | null | undefined> = [];
    const designSystemResult = await generateProjectDesignSystem({
        prompt,
        stylePreset,
        platform,
        images,
        assetRefs,
        preferredModel,
        temperature: modelTemperature,
        projectDesignSystem: options.projectDesignSystem,
    });
    const projectDesignSystem = designSystemResult.designSystem;
    usageEntries.push(...(designSystemResult.usage?.entries || []));
    const designSystemGuidance = buildDesignSystemGuidance(projectDesignSystem);

    const imageGuidance = referenceImages.length > 0
        ? `Use the attached image(s) as PRIMARY reference. Match palette, typography mood, spacing density, component shapes, and layout hierarchy. Do not ignore reference cues.
If the text request is ambiguous (e.g., "as seen", "like this"), preserve the same app domain and information architecture as the reference image(s).`
        : '';
    const referenceImageUrlGuidance = buildReferenceImageUrlGuidance(referenceImages);
    const assetReferenceGuidance = buildAssetReferenceContextPrompt(assetRefs);
    const noImageGuidance = referenceImages.length === 0 ? NO_IMAGE_REFERENCE_QUALITY_RULES : '';

    const baseUserPrompt = `
Design a UI for: "${prompt}"
Platform: ${platform} (${dimensions.width}x${dimensions.height})
Style: ${stylePreset}
Generate a maximum of 4 complete screens.
${imageGuidance}
${noImageGuidance}
${imageAnalysis}
${referenceImageUrlGuidance}
${assetReferenceGuidance}
${designSystemGuidance}
`;

    const fastBaseUserPrompt = `
Design a UI for: "${prompt}"
Platform: ${platform} (${dimensions.width}x${dimensions.height})
Style: ${stylePreset}
Generate exactly 1 complete main screen.
${imageGuidance}
${noImageGuidance}
${imageAnalysis}
${referenceImageUrlGuidance}
${assetReferenceGuidance}
${designSystemGuidance}
`;

    const buildParts = (userPrompt: string) => {
        return resolveImageParts(referenceImages).then((imageParts) => {
            const parts: any[] = [{ text: GENERATE_HTML_PROMPT + '\n\n' + userPrompt }];
            parts.push(...imageParts);
            return parts;
        });
    };

    const isFastTextProviderModel = isGroqModel(preferredModel) || isNvidiaModel(preferredModel);

    const resolvedPreferredModel = resolvePreferredModel(preferredModel);

    const generateOnce = async (promptText: string): Promise<ParsedDesign & { usage?: TokenUsageSummary }> => {
        if (isFastTextProviderModel) {
            try {
                const isNvidia = isNvidiaModel(preferredModel);
                const maxCompletionTokens = isNvidia ? 3400 : 2200;
                const fastUsageEntries: Array<TokenUsageEntry | null | undefined> = [];

                const runFast = async (promptPrefix: string) => (isNvidia
                    ? await nvidiaChatCompletion({
                        model: preferredModel,
                        systemPrompt: 'You are a world-class UI designer. Return one valid JSON object only and no reasoning.',
                        prompt: `${promptPrefix}\n${FAST_UNSPLASH_IMAGE_RULES}\n\n${promptText}`,
                        maxCompletionTokens,
                        temperature: modelTemperature,
                        topP: referenceImages.length > 0 ? 0.85 : 0.9,
                        responseFormat: 'json_object',
                        thinking: false,
                    })
                    : await groqChatCompletion({
                        model: preferredModel,
                        systemPrompt: 'You are a world-class UI designer. Return one valid JSON object only and no reasoning.',
                        prompt: `${promptPrefix}\n${FAST_UNSPLASH_IMAGE_RULES}\n\n${promptText}`,
                        maxCompletionTokens,
                        temperature: modelTemperature,
                        topP: referenceImages.length > 0 ? 0.85 : 0.9,
                        reasoningEffort: 'low',
                        responseFormat: 'json_object',
                    }));

                let completion = await runFast(FAST_GENERATE_HTML_PROMPT);
                fastUsageEntries.push(completion.usage);
                const { text, finishReason } = completion;
                if (finishReason === 'length') {
                    completion = await runFast(FAST_GENERATE_HTML_PROMPT_COMPACT);
                    fastUsageEntries.push(completion.usage);
                }
                if (completion.finishReason === 'length') {
                    throw new Error('Fast model output was truncated. Please retry with a shorter design request.');
                }
                try {
                    const cleanedJson = cleanJsonResponse(completion.text);
                    const parsed = parseJsonSafe(cleanedJson) as { description?: string; screens: RawScreen[] };
                    return {
                        description: parsed.description,
                        screens: parsed.screens || [],
                        parsedOk: true,
                        usage: summarizeTokenUsage(fastUsageEntries),
                    };
                } catch {
                    throw new Error('Fast model returned invalid structured output. Please retry.');
                }
            } catch (error) {
                if (isQuotaOrRateLimitError(error)) {
                    throw new Error('Fast model is rate-limited right now. Please wait a few seconds and retry.');
                }
                throw error;
            }
        }
        return generateDesignOnce(await buildParts(promptText), resolvedPreferredModel, generationConfig);
    };

    let initialResponse = await generateOnce(isFastTextProviderModel ? fastBaseUserPrompt : baseUserPrompt);
    usageEntries.push(...(initialResponse.usage?.entries || []));
    if (!initialResponse.parsedOk || initialResponse.screens.length === 0) {
        const activeBasePrompt = isFastTextProviderModel ? fastBaseUserPrompt : baseUserPrompt;
        const retryPrompt = `${activeBasePrompt}\nReturn STRICT JSON only. No markdown, no code fences, no trailing commas.`;
        initialResponse = await generateOnce(retryPrompt);
        usageEntries.push(...(initialResponse.usage?.entries || []));
    }

    const designId = uuidv4();
    const isFastMode = isFastTextProviderModel;
    const screens: HtmlScreen[] = initialResponse.screens.map(s => ({
        screenId: uuidv4(),
        name: s.name,
        html: enforceThemeAwareTokenUsage(
            enforcePlaceholderCatalogUrls(normalizeBrokenLogoPlaceholders(
                isFastMode
                    ? enforceFastWorkingImageUrls(normalizeFastFrameworkAssets(s.html))
                    : s.html
            )),
            projectDesignSystem
        ),
        width: dimensions.width,
        height: dimensions.height,
    }));

    const output: HtmlDesignSpec = {
        id: designId,
        name: prompt,
        screens,
        description: normalizeUiDescriptionTags(initialResponse.description),
        designSystem: projectDesignSystem,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    console.info('[Gemini] generateDesign:complete', {
        screens: output.screens.length,
        screenNames: output.screens.map((screen) => screen.name).slice(0, 8),
        descriptionPreview: String(output.description || '').slice(0, 180),
    });
    return {
        designSpec: output,
        usage: summarizeTokenUsage(usageEntries),
    };
}

export function generateDesignStreamWithUsage(options: GenerateOptions): {
    stream: AsyncGenerator<string, void, unknown>;
    usagePromise: Promise<TokenUsageSummary | undefined>;
} {
    const usageEntries: Array<TokenUsageEntry | null | undefined> = [];
    let streamUsageCandidate: TokenUsageEntry | undefined;
    let resolveUsage: (usage: TokenUsageSummary | undefined) => void = () => { };
    const usagePromise = new Promise<TokenUsageSummary | undefined>((resolve) => {
        resolveUsage = resolve;
    });

    const stream = (async function* () {
        try {
            const { prompt, stylePreset = 'modern', platform = 'mobile', images = [], assetRefs = [], preferredModel } = options;
            const referenceImages = mergeAssetReferenceImages(images, assetRefs);
            const modelTemperature = resolveModelTemperature(options.temperature, 1);
            console.info('[Gemini] generateDesignStream:start', {
                stylePreset,
                platform,
                imagesCount: images.length,
                assetRefCount: assetRefs.length,
                referenceImageCount: referenceImages.length,
                preferredModel: preferredModel || null,
                temperature: modelTemperature,
                hasProjectDesignSystem: Boolean(options.projectDesignSystem),
                promptPreview: String(prompt || '').slice(0, 180),
            });
            const dimensions = PLATFORM_DIMENSIONS[platform] || PLATFORM_DIMENSIONS.mobile;
            const generationConfig = getGenerationConfig(referenceImages.length > 0, modelTemperature);
            const imageAnalysis = await analyzeReferenceImages(referenceImages);
            const referenceImageUrlGuidance = buildReferenceImageUrlGuidance(referenceImages);
            const assetReferenceGuidance = buildAssetReferenceContextPrompt(assetRefs);
            const designSystemResult = await generateProjectDesignSystem({
                prompt,
                stylePreset,
                platform,
                images,
                assetRefs,
                preferredModel,
                temperature: modelTemperature,
                projectDesignSystem: options.projectDesignSystem,
            });
            usageEntries.push(...(designSystemResult.usage?.entries || []));
            const projectDesignSystem = designSystemResult.designSystem;
            const designSystemGuidance = buildDesignSystemGuidance(projectDesignSystem);

            const userPrompt = `Design: "${prompt}". Platform: ${platform}. Style: ${stylePreset}.
${referenceImages.length ? 'Attached image(s) are PRIMARY reference. Match them strongly.' : ''}
${referenceImages.length ? '' : NO_IMAGE_REFERENCE_QUALITY_RULES}
${imageAnalysis}
${referenceImageUrlGuidance}
${assetReferenceGuidance}
${designSystemGuidance}`;
            const parts: any[] = [{ text: GENERATE_STREAM_PROMPT + '\n\n' + userPrompt }];
            parts.push(...await resolveImageParts(referenceImages));

            const preferredGeminiModel = (!isGroqModel(preferredModel) && !isNvidiaModel(preferredModel))
                ? resolvePreferredModel(preferredModel)
                : undefined;
            const streamModelName = preferredGeminiModel || modelName;
            const streamModel = preferredGeminiModel ? getGenerativeModel(preferredGeminiModel).model : model;

            const result = await streamModel.generateContentStream({
                contents: [{ role: 'user', parts }],
                generationConfig,
            });

            let totalChars = 0;
            for await (const chunk of result.stream) {
                const text = chunk.text();
                totalChars += text.length;
                const parsedChunkUsage = parseGeminiUsageFromResponse(chunk, streamModelName);
                if (parsedChunkUsage) {
                    const currentTotal = Number(streamUsageCandidate?.totalTokens || 0);
                    const nextTotal = Number(parsedChunkUsage.totalTokens || 0);
                    if (!streamUsageCandidate || nextTotal >= currentTotal) {
                        streamUsageCandidate = parsedChunkUsage;
                    }
                }
                yield text;
            }

            try {
                const finalResponse = await result.response;
                const parsedFinalUsage = parseGeminiUsageFromResponse(finalResponse, streamModelName);
                if (parsedFinalUsage) {
                    streamUsageCandidate = parsedFinalUsage;
                }
                const finishReason = finalResponse?.candidates?.[0]?.finishReason || 'UNKNOWN';
                console.info('[Gemini] generateDesignStream: finish', { finishReason, totalChars });
            } catch (err) {
                console.warn('[Gemini] generateDesignStream: failed to read final response metadata', err);
            }
            usageEntries.push(streamUsageCandidate);
        } finally {
            resolveUsage(summarizeTokenUsage(usageEntries));
        }
    })();

    return { stream, usagePromise };
}

export async function* generateDesignStream(options: GenerateOptions): AsyncGenerator<string, void, unknown> {
    const { stream } = generateDesignStreamWithUsage(options);
    for await (const chunk of stream) {
        yield chunk;
    }
}

// ============================================================================
// Editing Logic
// ============================================================================

export interface EditOptions {
    instruction: string;
    html: string;
    screenId: string;
    images?: string[];
    assetRefs?: AssetReference[];
    preferredModel?: string;
    temperature?: number;
    projectDesignSystem?: ProjectDesignSystem;
    consistencyProfile?: {
        canonicalNavbarLabels?: string[];
        canonicalNavbarSignature?: string;
        rules?: string[];
    };
    referenceScreens?: Array<{
        screenId: string;
        name: string;
        html: string;
    }>;
}

export interface GenerateImageOptions {
    prompt: string;
    instruction?: string;
    preferredModel?: string;
}

export interface CompleteScreenOptions {
    screenName: string;
    partialHtml: string;
    prompt?: string;
    platform?: string;
    stylePreset?: string;
    temperature?: number;
    projectDesignSystem?: ProjectDesignSystem;
}

function extractImageSrcFromResponse(response: any): string | null {
    const parts = response?.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
        const inlineData = part?.inlineData;
        if (inlineData?.data && inlineData?.mimeType) {
            return `data:${inlineData.mimeType};base64,${inlineData.data}`;
        }
        const text = (part?.text || '').trim();
        if (!text) continue;
        const dataUrlMatch = text.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/);
        if (dataUrlMatch) return dataUrlMatch[0];
        const urlMatch = text.match(/https?:\/\/[^\s"')>]+/);
        if (urlMatch) return urlMatch[0];
    }
    return null;
}

export async function generateImageAsset(options: GenerateImageOptions): Promise<{
    src: string;
    modelUsed: string;
    description?: string;
    usage?: TokenUsageSummary;
}> {
    const prompt = (options.prompt || '').trim();
    if (!prompt) throw new Error('Prompt is required');

    const extraInstruction = (options.instruction || '').trim();
    const compactBaseInstruction = 'Generate one high-quality UI-ready image only. No text, logos, watermark, UI mockup, or explanation unless specifically requested. Return image output only.';
    const instruction = extraInstruction
        ? `${compactBaseInstruction} ${extraInstruction.slice(0, 240)}`
        : compactBaseInstruction;
    const requestText = `Instruction: ${instruction}\nPrompt: ${prompt.slice(0, 500)}`;
    const parts: any[] = [{ text: requestText }];

    const resolvedPreferredModel = resolvePreferredModel(options.preferredModel || 'image');
    const selectedModel = getGenerativeModel(resolvedPreferredModel);
    console.info('[Gemini] generateImageAsset model:', selectedModel.name);

    try {
        const result = await selectedModel.model.generateContent({
            contents: [{ role: 'user', parts }],
            generationConfig: GENERATION_CONFIG,
        });
        const src = extractImageSrcFromResponse(result.response);
        if (!src) throw new Error('Image model did not return a usable image payload.');
        return {
            src,
            modelUsed: selectedModel.name,
            usage: summarizeTokenUsage([parseGeminiUsageFromResponse(result.response, selectedModel.name)]),
        };
    } catch (error) {
        const shouldFallback =
            Boolean(resolvedPreferredModel) &&
            selectedModel.name !== IMAGE_FALLBACK_MODEL &&
            isQuotaOrRateLimitError(error);

        if (!shouldFallback) throw error;

        console.warn('[Gemini] generateImageAsset preferred model rate-limited/quota-exceeded; falling back', {
            preferredModel: selectedModel.name,
            fallbackModel: IMAGE_FALLBACK_MODEL,
        });

        const fallbackModel = getGenerativeModel(IMAGE_FALLBACK_MODEL);
        const fallbackResult = await fallbackModel.model.generateContent({
            contents: [{ role: 'user', parts }],
            generationConfig: GENERATION_CONFIG,
        });
        const fallbackSrc = extractImageSrcFromResponse(fallbackResult.response);
        if (!fallbackSrc) throw new Error('Fallback image model did not return a usable image payload.');
        return {
            src: fallbackSrc,
            modelUsed: IMAGE_FALLBACK_MODEL,
            description: `(Primary image model unavailable; used fallback model: ${IMAGE_FALLBACK_MODEL}.)`,
            usage: summarizeTokenUsage([parseGeminiUsageFromResponse(fallbackResult.response, IMAGE_FALLBACK_MODEL)]),
        };
    }
}

export async function editDesign(options: EditOptions): Promise<{
    html: string;
    description?: string;
    usage?: TokenUsageSummary;
}> {
    const { instruction, html, images = [], assetRefs = [], preferredModel } = options;
    const referenceImages = mergeAssetReferenceImages(images, assetRefs);
    const usageEntries: Array<TokenUsageEntry | null | undefined> = [];
    const modelTemperature = resolveModelTemperature(options.temperature, 1);
    console.info('[Gemini] editDesign:start', {
        screenId: options.screenId,
        htmlChars: String(html || '').length,
        instructionPreview: String(instruction || '').slice(0, 180),
        imagesCount: images.length,
        assetRefCount: assetRefs.length,
        referenceImageCount: referenceImages.length,
        preferredModel: preferredModel || null,
        temperature: modelTemperature,
        hasProjectDesignSystem: Boolean(options.projectDesignSystem),
        hasConsistencyProfile: Boolean(options.consistencyProfile),
        referenceScreens: (options.referenceScreens || []).map((screen) => screen.name).slice(0, 4),
    });
    const normalizedDesignSystem = options.projectDesignSystem
        ? normalizeProjectDesignSystem(
            options.projectDesignSystem,
            instruction || 'Screen edit',
            options.projectDesignSystem.stylePreset || 'modern',
            options.projectDesignSystem.platform || 'mobile'
        )
        : undefined;
    const designSystemGuidance = normalizedDesignSystem
        ? buildDesignSystemGuidance(normalizedDesignSystem)
        : '';
    const consistencyRules = (options.consistencyProfile?.rules || [])
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .slice(0, 10);
    const referenceScreens = (options.referenceScreens || [])
        .filter((screen) => screen && screen.screenId !== options.screenId)
        .slice(0, 2)
        .map((screen) => ({
            name: String(screen.name || 'Screen').slice(0, 80),
            htmlSnippet: String(screen.html || '').slice(0, 1400),
        }));
    const consistencyGuidance = `
Consistency requirements:
- Keep component language consistent with the existing app.
- Keep navigation decisions context-aware for each screen instead of forcing one navbar style.
- If navigation changes, keep it coherent with the screen goal and overall product UX.
${consistencyRules.length > 0 ? `- Consistency rules:\n${consistencyRules.map((rule) => `  - ${rule}`).join('\n')}` : ''}
${referenceScreens.length > 0 ? `- Reference screens:\n${referenceScreens.map((screen) => `  - ${screen.name}\n${screen.htmlSnippet}`).join('\n')}` : ''}
${designSystemGuidance}`.trim();
    const assetReferenceGuidance = buildAssetReferenceContextPrompt(assetRefs);
    const referenceImageUrlGuidance = buildReferenceImageUrlGuidance(referenceImages);
    const userPrompt = `${EDIT_HTML_PROMPT}\n${consistencyGuidance}\n${referenceImageUrlGuidance}\n${assetReferenceGuidance}\n${html}\n\nUser instruction: "${instruction}"`;
    const fastUserPrompt = `${FAST_EDIT_HTML_PROMPT}\n${consistencyGuidance}\n${referenceImageUrlGuidance}\n${assetReferenceGuidance}\n${html}\n\nUser instruction: "${instruction}"`;

    const parts: any[] = [{ text: userPrompt }];
    parts.push(...await resolveImageParts(referenceImages));

    const parseEditResponse = (raw: string): { html: string; description?: string } => {
        const descriptionMatch = raw.match(/<description>([\s\S]*?)<\/description>/i);
        const description = normalizeUiDescriptionTags(descriptionMatch?.[1]?.trim());
        const withoutDescription = raw.replace(/<description>[\s\S]*?<\/description>/i, '').trim();
        const editedHtml = cleanHtmlResponse(withoutDescription || raw);
        if (!editedHtml.includes('<!DOCTYPE html>')) {
            throw new Error('Gemini failed to return a full HTML document.');
        }
        const normalized = enforceThemeAwareTokenUsage(
            normalizeBrokenLogoPlaceholders(editedHtml),
            normalizedDesignSystem
        );
        return { html: normalized, description };
    };

    if (isGroqModel(preferredModel) || isNvidiaModel(preferredModel)) {
        try {
            const completion = isNvidiaModel(preferredModel)
                ? await nvidiaChatCompletion({
                    model: preferredModel,
                    systemPrompt: 'You are an expert UI designer that edits HTML.',
                    prompt: fastUserPrompt,
                    maxTokens: 1800,
                    temperature: modelTemperature,
                    thinking: false,
                })
                : await groqChatCompletion({
                    model: preferredModel,
                    systemPrompt: 'You are an expert UI designer that edits HTML.',
                    prompt: fastUserPrompt,
                    maxTokens: 1800,
                    temperature: modelTemperature,
                });
            const { text, modelUsed } = completion;
            usageEntries.push(completion.usage);
            const parsed = parseEditResponse(text);
            const note = `(Model: ${modelUsed})`;
            console.info('[Gemini] editDesign:complete-fast-provider', {
                screenId: options.screenId,
                modelUsed,
                htmlChars: parsed.html.length,
                descriptionPreview: String(parsed.description || note).slice(0, 180),
            });
            return {
                html: parsed.html,
                description: parsed.description ? `${parsed.description} ${note}` : note,
                usage: summarizeTokenUsage(usageEntries),
            };
        } catch (error) {
            if (isQuotaOrRateLimitError(error)) {
                throw new Error('Fast model is rate-limited right now. Please wait a few seconds and retry.');
            }
            throw error;
        }
    }

    const resolvedPreferredModel = resolvePreferredModel(preferredModel);
    const selectedModel = getGenerativeModel(resolvedPreferredModel);
    console.info('[Gemini] editDesign model:', selectedModel.name);

    try {
        const result = await selectedModel.model.generateContent({
            contents: [{ role: 'user', parts }],
            generationConfig: {
                ...GENERATION_CONFIG,
                temperature: modelTemperature,
            },
        });
        const parsed = parseEditResponse(result.response.text());
        usageEntries.push(parseGeminiUsageFromResponse(result.response, selectedModel.name));
        console.info('[Gemini] editDesign:complete-gemini', {
            screenId: options.screenId,
            modelUsed: selectedModel.name,
            htmlChars: parsed.html.length,
            descriptionPreview: String(parsed.description || '').slice(0, 180),
        });
        return {
            ...parsed,
            usage: summarizeTokenUsage(usageEntries),
        };
    } catch (error) {
        const shouldFallback =
            Boolean(resolvedPreferredModel) &&
            selectedModel.name !== modelName &&
            isQuotaOrRateLimitError(error);

        if (!shouldFallback) throw error;

        console.warn('[Gemini] editDesign preferred model rate-limited/quota-exceeded; falling back', {
            preferredModel: selectedModel.name,
            fallbackModel: IMAGE_FALLBACK_MODEL,
        });

        const fallbackModel = getGenerativeModel(IMAGE_FALLBACK_MODEL);
        const fallbackResult = await fallbackModel.model.generateContent({
            contents: [{ role: 'user', parts }],
            generationConfig: {
                ...GENERATION_CONFIG,
                temperature: modelTemperature,
            },
        });
        const parsed = parseEditResponse(fallbackResult.response.text());
        usageEntries.push(parseGeminiUsageFromResponse(fallbackResult.response, IMAGE_FALLBACK_MODEL));
        const fallbackNote = `(Image model quota exceeded; used fallback model: ${IMAGE_FALLBACK_MODEL}.)`;
        console.info('[Gemini] editDesign:complete-fallback', {
            screenId: options.screenId,
            modelUsed: IMAGE_FALLBACK_MODEL,
            htmlChars: parsed.html.length,
            descriptionPreview: String(parsed.description || fallbackNote).slice(0, 180),
        });
        return {
            html: parsed.html,
            description: parsed.description ? `${parsed.description} ${fallbackNote}` : fallbackNote,
            usage: summarizeTokenUsage(usageEntries),
        };
    }
}

export function editDesignStreamWithUsage(options: EditOptions): {
    stream: AsyncGenerator<string, void, unknown>;
    usagePromise: Promise<TokenUsageSummary | undefined>;
} {
    const usageEntries: Array<TokenUsageEntry | null | undefined> = [];
    let streamUsageCandidate: TokenUsageEntry | undefined;
    let resolveUsage: (usage: TokenUsageSummary | undefined) => void = () => { };
    const usagePromise = new Promise<TokenUsageSummary | undefined>((resolve) => {
        resolveUsage = resolve;
    });

    const stream = (async function* () {
        try {
            const { instruction, html, images = [], assetRefs = [], preferredModel } = options;
            const referenceImages = mergeAssetReferenceImages(images, assetRefs);
            const modelTemperature = resolveModelTemperature(options.temperature, 1);
            const normalizedDesignSystem = options.projectDesignSystem
                ? normalizeProjectDesignSystem(
                    options.projectDesignSystem,
                    instruction || 'Screen edit',
                    options.projectDesignSystem.stylePreset || 'modern',
                    options.projectDesignSystem.platform || 'mobile'
                )
                : undefined;
            const designSystemGuidance = normalizedDesignSystem
                ? buildDesignSystemGuidance(normalizedDesignSystem)
                : '';
            const consistencyRules = (options.consistencyProfile?.rules || [])
                .map((item) => String(item || '').trim())
                .filter(Boolean)
                .slice(0, 10);
            const referenceScreens = (options.referenceScreens || [])
                .filter((screen) => screen && screen.screenId !== options.screenId)
                .slice(0, 2)
                .map((screen) => ({
                    name: String(screen.name || 'Screen').slice(0, 80),
                    htmlSnippet: String(screen.html || '').slice(0, 1400),
                }));
            const consistencyGuidance = `
Consistency requirements:
- Keep component language consistent with the existing app.
- Keep navigation decisions context-aware for each screen instead of forcing one navbar style.
- If navigation changes, keep it coherent with the screen goal and overall product UX.
${consistencyRules.length > 0 ? `- Consistency rules:\n${consistencyRules.map((rule) => `  - ${rule}`).join('\n')}` : ''}
${referenceScreens.length > 0 ? `- Reference screens:\n${referenceScreens.map((screen) => `  - ${screen.name}\n${screen.htmlSnippet}`).join('\n')}` : ''}
${designSystemGuidance}`.trim();
            const assetReferenceGuidance = buildAssetReferenceContextPrompt(assetRefs);
            const referenceImageUrlGuidance = buildReferenceImageUrlGuidance(referenceImages);
            const streamPrompt = `${STREAM_EDIT_HTML_PROMPT}\n${consistencyGuidance}\n${referenceImageUrlGuidance}\n${assetReferenceGuidance}\n${html}\n\nUser instruction: "${instruction}"`;
            const parts: any[] = [{ text: streamPrompt }];
            parts.push(...await resolveImageParts(referenceImages));

            if (isGroqModel(preferredModel) || isNvidiaModel(preferredModel)) {
                const edited = await editDesign(options);
                if (edited.usage?.entries?.length) {
                    usageEntries.push(...edited.usage.entries);
                }
                yield edited.html;
                return;
            }

            const resolvedPreferredModel = resolvePreferredModel(preferredModel);
            const selectedModel = getGenerativeModel(resolvedPreferredModel);
            const result = await selectedModel.model.generateContentStream({
                contents: [{ role: 'user', parts }],
                generationConfig: {
                    ...GENERATION_CONFIG,
                    temperature: modelTemperature,
                },
            });

            for await (const chunk of result.stream) {
                const text = chunk.text();
                const parsedChunkUsage = parseGeminiUsageFromResponse(chunk, selectedModel.name);
                if (parsedChunkUsage) {
                    const currentTotal = Number(streamUsageCandidate?.totalTokens || 0);
                    const nextTotal = Number(parsedChunkUsage.totalTokens || 0);
                    if (!streamUsageCandidate || nextTotal >= currentTotal) {
                        streamUsageCandidate = parsedChunkUsage;
                    }
                }
                yield text;
            }

            try {
                const finalResponse = await result.response;
                const parsedFinalUsage = parseGeminiUsageFromResponse(finalResponse, selectedModel.name);
                if (parsedFinalUsage) {
                    streamUsageCandidate = parsedFinalUsage;
                }
            } catch (err) {
                console.warn('[Gemini] editDesignStream: failed to read final response metadata', err);
            }
            usageEntries.push(streamUsageCandidate);
        } finally {
            resolveUsage(summarizeTokenUsage(usageEntries));
        }
    })();

    return { stream, usagePromise };
}

export async function completePartialScreen(options: CompleteScreenOptions): Promise<{
    html: string;
    usage?: TokenUsageSummary;
}> {
    const { screenName, partialHtml, prompt, platform, stylePreset } = options;
    const modelTemperature = resolveModelTemperature(options.temperature, 1);
    const projectDesignSystem = options.projectDesignSystem
        ? normalizeProjectDesignSystem(
            options.projectDesignSystem,
            prompt || screenName,
            stylePreset || 'modern',
            platform || 'mobile'
        )
        : buildFallbackProjectDesignSystem(prompt || screenName, stylePreset || 'modern', platform || 'mobile');
    const designSystemGuidance = buildDesignSystemGuidance(projectDesignSystem);
    const userPrompt = `${COMPLETE_PARTIAL_SCREEN_PROMPT}
Screen name: ${screenName}
Original request: ${prompt || 'N/A'}
Platform: ${platform || 'unknown'}
Style: ${stylePreset || 'unknown'}
${designSystemGuidance}

Partial HTML:
${partialHtml}
`;

    const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
            ...GENERATION_CONFIG,
            temperature: modelTemperature,
        },
    });

    const completedHtml = cleanHtmlResponse(result.response.text());
    if (!completedHtml.includes('<!DOCTYPE html>') || !completedHtml.match(/<\/html>/i)) {
        throw new Error('Gemini failed to return a complete HTML document for partial screen completion.');
    }
    return {
        html: enforceThemeAwareTokenUsage(
            enforcePlaceholderCatalogUrls(completedHtml),
            projectDesignSystem
        ),
        usage: summarizeTokenUsage([parseGeminiUsageFromResponse(result.response, modelName)]),
    };
}

// ============================================================================
// Helpers
// ============================================================================

type RawScreen = { name: string; html: string };
type ParsedDesign = { description?: string; screens: RawScreen[]; parsedOk: boolean };

function looksLikeJsonBlob(text: string): boolean {
    const sample = text.slice(0, 2000);
    return sample.includes('"description"') || sample.includes('"screens"');
}

function ensureCompleteHtmlDocument(input: string): string {
    let html = (input || '').trim();
    if (!html) return html;
    if (!/<!doctype html>/i.test(html)) {
        html = `<!DOCTYPE html>\n${html}`;
    }
    if (!/<html[\s>]/i.test(html)) {
        html = `<html><head></head><body>${html}</body></html>`;
    }
    if (!/<head[\s>]/i.test(html)) {
        html = html.replace(/<html([^>]*)>/i, '<html$1><head></head>');
    }
    if (!/<body[\s>]/i.test(html)) {
        html = html.replace(/<\/head>/i, '</head><body>');
    }
    if (!/<\/body>/i.test(html)) {
        html += '\n</body>';
    }
    if (!/<\/html>/i.test(html)) {
        html += '\n</html>';
    }
    return html;
}

function normalizeFastFrameworkAssets(html: string): string {
    if (!html) return html;
    let next = html;
    next = next.replace(/<link[^>]+tailwind[^>]*>/gi, '');
    const hasTailwindScript = /<script[^>]+src=["']https:\/\/cdn\.tailwindcss\.com["'][^>]*><\/script>/i.test(next);
    if (!hasTailwindScript && /<\/head>/i.test(next)) {
        next = next.replace(/<\/head>/i, '<script src="https://cdn.tailwindcss.com"></script></head>');
    }
    return next;
}

function enforceFastWorkingImageUrls(html: string): string {
    if (!html || !/<img\b/i.test(html)) return html;
    let mapIndex = 0;

    return html.replace(/<img\b[^>]*>/gi, (tag: string) => {
        const srcMatch = tag.match(/\bsrc\s*=\s*(["'])(.*?)\1/i);
        const currentSrc = (srcMatch?.[2] || '').trim();
        const context = `${tag} ${currentSrc}`.toLowerCase();
        const isMap = /map|location|route|pin|geo/.test(context);
        if (!isMap) return tag;

        const src = FAST_MAP_IMAGE_FALLBACKS[mapIndex++ % FAST_MAP_IMAGE_FALLBACKS.length];

        if (srcMatch) {
            return tag.replace(/\bsrc\s*=\s*(["']).*?\1/i, `src="${src}"`);
        }
        return tag.replace(/<img\b/i, `<img src="${src}"`);
    });
}

function enforcePlaceholderCatalogUrls(html: string): string {
    if (!html || !/<img\b/i.test(html)) return html;
    let mapIndex = 0;

    const normalizeMapSrc = (tag: string, rawSrc: string): string => {
        const src = (rawSrc || '').trim();
        const context = `${tag} ${src}`.toLowerCase();
        const isMap = /map|location|route|pin|geo/.test(context);
        if (!isMap) return src;

        const dims = src.match(/(\d{2,4})x(\d{2,4})/i);
        const w = dims ? Number(dims[1]) : 0;
        const h = dims ? Number(dims[2]) : 0;
        const ratio = w > 0 && h > 0 ? w / h : 1;

        if (ratio >= 1.8) return 'https://placehold.net/map-1200x600.png';
        if (ratio >= 1.3) return 'https://placehold.net/map-600x400.png';
        if (ratio <= 0.78) return 'https://placehold.net/map-400x600.png';
        if (w >= 500 && h >= 500) return 'https://placehold.net/map-600x600.png';
        return PLACEHOLDER_MAP_ALLOWED[mapIndex++ % PLACEHOLDER_MAP_ALLOWED.length];
    };

    return html.replace(/<img\b[^>]*>/gi, (tag: string) => {
        const srcMatch = tag.match(/\bsrc\s*=\s*(["'])(.*?)\1/i);
        const currentSrc = srcMatch?.[2] || '';
        const nextSrc = normalizeMapSrc(tag, currentSrc);
        if (nextSrc === currentSrc) return tag;
        let nextTag = tag;
        if (srcMatch) {
            nextTag = nextTag.replace(/\bsrc\s*=\s*(["'])(.*?)\1/i, `src="${nextSrc}"`);
        } else {
            nextTag = nextTag.replace(/<img\b/i, `<img src="${nextSrc}"`);
        }
        if (/\bsrcset\s*=\s*(["'])(.*?)\1/i.test(nextTag)) {
            nextTag = nextTag.replace(/\bsrcset\s*=\s*(["'])(.*?)\1/i, `srcset="${nextSrc}"`);
        }
        return nextTag;
    });
}

function normalizeBrokenLogoPlaceholders(html: string): string {
    if (!html) return html;

    const brandIcons: Array<{ pattern: RegExp; icon: string }> = [
        { pattern: /\bLOGO[_\-\s]*GOOGLE\b/gi, icon: 'simple-icons:google' },
        { pattern: /\bLOGO[_\-\s]*FACEBOOK\b/gi, icon: 'simple-icons:facebook' },
        { pattern: /\bLOGO[_\-\s]*APPLE\b/gi, icon: 'simple-icons:apple' },
        { pattern: /\bLOGO[_\-\s]*GITHUB\b/gi, icon: 'simple-icons:github' },
        { pattern: /\bLOGO[_\-\s]*(TWITTER|X)\b/gi, icon: 'simple-icons:x' },
        { pattern: /\bLOGO[_\-\s]*LINKEDIN\b/gi, icon: 'simple-icons:linkedin' },
        { pattern: /\bLOGO[_\-\s]*INSTAGRAM\b/gi, icon: 'simple-icons:instagram' },
    ];

    let next = html;
    let replacedBrand = false;
    for (const entry of brandIcons) {
        if (entry.pattern.test(next)) replacedBrand = true;
        entry.pattern.lastIndex = 0;
        next = next.replace(
            entry.pattern,
            `<iconify-icon icon="${entry.icon}" width="20" height="20" style="vertical-align:middle"></iconify-icon>`
        );
    }

    const needsIconify = replacedBrand || /<iconify-icon\b/i.test(next);
    const hasIconifyScript = /<script[^>]+src=["']https:\/\/code\.iconify\.design\/iconify-icon\/2\.1\.0\/iconify-icon\.min\.js["'][^>]*><\/script>/i.test(next);

    if (needsIconify && !hasIconifyScript && /<\/head>/i.test(next)) {
        next = next.replace(
            /<\/head>/i,
            '<script src="https://code.iconify.design/iconify-icon/2.1.0/iconify-icon.min.js"></script></head>'
        );
    }

    return next;
}

function normalizeHexColor(value: string): string | null {
    const parsed = parseHexColor(value);
    if (!parsed) return null;
    return rgbToHex(parsed.r, parsed.g, parsed.b).toLowerCase();
}

function luminanceFromHex(value: string): number | null {
    const parsed = parseHexColor(value);
    if (!parsed) return null;
    return relativeLuminance(parsed.r, parsed.g, parsed.b);
}

function hasClassPrefix(classList: string[], prefix: string): boolean {
    return classList.some((item) => item === prefix || item.startsWith(`${prefix}/`));
}

function chooseRoleForBg(classList: string[]): keyof ProjectDesignSystem['tokens'] {
    if (hasClassPrefix(classList, 'bg-bg')) return 'bg';
    if (hasClassPrefix(classList, 'bg-surface2')) return 'surface2';
    if (hasClassPrefix(classList, 'bg-surface') || classList.includes('bg-white')) return 'surface';
    if (hasClassPrefix(classList, 'from-bg') || hasClassPrefix(classList, 'to-bg') || hasClassPrefix(classList, 'via-bg')) return 'bg';
    if (hasClassPrefix(classList, 'from-surface2') || hasClassPrefix(classList, 'to-surface2') || hasClassPrefix(classList, 'via-surface2')) return 'surface2';
    if (hasClassPrefix(classList, 'from-surface') || hasClassPrefix(classList, 'to-surface') || hasClassPrefix(classList, 'via-surface')) return 'surface';
    return 'surface';
}

function chooseRoleForText(classList: string[]): keyof ProjectDesignSystem['tokens'] {
    if (hasClassPrefix(classList, 'text-muted')) return 'muted';
    if (hasClassPrefix(classList, 'text-text')) return 'text';
    return 'text';
}

function chooseRoleForBorder(classList: string[]): keyof ProjectDesignSystem['tokens'] {
    if (hasClassPrefix(classList, 'border-stroke')) return 'stroke';
    return 'stroke';
}

function enforceThemeAwareTokenUsage(
    html: string,
    projectDesignSystem?: ProjectDesignSystem
): string {
    if (!html) return html;

    const fallbackDarkTokens: ProjectDesignSystem['tokens'] = {
        bg: '#0b1020',
        surface: '#121933',
        surface2: '#1c2444',
        text: '#f3f7ff',
        muted: '#9aa7c7',
        stroke: '#2a3764',
        accent: '#4f8cff',
        accent2: '#1cc8e8',
    };

    const modeTokens = projectDesignSystem
        ? (projectDesignSystem.tokenModes || resolveTokenModesFromSource(projectDesignSystem.tokens, projectDesignSystem.themeMode))
        : null;
    const darkTokens = modeTokens?.dark || fallbackDarkTokens;

    let nextHtml = String(html || '');
    let changed = false;

    // Remove invalid nested colors.dark object in tailwind.config output.
    const withoutNestedDarkPalette = nextHtml.replace(/\bdark\s*:\s*\{[\s\S]*?\}\s*,?/gi, (full) => {
        const normalized = full.trim();
        if (!normalized.startsWith('dark:')) return full;
        changed = true;
        return '';
    });
    nextHtml = withoutNestedDarkPalette;

    const rewriteClassToken = (token: string, classList: string[]): string => {
        const match = token.match(/^dark:(bg|text|border|from|to|via)-\[#([0-9a-fA-F]{3,8})\](\/\d{1,3})?$/);
        const named = token.match(/^dark:(bg|text|border|from|to|via)-(white|black)(\/\d{1,3})?$/);

        let property: 'bg' | 'text' | 'border' | 'from' | 'to' | 'via' | null = null;
        let hex: string | null = null;
        let opacity = '';

        if (match) {
            property = match[1] as any;
            hex = normalizeHexColor(`#${match[2]}`);
            opacity = match[3] || '';
        } else if (named) {
            property = named[1] as any;
            hex = named[2] === 'white' ? '#ffffff' : '#000000';
            opacity = named[3] || '';
        }
        if (!property || !hex) return token;

        const luminance = luminanceFromHex(hex);
        const isBright = typeof luminance === 'number' ? luminance > 0.62 : false;
        const isDarkValue = typeof luminance === 'number' ? luminance < 0.36 : false;

        if (property === 'bg' || property === 'from' || property === 'to' || property === 'via') {
            const role = chooseRoleForBg(classList);
            if (isBright) {
                changed = true;
                return `dark:${property}-[${darkTokens[role]}]${opacity}`;
            }
            if (property === 'bg' && token === 'dark:bg-black') {
                changed = true;
                return `dark:bg-[${darkTokens.surface}]${opacity}`;
            }
            return token;
        }

        if (property === 'text') {
            const role = chooseRoleForText(classList);
            if (isDarkValue || token === 'dark:text-black') {
                changed = true;
                return `dark:text-[${darkTokens[role]}]${opacity}`;
            }
            if (isBright && role === 'muted') {
                changed = true;
                return `dark:text-[${darkTokens.muted}]${opacity}`;
            }
            return token;
        }

        if (property === 'border') {
            const role = chooseRoleForBorder(classList);
            if (isBright || token === 'dark:border-white') {
                changed = true;
                return `dark:border-[${darkTokens[role]}]${opacity}`;
            }
            return token;
        }

        return token;
    };

    nextHtml = nextHtml.replace(/\bclass\s*=\s*(["'])([\s\S]*?)\1/gi, (full, quote: string, classValue: string) => {
        const classes = String(classValue || '').split(/\s+/).filter(Boolean);
        if (classes.length === 0) return full;
        const rewritten = classes.map((token) => rewriteClassToken(token, classes));
        if (rewritten.join(' ') === classes.join(' ')) return full;
        return `class=${quote}${rewritten.join(' ')}${quote}`;
    });

    return changed ? nextHtml : html;
}

function recoverHtmlFromMalformedFastOutput(raw: string): string | null {
    const text = (raw || '').trim();
    if (!text) return null;

    // If JSON got serialized into text, try to parse it back and extract first screen HTML.
    if (looksLikeJsonBlob(text)) {
        try {
            const parsed = parseJsonSafe(cleanJsonResponse(text)) as { screens?: Array<{ html?: string }> };
            const candidate = (parsed.screens || []).find((s) => typeof s?.html === 'string')?.html || '';
            if (candidate.trim()) {
                const unescaped = candidate.replace(/\\n/g, '\n').replace(/\\"/g, '"');
                return ensureCompleteHtmlDocument(unescaped);
            }
        } catch {
            // continue to next fallback
        }
    }

    // If we only got escaped HTML-ish text, unescape and wrap.
    let unescaped = text.replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
    const firstHtmlIdxCandidates = [
        unescaped.search(/<!doctype html>/i),
        unescaped.search(/<html[\s>]/i),
        unescaped.search(/<body[\s>]/i),
        unescaped.search(/<main[\s>]/i),
        unescaped.search(/<div[\s>]/i),
    ].filter((idx) => idx >= 0);
    if (firstHtmlIdxCandidates.length > 0) {
        const firstHtmlIdx = Math.min(...firstHtmlIdxCandidates);
        if (firstHtmlIdx > 0) {
            unescaped = unescaped.slice(firstHtmlIdx).trim();
        }
    }
    if (/<[a-z][\s\S]*>/i.test(unescaped)) {
        return ensureCompleteHtmlDocument(unescaped);
    }

    return null;
}

async function generateDesignOnce(
    parts: any[],
    preferredModelName?: string,
    generationConfig = GENERATION_CONFIG
): Promise<ParsedDesign & { usage?: TokenUsageSummary }> {
    console.info('[Gemini] generateDesignOnce: start');
    const activeModelName = normalizeGeminiTextModel(preferredModelName || modelName);
    const fallbackModelName = resolveGeminiTextFallbackModel(activeModelName);

    const runAttempt = async (candidateModelName: string) => {
        const activeModel = candidateModelName === modelName ? model : getGenerativeModel(candidateModelName).model;
        const result = await activeModel.generateContent({
            contents: [{ role: 'user', parts }],
            generationConfig,
        });
        const responseText = result.response.text();
        console.info(`[Gemini] generateDesignOnce: received ${responseText.length} chars`);
        return {
            modelUsed: candidateModelName,
            result,
            responseText,
        };
    };

    let attempt;
    try {
        attempt = await runAttempt(activeModelName);
    } catch (error) {
        const shouldFallback = activeModelName !== fallbackModelName && isGeminiModelResolutionError(error);
        if (!shouldFallback) throw error;
        console.warn('[Gemini] generateDesignOnce: falling back to stable model', {
            requestedModel: activeModelName,
            fallbackModel: fallbackModelName,
            message: (error as Error)?.message || String(error),
        });
        attempt = await runAttempt(fallbackModelName);
    }

    let parsedResponse: ParsedDesign;
    try {
        const cleanedJson = cleanJsonResponse(attempt.responseText);
        parsedResponse = {
            ...(parseJsonSafe(cleanedJson) as { description?: string; screens: { name: string; html: string }[] }),
            parsedOk: true,
        };
    } catch (e) {
        console.error('Failed to parse JSON, attempting fallback:', e);
        if (attempt.responseText.includes('<!DOCTYPE html>')) {
            const html = cleanHtmlResponse(attempt.responseText);
            parsedResponse = { screens: [{ name: 'Generated Screen', html }], parsedOk: false };
        } else {
            parsedResponse = { screens: [], parsedOk: false };
        }
    }

    return {
        description: parsedResponse.description,
        screens: parsedResponse.screens.map(s => {
            const rawHtml = cleanHtmlResponse(s.html);
            const recovered = recoverHtmlFromMalformedFastOutput(rawHtml);
            const finalHtml = recovered || ensureCompleteHtmlDocument(rawHtml);
            return {
                name: s.name,
                html: enforcePlaceholderCatalogUrls(finalHtml),
            };
        }),
        parsedOk: parsedResponse.parsedOk,
        usage: summarizeTokenUsage([parseGeminiUsageFromResponse(attempt.result.response, attempt.modelUsed)]),
    };
}

/**
 * Strips markdown code fences and whitespace from HTML strings.
 */
function cleanHtmlResponse(html: string): string {
    return html
        .replace(/^```html\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
}

/**
 * Extracts the first JSON object found in the text.
 * More robust than simple string replacement for LLM output.
 */
function cleanJsonResponse(text: string): string {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    let source = fenced ? fenced[1] : text;

    // Handle unterminated fences like: "```json\n{...".
    source = source
        .replace(/^\s*```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();

    const extracted = extractFirstJsonObject(source);
    return extracted ?? source.trim();
}

function parseJsonSafe(text: string) {
    const normalized = text
        .replace(/^\uFEFF/, '')
        .replace(/^\s*```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();

    const extracted = extractFirstJsonObject(normalized) ?? normalized;
    // Remove trailing commas before } or ]
    const withoutTrailing = extracted.replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(withoutTrailing);
}

function extractFirstJsonObject(text: string): string | null {
    let start = -1;
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (escape) {
            escape = false;
            continue;
        }
        if (ch === '\\') {
            if (inString) escape = true;
            continue;
        }
        if (ch === '"') {
            inString = !inString;
            continue;
        }
        if (inString) continue;

        if (ch === '{') {
            if (start === -1) start = i;
            depth++;
        } else if (ch === '}') {
            if (start !== -1) {
                depth--;
                if (depth === 0) {
                    return text.substring(start, i + 1);
                }
            }
        }
    }

    return null;
}

// Legacy Exports
export type { HtmlDesignSpec as DesignSpec };
export type Patch = { op: string; path: string; value: unknown };
