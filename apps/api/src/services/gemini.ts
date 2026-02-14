// ============================================================================
// Gemini Service - HTML-Based UI Generation (Google Stitch Approach)
// ============================================================================

import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { v4 as uuidv4 } from 'uuid';

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
        message.includes('rate limit')
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
IMAGES (STRICT):
You may ONLY use these exact image URLs (you may change query params like w/h/fit/q, but the base must match):

- Nature:   https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05
- Tech:     https://images.unsplash.com/photo-1488590528505-98d2b5aba04b
- People:   https://images.unsplash.com/photo-1539571696357-5a69c17a67c6
- Travel:   https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1
- Abstract: https://images.unsplash.com/photo-1541701494587-cb58502866ab
- Food:     https://images.unsplash.com/photo-1504674900247-0877df9cc836
- Business: https://images.unsplash.com/photo-1486406146926-c627a92ad1ab

FORBIDDEN:
- Any other domain (pexels.com, source.unsplash.com, etc.)
- If you need more images, reuse the allowed ones with different crops.
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
- Create a map mock using CSS gradients + optional SVG routes.
- The map mock should include subtle grid lines + noise + land/water gradients.
- The map must have 3 layers:
  1) base map background (gradients + faint roads)
  2) map pins + route overlay (SVG)
  3) UI chrome (search bar, chips, bottom sheet)
- Include at least 1-3 pins, one search UI, and a bottom sheet or pinned place card.
- Add an optional route line when context implies trip/directions.
- Ensure proper contrast over map surfaces (cards/chips/text must remain legible).
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
7. Do NOT use markdown fences.

Current HTML:
`;


// ============================================================================
// Platform Dimensions
// ============================================================================

const PLATFORM_DIMENSIONS: Record<string, { width: number; height: number }> = {
    mobile: { width: 375, height: 812 },
    tablet: { width: 768, height: 1024 },
    desktop: { width: 1280, height: 800 },
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
}

export async function generateDesign(options: GenerateOptions): Promise<HtmlDesignSpec> {
    const { prompt, stylePreset = 'modern', platform = 'mobile', images = [] } = options;
    const dimensions = PLATFORM_DIMENSIONS[platform] || PLATFORM_DIMENSIONS.mobile;

    const imageGuidance = images.length > 0
        ? `Use the attached image(s) to infer palette, typography mood, spacing density, and material finish. Do not copy the layout 1:1.`
        : '';

    const baseUserPrompt = `
Design a UI for: "${prompt}"
Platform: ${platform} (${dimensions.width}x${dimensions.height})
Style: ${stylePreset}
Generate a maximum of 4 complete screens.
${imageGuidance}
`;

    const buildParts = (userPrompt: string) => {
        const parts: any[] = [{ text: GENERATE_HTML_PROMPT + '\n\n' + userPrompt }];

        if (images.length > 0) {
            images.forEach(img => {
                const matches = img.match(/^data:(.+);base64,(.+)$/);
                if (matches) {
                    parts.push({
                        inlineData: { data: matches[2], mimeType: matches[1] }
                    });
                }
            });
        }

        return parts;
    };

    let initialResponse = await generateDesignOnce(buildParts(baseUserPrompt));
    if (!initialResponse.parsedOk || initialResponse.screens.length === 0) {
        const retryPrompt = `${baseUserPrompt}\nReturn STRICT JSON only. No markdown, no code fences, no trailing commas.`;
        initialResponse = await generateDesignOnce(buildParts(retryPrompt));
    }

    const designId = uuidv4();
    const screens: HtmlScreen[] = initialResponse.screens.map(s => ({
        screenId: uuidv4(),
        name: s.name,
        html: s.html,
        width: dimensions.width,
        height: dimensions.height,
    }));

    return {
        id: designId,
        name: prompt,
        screens,
        description: initialResponse.description,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

export async function* generateDesignStream(options: GenerateOptions): AsyncGenerator<string, void, unknown> {
    const { prompt, stylePreset = 'modern', platform = 'mobile', images = [] } = options;
    const dimensions = PLATFORM_DIMENSIONS[platform] || PLATFORM_DIMENSIONS.mobile;

    const userPrompt = `Design: "${prompt}". Platform: ${platform}. Style: ${stylePreset}.`;
    const parts: any[] = [{ text: GENERATE_STREAM_PROMPT + '\n\n' + userPrompt }];

    if (images.length > 0) {
        images.forEach(img => {
            const matches = img.match(/^data:(.+);base64,(.+)$/);
            if (matches) {
                parts.push({ inlineData: { data: matches[2], mimeType: matches[1] } });
            }
        });
    }

    const result = await model.generateContentStream({
        contents: [{ role: 'user', parts }],
        generationConfig: GENERATION_CONFIG,
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
        const description = descriptionMatch?.[1]?.trim();
        const withoutDescription = raw.replace(/<description>[\s\S]*?<\/description>/i, '').trim();
        const editedHtml = cleanHtmlResponse(withoutDescription || raw);
        if (!editedHtml.includes('<!DOCTYPE html>')) {
            throw new Error('Gemini failed to return a full HTML document.');
        }
        return { html: editedHtml, description };
    };

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

async function generateDesignOnce(parts: any[]): Promise<ParsedDesign> {
    console.info('[Gemini] generateDesignOnce: start');
    const result = await model.generateContent({
        contents: [{ role: 'user', parts }],
        generationConfig: GENERATION_CONFIG,
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
        screens: parsedResponse.screens.map(s => ({
            name: s.name,
            html: cleanHtmlResponse(s.html),
        })),
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
