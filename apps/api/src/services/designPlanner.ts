import { z } from 'zod';
import { GROQ_MODELS, groqChatCompletion, isGroqModel, type GroqModelId } from './groq.provider.js';

export type PlannerPhase = 'discovery' | 'plan' | 'postgen' | 'route';

const PlannerQuestionSchema = z.object({
    id: z.string(),
    q: z.string(),
    type: z.string().optional(),
    options: z.array(z.string()).optional(),
});

const PlannerRecommendedScreenSchema = z.object({
    name: z.string(),
    goal: z.string().optional(),
    why: z.string().optional(),
    priority: z.number().int().positive().optional(),
});

const PlannerPlanResponseSchema = z.object({
    phase: z.enum(['plan', 'discovery']).default('plan'),
    appName: z.string().optional(),
    oneLineConcept: z.string().optional(),
    questions: z.array(PlannerQuestionSchema).default([]),
    assumptions: z.array(z.string()).default([]),
    recommendedScreens: z.array(PlannerRecommendedScreenSchema).default([]),
    navigationRecommendation: z.object({
        pattern: z.string().optional(),
        tabs: z.array(z.string()).optional(),
    }).optional(),
    visualDirection: z.object({
        mood: z.string().optional(),
        motif: z.string().optional(),
        colorNotes: z.string().optional(),
    }).optional(),
    generationSuggestion: z.object({
        screenCountNow: z.number().int().positive().optional(),
        generateNow: z.boolean().optional(),
        generateTheseNow: z.array(z.string()).optional(),
        why: z.string().optional(),
    }).optional(),
    generatorPrompt: z.string().default(''),
});

const PlannerPostgenResponseSchema = z.object({
    phase: z.literal('postgen'),
    whatYouHave: z.array(z.string()).default([]),
    gapsDetected: z.array(z.string()).default([]),
    nextScreenSuggestions: z.array(z.object({
        name: z.string(),
        why: z.string(),
        priority: z.number().int().positive(),
    })).default([]),
    callToAction: z.object({
        primary: z.object({
            label: z.string(),
            screenNames: z.array(z.string()).default([]),
        }).optional(),
        secondary: z.object({
            label: z.string(),
            screenNames: z.array(z.string()).default([]),
        }).optional(),
    }).optional(),
});

const PlannerRouteResponseSchema = z.object({
    phase: z.literal('route'),
    intent: z.enum(['new_app', 'add_screen', 'edit_existing_screen']),
    reason: z.string().default(''),
    appContextPrompt: z.string().optional(),
    targetScreenName: z.string().optional(),
    matchedExistingScreenName: z.string().optional(),
    referenceExistingScreenName: z.string().optional(),
    generateTheseNow: z.array(z.string()).default([]),
    editInstruction: z.string().optional(),
});

export type PlannerPlanResponse = z.infer<typeof PlannerPlanResponseSchema>;
export type PlannerPostgenResponse = z.infer<typeof PlannerPostgenResponseSchema>;
export type PlannerRouteResponse = z.infer<typeof PlannerRouteResponseSchema>;
export type PlannerResponse = PlannerPlanResponse | PlannerPostgenResponse | PlannerRouteResponse;

export type PlannerInput = {
    phase: PlannerPhase;
    appPrompt: string;
    platform?: 'mobile' | 'tablet' | 'desktop';
    stylePreset?: 'modern' | 'minimal' | 'vibrant' | 'luxury' | 'playful';
    screenCountDesired?: number;
    screensGenerated?: Array<{ name: string; description?: string; htmlSummary?: string }>;
    preferredModel?: string;
};

export type ImagePromptPlannerInput = {
    appPrompt: string;
    platform?: 'mobile' | 'tablet' | 'desktop';
    stylePreset?: 'modern' | 'minimal' | 'vibrant' | 'luxury' | 'playful';
    intents: Array<{
        id: string;
        screenName: string;
        alt?: string;
        aspect?: string;
        srcHint?: string;
    }>;
    preferredModel?: string;
};

function pickPlannerModel(phase: PlannerPhase, preferredModel?: string): GroqModelId {
    if (isGroqModel(preferredModel)) return preferredModel;
    if (phase === 'discovery') return 'llama-3.1-8b-instant';
    return 'llama-3.3-70b-versatile';
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
            depth += 1;
            continue;
        }
        if (ch === '}') {
            if (start === -1) continue;
            depth -= 1;
            if (depth === 0) {
                return text.slice(start, i + 1);
            }
        }
    }

    return null;
}

function parseJsonSafe<T = any>(text: string): T {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text;
    const extracted = extractFirstJsonObject(fenced) ?? fenced;
    return JSON.parse(extracted.replace(/,\s*([}\]])/g, '$1').trim()) as T;
}

