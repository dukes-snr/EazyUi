// ============================================================================
// Gemini Service - HTML-Based UI Generation (Google Stitch Approach)
// ============================================================================

import { GoogleGenerativeAI } from '@google/generative-ai';
import { v4 as uuidv4 } from 'uuid';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
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

const GENERATE_HTML_PROMPT = `You are an expert UI designer creating beautiful, production-ready mobile app screens.

TASK: Generate a set of HTML screens for the requested UI design.

REQUIREMENTS:
1. Output a JSON object with the following structure:
\`\`\`json
{
  "description": "A professional summary of the designs and why they meet the user's goals.",
  "screens": [
    {
      "name": "Screen Name (e.g. Login, Home)",
      "html": "<!DOCTYPE html>..."
    }
  ]
}
\`\`\`
2. The "description" is MANDATORY. It should be conversational and provide a concise walkthrough of EACH screen generated (e.g., 'I\'ve designed a sleek Home Screen for discovery and a detailed Recipe page...'). Always mention every screen by name.
3. Create up to 4 screens that represent a cohesive user flow.
3. Use Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
4. Use dark mode by default if appropriate, but feel free to use light or vibrant themes if they fit the prompt better.
5. Create a UNIQUE and professional color palette for each design. DO NOT default to the same dark blue.
6. Use Google Fonts: <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
7. Use Material Symbols: <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0" />
8. Return ONLY the JSON object.

STYLING & CONTENT GUIDELINES:
- Use a cohesive color palette. Modern, premium designs.
- Use <span class="material-symbols-rounded">icon_name</span> for icons.
- IMAGE HANDLING: If a specific image URL is likely to break, use CSS Gradients (linear-gradient/radial-gradient) for backgrounds and placeholders.
- USE THESE IMAGE CATEGORIES (Unsplash URLs):
  - Nature: https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&q=80
  - Tech: https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?w=800&q=80
  - People/Avatars: https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=200&h=200&fit=crop
  - Travel: https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800&q=80
  - Abstract/Art: https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=800&q=80
  - Food: https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80
  - Business: https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&q=80
- ALWAYS prefer high-quality gradients for containers and decorative elements to ensure reliability.

TAILWIND CONFIG:
<script>
    tailwind.config = {
        darkMode: "class",
        theme: {
            extend: {
                colors: {
                    "primary": "#6366F1",
                    "background-dark": "#0F172A",
                    "surface": "#1E293B",
                },
                fontFamily: {
                    "sans": ["Plus Jakarta Sans", "sans-serif"]
                },
            },
        },
    }
</script>
`;

const GENERATE_STREAM_PROMPT = `You are an expert UI designer creating beautiful, production-ready mobile app screens.

TASK: Generate a set of HTML screens for the requested UI design.

REQUIREMENTS:
1. Output each screen wrapped in a generic XML-like block:
\`\`\`xml
<description>
A conversational walkthrough of the designs.
</description>
<screen name="Screen Name">
...
</screen>
\`\`\`
2. The <description> is MANDATORY and should be at the very start of the output. It should be conversational and provide a concise walkthrough of EACH screen generated (e.g., 'I\'ve designed a sleek Home Screen for discovery and a detailed Recipe page...'). Always mention every screen by name.
3. Create up to 4 screens that represent a cohesive user flow.
3. Use Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
4. Use dark mode by default if appropriate, but feel free to use light or vibrant themes if they fit the prompt better.
5. Create a UNIQUE and professional color palette for each design. DO NOT default to the same dark blue.
6. Use Google Fonts: <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
7. Use Material Symbols: <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0" />
8. Do NOT mark the code with markdown fences (like \`\`\`html). just output the raw <screen> blocks.

STYLING & CONTENT GUIDELINES:
- Use a cohesive color palette.
- Use <span class="material-symbols-rounded">icon_name</span> for icons.
- IMAGE HANDLING: If images are risky, use CSS Gradients (linear/radial) for backgrounds/decor.
- IMAGE CATEGORIES:
  - Avatars: https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=200&h=200&fit=crop
  - Nature: https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&q=80
  - Tech: https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?w=800&q=80
  - Abstract: https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=800&q=80
  - Business: https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&q=80

TAILWIND CONFIG:
<script>
    tailwind.config = {
        darkMode: "class",
        theme: {
            extend: {
                colors: {
                    "primary": "#6366F1",
                },
                fontFamily: {
                    "sans": ["Plus Jakarta Sans", "sans-serif"]
                },
            },
        },
    }
</script>
`;

