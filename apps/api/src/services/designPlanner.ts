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
    intent: z.enum(['new_app', 'add_screen', 'edit_existing_screen', 'chat_assist']),
    reason: z.string().default(''),
    appContextPrompt: z.string().nullable().optional().transform((v) => v ?? undefined),
    targetScreenName: z.string().nullable().optional().transform((v) => v ?? undefined),
    matchedExistingScreenName: z.string().nullable().optional().transform((v) => v ?? undefined),
    referenceExistingScreenName: z.string().nullable().optional().transform((v) => v ?? undefined),
    generateTheseNow: z.array(z.string()).default([]),
    editInstruction: z.string().nullable().optional().transform((v) => v ?? undefined),
    assistantResponse: z.string().nullable().optional().transform((v) => v ?? undefined),
    recommendNextScreens: z.boolean().optional().default(false),
    nextScreenSuggestions: z.array(z.object({
        name: z.string(),
        why: z.string().default(''),
        priority: z.number().int().positive().optional(),
    })).optional().default([]),
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
    referenceImages?: string[];
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
    if (phase === 'route') return 'meta-llama/llama-4-maverick-17b-128e-instruct';
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
        return `You are a conversational UI design assistant that also routes actions.
Return JSON only.

Output schema:
{
  "phase": "route",
  "intent": "new_app | add_screen | edit_existing_screen | chat_assist",
  "reason": "short reason",
  "appContextPrompt": "full app context prompt to keep style consistency",
  "targetScreenName": "Home",
  "matchedExistingScreenName": "Dashboard",
  "referenceExistingScreenName": "Account",
  "generateTheseNow": ["Account"],
  "editInstruction": "regenerate with cleaner hierarchy",
  "assistantResponse": "conversational answer for critique/idea/help requests",
  "recommendNextScreens": false,
  "nextScreenSuggestions": [{ "name": "Explore", "why": "why it helps", "priority": 1 }]
}

Rules:
- Default to chat_assist unless user clearly asks to generate/add/edit screens.
- If user asks to regenerate/update/rework an existing screen by name -> edit_existing_screen.
- If user asks to match/design like another existing screen, set referenceExistingScreenName.
- If user asks for a new screen inside existing app -> add_screen.
- If user asks for a new app concept unrelated to existing screens -> new_app.
- If user asks for critique, feedback, app ideas, UX advice, strategy, or general conversation without explicit generation/edit action -> chat_assist.
- If user asks to describe/explain/analyze what a referenced screen looks like, ALWAYS use chat_assist.
- For chat_assist, provide assistantResponse as concise natural chat assistant text (not robotic JSON style), with practical suggestions.
- For chat_assist, write as a senior UI/UX designer and use rich tags in assistantResponse:
  [h2]...[/h2], [p]...[/p], [li]...[/li], [b]...[/b], [i]...[/i].
- Structure should adapt to user intent, not fixed section names.
- For critique requests, you may use sections like summary/strengths/issues/improvements.
- For ideation requests (e.g., "pitch this app idea"), provide a product pitch format:
  app concept, audience, key features, visual direction, and why it will work.
- Avoid generic one-liners; ground feedback in concrete UI details (hierarchy, spacing, contrast, typography, layout, interaction cues).
- Set recommendNextScreens=true only if the user explicitly asks what to build next / next screens / suggestions for next flow.
- Do NOT recommend next screens in normal conversation unless explicitly requested.
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
- Reject unrelated fallback templates.

Reference images:
- If provided, use attached images as visual source of truth for critique/style/layout analysis.
- In critique requests, cite concrete visual observations from the image(s).`;
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientNetworkError(error: unknown): boolean {
    const message = (error as Error)?.message || '';
    return /ECONNRESET|ETIMEDOUT|fetch failed|network|socket hang up/i.test(message);
}

function isAssistLikeRequest(prompt: string): boolean {
    const text = (prompt || '').toLowerCase();
    return /(describe|critique|criticize|review|analy[sz]e|analysis|feedback|what .*look|app idea|ideas|brainstorm|suggestion|ux advice|improve this)/i.test(text);
}

function isNextScreenRequest(prompt: string): boolean {
    const text = (prompt || '').toLowerCase();
    return /(what next|next screen|next screens|recommend.*screen|suggest.*screen|what should i build next|flow next)/i.test(text);
}

async function generateAssistFallbackResponse(input: PlannerInput, model: GroqModelId): Promise<string> {
    const referenceImages = (input.referenceImages || []).filter(Boolean).slice(0, 3);
    const assistInstruction = `You are a senior UI/UX designer assisting in-product.
Respond conversationally and directly to the user's request.
If the user asks to describe or critique a referenced screen, ground the answer in concrete visual observations (layout, hierarchy, color, spacing, typography, components, affordances).
Keep it concise but substantive (not too short).
Do not output JSON.

Formatting requirement: use these tags in output where helpful:
[h2]...[/h2], [p]...[/p], [li]...[/li], [b]...[/b], [i]...[/i]

Use a structured response, but choose section names based on user intent.
Do not force one rigid template for all requests.

Guidance:
- Critique/analysis: include strengths, issues, and concrete improvements.
- Pitch/idea requests: include app name ideas, product concept, core loop, key screens/features, and visual direction.
- General questions: answer directly with concise sections and actionable points.
`;
    const userPrompt = `User request:
${input.appPrompt}

Known screen names:
${(input.screensGenerated || []).map((s, i) => `${i + 1}. ${s.name}`).join('\n') || 'none'}`;

    const multimodalCapable = model === 'meta-llama/llama-4-maverick-17b-128e-instruct' && referenceImages.length > 0;
    const completion = await groqChatCompletion(multimodalCapable ? {
        model,
        prompt: '',
        messages: [
            {
                role: 'user',
                content: [
                    { type: 'text', text: `${assistInstruction}\n\n${userPrompt}` },
                    ...referenceImages.map((url) => ({
                        type: 'image_url' as const,
                        image_url: { url },
                    })),
                ],
            },
        ],
        maxCompletionTokens: 900,
        temperature: 0.35,
        topP: 0.9,
    } : {
        model,
        systemPrompt: assistInstruction,
        prompt: userPrompt,
        maxCompletionTokens: 900,
        temperature: 0.35,
        topP: 0.9,
    });
    return (completion.text || '').trim();
}