function buildSystemPrompt(phase: PlannerPhase): string {
    if (phase === 'route') {
        return `You are an intent router for UI design actions.
Return JSON only.

Output schema:
{
  "phase": "route",
  "intent": "new_app | add_screen | edit_existing_screen",
  "reason": "short reason",
  "appContextPrompt": "full app context prompt to keep style consistency",
  "targetScreenName": "Home",
  "matchedExistingScreenName": "Dashboard",
  "referenceExistingScreenName": "Account",
  "generateTheseNow": ["Account"],
  "editInstruction": "regenerate with cleaner hierarchy"
}

Rules:
- If user asks to regenerate/update/rework an existing screen by name -> edit_existing_screen.
- If user asks to match/design like another existing screen, set referenceExistingScreenName.
- If user asks for a new screen inside existing app -> add_screen.
- If user asks for a new app concept unrelated to existing screens -> new_app.
- Keep reason very short.
- generateTheseNow should include 1-3 screen names when intent is add_screen.
- appContextPrompt should preserve existing app context when app exists.`;
    }

    if (phase === 'postgen') {
        return `You are a product-focused UI/UX planner.
Return JSON only. Do not return markdown.

Output schema:
{
  "phase": "postgen",
  "whatYouHave": ["Profile"],
  "gapsDetected": ["string"],
  "nextScreenSuggestions": [{ "name": "Home Feed", "why": "string", "priority": 1 }],
  "callToAction": {
    "primary": { "label": "Generate Home Feed", "screenNames": ["Home Feed"] },
    "secondary": { "label": "Generate Explore + Messages", "screenNames": ["Explore", "Messages"] }
  }
}

Rules:
- Be concrete and actionable.
- Prioritize suggestions by core-loop completion first.
- Limit nextScreenSuggestions to 3 items max.
- Keep CTA labels short.
- Suggestions MUST stay in the same product domain as appPrompt + alreadyGeneratedScreens.
- Do NOT inject unrelated domains (e.g., habits, fintech, food) unless explicitly present in appPrompt/screens.
- Use existing screen names and semantics to infer the product context and continue that context.`;
    }

    return `You are a product-focused UI/UX planner.
Return JSON only. Do not return markdown.

Output schema:
{
  "phase": "plan",
  "appName": "string",
  "oneLineConcept": "string",
  "questions": [{ "id": "audience", "q": "question", "type": "single", "options": ["A", "B"] }],
  "assumptions": ["string"],
  "recommendedScreens": [{ "name": "Dashboard", "goal": "string", "priority": 1 }],
  "navigationRecommendation": { "pattern": "floating_pill_bottom_nav", "tabs": ["Home", "Insights"] },
  "visualDirection": { "mood": "string", "motif": "string", "colorNotes": "string" },
  "generationSuggestion": {
    "screenCountNow": 2,
    "generateNow": true,
    "generateTheseNow": ["Dashboard", "Habit Detail"],
    "why": "string"
  },
  "generatorPrompt": "short instruction block for an HTML screen generator"
}

Rules:
- Ask up to 6 high-value questions max.
- If info is missing, make explicit assumptions instead of blocking.
- recommendedScreens should be ordered by priority.
- Keep recommendations in the same product domain implied by appPrompt.
- Do NOT default to habit-tracker style suggestions unless appPrompt explicitly indicates that domain.
- generatorPrompt must include:
  1) product concept
  2) platform + style direction
  3) EXACT screens to generate now
  4) instruction to avoid regenerating existing screens
  5) instruction to keep visual consistency across screens.`;
}

function buildUserPrompt(input: PlannerInput): string {
    const constraints = [
        `phase=${input.phase}`,
        `appPrompt=${input.appPrompt}`,
        `platform=${input.platform || 'mobile'}`,
        `stylePreset=${input.stylePreset || 'modern'}`,
        `screenCountDesired=${input.screenCountDesired || 2}`,
    ].join('\n');

    const screens = (input.screensGenerated || [])
        .map((screen, idx) => `${idx + 1}. ${screen.name}${screen.description ? ` - ${screen.description}` : ''}`)
        .join('\n');

    return `${constraints}

alreadyGeneratedScreens:
${screens || 'none'}

If phase is "postgen", use alreadyGeneratedScreens to find gaps and propose next screens.
If phase is "plan" or "discovery", define the best initial flow and which screens to generate now.

Domain lock:
- Treat appPrompt + alreadyGeneratedScreens as the source of truth for product domain.
- Continue the same domain and user journey.
- Reject unrelated fallback templates.`;
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientNetworkError(error: unknown): boolean {
    const message = (error as Error)?.message || '';
    return /ECONNRESET|ETIMEDOUT|fetch failed|network|socket hang up/i.test(message);
}

export async function runDesignPlanner(input: PlannerInput): Promise<PlannerResponse> {
    const primaryModel = pickPlannerModel(input.phase, input.preferredModel);
    const fallbackModel: GroqModelId = primaryModel === 'llama-3.3-70b-versatile'
        ? 'llama-3.1-8b-instant'
        : 'llama-3.3-70b-versatile';
    const modelsToTry: GroqModelId[] = [primaryModel, fallbackModel];
    let completion: Awaited<ReturnType<typeof groqChatCompletion>> | null = null;
    let lastError: unknown = null;

    for (const model of modelsToTry) {
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                completion = await groqChatCompletion({
                    model,
                    systemPrompt: buildSystemPrompt(input.phase),
                    prompt: buildUserPrompt(input),
                    maxCompletionTokens: 2300,
                    temperature: 0.3,
                    topP: 0.85,
                    responseFormat: 'json_object',
                });
                break;
            } catch (error) {
                lastError = error;
                if (attempt === 0 && isTransientNetworkError(error)) {
                    await sleep(400 + Math.round(Math.random() * 450));
                    continue;
                }
                break;
            }
        }
        if (completion) break;
    }

    if (!completion) {
        throw (lastError instanceof Error ? lastError : new Error('Planner request failed'));
    }

    const raw = parseJsonSafe<any>(completion.text || '{}');
    if (input.phase === 'route') {
        return PlannerRouteResponseSchema.parse({
            phase: 'route',
            ...raw,
        });
    }
    if (input.phase === 'postgen') {
        return PlannerPostgenResponseSchema.parse({
            phase: 'postgen',
            ...raw,
        });
    }

    return PlannerPlanResponseSchema.parse({
        phase: 'plan',
        ...raw,
    });
}