const EDIT_HTML_PROMPT = `You are an expert UI designer. Edit the existing HTML based on the user's instruction.

RULES:
1. Modify ONLY what the user requested
2. Preserve the overall structure and styling (ESPECIALLY <head> tags for Fonts/Icons)
3. Return the complete modified HTML document
4. Keep all existing Tailwind classes and configurations
5. Return ONLY the HTML code, no explanation
6. If adding new images, use reliable Unsplash URLs (e.g. from https://images.unsplash.com)
7. If adding icons, use <span class="material-symbols-rounded">icon_name</span>
8. Use flexbox with gap-2 for buttons with icons to prevent overlap

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
// Generation
// ============================================================================

export interface GenerateOptions {
    prompt: string;
    stylePreset?: string;
    platform?: string;
    images?: string[];
}

// Helper to clean JSON response (remove markdown fences)
function cleanJsonResponse(text: string): string {
    return text.replace(/```json/g, '').replace(/```/g, '').trim();
}

// cleanHtmlResponse is already defined above? No, I see it in the previous file content at line 75 (in the original file).
// Wait, looking at the previous specific diff, I see I added `cleanHtmlResponse` again.
// I should remove the one I added if it exists twice.
// Let me just look at the file to be sure.


export async function generateDesign(options: GenerateOptions): Promise<HtmlDesignSpec> {
    const { prompt, stylePreset = 'modern', platform = 'mobile', images = [] } = options;

    const dimensions = PLATFORM_DIMENSIONS[platform] || PLATFORM_DIMENSIONS.mobile;

    const userPrompt = `
Design a UI for: "${prompt}"

Platform: ${platform} (${dimensions.width}x${dimensions.height} viewport)
Style: ${stylePreset}

Decide how many screens are needed (max 4) to demonstrate a flow.
For each screen, generate a complete HTML document.
Ensure body min-height matches viewport: ${dimensions.height}px.
`;

    // Construct parts including images if present
    const parts: any[] = [{ text: GENERATE_HTML_PROMPT + '\n\n' + userPrompt }];

    if (images && images.length > 0) {
        images.forEach(img => {
            // img is base64 data URL: "data:image/png;base64,..."
            // Extract base64 and mime type
            const matches = img.match(/^data:(.+);base64,(.+)$/);
            if (matches) {
                const mimeType = matches[1];
                const data = matches[2];
                parts.push({
                    inlineData: {
                        data: data,
                        mimeType: mimeType
                    }
                });
            }
        });
    }

    const result = await model.generateContent({
        contents: [{ role: 'user', parts: parts }],
    });

    const responseText = result.response.text();
    console.log('Gemini response length:', responseText.length);

    let parsedResponse: { description?: string; screens: { name: string; html: string }[] };

    try {
        const cleanedJson = cleanJsonResponse(responseText);
        parsedResponse = JSON.parse(cleanedJson);
    } catch (e) {
        console.error('Failed to parse JSON response:', e);
        // Fallback: try to treat as single HTML if parsing fails (legacy support/fallback)
        if (responseText.includes('<!DOCTYPE html>')) {
            const html = cleanHtmlResponse(responseText);
            parsedResponse = { screens: [{ name: prompt.slice(0, 20), html }] };
        } else {
            throw new Error('Failed to generate valid design');
        }
    }

    if (!parsedResponse.screens || parsedResponse.screens.length === 0) {
        throw new Error('No screens generated');
    }

    const designId = uuidv4();
    const screens: HtmlScreen[] = parsedResponse.screens.map(s => ({
        screenId: uuidv4(),
        name: s.name,
        html: cleanHtmlResponse(s.html), // Clean generic markdown if inside JSON string
        width: dimensions.width,
        height: dimensions.height,
    }));

    const spec: HtmlDesignSpec = {
        id: designId,
        name: prompt,
        screens: screens,
        description: parsedResponse.description,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    return spec;
}

export async function* generateDesignStream(options: GenerateOptions): AsyncGenerator<string, void, unknown> {
    const { prompt, stylePreset = 'modern', platform = 'mobile', images = [] } = options;
    const dimensions = PLATFORM_DIMENSIONS[platform] || PLATFORM_DIMENSIONS.mobile;

    const userPrompt = `
Design a UI for: "${prompt}"

Platform: ${platform} (${dimensions.width}x${dimensions.height} viewport)
Style: ${stylePreset}

Decide how many screens are needed (max 4).
Stream the output using <screen name="...">...</screen> blocks.
`;

    const parts: any[] = [{ text: GENERATE_STREAM_PROMPT + '\n\n' + userPrompt }];

    if (images && images.length > 0) {
        images.forEach(img => {
            const matches = img.match(/^data:(.+);base64,(.+)$/);
            if (matches) {
                parts.push({
                    inlineData: {
                        data: matches[2],
                        mimeType: matches[1]
                    }
                });
            }
        });
    }

    const result = await model.generateContentStream({
        contents: [{ role: 'user', parts: parts }],
    });

    for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        yield chunkText;
    }
}


// ============================================================================
// Editing
// ============================================================================

export interface EditOptions {
    instruction: string;
    html: string;
    screenId: string;
}

export async function editDesign(options: EditOptions): Promise<string> {
    const { instruction, html } = options;

    const userPrompt = `
${EDIT_HTML_PROMPT}
${html}

---

User instruction: "${instruction}"

Apply this change and return the complete modified HTML.
`;

    const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    });

    let editedHtml = result.response.text();
    console.log('Gemini edit response length:', editedHtml.length);

    // Clean up the response
    editedHtml = cleanHtmlResponse(editedHtml);

    if (!editedHtml.includes('<!DOCTYPE html>') && !editedHtml.includes('<html')) {
        throw new Error('Gemini did not return valid HTML after edit');
    }

    return editedHtml;
}

// ============================================================================
// Helpers
// ============================================================================

function cleanHtmlResponse(html: string): string {
    // Remove markdown code blocks if present
    html = html.trim();

    if (html.startsWith('```html')) {
        html = html.slice(7);
    } else if (html.startsWith('```')) {
        html = html.slice(3);
    }

    if (html.endsWith('```')) {
        html = html.slice(0, -3);
    }

    return html.trim();
}

// ============================================================================
// Legacy Exports (for backwards compatibility)
// ============================================================================

// These are kept for any existing code that might import them
export type { HtmlDesignSpec as DesignSpec };
export type Patch = { op: string; path: string; value: unknown };
