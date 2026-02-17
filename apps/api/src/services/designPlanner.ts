import { z } from 'zod';
import { GROQ_MODELS, groqChatCompletion, isGroqModel, type GroqModelId } from './groq.provider.js';

export type PlannerPhase = 'discovery' | 'plan' | 'postgen';

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

export type PlannerPlanResponse = z.infer<typeof PlannerPlanResponseSchema>;
export type PlannerPostgenResponse = z.infer<typeof PlannerPostgenResponseSchema>;
export type PlannerResponse = PlannerPlanResponse | PlannerPostgenResponse;

export type PlannerInput = {
    phase: PlannerPhase;
    appPrompt: string;
    platform?: 'mobile' | 'tablet' | 'desktop';
    stylePreset?: 'modern' | 'minimal' | 'vibrant' | 'luxury' | 'playful';
    screenCountDesired?: number;
    screensGenerated?: Array<{ name: string; description?: string; htmlSummary?: string }>;
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
    if (phase === 'postgen') {
        return `You are a product-focused mobile UI planner.
Return JSON only. Do not return markdown.

Output schema:
{
  "phase": "postgen",
  "whatYouHave": ["Dashboard"],
  "gapsDetected": ["string"],
  "nextScreenSuggestions": [{ "name": "Create Habit", "why": "string", "priority": 1 }],
  "callToAction": {
    "primary": { "label": "Generate Create Habit", "screenNames": ["Create Habit"] },
    "secondary": { "label": "Generate Challenges + Profile", "screenNames": ["Challenges", "Profile & Settings"] }
  }
}

Rules:
- Be concrete and actionable.
- Prioritize suggestions by core-loop completion first.
- Limit nextScreenSuggestions to 3 items max.
- Keep CTA labels short.`;
    }

    return `You are a product-focused mobile UI planner.
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
If phase is "plan" or "discovery", define the best initial flow and which screens to generate now.`;
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