export function getPlannerModels() {
    const candidates = [
        'llama-3.1-8b-instant',
        'llama-3.3-70b-versatile',
        'qwen/qwen3-32b',
    ] as const;
    return candidates.filter((id) => id in GROQ_MODELS);
}

type PlannedImagePrompt = {
    id: string;
    prompt: string;
};

type ImagePromptPlannerResponse = {
    prompts: PlannedImagePrompt[];
};

const ImagePromptPlannerResponseSchema = z.object({
    prompts: z.array(z.object({
        id: z.string(),
        prompt: z.string(),
    })).default([]),
});

function buildImagePromptPlannerSystemPrompt() {
    return `You are a visual prompt writer for image generation.
Return JSON only.

Output schema:
{
  "prompts": [
    { "id": "slot-id", "prompt": "high quality image prompt" }
  ]
}

Rules:
- Keep each prompt simple, direct, and standalone.
- Do NOT mention aspect ratios or tokens like 1:1, 4:5, 16:9.
- Do NOT mention app UI terms (screen, app, dashboard, mobile UI).
- Prefer concise natural language in the style of:
  - "Indoor selfie portrait, relaxed pose, warm natural light, minimal background, high-resolution."
  - "A photorealistic close-up portrait of [subject], soft window light, natural mood, high detail, 4k."
- Keep each prompt around 12-28 words.
- Include clear subject + scene + lighting + mood/style when possible.
- Add a short exclusion at the end: "no text, no watermark, no logos."
- Return one prompt per input id.`;
}

function buildImagePromptPlannerUserPrompt(input: ImagePromptPlannerInput) {
    const intents = input.intents
        .map((intent, idx) => `${idx + 1}. id=${intent.id}
screenName=${intent.screenName}
alt=${intent.alt || 'none'}
aspect=${intent.aspect || '1:1'}
srcHint=${intent.srcHint || 'none'}`)
        .join('\n\n');

    return `appPrompt=${input.appPrompt}
platform=${input.platform || 'mobile'}
stylePreset=${input.stylePreset || 'modern'}

imageIntents:
${intents || 'none'}

Return prompts that are production-ready for image generation and consistent across screens.`;
}

export async function planImagePrompts(input: ImagePromptPlannerInput): Promise<Map<string, string>> {
    if (!input.intents.length) return new Map();

    const primaryModel = (isGroqModel(input.preferredModel) ? input.preferredModel : 'llama-3.3-70b-versatile') as GroqModelId;
    const fallbackModel: GroqModelId = primaryModel === 'llama-3.3-70b-versatile'
        ? 'llama-3.1-8b-instant'
        : 'llama-3.3-70b-versatile';

    const modelsToTry: GroqModelId[] = [primaryModel, fallbackModel];
    let completion: Awaited<ReturnType<typeof groqChatCompletion>> | null = null;
    let lastError: unknown = null;

    for (const model of modelsToTry) {
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                completion = await groqChatCompletion({
                    model,
                    systemPrompt: buildImagePromptPlannerSystemPrompt(),
                    prompt: buildImagePromptPlannerUserPrompt(input),
                    maxCompletionTokens: 2600,
                    temperature: 0.35,
                    topP: 0.9,
                    responseFormat: 'json_object',
                });
                break;
            } catch (error) {
                lastError = error;
                if (attempt === 0 && isTransientNetworkError(error)) {
                    await sleep(400 + Math.round(Math.random() * 450));
                    continue;
                }
                break;
            }
        }
        if (completion) break;
    }

    if (!completion) {
        throw (lastError instanceof Error ? lastError : new Error('Image prompt planner request failed'));
    }

    const raw = parseJsonSafe<ImagePromptPlannerResponse>(completion.text || '{}');
    const parsed = ImagePromptPlannerResponseSchema.parse(raw);
    const mapping = new Map<string, string>();
    parsed.prompts.forEach((entry) => {
        const key = (entry.id || '').trim();
        const prompt = (entry.prompt || '').trim();
        if (key && prompt) mapping.set(key, prompt);
    });
    return mapping;
}