export async function runDesignPlanner(input: PlannerInput): Promise<PlannerResponse> {
    const hasReferenceImages = (input.referenceImages || []).filter(Boolean).length > 0;
    const forcedRouteVisionModel: GroqModelId | null =
        input.phase === 'route' && hasReferenceImages
            ? 'meta-llama/llama-4-maverick-17b-128e-instruct'
            : null;
    const primaryModel = forcedRouteVisionModel || pickPlannerModel(input.phase, input.preferredModel);
    const fallbackModel: GroqModelId = primaryModel === 'llama-3.3-70b-versatile'
        ? 'llama-3.1-8b-instant'
        : 'llama-3.3-70b-versatile';
    const modelsToTry: GroqModelId[] = [primaryModel, fallbackModel];
    let completion: Awaited<ReturnType<typeof groqChatCompletion>> | null = null;
    let lastError: unknown = null;

    for (const model of modelsToTry) {
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const referenceImages = (input.referenceImages || []).filter(Boolean).slice(0, 3);
                const canUseVisionRoute =
                    input.phase === 'route'
                    && model === 'meta-llama/llama-4-maverick-17b-128e-instruct'
                    && referenceImages.length > 0;

                if (canUseVisionRoute) {
                    // Use Groq multimodal shape for route/critique tasks on Maverick.
                    completion = await groqChatCompletion({
                        model,
                        prompt: '',
                        messages: [
                            {
                                role: 'user',
                                content: [
                                    {
                                        type: 'text',
                                        text: `${buildSystemPrompt(input.phase)}

${buildUserPrompt(input)}

Return JSON only.`,
                                    },
                                    ...referenceImages.map((url) => ({
                                        type: 'image_url' as const,
                                        image_url: { url },
                                    })),
                                ],
                            },
                        ],
                        maxCompletionTokens: 2300,
                        temperature: 0.3,
                        topP: 0.85,
                        // JSON response_format can conflict with multimodal on some Groq routes/models.
                        responseFormat: undefined,
                    });
                } else {
                    completion = await groqChatCompletion({
                        model,
                        systemPrompt: buildSystemPrompt(input.phase),
                        prompt: buildUserPrompt(input),
                        maxCompletionTokens: 2300,
                        temperature: 0.3,
                        topP: 0.85,
                        responseFormat: 'json_object',
                    });
                }
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
        const parsedRoute = PlannerRouteResponseSchema.parse({
            phase: 'route',
            ...raw,
        });
        if (parsedRoute.intent === 'chat_assist') {
            if (!parsedRoute.assistantResponse?.trim()) {
                try {
                    const assistText = await generateAssistFallbackResponse(input, primaryModel);
                    return {
                        ...parsedRoute,
                        assistantResponse: assistText || 'Here is a direct response based on your request.',
                    };
                } catch {
                    return {
                        ...parsedRoute,
                        assistantResponse: 'Here is a direct response based on your request.',
                    };
                }
            }
            if (!isNextScreenRequest(input.appPrompt)) {
                return {
                    ...parsedRoute,
                    recommendNextScreens: false,
                    nextScreenSuggestions: [],
                };
            }
            return parsedRoute;
        }
        if (isAssistLikeRequest(input.appPrompt)) {
            try {
                const assistText = await generateAssistFallbackResponse(input, primaryModel);
                return {
                    ...parsedRoute,
                    intent: 'chat_assist',
                    reason: parsedRoute.reason || 'assist-like request',
                    assistantResponse: assistText || parsedRoute.assistantResponse || 'Here is a direct review based on your request.',
                    recommendNextScreens: isNextScreenRequest(input.appPrompt),
                    nextScreenSuggestions: isNextScreenRequest(input.appPrompt) ? parsedRoute.nextScreenSuggestions : [],
                };
            } catch {
                return {
                    ...parsedRoute,
                    intent: 'chat_assist',
                    reason: parsedRoute.reason || 'assist-like request',
                    assistantResponse: parsedRoute.assistantResponse || 'Here is a direct review based on your request.',
                    recommendNextScreens: isNextScreenRequest(input.appPrompt),
                    nextScreenSuggestions: isNextScreenRequest(input.appPrompt) ? parsedRoute.nextScreenSuggestions : [],
                };
            }
        }
        return parsedRoute;
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
        'meta-llama/llama-4-maverick-17b-128e-instruct',
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
