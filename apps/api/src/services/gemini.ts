// ============================================================================
// Gemini Service - HTML-Based UI Generation (Google Stitch Approach)
// ============================================================================

import { GoogleGenerativeAI } from '@google/generative-ai';
import { v4 as uuidv4 } from 'uuid';

// Initialize the Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({
    // Using gemini-1.5-flash as a reliable default for UI generation speed
    model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
});

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

const GENERATE_HTML_PROMPT = `You are a world-class UI designer creating stunning, Dribbble-quality mobile app screens.

TASK: Generate a set of HTML screens for the requested UI design.

REQUIREMENTS:
1. Output a JSON object with the following structure:
\`\`\`json
{
  "description": "The designs for your [app name] have been generated:\\n- [Screen 1]: [Brief one-sentence summary]\\n- [Screen 2]: [Brief one-sentence summary]",
  "screens": [
    {
      "name": "Screen Name (e.g. Login, Home)",
      "html": "<!DOCTYPE html><html><head>...</head><body>...</body></html>"
    }
  ]
}
\`\`\`
2. EVERY HTML screen must be a COMPLETE, standalone HTML document (including <!DOCTYPE html>, <html>, <head>, and <body>).
3. DESCRIPTION FORMAT: The "description" is MANDATORY and must be extremely CONCISE. 
   - Start with: "The designs for your [app name] have been generated:"
   - List each screen as a bullet point: "- [Screen Name]: [One sentence summary]."
   - PROHIBITED: Do NOT write long prose, "walkthroughs", or logic explanations.
4. Create up to 4 screens for a cohesive user flow.
5. Use Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
6. Use Google Fonts: <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
7. Use Material Symbols: <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0" />
8. Do NOT use SVGs or any other icon system. Material Symbols are MANDATORY: <span class="material-symbols-rounded">icon_name</span>.
9. Return ONLY the JSON object.

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
- THEME & COLOR: You MUST decide the colors and the overall theme (light, dark, or vibrant). Choose a unique, professional color palette. Define these colors in the tailwind.config script.
- IMAGE HANDLING: PROHIBITED: Do NOT use "source.unsplash.com" (it is broken). 
- RELIABLE IMAGES: Use only "images.unsplash.com" with a specific photo ID or these categories:
  - Nature: https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&q=80
  - Tech: https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?w=800&q=80
  - Avatars: https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=200&h=200&fit=crop
- ALWAYS prefer CSS Gradients for containers and decorative elements.

TAILWIND CONFIG (Mandatory in every <head>):
<script>
    tailwind.config = {
        darkMode: "class",
        theme: {
            extend: {
                colors: { /* Define your unique theme here */ },
                fontFamily: { "sans": ["Plus Jakarta Sans", "sans-serif"] },
            },
        },
    }
</script>
`;

const GENERATE_STREAM_PROMPT = `You are a world-class UI designer. Stream the output using XML blocks.

STRUCTURE RULE:
1. Output exactly ONE <description> block at the very beginning. 
2. The description must be a concise bulleted summary of ALL screens (e.g. "The designs for [app] have been generated:\\n- [Screen 1]: [Summary]\\n- [Screen 2]: [Summary]").
3. Follow the description with the <screen> blocks.
4. DO NOT repeat the <description> block.

<description>
[Concise summary of all screens]
</description>
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

TYPOGRAPHY: Bold headings (text-3xl+, tracking-tight), clear hierarchy, generous spacing (p-6+, space-y-5+).

PROHIBITED:
- No plain white/gray backgrounds with basic colored buttons unless needed or requested.
- No uniform grids of identical cards. Vary sizes, add featured items.
- No generic Bootstrap/Material Design templates.

Follow the same STYLING, IMAGE (NO source.unsplash.com), and MATERIAL SYMBOL rules as the standard generation. 
CRITICAL: The <screen name="..."> attribute MUST match the actual HTML content of that screen!
CRITICAL: Every <screen> block MUST be a COMPLETE HTML document.
Do NOT use markdown fences.`;

const EDIT_HTML_PROMPT = `You are an expert UI designer. Edit the existing HTML.
1. Modify ONLY what the user requested.
2. Return the complete, modified HTML document.
3. Preserve all <head> links, Material Symbols, and Tailwind configs.
4. PROHIBITED: Do NOT use "source.unsplash.com".
5. Return ONLY the HTML code, no prose explanation.

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

    const userPrompt = `
Design a UI for: "${prompt}"
Platform: ${platform} (${dimensions.width}x${dimensions.height})
Style: ${stylePreset}
Generate up to 4 complete screens.
`;

    const parts: any[] = [{ text: GENERATE_HTML_PROMPT + '\n\n' + userPrompt }];

    // Handle Image Inputs
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

    const result = await model.generateContent({ contents: [{ role: 'user', parts }] });
    const responseText = result.response.text();

    let parsedResponse: { description?: string; screens: { name: string; html: string }[] };

    try {
        const cleanedJson = cleanJsonResponse(responseText);
        parsedResponse = JSON.parse(cleanedJson);
    } catch (e) {
        console.error('Failed to parse JSON, attempting fallback:', e);
        if (responseText.includes('<!DOCTYPE html>')) {
            const html = cleanHtmlResponse(responseText);
            parsedResponse = { screens: [{ name: "Generated Screen", html }] };
        } else {
            throw new Error('Failed to generate valid design JSON');
        }
    }

    const designId = uuidv4();
    const screens: HtmlScreen[] = parsedResponse.screens.map(s => ({
        screenId: uuidv4(),
        name: s.name,
        html: cleanHtmlResponse(s.html),
        width: dimensions.width,
        height: dimensions.height,
    }));

    return {
        id: designId,
        name: prompt,
        screens,
        description: parsedResponse.description,
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

    const result = await model.generateContentStream({ contents: [{ role: 'user', parts }] });

    for await (const chunk of result.stream) {
        yield chunk.text();
    }
}

// ============================================================================
// Editing Logic
// ============================================================================

export interface EditOptions {
    instruction: string;
    html: string;
    screenId: string;
}

export async function editDesign(options: EditOptions): Promise<string> {
    const { instruction, html } = options;
    const userPrompt = `${EDIT_HTML_PROMPT}\n${html}\n\nUser instruction: "${instruction}"`;

    const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    });

    let editedHtml = cleanHtmlResponse(result.response.text());

    if (!editedHtml.includes('<!DOCTYPE html>')) {
        throw new Error('Gemini failed to return a full HTML document.');
    }

    return editedHtml;
}

// ============================================================================
// Helpers
// ============================================================================

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
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
        return text.substring(start, end + 1);
    }
    return text.trim();
}

// Legacy Exports
export type { HtmlDesignSpec as DesignSpec };
export type Patch = { op: string; path: string; value: unknown };
