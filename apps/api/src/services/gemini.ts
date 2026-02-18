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
const modelName = envModel.length > 0 ? envModel : 'gemini-2.5-pro';
const model = genAI.getGenerativeModel({
    model: modelName,
});
console.info(`[Gemini] Using model: ${modelName} (env: ${envModel || 'unset'})`);

function getGenerativeModel(preferredModel?: string) {
    const requested = (preferredModel || '').trim();
    const resolved = requested.length > 0 ? requested : modelName;
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
const IMAGE_PRIMARY_MODEL = imagePrimaryEnvModel || 'gemini-3-pro-image-preview';
const IMAGE_FALLBACK_MODEL = imageFallbackEnvModel || 'gemini-2.5-flash-image';
console.info(`[Gemini] Image edit model: ${IMAGE_PRIMARY_MODEL} (env: ${imagePrimaryEnvModel || 'unset'})`);
console.info(`[Gemini] Image fallback model: ${IMAGE_FALLBACK_MODEL} (env: ${imageFallbackEnvModel || 'unset'})`);

function resolvePreferredModel(preferredModel?: string): string | undefined {
    const requested = (preferredModel || '').trim();
    if (!requested) return undefined;
    if (requested === 'image') return IMAGE_PRIMARY_MODEL;
    return requested;
}


const GENERATION_CONFIG = {
    temperature: 1.0,
    topP: 0.9,
    maxOutputTokens: 16384,
};

function getGenerationConfig(hasReferenceImages: boolean) {
    if (!hasReferenceImages) return GENERATION_CONFIG;
    return {
        ...GENERATION_CONFIG,
        temperature: 0.35,
        topP: 0.85,
    };
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

export interface HtmlDesignSpec {
    id: string;
    name: string;
    screens: HtmlScreen[];
    description?: string;
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
Each screen MUST define a unique Tailwind token palette INSIDE <head>:

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
- Accent usage must be restrained: only primary CTAs, key highlights, and active states.
`;

const IMAGE_WHITELIST = `
IMAGES (STRICT, PLACEHOLDER-FIRST):
For INITIAL screen generation, use placeholder URLs from placeholder.net only.
These placeholders are temporary and will be replaced later by generated assets.

Generic content images:
- https://placehold.net/400x400.png
- https://placehold.net/600x600.png
- https://placehold.net/400x600.png
- https://placehold.net/600x800.png
- https://placehold.net/600x400.png
- https://placehold.net/800x600.png
- https://placehold.net/1200x600.png

Map images (use for maps/location blocks):
- https://placehold.net/map-400x400.png
- https://placehold.net/map-600x600.png
- https://placehold.net/map-400x600.png
- https://placehold.net/map-600x400.png
- https://placehold.net/map-1200x600.png

Avatar / people images (use for profile/user chips/comments/creators):
- https://placehold.net/avatar.svg
- https://placehold.net/avatar.png
- https://placehold.net/avatar-2.svg
- https://placehold.net/avatar-2.png
- https://placehold.net/avatar-3.svg
- https://placehold.net/avatar-3.png
- https://placehold.net/avatar-4.svg
- https://placehold.net/avatar-4.png
- https://placehold.net/avatar-5.svg
- https://placehold.net/avatar-5.png

Rules:
- Choose placeholder type by context:
  - map/location -> map placeholders
  - user/profile/people -> avatar placeholders
  - everything else -> generic placeholders
- Do not use Unsplash/Pexels/source.unsplash or other image domains in initial HTML.
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
- The runtime device node renders status bar chrome globally. Your HTML must start with app content only.
- If needed, add top spacing for app content using padding/margin, but never include OS status bar UI.
`;

const GENERATE_HTML_PROMPT = `You are a world-class UI designer creating stunning, Dribbble-quality mobile app screens.

TASK: Generate a set of HTML screens for the requested UI design.

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

DESIGN PHILOSOPHY (CRITICAL — follow these strictly):
You are designing screens that would win awards on Dribbble or Behance. Before writing any code, THINK about what makes this specific app unique and design accordingly.

THINK BEFORE YOU DESIGN:
- What is the app's personality? A finance app should feel trustworthy and clean. A music app should feel vibrant and expressive. A food app should feel warm and appetizing.
- What emotions should the user feel? Design around that feeling, not around a generic template.
- Each screen should have a clear visual focal point — a hero image, a bold stat, a featured card — NOT just a list of items.

NAVIGATION — CONTEXT-AWARE & PLATFORM-SPECIFIC:
- MOBILE:
  - Professional/Finance: Clean, structured fixed bottom nav or top tab bar.
  - Creative/Social: Floating pill-shaped bottom bar with backdrop-blur or fixed bottom bar with backdrop-blur.
- DESKTOP / TABLET:
  - Use a left sidebar navigation (fixed or collapsible) OR a robust top navigation header.
  - PROHIBITED: Do NOT use bottom navigation bars on Desktop/Tablet.
- General:
  - Detail screens: Minimal top bar with back arrow.
  - Splash/Welcome: NO navigation.
- NEVER stamp the same navigation style onto every screen.

LAYOUT COMPOSITION — NOT TEMPLATES:
- Design each screen like an editorial page, NOT a form or a list.
- Use asymmetric layouts: mix full-width hero sections with offset cards, overlapping elements, and varied column widths.
- Create visual hierarchy with SIZE CONTRAST: one large featured item alongside smaller supporting items, not a grid of identical cards.
- Use full-bleed images with gradient overlays (bg-gradient-to-t from-black/80 via-black/40 to-transparent) as hero sections.
- Stack content in interesting ways: overlap an avatar over a header, float a price badge over an image, use negative margins creatively.
- Vary card sizes within the same screen — one tall card next to two short ones, horizontal scrollable chips, etc.

GLASSMORPHISM & DEPTH:
- Use backdrop-blur-lg with semi-transparent backgrounds (bg-white/5, bg-white/10, bg-black/20) for cards, navs, and overlays.
- Layer elements with colored shadows that match the theme (e.g. shadow-xl shadow-amber-500/10 for a warm app), NOT plain gray shadows.
- Create visual depth: background layer → content layer → floating UI layer.

TYPOGRAPHY & SPACING:
- Use a TWO-FONT pairing: a display font (font-display) for hero headings + Plus Jakarta Sans (font-sans) for body/meta.
- Use bold, large display headings (text-3xl or text-4xl, font-bold) with tracking-tight for screen titles.
- Create clear hierarchy: title → subtitle → body → caption, each with distinct size and opacity.
- Use generous spacing: p-6 minimum on containers, space-y-5 or space-y-6 between sections.
- Add leading-relaxed for body text readability.

VISUAL RICHNESS:
- Use large border-radius: rounded-2xl for cards, rounded-3xl for containers, rounded-full for avatars, pills, and tags.
- Use colored accent borders or rings (e.g. ring-2 ring-purple-500/30) to highlight interactive elements.
- Add subtle state indicators: active dots, progress bars, status badges with colored backgrounds.
- Use emoji or styled badges for engagement (ratings, tags, status).

PROHIBITED PATTERNS:
- No plain white or plain gray backgrounds with basic colored buttons.
- No uniform grid of identical cards (vary sizes, add a featured/hero card).
- No basic unstyled list views without imagery or visual hierarchy.
- No screens that look like default Bootstrap, Material Design, or generic HTML templates.
- No identical navigation bars stamped onto every single screen.

STYLING & CONTENT:
- THEME & COLOR: You MUST decide the colors and overall theme (light, dark, or vibrant). Use the token contract.
- ALWAYS prefer CSS Gradients for containers and decorative elements.

${TOKEN_CONTRACT}
${IMAGE_WHITELIST}
${ANTI_GENERIC_RULES}
${ICON_POLICY_RULES}
${DEVICE_CHROME_RULES}
${EDIT_TAGGING_RULES}
${MAP_SCREEN_RULES}
`;

const GENERATE_STREAM_PROMPT = `You are a world-class UI designer. Stream the output using XML blocks.

STRUCTURE RULE (STRICT):
1. Output all <screen> blocks first.
2. Output exactly ONE <description> block after ALL screens. 
3. The description must be a concise bulleted summary of ALL screens (e.g. "The designs for [app] have been generated:\\n- Screen 1: [Summary]\\n- Screen 2: [Summary]").
   - Include UI display tags in description for rich rendering:
     [h2]...[/h2], [p]...[/p], [li]...[/li], [b]...[/b], [i]...[/i]
4. DO NOT repeat the <description> block.
5. Every <screen> MUST end with a closing </screen> tag.
6. Do NOT end output until ALL </screen> tags are closed.
7. After the final </description>, output <done/> on its own line.
8. If unsure, repeat the final </screen> and then stop.

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
<description>
[Concise summary of all screens]
</description>

MANDATORY ASSETS:
- Tailwind CDN: <script src="https://cdn.tailwindcss.com"></script>
- Fonts: include Plus Jakarta Sans + one display font via Google Fonts
- Material Symbols Rounded

DESIGN PHILOSOPHY (CRITICAL):
Design award-winning screens. THINK about what makes this app unique before coding.

THINK FIRST:
- What is the app's personality? Finance = trustworthy. Music = vibrant. Food = warm. Design around that feeling.
- Each screen needs a clear visual focal point — a hero image, a bold stat, a featured card — NOT just a list.

NAVIGATION — CONTEXT-AWARE & PLATFORM-SPECIFIC:
- MOBILE: Finance=Fixed Bottom, Creative=Floating Pill. 
- DESKTOP: Sidebar or Top Header. NO bottom nav.
- Detail screens: Back button only. Splash: No nav.

LAYOUT COMPOSITION:
- Design like an editorial page, NOT a form or list.
- Use asymmetric layouts: full-width hero + offset cards, overlapping elements, varied card sizes.
- SIZE CONTRAST: one large featured item with smaller supporting items, not identical card grids.
- Full-bleed images with gradient overlays as hero sections.
- Overlap elements creatively: avatar over header, price badge over image.

GLASSMORPHISM & DEPTH:
- backdrop-blur-lg + semi-transparent backgrounds (bg-white/5, bg-white/10, bg-black/20).
- Colored shadows matching the theme (shadow-xl shadow-amber-500/10), NOT plain gray.
- Depth layers: background → content → floating UI.

TYPOGRAPHY: Use font-display for hero headings and font-sans for body. Bold headings (text-3xl+, tracking-tight), clear hierarchy, generous spacing (p-6+, space-y-5+).

PROHIBITED:
- No plain white/gray backgrounds with basic colored buttons unless needed or requested.
- No uniform grids of identical cards. Vary sizes, add featured items.
- No generic Bootstrap/Material Design templates.

${TOKEN_CONTRACT}
${IMAGE_WHITELIST}
${ANTI_GENERIC_RULES}
${ICON_POLICY_RULES}
${DEVICE_CHROME_RULES}
${EDIT_TAGGING_RULES}
${MAP_SCREEN_RULES}

Follow the same STYLING, IMAGE, and MATERIAL SYMBOL rules as the standard generation. 
CRITICAL: The <screen name="..."> attribute MUST match the actual HTML content of that screen!
CRITICAL: Every <screen> block MUST be a COMPLETE HTML document.
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
5. Do not introduce non-whitelisted image domains.
`;

const EDIT_HTML_PROMPT = `You are an expert UI designer. Edit the existing HTML.
1. Modify the HTML to satisfy the user instruction.
2. Return:
   <description>[One to two concise sentences summarizing what changed and why]</description>
   followed by the complete, modified HTML document.
3. Preserve all <head> imports and the token contract (tailwind.config with semantic tokens).
4. Preserve data-uid and data-editable attributes on existing elements.
5. You MAY restructure layout to achieve the instruction.
6. PROHIBITED: Do NOT use "source.unsplash.com" or other non-whitelisted image domains.
7. Do NOT design or include a mobile OS status bar (time/signal/wifi/battery row). Device chrome is provided by runtime.
8. Do NOT use markdown fences.

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
- Add depth with at least 2 of: gradient background, glass/blur panel, soft shadow, layered overlap.
- Use prompt-specific labels; no filler copy (no "Lorem ipsum", "Item 1", "Product Name").
- Define tailwind.config theme.extend.colors with semantic tokens: bg, surface, text, muted, accent.
- Use those semantic tokens for major surfaces and CTA.
- Avoid invented class names that are not valid Tailwind utilities.
- Brand icons must use Iconify + Simple Icons (never placeholder text like LOGO_GOOGLE).
- Do NOT include mobile OS status bar rows (time/signal/wifi/battery); runtime provides this chrome.
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
- Build only core blocks: hero, control row, featured card, secondary list, sticky CTA.
- Keep markup concise and visually rich; avoid long repeated sections.
- Do NOT include a mobile OS status bar row (time/signal/wifi/battery).
- No reasoning or markdown.
`;
const FAST_EDIT_HTML_PROMPT = `Edit the HTML to match the user instruction.
Return:
<description>one concise sentence</description>
then the complete updated HTML document.
Rules:
- Keep full valid HTML document.
- Keep existing data-uid and data-editable attributes where present.
- Brand icons must use Iconify + Simple Icons (no placeholder text).
- Do NOT include mobile OS status bar UI (time/signal/wifi/battery row).
- No markdown fences.
`;

const FAST_UNSPLASH_IMAGE_RULES = `
Fast image policy (placeholder-first):
- For initial HTML generation, use placeholder.net URLs only.
- Generic image placeholders:
  - https://placehold.net/400x400.png
  - https://placehold.net/600x600.png
  - https://placehold.net/400x600.png
  - https://placehold.net/600x800.png
  - https://placehold.net/600x400.png
  - https://placehold.net/800x600.png
  - https://placehold.net/1200x600.png
- Map placeholders:
  - https://placehold.net/map-400x400.png
  - https://placehold.net/map-600x600.png
  - https://placehold.net/map-400x600.png
  - https://placehold.net/map-600x400.png
  - https://placehold.net/map-1200x600.png
- Avatar placeholders:
  - https://placehold.net/avatar.png
  - https://placehold.net/avatar-2.png
  - https://placehold.net/avatar-3.png
  - https://placehold.net/avatar-4.png
  - https://placehold.net/avatar-5.png
`;

const FAST_IMAGE_FALLBACKS = [
    'https://placehold.net/1200x600.png',
    'https://placehold.net/800x600.png',
    'https://placehold.net/600x400.png',
    'https://placehold.net/600x800.png',
    'https://placehold.net/400x600.png',
    'https://placehold.net/600x600.png',
    'https://placehold.net/400x400.png',
] as const;

const FAST_MAP_IMAGE_FALLBACKS = [
    'https://placehold.net/map-1200x600.png',
    'https://placehold.net/map-600x400.png',
    'https://placehold.net/map-400x600.png',
    'https://placehold.net/map-600x600.png',
    'https://placehold.net/map-400x400.png',
] as const;

const FAST_AVATAR_IMAGE_FALLBACKS = [
    'https://placehold.net/avatar.png',
    'https://placehold.net/avatar-2.png',
    'https://placehold.net/avatar-3.png',
    'https://placehold.net/avatar-4.png',
    'https://placehold.net/avatar-5.png',
] as const;


// ============================================================================
// Platform Dimensions
// ============================================================================

const PLATFORM_DIMENSIONS: Record<string, { width: number; height: number }> = {
    mobile: { width: 375, height: 812 },
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
    preferredModel?: string;
}

function extractInlineImageParts(images: string[]) {
    const parts: any[] = [];
    images.forEach((img) => {
        const matches = img.match(/^data:(.+);base64,(.+)$/);
        if (matches) {
            parts.push({
                inlineData: { data: matches[2], mimeType: matches[1] }
            });
        }
    });
    return parts;
}

async function analyzeReferenceImages(images: string[]): Promise<string> {
    if (!images.length) return '';
    const imageParts = extractInlineImageParts(images).slice(0, 3);
    if (!imageParts.length) return '';

    const analysisPrompt = `Analyze the attached UI reference image(s) for generation guidance.
Return concise JSON only with fields:
{
  "designType": "app/website/dashboard/etc",
  "visualTone": "short phrase",
  "palette": { "primary": "#hex", "secondary": "#hex", "background": "#hex", "surface": "#hex", "text": "#hex", "accent": "#hex" },
  "layoutStructure": ["hero + cards", "sidebar + content", "..."],
  "componentPatterns": ["rounded cards", "pill chips", "minimal nav", "..."],
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
        return `IMAGE REFERENCE ANALYSIS (HARD GUIDANCE):\n${compact}\nUse this analysis to match palette, layout structure, spacing rhythm, and component style from the reference image(s).`;
    } catch (error) {
        console.warn('[Gemini] analyzeReferenceImages failed; continuing without structured image analysis', error);
        return 'Attached image(s) are reference-first. Prioritize matching their palette, layout structure, component style, and visual hierarchy over generic patterns.';
    }
}

export async function generateDesign(options: GenerateOptions): Promise<HtmlDesignSpec> {
    const { prompt, stylePreset = 'modern', platform = 'mobile', images = [], preferredModel } = options;
    const dimensions = PLATFORM_DIMENSIONS[platform] || PLATFORM_DIMENSIONS.mobile;
    const generationConfig = getGenerationConfig(images.length > 0);
    const imageAnalysis = await analyzeReferenceImages(images);

    const imageGuidance = images.length > 0
        ? `Use the attached image(s) as PRIMARY reference. Match palette, typography mood, spacing density, component shapes, and layout hierarchy. Do not ignore reference cues.
If the text request is ambiguous (e.g., "as seen", "like this"), preserve the same app domain and information architecture as the reference image(s).`
        : '';

    const baseUserPrompt = `
Design a UI for: "${prompt}"
Platform: ${platform} (${dimensions.width}x${dimensions.height})
Style: ${stylePreset}
Generate a maximum of 4 complete screens.
${imageGuidance}
${imageAnalysis}
`;

    const fastBaseUserPrompt = `
Design a UI for: "${prompt}"
Platform: ${platform} (${dimensions.width}x${dimensions.height})
Style: ${stylePreset}
Generate exactly 1 complete main screen.
${imageGuidance}
${imageAnalysis}
`;

    const buildParts = (userPrompt: string) => {
        const parts: any[] = [{ text: GENERATE_HTML_PROMPT + '\n\n' + userPrompt }];

        parts.push(...extractInlineImageParts(images));

        return parts;
    };

    const isFastTextProviderModel = isGroqModel(preferredModel) || isNvidiaModel(preferredModel);

    const resolvedPreferredModel = resolvePreferredModel(preferredModel);

    const generateOnce = async (promptText: string): Promise<ParsedDesign> => {
        if (isFastTextProviderModel) {
            try {
                const isNvidia = isNvidiaModel(preferredModel);
                const maxCompletionTokens = isNvidia ? 3400 : 2200;

                const runFast = async (promptPrefix: string) => (isNvidia
                    ? await nvidiaChatCompletion({
                        model: preferredModel,
                        systemPrompt: 'You are a world-class UI designer. Return one valid JSON object only and no reasoning.',
                        prompt: `${promptPrefix}\n${FAST_UNSPLASH_IMAGE_RULES}\n\n${promptText}`,
                        maxCompletionTokens,
                        temperature: images.length > 0 ? 0.32 : 0.52,
                        topP: images.length > 0 ? 0.85 : 0.9,
                        responseFormat: 'json_object',
                        thinking: false,
                    })
                    : await groqChatCompletion({
                        model: preferredModel,
                        systemPrompt: 'You are a world-class UI designer. Return one valid JSON object only and no reasoning.',
                        prompt: `${promptPrefix}\n${FAST_UNSPLASH_IMAGE_RULES}\n\n${promptText}`,
                        maxCompletionTokens,
                        temperature: images.length > 0 ? 0.32 : 0.52,
                        topP: images.length > 0 ? 0.85 : 0.9,
                        reasoningEffort: 'low',
                        responseFormat: 'json_object',
                    }));

                let completion = await runFast(FAST_GENERATE_HTML_PROMPT);
                const { text, finishReason } = completion;
                if (finishReason === 'length') {
                    completion = await runFast(FAST_GENERATE_HTML_PROMPT_COMPACT);
                }
                if (completion.finishReason === 'length') {
                    throw new Error('Fast model output was truncated. Please retry with a shorter design request.');
                }
                try {
                    const cleanedJson = cleanJsonResponse(completion.text);
                    const parsed = parseJsonSafe(cleanedJson) as { description?: string; screens: RawScreen[] };
                    return { description: parsed.description, screens: parsed.screens || [], parsedOk: true };
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
        return generateDesignOnce(buildParts(promptText), resolvedPreferredModel, generationConfig);
    };

    let initialResponse = await generateOnce(isFastTextProviderModel ? fastBaseUserPrompt : baseUserPrompt);
    if (!initialResponse.parsedOk || initialResponse.screens.length === 0) {
        const activeBasePrompt = isFastTextProviderModel ? fastBaseUserPrompt : baseUserPrompt;
        const retryPrompt = `${activeBasePrompt}\nReturn STRICT JSON only. No markdown, no code fences, no trailing commas.`;
        initialResponse = await generateOnce(retryPrompt);
    }

    const designId = uuidv4();
    const isFastMode = isFastTextProviderModel;
    const screens: HtmlScreen[] = initialResponse.screens.map(s => ({
        screenId: uuidv4(),
        name: s.name,
        html: normalizeBrokenLogoPlaceholders(
            isFastMode
                ? enforceFastWorkingImageUrls(normalizeFastFrameworkAssets(s.html))
                : s.html
        ),
        width: dimensions.width,
        height: dimensions.height,
    }));

    return {
        id: designId,
        name: prompt,
        screens,
        description: normalizeUiDescriptionTags(initialResponse.description),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

export async function* generateDesignStream(options: GenerateOptions): AsyncGenerator<string, void, unknown> {
    const { prompt, stylePreset = 'modern', platform = 'mobile', images = [] } = options;
    const dimensions = PLATFORM_DIMENSIONS[platform] || PLATFORM_DIMENSIONS.mobile;
    const generationConfig = getGenerationConfig(images.length > 0);
    const imageAnalysis = await analyzeReferenceImages(images);

    const userPrompt = `Design: "${prompt}". Platform: ${platform}. Style: ${stylePreset}.
${images.length ? 'Attached image(s) are PRIMARY reference. Match them strongly.' : ''}
${imageAnalysis}`;
    const parts: any[] = [{ text: GENERATE_STREAM_PROMPT + '\n\n' + userPrompt }];

    parts.push(...extractInlineImageParts(images));

    const result = await model.generateContentStream({
        contents: [{ role: 'user', parts }],
        generationConfig,
    });

    let totalChars = 0;
    for await (const chunk of result.stream) {
        const text = chunk.text();
        totalChars += text.length;
        yield text;
    }

    try {
        const finalResponse = await result.response;
        const finishReason = finalResponse?.candidates?.[0]?.finishReason || 'UNKNOWN';
        console.info('[Gemini] generateDesignStream: finish', { finishReason, totalChars });
    } catch (err) {
        console.warn('[Gemini] generateDesignStream: failed to read final response metadata', err);
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
    preferredModel?: string;
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

export async function generateImageAsset(options: GenerateImageOptions): Promise<{ src: string; modelUsed: string; description?: string }> {
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
        return { src, modelUsed: selectedModel.name };
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
        };
    }
}

export async function editDesign(options: EditOptions): Promise<{ html: string; description?: string }> {
    const { instruction, html, images = [], preferredModel } = options;
    const userPrompt = `${EDIT_HTML_PROMPT}\n${html}\n\nUser instruction: "${instruction}"`;
    const fastUserPrompt = `${FAST_EDIT_HTML_PROMPT}\n${html}\n\nUser instruction: "${instruction}"`;

    const parts: any[] = [{ text: userPrompt }];
    if (images.length > 0) {
        images.forEach((img) => {
            const matches = img.match(/^data:(.+);base64,(.+)$/);
            if (matches) {
                parts.push({
                    inlineData: { data: matches[2], mimeType: matches[1] }
                });
            }
        });
    }

    const parseEditResponse = (raw: string): { html: string; description?: string } => {
        const descriptionMatch = raw.match(/<description>([\s\S]*?)<\/description>/i);
        const description = normalizeUiDescriptionTags(descriptionMatch?.[1]?.trim());
        const withoutDescription = raw.replace(/<description>[\s\S]*?<\/description>/i, '').trim();
        const editedHtml = cleanHtmlResponse(withoutDescription || raw);
        if (!editedHtml.includes('<!DOCTYPE html>')) {
            throw new Error('Gemini failed to return a full HTML document.');
        }
        return { html: normalizeBrokenLogoPlaceholders(editedHtml), description };
    };

    if (isGroqModel(preferredModel) || isNvidiaModel(preferredModel)) {
        try {
            const completion = isNvidiaModel(preferredModel)
                ? await nvidiaChatCompletion({
                    model: preferredModel,
                    systemPrompt: 'You are an expert UI designer that edits HTML.',
                    prompt: fastUserPrompt,
                    maxTokens: 1800,
                    temperature: 0.5,
                    thinking: false,
                })
                : await groqChatCompletion({
                    model: preferredModel,
                    systemPrompt: 'You are an expert UI designer that edits HTML.',
                    prompt: fastUserPrompt,
                    maxTokens: 1800,
                    temperature: 0.5,
                });
            const { text, modelUsed } = completion;
            const parsed = parseEditResponse(text);
            const note = `(Model: ${modelUsed})`;
            return {
                html: parsed.html,
                description: parsed.description ? `${parsed.description} ${note}` : note,
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
            generationConfig: GENERATION_CONFIG,
        });
        return parseEditResponse(result.response.text());
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
            generationConfig: GENERATION_CONFIG,
        });
        const parsed = parseEditResponse(fallbackResult.response.text());
        const fallbackNote = `(Image model quota exceeded; used fallback model: ${IMAGE_FALLBACK_MODEL}.)`;
        return {
            html: parsed.html,
            description: parsed.description ? `${parsed.description} ${fallbackNote}` : fallbackNote,
        };
    }
}

export async function completePartialScreen(options: CompleteScreenOptions): Promise<string> {
    const { screenName, partialHtml, prompt, platform, stylePreset } = options;
    const userPrompt = `${COMPLETE_PARTIAL_SCREEN_PROMPT}
Screen name: ${screenName}
Original request: ${prompt || 'N/A'}
Platform: ${platform || 'unknown'}
Style: ${stylePreset || 'unknown'}

Partial HTML:
${partialHtml}
`;

    const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
            ...GENERATION_CONFIG,
            temperature: 0.4,
        },
    });

    const completedHtml = cleanHtmlResponse(result.response.text());
    if (!completedHtml.includes('<!DOCTYPE html>') || !completedHtml.match(/<\/html>/i)) {
        throw new Error('Gemini failed to return a complete HTML document for partial screen completion.');
    }
    return completedHtml;
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
    let genericIndex = 0;
    let mapIndex = 0;
    let avatarIndex = 0;

    return html.replace(/<img\b[^>]*>/gi, (tag: string) => {
        const context = tag.toLowerCase();
        const isMap = /map|location|route|pin|geo/.test(context);
        const isAvatar = /avatar|profile|user|person|creator|author/.test(context);

        const src = isMap
            ? FAST_MAP_IMAGE_FALLBACKS[mapIndex++ % FAST_MAP_IMAGE_FALLBACKS.length]
            : isAvatar
                ? FAST_AVATAR_IMAGE_FALLBACKS[avatarIndex++ % FAST_AVATAR_IMAGE_FALLBACKS.length]
                : FAST_IMAGE_FALLBACKS[genericIndex++ % FAST_IMAGE_FALLBACKS.length];

        if (/\bsrc\s*=\s*(["']).*?\1/i.test(tag)) {
            return tag.replace(/\bsrc\s*=\s*(["']).*?\1/i, `src="${src}"`);
        }
        return tag.replace(/<img\b/i, `<img src="${src}"`);
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
): Promise<ParsedDesign> {
    console.info('[Gemini] generateDesignOnce: start');
    const activeModel = preferredModelName ? getGenerativeModel(preferredModelName).model : model;
    const result = await activeModel.generateContent({
        contents: [{ role: 'user', parts }],
        generationConfig,
    });
    const responseText = result.response.text();
    console.info(`[Gemini] generateDesignOnce: received ${responseText.length} chars`);

    let parsedResponse: ParsedDesign;
    try {
        const cleanedJson = cleanJsonResponse(responseText);
        parsedResponse = {
            ...(parseJsonSafe(cleanedJson) as { description?: string; screens: { name: string; html: string }[] }),
            parsedOk: true,
        };
    } catch (e) {
        console.error('Failed to parse JSON, attempting fallback:', e);
        if (responseText.includes('<!DOCTYPE html>')) {
            const html = cleanHtmlResponse(responseText);
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
                html: finalHtml,
            };
        }),
        parsedOk: parsedResponse.parsedOk,
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
