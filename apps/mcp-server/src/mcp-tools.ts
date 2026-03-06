import { randomUUID } from 'node:crypto';
import { strToU8, zipSync } from 'fflate';
import type { EazyUiApiClient } from './api-client.js';
import type { ProjectRepository } from './project-repository.js';
import {
  DesignSystemAcceptInitialInputSchema,
  DesignSystemUpdateInputSchema,
  PlannerRouteInputSchema,
  ProjectCreateFromPromptInputSchema,
  ProjectCreateInputSchema,
  ProjectExportInputSchema,
  ProjectGetContextInputSchema,
  ProjectSaveInputSchema,
  ScreenEditInputSchema,
  ScreenGenerateInputSchema,
  ScreenMultiEditInputSchema,
} from './schemas.js';
import type { EazyUiHtmlScreen, EazyUiProjectPayload, RequestContext } from './types.js';

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  mutating?: boolean;
}

type ModelProfile = 'fast' | 'balanced' | 'quality';

export const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'project.list',
    description: 'List current user projects in descending updatedAt order.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'project.get_context',
    description: 'Fetch consolidated project context (design system, screens, chat summary).',
    inputSchema: {
      type: 'object',
      required: ['projectId'],
      properties: {
        projectId: { type: 'string' },
        includeHtml: { type: 'boolean' },
        htmlLimit: { type: 'number' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'project.create',
    description: 'Create a new empty project with selected platform/style defaults.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        platform: {
          type: 'string',
          description: 'Preferred device target. Supports aliases like mobile/phone, tablet/ipad, desktop/web.',
        },
        stylePreset: {
          type: 'string',
          description: 'Preferred style. Canonical: modern|minimal|vibrant|luxury|playful. Aliases like warm/cozy are accepted.',
        },
        idempotencyKey: { type: 'string' },
      },
      additionalProperties: false,
    },
    mutating: true,
  },
  {
    name: 'project.create_from_prompt',
    description: 'Create a whole new project from prompt (design system + screens) with model profile control.',
    inputSchema: {
      type: 'object',
      required: ['prompt'],
      properties: {
        prompt: { type: 'string' },
        name: { type: 'string' },
        platform: {
          type: 'string',
          description: 'Preferred device target. Supports aliases like mobile/phone, tablet/ipad, desktop/web.',
        },
        stylePreset: {
          type: 'string',
          description: 'Preferred style. Canonical: modern|minimal|vibrant|luxury|playful. Aliases like warm/cozy are accepted.',
        },
        modelProfile: { enum: ['fast', 'balanced', 'quality'] },
        temperature: { type: 'number', minimum: 0, maximum: 2 },
        idempotencyKey: { type: 'string' },
      },
      additionalProperties: false,
    },
    mutating: true,
  },
  {
    name: 'design_system.accept_initial',
    description: 'Accept the initial design system proposal and generate the first screen bundle.',
    inputSchema: {
      type: 'object',
      required: ['projectId'],
      properties: {
        projectId: { type: 'string' },
        modelProfile: { enum: ['fast', 'balanced', 'quality'] },
        temperature: { type: 'number', minimum: 0, maximum: 2 },
        expectedUpdatedAt: { type: 'string' },
        idempotencyKey: { type: 'string' },
      },
      additionalProperties: false,
    },
    mutating: true,
  },
  {
    name: 'planner.route',
    description: 'Run route planner to decide whether prompt should chat, generate, or edit.',
    inputSchema: {
      type: 'object',
      required: ['projectId', 'prompt'],
      properties: {
        projectId: { type: 'string' },
        prompt: { type: 'string' },
        platform: {
          type: 'string',
          description: 'Preferred device target. Supports aliases like mobile/phone, tablet/ipad, desktop/web.',
        },
        stylePreset: {
          type: 'string',
          description: 'Preferred style. Canonical: modern|minimal|vibrant|luxury|playful. Aliases like warm/cozy are accepted.',
        },
        modelProfile: { enum: ['fast', 'balanced', 'quality'] },
        temperature: { type: 'number', minimum: 0, maximum: 2 },
        referenceScreenIds: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'screen.generate',
    description: 'Generate one or more new screens and persist to project when projectId is provided.',
    inputSchema: {
      type: 'object',
      required: ['prompt'],
      properties: {
        projectId: { type: 'string' },
        prompt: { type: 'string' },
        platform: {
          type: 'string',
          description: 'Preferred device target. Supports aliases like mobile/phone, tablet/ipad, desktop/web.',
        },
        stylePreset: {
          type: 'string',
          description: 'Preferred style. Canonical: modern|minimal|vibrant|luxury|playful. Aliases like warm/cozy are accepted.',
        },
        modelProfile: { enum: ['fast', 'balanced', 'quality'] },
        targetScreenNames: { type: 'array', items: { type: 'string' } },
        temperature: { type: 'number', minimum: 0, maximum: 2 },
        expectedUpdatedAt: { type: 'string' },
        idempotencyKey: { type: 'string' },
      },
      additionalProperties: false,
    },
    mutating: true,
  },
  {
    name: 'screen.edit',
    description: 'Edit an existing screen and persist changes to project.',
    inputSchema: {
      type: 'object',
      required: ['projectId', 'screenId', 'instruction'],
      properties: {
        projectId: { type: 'string' },
        screenId: { type: 'string' },
        instruction: { type: 'string' },
        html: { type: 'string' },
        modelProfile: { enum: ['fast', 'balanced', 'quality'] },
        temperature: { type: 'number', minimum: 0, maximum: 2 },
        expectedUpdatedAt: { type: 'string' },
        idempotencyKey: { type: 'string' },
      },
      additionalProperties: false,
    },
    mutating: true,
  },
  {
    name: 'screen.multi_edit',
    description: 'Apply one edit instruction across multiple screens and persist with merged summary.',
    inputSchema: {
      type: 'object',
      required: ['projectId', 'screenIds', 'instruction'],
      properties: {
        projectId: { type: 'string' },
        screenIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
        instruction: { type: 'string' },
        modelProfile: { enum: ['fast', 'balanced', 'quality'] },
        temperature: { type: 'number', minimum: 0, maximum: 2 },
        expectedUpdatedAt: { type: 'string' },
        idempotencyKey: { type: 'string' },
      },
      additionalProperties: false,
    },
    mutating: true,
  },
  {
    name: 'design_system.update',
    description: 'Update project design system via prompt or patch and optionally restyle screens.',
    inputSchema: {
      type: 'object',
      required: ['projectId'],
      properties: {
        projectId: { type: 'string' },
        prompt: { type: 'string' },
        patch: { type: 'object' },
        applyToExistingScreens: { type: 'boolean' },
        modelProfile: { enum: ['fast', 'balanced', 'quality'] },
        temperature: { type: 'number', minimum: 0, maximum: 2 },
        expectedUpdatedAt: { type: 'string' },
        idempotencyKey: { type: 'string' },
      },
      additionalProperties: false,
    },
    mutating: true,
  },
  {
    name: 'project.save',
    description: 'Persist current project state to Firestore-backed project storage.',
    inputSchema: {
      type: 'object',
      required: ['projectId'],
      properties: {
        projectId: { type: 'string' },
        reason: { type: 'string' },
        designSpec: { type: 'object' },
        canvasDoc: {},
        chatState: {},
        expectedUpdatedAt: { type: 'string' },
        idempotencyKey: { type: 'string' },
      },
      additionalProperties: true,
    },
    mutating: true,
  },
  {
    name: 'project.export',
    description: 'Export project screens as HTML bundle, PNG renders, or ZIP bundle.',
    inputSchema: {
      type: 'object',
      required: ['projectId', 'format'],
      properties: {
        projectId: { type: 'string' },
        format: { enum: ['png', 'zip', 'html'] },
        screenIds: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: false,
    },
    mutating: false,
  },
] as const;

interface ToolExecutionOptions {
  apiClient: EazyUiApiClient;
  projectRepo: ProjectRepository;
  context: RequestContext;
  name: string;
  args: unknown;
  enableMutations: boolean;
}

export async function executeTool(options: ToolExecutionOptions): Promise<Record<string, unknown>> {
  const { apiClient, projectRepo, context, name, args, enableMutations } = options;
  const definition = MCP_TOOLS.find((tool) => tool.name === name);
  if (!definition) {
    throw new Error(`Unknown tool: ${name}`);
  }
  if (definition.mutating && !enableMutations) {
    throw new Error(`Mutating tools are disabled (tool: ${name}).`);
  }
  if (!context.uid) {
    throw new Error('Unauthorized: missing user identity.');
  }

  const startedAt = Date.now();
  const base = {
    traceId: context.traceId,
    tool: name,
  };
  const stagePromptInProjectChat = async (params: {
    project: EazyUiProjectPayload;
    content: string;
    idempotencyKey?: string;
    expectedUpdatedAt?: string;
    immediate?: boolean;
  }): Promise<EazyUiProjectPayload> => {
    const promptText = params.content.trim();
    if (!promptText) return params.project;
    const nextChatState = appendUserMessage(params.project.chatState, promptText, {
      source: 'mcp',
      tool: name,
      requestKind: 'mcp_prompt',
    });
    const nextProject: EazyUiProjectPayload = {
      ...params.project,
      chatState: nextChatState,
    };
    if (!params.immediate || params.expectedUpdatedAt) {
      return nextProject;
    }
    const promptIdempotencyKey = buildAuxIdempotencyKey(params.idempotencyKey, 'prompt');
    await projectRepo.saveProject({
      uid: context.uid!,
      projectId: params.project.projectId,
      designSpec: params.project.designSpec as unknown as Record<string, unknown>,
      canvasDoc: params.project.canvasDoc,
      chatState: nextChatState,
      idempotencyKey: promptIdempotencyKey,
    });
    return nextProject;
  };

  if (name === 'project.list') {
    const projects = await projectRepo.listProjects(context.uid);
    return finalize(base, startedAt, {
      operationSummary: `Listed ${projects.length} project(s)`,
      projects,
    });
  }

  if (name === 'project.get_context') {
    const input = ProjectGetContextInputSchema.parse(args);
    const project = await projectRepo.getProject(context.uid, input.projectId);
    return finalize(base, startedAt, {
      operationSummary: `Loaded project context for ${input.projectId}`,
      ...buildProjectContext(project, input.includeHtml, input.htmlLimit),
    });
  }

  if (name === 'project.create') {
    const input = ProjectCreateInputSchema.parse(args);
    const normalizedPlatform = normalizePlatform(input.platform);
    const normalizedStylePreset = normalizeStylePreset(input.stylePreset);
    const initialDesignSpec = createInitialDesignSpec({
      name: input.name,
      description: input.description || '',
      platform: normalizedPlatform,
      stylePreset: normalizedStylePreset,
    });
    const saved = await projectRepo.saveProject({
      uid: context.uid,
      designSpec: initialDesignSpec,
      canvasDoc: null,
      mcpMeta: {
        designSystemPendingAcceptance: false,
        platform: normalizedPlatform,
        stylePreset: normalizedStylePreset,
      },
      chatState: {
        messages: [{
          id: randomUUID(),
          role: 'assistant',
          content: `Project "${input.name}" created (${normalizedPlatform}/${normalizedStylePreset}).`,
          status: 'complete',
          timestamp: Date.now(),
        }],
      },
      idempotencyKey: input.idempotencyKey,
    });
    return finalize(base, startedAt, {
      operationSummary: `Created new project ${saved.projectId}`,
      projectId: saved.projectId,
      name: input.name,
      platform: normalizedPlatform,
      stylePreset: normalizedStylePreset,
      savedAt: saved.savedAt,
      updatedAt: saved.updatedAt,
    });
  }

  if (name === 'project.create_from_prompt') {
    const input = ProjectCreateFromPromptInputSchema.parse(args);
    const normalizedPlatform = normalizePlatform(input.platform);
    const normalizedStylePreset = normalizeStylePreset(input.stylePreset);
    const preferredModel = resolvePreferredModel(input.modelProfile, 'designer');
    const designSystemResponse = await apiClient.designSystem(context, {
      prompt: input.prompt,
      stylePreset: normalizedStylePreset,
      platform: normalizedPlatform,
      preferredModel,
      temperature: input.temperature,
      idempotencyKey: input.idempotencyKey ? `${input.idempotencyKey}-ds` : undefined,
    });
    const designSystem = (designSystemResponse.designSystem && typeof designSystemResponse.designSystem === 'object')
      ? (designSystemResponse.designSystem as Record<string, unknown>)
      : undefined;
    const dsSystemName = coerceOptionalString((designSystem as { systemName?: unknown } | undefined)?.systemName);
    const finalName = input.name || dsSystemName || deriveProjectNameFromPrompt(input.prompt);
    const finalDesignSpec: Record<string, unknown> = {
      id: randomUUID(),
      name: finalName,
      description: `Initial prompt: ${input.prompt}`,
      designSystem,
      screens: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {
        platform: normalizedPlatform,
        stylePreset: normalizedStylePreset,
        modelProfile: input.modelProfile,
      },
    };

    const saved = await projectRepo.saveProject({
      uid: context.uid,
      designSpec: finalDesignSpec,
      canvasDoc: null,
      mcpMeta: {
        designSystemPendingAcceptance: true,
        initialPrompt: input.prompt,
        initialDesignSystemProposedAt: new Date().toISOString(),
        platform: normalizedPlatform,
        stylePreset: normalizedStylePreset,
        modelProfile: input.modelProfile,
      },
      chatState: {
        messages: [
          {
            id: randomUUID(),
            role: 'user',
            content: input.prompt,
            status: 'complete',
            timestamp: Date.now(),
            meta: {
              source: 'mcp',
              tool: name,
              requestKind: 'mcp_prompt',
            },
          },
          {
            id: randomUUID(),
            role: 'assistant',
            content: `Created project "${finalName}" with an initial design system proposal. Accept it to generate first screens.`,
            status: 'complete',
            timestamp: Date.now(),
            meta: {
              source: 'mcp',
              tool: name,
            },
          },
        ],
      },
      idempotencyKey: input.idempotencyKey,
    });

    return finalize(base, startedAt, {
      operationSummary: `Created project ${saved.projectId} from prompt`,
      projectId: saved.projectId,
      name: finalName,
      platform: normalizedPlatform,
      stylePreset: normalizedStylePreset,
      modelProfile: input.modelProfile,
      screenCount: 0,
      requiresDesignSystemAcceptance: true,
      nextAction: {
        tool: 'design_system.accept_initial',
        arguments: {
          projectId: saved.projectId,
          modelProfile: input.modelProfile,
        },
      },
      designSystem,
      savedAt: saved.savedAt,
      updatedAt: saved.updatedAt,
    });
  }

  if (name === 'design_system.accept_initial') {
    const input = DesignSystemAcceptInitialInputSchema.parse(args);
    const preferredModel = resolvePreferredModel(input.modelProfile, 'designer');
    let project = await projectRepo.getProject(context.uid, input.projectId);
    const mcpMeta = getProjectMcpMeta(project);
    const pendingAcceptance = mcpMeta.designSystemPendingAcceptance === true;
    if (!pendingAcceptance) {
      return finalize(base, startedAt, {
        operationSummary: `Initial design system already accepted for ${input.projectId}`,
        projectId: input.projectId,
        accepted: true,
        alreadyAccepted: true,
        screenCount: project.designSpec.screens.length,
      });
    }
    project = await stagePromptInProjectChat({
      project,
      content: 'Proceed with the initial design system and generate the first screen bundle.',
      idempotencyKey: input.idempotencyKey,
      expectedUpdatedAt: input.expectedUpdatedAt,
      immediate: true,
    });

    const initialPrompt = coerceOptionalString(mcpMeta.initialPrompt)
      || coerceOptionalString(project.designSpec.description)
      || project.designSpec.name;

    const generated = await apiClient.generate(context, {
      prompt: initialPrompt,
      platform: normalizePlatform(coerceOptionalString(mcpMeta.platform)),
      stylePreset: normalizeStylePreset(coerceOptionalString(mcpMeta.stylePreset)),
      projectId: input.projectId,
      preferredModel,
      projectDesignSystem: project.designSpec.designSystem,
      bundleIncludesDesignSystem: true,
      temperature: input.temperature,
      idempotencyKey: input.idempotencyKey,
    });
    const generatedSpec = (generated.designSpec && typeof generated.designSpec === 'object')
      ? (generated.designSpec as Record<string, unknown>)
      : {};
    const newScreens = ensureScreensFromUnknown(generatedSpec.screens);
    const mergeResult = mergeScreens(project.designSpec.screens, newScreens);
    const mergedScreens = mergeResult.screens;
    const acceptedAt = new Date().toISOString();

    const saved = await projectRepo.saveProject({
      uid: context.uid,
      projectId: input.projectId,
      expectedUpdatedAt: input.expectedUpdatedAt,
      idempotencyKey: input.idempotencyKey,
      mcpMeta: {
        ...mcpMeta,
        designSystemPendingAcceptance: false,
        initialDesignSystemAcceptedAt: acceptedAt,
      },
      designSpec: {
        ...project.designSpec,
        screens: mergedScreens,
        designSystem: (generatedSpec.designSystem && typeof generatedSpec.designSystem === 'object')
          ? generatedSpec.designSystem
          : project.designSpec.designSystem,
        updatedAt: acceptedAt,
      } as Record<string, unknown>,
      canvasDoc: project.canvasDoc,
      chatState: appendAssistantMessage(
        project.chatState,
        `Initial design system accepted. Added ${mergeResult.addedCount} screen(s).${mergeResult.skippedCount > 0 ? ` Skipped ${mergeResult.skippedCount} duplicates.` : ''}`,
        { source: 'mcp', tool: name },
      ),
    });

    return finalize(base, startedAt, {
      operationSummary: `Accepted initial design system and added ${mergeResult.addedCount} screen(s)`,
      projectId: input.projectId,
      accepted: true,
      generatedScreenCount: newScreens.length,
      addedScreenCount: mergeResult.addedCount,
      skippedDuplicateCount: mergeResult.skippedCount,
      screenCount: mergedScreens.length,
      screens: mergedScreens.map((screen) => ({ screenId: screen.screenId, name: screen.name })),
      savedAt: saved.savedAt,
      updatedAt: saved.updatedAt,
    });
  }

  if (name === 'planner.route') {
    const input = PlannerRouteInputSchema.parse(args);
    let project = await projectRepo.getProject(context.uid, input.projectId);
    project = await stagePromptInProjectChat({
      project,
      content: input.prompt,
      immediate: true,
    });
    const normalizedPlatform = normalizePlatform(input.platform);
    const normalizedStylePreset = normalizeStylePreset(input.stylePreset);
    if (requiresInitialDesignSystemAcceptance(project)) {
      return finalize(base, startedAt, {
        operationSummary: `Route blocked: initial design system acceptance required for ${input.projectId}`,
        projectId: input.projectId,
        route: {
          phase: 'route',
          intent: 'accept_design_system_required',
          action: 'chat_assist',
          confidence: 1,
          reason: 'Initial design system must be accepted before first screen generation.',
          assistantResponse: 'Call design_system.accept_initial with this projectId to generate the first screens.',
        },
        requiresDesignSystemAcceptance: true,
      });
    }
    const preferredModel = resolvePreferredModel(input.modelProfile, 'planner');
    const referenceScreens = (input.referenceScreenIds || [])
      .map((screenId) => project.designSpec.screens.find((screen) => screen.screenId === screenId))
      .filter((screen): screen is NonNullable<typeof screen> => Boolean(screen))
      .map((screen) => ({
        screenId: screen.screenId,
        name: screen.name,
        html: screen.html,
      }));
    const recentMessages = extractRecentMessages(project.chatState, 20);

    const routed = await apiClient.routePlan(context, {
      phase: 'route',
      appPrompt: input.prompt,
      platform: normalizedPlatform,
      stylePreset: normalizedStylePreset,
      screenDetails: project.designSpec.screens.map((screen) => ({
        screenId: screen.screenId,
        name: screen.name,
        htmlSummary: screen.html.slice(0, 500),
      })),
      recentMessages,
      routeReferenceScreens: referenceScreens,
      projectMemorySummary: createProjectMemorySummary(project),
      preferredModel,
      temperature: input.temperature,
    });
    const routedAssistantContent = routed && typeof routed === 'object' && typeof (routed as { assistantResponse?: unknown }).assistantResponse === 'string'
      ? coerceString((routed as { assistantResponse?: unknown }).assistantResponse)
      : `Planner route: ${(routed as { intent?: unknown }).intent || 'unknown'} -> ${(routed as { action?: unknown }).action || 'assist'}.`;
    const routedChatState = appendAssistantMessage(
      project.chatState,
      routedAssistantContent,
      { source: 'mcp', tool: name },
    );
    const routeSaved = await projectRepo.saveProject({
      uid: context.uid,
      projectId: input.projectId,
      designSpec: project.designSpec as unknown as Record<string, unknown>,
      canvasDoc: project.canvasDoc,
      chatState: routedChatState,
      idempotencyKey: buildAuxIdempotencyKey(undefined, 'route'),
    });

    return finalize(base, startedAt, {
      operationSummary: `Planner route completed for ${input.projectId}`,
      projectId: input.projectId,
      route: routed,
      savedAt: routeSaved.savedAt,
      updatedAt: routeSaved.updatedAt,
    });
  }

  if (name === 'screen.generate') {
    const input = ScreenGenerateInputSchema.parse(args);
    const normalizedPlatform = normalizePlatform(input.platform);
    const normalizedStylePreset = normalizeStylePreset(input.stylePreset);
    const preferredModel = resolvePreferredModel(input.modelProfile, 'designer');
    let project: EazyUiProjectPayload | null = null;
    if (input.projectId) {
      project = await projectRepo.getProject(context.uid, input.projectId);
      ensureInitialDesignSystemAcceptedOrThrow(project);
      project = await stagePromptInProjectChat({
        project,
        content: input.prompt,
        idempotencyKey: input.idempotencyKey,
        expectedUpdatedAt: input.expectedUpdatedAt,
        immediate: true,
      });
    }
    let enhancedPrompt = input.targetScreenNames?.length
      ? `${input.prompt}\n\nGenerate these screens now (exactly): ${input.targetScreenNames.join(', ')}.`
      : input.prompt;
    if (project?.designSpec.designSystem && typeof project.designSpec.designSystem === 'object') {
      enhancedPrompt = `${enhancedPrompt}\n\n${buildDesignSystemLockInstruction(project.designSpec.designSystem as Record<string, unknown>)}`;
    }

    const generated = await apiClient.generate(context, {
      prompt: enhancedPrompt,
      platform: normalizedPlatform,
      stylePreset: normalizedStylePreset,
      projectId: input.projectId,
      preferredModel,
      projectDesignSystem: project?.designSpec.designSystem,
      bundleIncludesDesignSystem: false,
      temperature: input.temperature,
      idempotencyKey: input.idempotencyKey,
    });

    if (!input.projectId) {
      return finalize(base, startedAt, {
        operationSummary: 'Generated screens without project persistence',
        generated,
      });
    }
    if (!project) {
      project = await projectRepo.getProject(context.uid, input.projectId);
    }
    const generatedSpec = (generated.designSpec && typeof generated.designSpec === 'object')
      ? (generated.designSpec as Record<string, unknown>)
      : {};
    let newScreens = ensureScreensFromUnknown(generatedSpec.screens);
    if (input.targetScreenNames?.length) {
      const targetCanon = new Set(input.targetScreenNames.map((value) => canonicalizeScreenName(value)));
      const filtered = newScreens.filter((screen) => targetCanon.has(canonicalizeScreenName(screen.name)));
      if (filtered.length > 0) {
        newScreens = filtered;
      }
    }
    const mergeResult = mergeScreens(project.designSpec.screens, newScreens);
    const mergedScreens = mergeResult.screens;
    const nextDesignSpec = {
      ...project.designSpec,
      screens: mergedScreens,
      description: typeof generatedSpec.description === 'string'
        ? generatedSpec.description
        : project.designSpec.description,
      // Keep project design system locked after acceptance; do not drift from generation output.
      designSystem: project.designSpec.designSystem,
      updatedAt: new Date().toISOString(),
    };

    const saved = await projectRepo.saveProject({
      uid: context.uid,
      projectId: input.projectId,
      expectedUpdatedAt: input.expectedUpdatedAt,
      idempotencyKey: input.idempotencyKey,
      designSpec: nextDesignSpec as Record<string, unknown>,
      canvasDoc: project.canvasDoc,
      chatState: appendAssistantMessage(
        project.chatState,
        `Generated ${newScreens.length} candidate screen(s); added ${mergeResult.addedCount}.${mergeResult.skippedCount > 0 ? ` Skipped ${mergeResult.skippedCount} duplicates.` : ''} ${mergeResult.addedNames.length > 0 ? `Added: ${mergeResult.addedNames.join(', ')}.` : ''}`,
        { source: 'mcp', tool: name },
      ),
    });

    return finalize(base, startedAt, {
      operationSummary: `Generated ${newScreens.length} candidate screen(s); added ${mergeResult.addedCount}`,
      projectId: input.projectId,
      generatedScreenCount: newScreens.length,
      addedScreenCount: mergeResult.addedCount,
      skippedDuplicateCount: mergeResult.skippedCount,
      savedAt: saved.savedAt,
      updatedAt: saved.updatedAt,
      screens: mergedScreens.map((screen) => ({
        screenId: screen.screenId,
        name: screen.name,
      })),
    });
  }

  if (name === 'screen.edit') {
    const input = ScreenEditInputSchema.parse(args);
    const preferredModel = resolvePreferredModel(input.modelProfile, 'designer');
    let project = await projectRepo.getProject(context.uid, input.projectId);
    project = await stagePromptInProjectChat({
      project,
      content: input.instruction,
      idempotencyKey: input.idempotencyKey,
      expectedUpdatedAt: input.expectedUpdatedAt,
      immediate: true,
    });
    const screen = project.designSpec.screens.find((item) => item.screenId === input.screenId);
    if (!screen) {
      throw new Error(`Screen not found: ${input.screenId}`);
    }
    const html = input.html || screen.html;
    const editResult = await apiClient.edit(context, {
      instruction: input.instruction,
      screenId: input.screenId,
      html,
      projectId: input.projectId,
      preferredModel,
      projectDesignSystem: project.designSpec.designSystem,
      temperature: input.temperature,
      idempotencyKey: input.idempotencyKey,
    });
    const editedHtml = typeof editResult.html === 'string' ? sanitizeGeneratedHtml(editResult.html) : screen.html;
    const nextScreens = project.designSpec.screens.map((item) => (
      item.screenId === input.screenId
        ? { ...item, html: editedHtml, status: 'complete' as const }
        : item
    ));
    const nextChatState = appendAssistantMessage(
      project.chatState,
      coerceString(editResult.description, 'Screen edited successfully.'),
      { source: 'mcp', tool: name },
    );
    const saved = await projectRepo.saveProject({
      uid: context.uid,
      projectId: input.projectId,
      expectedUpdatedAt: input.expectedUpdatedAt,
      idempotencyKey: input.idempotencyKey,
      designSpec: {
        ...project.designSpec,
        screens: nextScreens,
        updatedAt: new Date().toISOString(),
      } as Record<string, unknown>,
      canvasDoc: project.canvasDoc,
      chatState: nextChatState,
    });

    return finalize(base, startedAt, {
      operationSummary: `Edited screen ${screen.name}`,
      projectId: input.projectId,
      screenId: input.screenId,
      description: coerceOptionalString(editResult.description),
      htmlChars: editedHtml.length,
      savedAt: saved.savedAt,
      updatedAt: saved.updatedAt,
    });
  }

  if (name === 'screen.multi_edit') {
    const input = ScreenMultiEditInputSchema.parse(args);
    const preferredModel = resolvePreferredModel(input.modelProfile, 'designer');
    let project = await projectRepo.getProject(context.uid, input.projectId);
    project = await stagePromptInProjectChat({
      project,
      content: input.instruction,
      idempotencyKey: input.idempotencyKey,
      expectedUpdatedAt: input.expectedUpdatedAt,
      immediate: true,
    });
    const targetIds = new Set(input.screenIds);
    const results: Array<Record<string, unknown>> = [];
    const updatedScreens = [...project.designSpec.screens];
    let successCount = 0;

    for (const screen of project.designSpec.screens) {
      if (!targetIds.has(screen.screenId)) continue;
      try {
        const referenceScreens = project.designSpec.screens
          .filter((item) => item.screenId !== screen.screenId)
          .slice(0, 3)
          .map((item) => ({
            screenId: item.screenId,
            name: item.name,
            html: item.html,
          }));
        const editResult = await apiClient.edit(context, {
          instruction: input.instruction,
          screenId: screen.screenId,
          html: screen.html,
          projectId: input.projectId,
          preferredModel,
          projectDesignSystem: project.designSpec.designSystem,
          referenceScreens,
          temperature: input.temperature,
          idempotencyKey: input.idempotencyKey,
        });
        const editedHtml = typeof editResult.html === 'string' ? sanitizeGeneratedHtml(editResult.html) : screen.html;
        const targetIndex = updatedScreens.findIndex((item) => item.screenId === screen.screenId);
        if (targetIndex >= 0) {
          updatedScreens[targetIndex] = {
            ...updatedScreens[targetIndex],
            html: editedHtml,
            status: 'complete',
          };
        }
        successCount += 1;
        results.push({
          screenId: screen.screenId,
          screenName: screen.name,
          status: 'success',
          description: editResult.description || '',
          htmlChars: editedHtml.length,
        });
      } catch (error) {
        results.push({
          screenId: screen.screenId,
          screenName: screen.name,
          status: 'error',
          error: (error as Error).message,
        });
      }
    }

    const mergedDescription = results
      .filter((item) => item.status === 'success' && typeof item.description === 'string' && item.description)
      .map((item) => `${item.screenName}: ${item.description}`)
      .join(' | ');

    let savedInfo: { savedAt: string; updatedAt: string } | null = null;
    if (successCount > 0) {
      const nextChatState = appendAssistantMessage(
        project.chatState,
        mergedDescription || `Updated ${successCount} screens.`,
        { source: 'mcp', tool: name },
      );
      savedInfo = await projectRepo.saveProject({
        uid: context.uid,
        projectId: input.projectId,
        expectedUpdatedAt: input.expectedUpdatedAt,
        idempotencyKey: input.idempotencyKey,
        designSpec: {
          ...project.designSpec,
          screens: updatedScreens,
          updatedAt: new Date().toISOString(),
        } as Record<string, unknown>,
        canvasDoc: project.canvasDoc,
        chatState: nextChatState,
      });
    }

    return finalize(base, startedAt, {
      operationSummary: `Multi-edit processed ${results.length} screen(s)`,
      projectId: input.projectId,
      successCount,
      failedCount: results.length - successCount,
      mergedDescription,
      savedAt: savedInfo?.savedAt || null,
      updatedAt: savedInfo?.updatedAt || null,
      results,
    });
  }

  if (name === 'design_system.update') {
    const input = DesignSystemUpdateInputSchema.parse(args);
    const preferredModel = resolvePreferredModel(input.modelProfile, 'designer');
    let project = await projectRepo.getProject(context.uid, input.projectId);
    const designSystemPrompt = input.prompt
      || (input.patch ? `Apply this design-system patch: ${JSON.stringify(input.patch).slice(0, 2000)}` : '');
    project = await stagePromptInProjectChat({
      project,
      content: designSystemPrompt,
      idempotencyKey: input.idempotencyKey,
      expectedUpdatedAt: input.expectedUpdatedAt,
      immediate: true,
    });
    let nextDesignSystem: Record<string, unknown> | undefined =
      (project.designSpec.designSystem && typeof project.designSpec.designSystem === 'object')
        ? (project.designSpec.designSystem as Record<string, unknown>)
        : undefined;

    if (input.prompt) {
      const dsResponse = await apiClient.designSystem(context, {
        prompt: input.prompt,
        projectId: input.projectId,
        preferredModel,
        temperature: input.temperature,
        projectDesignSystem: nextDesignSystem,
        idempotencyKey: input.idempotencyKey,
      });
      if (dsResponse.designSystem && typeof dsResponse.designSystem === 'object') {
        nextDesignSystem = dsResponse.designSystem as Record<string, unknown>;
      }
    }

    if (input.patch) {
      nextDesignSystem = deepMerge(nextDesignSystem || {}, input.patch);
    }

    if (!nextDesignSystem) {
      throw new Error('No design system update produced. Provide prompt or patch.');
    }

    let nextScreens = [...project.designSpec.screens];
    const restyleResults: Array<{ screenId: string; screenName: string; status: 'success' | 'error'; description?: string; error?: string }> = [];
    if (input.applyToExistingScreens) {
      for (const screen of project.designSpec.screens) {
        try {
          const editResult = await apiClient.edit(context, {
            instruction: [
              'Apply the updated project design system to this screen.',
              'Keep structure and content intent unchanged.',
              'Update tokens, typography, spacing tone, and radius usage for consistency.',
              'Ensure both light and dark mode are theme-aware.',
            ].join(' '),
            screenId: screen.screenId,
            html: screen.html,
            projectId: input.projectId,
            preferredModel,
            projectDesignSystem: nextDesignSystem,
            temperature: input.temperature,
            idempotencyKey: input.idempotencyKey,
          });
          const editedHtml = typeof editResult.html === 'string' ? sanitizeGeneratedHtml(editResult.html) : screen.html;
          nextScreens = nextScreens.map((item) => (
            item.screenId === screen.screenId ? { ...item, html: editedHtml } : item
          ));
          restyleResults.push({
            screenId: screen.screenId,
            screenName: screen.name,
            status: 'success',
            description: coerceOptionalString(editResult.description),
          });
        } catch (error) {
          restyleResults.push({
            screenId: screen.screenId,
            screenName: screen.name,
            status: 'error',
            error: (error as Error).message,
          });
        }
      }
    }

    const nextChatState = appendAssistantMessage(
      project.chatState,
      `Design system updated${input.applyToExistingScreens ? ` and restyled ${restyleResults.filter((item) => item.status === 'success').length} screens` : ''}.`,
      { source: 'mcp', tool: name },
    );
    const saved = await projectRepo.saveProject({
      uid: context.uid,
      projectId: input.projectId,
      expectedUpdatedAt: input.expectedUpdatedAt,
      idempotencyKey: input.idempotencyKey,
      designSpec: {
        ...project.designSpec,
        designSystem: nextDesignSystem,
        screens: nextScreens,
        updatedAt: new Date().toISOString(),
      } as Record<string, unknown>,
      canvasDoc: project.canvasDoc,
      chatState: nextChatState,
    });

    return finalize(base, startedAt, {
      operationSummary: `Updated design system for ${input.projectId}`,
      projectId: input.projectId,
      applyToExistingScreens: input.applyToExistingScreens,
      restyledSuccessCount: restyleResults.filter((item) => item.status === 'success').length,
      restyledFailedCount: restyleResults.filter((item) => item.status === 'error').length,
      restyleResults,
      designSystem: nextDesignSystem,
      savedAt: saved.savedAt,
      updatedAt: saved.updatedAt,
    });
  }

  if (name === 'project.save') {
    const input = ProjectSaveInputSchema.parse(args);
    const project = await projectRepo.getProject(context.uid, input.projectId);
    const saved = await projectRepo.saveProject({
      uid: context.uid,
      projectId: input.projectId,
      expectedUpdatedAt: input.expectedUpdatedAt,
      idempotencyKey: input.idempotencyKey,
      designSpec: input.designSpec || (project.designSpec as unknown as Record<string, unknown>),
      canvasDoc: input.canvasDoc !== undefined ? input.canvasDoc : project.canvasDoc,
      chatState: input.chatState !== undefined ? input.chatState : project.chatState,
    });
    return finalize(base, startedAt, {
      operationSummary: `Saved project ${input.projectId}`,
      projectId: input.projectId,
      reason: input.reason || null,
      snapshotPath: saved.snapshotPath || null,
      snapshotUpdated: saved.snapshotWritten === true,
      savedAt: saved.savedAt,
      updatedAt: saved.updatedAt,
    });
  }

  if (name === 'project.export') {
    const input = ProjectExportInputSchema.parse(args);
    const project = await projectRepo.getProject(context.uid, input.projectId);
    const selectedScreens = input.screenIds?.length
      ? project.designSpec.screens.filter((screen) => input.screenIds?.includes(screen.screenId))
      : project.designSpec.screens;

    if (input.format === 'html') {
      const files = buildExportFileEntries(selectedScreens, 'html').map(({ screen, path }) => ({
        path,
        screenId: screen.screenId,
        screenName: screen.name,
        content: screen.html,
      }));
      return finalize(base, startedAt, {
        operationSummary: `Exported ${files.length} screen(s) as HTML`,
        projectId: input.projectId,
        format: 'html',
        files,
      });
    }

    if (input.format === 'png') {
      const images: Array<Record<string, unknown>> = [];
      const pathByScreenId = new Map(buildExportFileEntries(selectedScreens, 'png').map((entry) => [entry.screen.screenId, entry.path]));
      for (const screen of selectedScreens) {
        const rendered = await apiClient.renderScreenImage(context, {
          html: screen.html,
          width: screen.width || 402,
          height: screen.height || 874,
          scale: 2,
        });
        images.push({
          screenId: screen.screenId,
          screenName: screen.name,
          path: pathByScreenId.get(screen.screenId) || `${toSafeFileName(screen.name || screen.screenId)}.png`,
          width: rendered.width,
          height: rendered.height,
          dataUrl: `data:image/png;base64,${rendered.pngBase64}`,
        });
      }
      return finalize(base, startedAt, {
        operationSummary: `Exported ${images.length} screen(s) as PNG`,
        projectId: input.projectId,
        format: 'png',
        images,
      });
    }

    const zipInput: Record<string, Uint8Array> = {};
    for (const { screen, path: fileName } of buildExportFileEntries(selectedScreens, 'html')) {
      zipInput[fileName] = strToU8(screen.html || '');
    }
    zipInput['manifest.json'] = strToU8(
      JSON.stringify({
        projectId: project.projectId,
        projectName: project.designSpec.name,
        exportedAt: new Date().toISOString(),
        screenCount: selectedScreens.length,
        screens: selectedScreens.map((screen) => ({
          screenId: screen.screenId,
          name: screen.name,
          width: screen.width,
          height: screen.height,
        })),
      }, null, 2),
    );
    const zipped = zipSync(zipInput, { level: 6 });
    const zipBase64 = Buffer.from(zipped).toString('base64');
    return finalize(base, startedAt, {
      operationSummary: `Exported ${selectedScreens.length} screen(s) as ZIP`,
      projectId: input.projectId,
      format: 'zip',
      fileName: `${toSafeFileName(project.designSpec.name || project.projectId)}-export.zip`,
      base64: zipBase64,
      sizeBytes: zipped.byteLength,
    });
  }

  throw new Error(`Unhandled tool: ${name}`);
}

function finalize(
  base: Record<string, unknown>,
  startedAt: number,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...base,
    status: 'success',
    durationMs: Date.now() - startedAt,
    ...payload,
  };
}

function buildProjectContext(
  project: EazyUiProjectPayload,
  includeHtml: boolean,
  htmlLimit: number,
): Record<string, unknown> {
  return {
    projectId: project.projectId,
    name: project.designSpec?.name,
    description: project.designSpec?.description || null,
    updatedAt: project.updatedAt,
    designSystem: project.designSpec?.designSystem || null,
    screenCount: project.designSpec?.screens.length || 0,
    screens: (project.designSpec?.screens || []).map((screen) => ({
      screenId: screen.screenId,
      name: screen.name,
      width: screen.width,
      height: screen.height,
      html: includeHtml ? screen.html.slice(0, htmlLimit) : undefined,
      htmlChars: screen.html.length,
    })),
    chatSummary: {
      messageCount: extractRecentMessages(project.chatState, 500).length,
      recent: extractRecentMessages(project.chatState, 20),
    },
  };
}

function extractRecentMessages(
  chatState: unknown,
  limit: number,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (!chatState || typeof chatState !== 'object') return [];
  const raw = (chatState as { messages?: unknown }).messages;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((message): message is Record<string, unknown> => Boolean(message && typeof message === 'object'))
    .map((message) => ({
      role: message.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: typeof message.content === 'string' ? message.content : '',
    }))
    .slice(-1 * limit);
}

function createProjectMemorySummary(project: EazyUiProjectPayload): string {
  const screenNames = (project.designSpec?.screens || []).map((screen) => screen.name).join(', ');
  const designSystem = (project.designSpec?.designSystem && typeof project.designSpec.designSystem === 'object')
    ? (project.designSpec.designSystem as Record<string, unknown>)
    : {};
  const designSystemName = typeof designSystem.systemName === 'string' ? designSystem.systemName : 'none';
  const themeMode = typeof designSystem.themeMode === 'string' ? designSystem.themeMode : 'unknown';
  return [
    `Project: ${project.designSpec?.name || project.projectId}`,
    `Screens: ${screenNames || 'none'}`,
    `Design system: ${designSystemName}`,
    `Theme mode: ${themeMode}`,
  ].join(' | ');
}

function getProjectMcpMeta(project: EazyUiProjectPayload): Record<string, unknown> {
  if (project.designSpec?.metadata && typeof project.designSpec.metadata === 'object') {
    return project.designSpec.metadata as Record<string, unknown>;
  }
  return {};
}

function requiresInitialDesignSystemAcceptance(project: EazyUiProjectPayload): boolean {
  const meta = getProjectMcpMeta(project);
  return meta.designSystemPendingAcceptance === true;
}

function ensureInitialDesignSystemAcceptedOrThrow(project: EazyUiProjectPayload): void {
  if (!requiresInitialDesignSystemAcceptance(project)) return;
  throw new Error('Initial design system is pending acceptance. Call design_system.accept_initial first.');
}

function ensureScreensFromUnknown(value: unknown): EazyUiHtmlScreen[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw, index) => {
    const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const normalizedName = normalizeScreenDisplayName(
      typeof source.name === 'string' && source.name.trim()
        ? source.name.trim()
        : `Generated Screen ${index + 1}`,
    );
    return {
      screenId: typeof source.screenId === 'string' && source.screenId.trim()
        ? source.screenId.trim()
        : randomUUID(),
      name: normalizedName,
      html: typeof source.html === 'string' ? sanitizeGeneratedHtml(source.html) : '',
      width: Number.isFinite(Number(source.width)) ? Number(source.width) : 402,
      height: Number.isFinite(Number(source.height)) ? Number(source.height) : 874,
      status: source.status === 'streaming' ? 'streaming' : 'complete',
    } satisfies EazyUiHtmlScreen;
  });
}

function mergeScreens(existing: EazyUiHtmlScreen[], incoming: EazyUiHtmlScreen[]): {
  screens: EazyUiHtmlScreen[];
  addedCount: number;
  skippedCount: number;
  addedNames: string[];
  skippedNames: string[];
} {
  const existingById = new Map(existing.map((screen) => [screen.screenId, screen]));
  const existingByCanonicalName = new Set(existing.map((screen) => canonicalizeScreenName(screen.name)));
  const merged = [...existing];
  const addedNames: string[] = [];
  const skippedNames: string[] = [];

  for (const screen of incoming) {
    const canonicalName = canonicalizeScreenName(screen.name);
    if (existingByCanonicalName.has(canonicalName)) {
      skippedNames.push(screen.name);
      continue;
    }
    if (existingById.has(screen.screenId)) {
      const newId = `${screen.screenId}-${randomUUID().slice(0, 8)}`.slice(0, 80);
      const nextScreen = { ...screen, screenId: newId, name: normalizeScreenDisplayName(screen.name) };
      merged.push(nextScreen);
      existingByCanonicalName.add(canonicalizeScreenName(nextScreen.name));
      addedNames.push(nextScreen.name);
      continue;
    }
    const nextScreen = { ...screen, name: normalizeScreenDisplayName(screen.name) };
    merged.push(nextScreen);
    existingByCanonicalName.add(canonicalizeScreenName(nextScreen.name));
    addedNames.push(nextScreen.name);
  }
  return {
    screens: merged,
    addedCount: addedNames.length,
    skippedCount: skippedNames.length,
    addedNames,
    skippedNames,
  };
}

function appendChatMessage(
  chatState: unknown,
  params: {
    role: 'user' | 'assistant' | 'system';
    content: string;
    status?: 'pending' | 'streaming' | 'complete' | 'error';
    meta?: Record<string, unknown>;
  },
): unknown {
  const content = params.content.trim();
  if (!content) return chatState;
  const rawMessages = (chatState && typeof chatState === 'object' && Array.isArray((chatState as { messages?: unknown }).messages))
    ? [...(((chatState as { messages?: unknown }).messages as Array<Record<string, unknown>>))]
    : [];
  rawMessages.push({
    id: randomUUID(),
    role: params.role,
    content: content.slice(0, 24_000),
    status: params.status || 'complete',
    timestamp: Date.now(),
    meta: params.meta || null,
  });
  return { messages: rawMessages.slice(-250) };
}

function appendUserMessage(
  chatState: unknown,
  content: string,
  meta?: Record<string, unknown>,
): unknown {
  return appendChatMessage(chatState, {
    role: 'user',
    content,
    status: 'complete',
    meta,
  });
}

function appendAssistantMessage(
  chatState: unknown,
  content: string,
  meta?: Record<string, unknown>,
  status: 'pending' | 'streaming' | 'complete' | 'error' = 'complete',
): unknown {
  return appendChatMessage(chatState, {
    role: 'assistant',
    content,
    status,
    meta,
  });
}

function buildAuxIdempotencyKey(base: string | undefined, suffix: string): string | undefined {
  const source = typeof base === 'string' ? base.trim() : '';
  if (!source) return undefined;
  const normalizedSuffix = suffix.trim().replace(/[^\w.-]/g, '_').slice(0, 28) || 'aux';
  const raw = `${source}-${normalizedSuffix}`;
  if (raw.length <= 180) return raw;
  return raw.slice(0, 180);
}

function toSafeFileName(value: string): string {
  const base = value.trim().toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return base || 'screen';
}

function buildExportFileEntries(
  screens: EazyUiHtmlScreen[],
  extension: 'html' | 'png',
): Array<{ screen: EazyUiHtmlScreen; path: string }> {
  const used = new Map<string, number>();
  return screens.map((screen) => {
    const base = toSafeFileName(screen.name || screen.screenId);
    const count = (used.get(base) || 0) + 1;
    used.set(base, count);
    const fileBase = count === 1 ? base : `${base}-${count}`;
    return {
      screen,
      path: `${fileBase}.${extension}`,
    };
  });
}

function canonicalizeScreenName(value: string): string {
  const normalized = normalizeScreenDisplayName(value).toLowerCase();
  const tokens = normalized
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      if (token.length <= 3) return token;
      if (!token.endsWith('s')) return token;
      if (token.endsWith('ss')) return token;
      return token.slice(0, -1);
    });
  return tokens.join(' ');
}

function normalizeScreenDisplayName(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function sanitizeGeneratedHtml(html: string): string {
  let normalized = html || '';
  if (!normalized) return normalized;

  // Fix malformed Tailwind theme keys like 'accent-fg:'.
  normalized = normalized.replace(/(['"])([A-Za-z0-9_-]+):\1(\s*:)/g, '$1$2$1$3');

  // Remove accidental trailing colon in class tokens (e.g. "text-accent-fg:").
  normalized = normalized.replace(/\b([a-z0-9-]+):(?=(?:\s|["']))/gi, '$1');

  return normalized;
}

function buildDesignSystemLockInstruction(designSystem: Record<string, unknown>): string {
  const systemName = coerceString(designSystem.systemName, 'Project Design System');
  const typography = (designSystem.typography && typeof designSystem.typography === 'object')
    ? (designSystem.typography as Record<string, unknown>)
    : {};
  const radius = (designSystem.radius && typeof designSystem.radius === 'object')
    ? (designSystem.radius as Record<string, unknown>)
    : {};
  const tokens = (designSystem.tokens && typeof designSystem.tokens === 'object')
    ? (designSystem.tokens as Record<string, unknown>)
    : {};

  const lockSummary = {
    systemName,
    themeMode: coerceOptionalString(designSystem.themeMode) || 'mixed',
    displayFont: coerceOptionalString(typography.displayFont) || null,
    bodyFont: coerceOptionalString(typography.bodyFont) || null,
    radius,
    tokens,
  };

  return [
    'STRICT CONSISTENCY REQUIREMENT:',
    `Use the existing accepted project design system "${systemName}" exactly.`,
    'Do not introduce new token names, new font families, or alternate component styles.',
    'Generate only missing screens for the requested intent; avoid regenerating existing screens with equivalent purpose.',
    `Design system lock: ${JSON.stringify(lockSummary).slice(0, 2200)}`,
  ].join(' ');
}

function deepMerge(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const baseChild = (out[key] && typeof out[key] === 'object' && !Array.isArray(out[key]))
        ? (out[key] as Record<string, unknown>)
        : {};
      out[key] = deepMerge(baseChild, value as Record<string, unknown>);
      continue;
    }
    out[key] = value;
  }
  return out;
}

function createInitialDesignSpec(params: {
  name: string;
  description: string;
  platform: 'mobile' | 'tablet' | 'desktop';
  stylePreset: 'modern' | 'minimal' | 'vibrant' | 'luxury' | 'playful';
}): Record<string, unknown> {
  return {
    id: randomUUID(),
    name: params.name,
    description: params.description,
    designSystem: {
      version: 1,
      systemName: `${params.name} Design System`,
      intentSummary: params.description || `${params.stylePreset} ${params.platform} project.`,
      stylePreset: params.stylePreset,
      platform: params.platform,
      themeMode: 'mixed',
      tokens: {
        bg: '#F8FAFC',
        surface: '#FFFFFF',
        surface2: '#F1F5F9',
        text: '#0F172A',
        muted: '#64748B',
        stroke: '#E2E8F0',
        accent: '#4F46E5',
        accent2: '#F97316',
      },
    },
    screens: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {
      platform: params.platform,
      stylePreset: params.stylePreset,
    },
  };
}

function deriveProjectNameFromPrompt(prompt: string): string {
  const clean = prompt.replace(/\s+/g, ' ').trim();
  if (!clean) return 'New Project';
  const truncated = clean.length <= 44 ? clean : clean.slice(0, 44);
  return truncated
    .replace(/^[^a-zA-Z0-9]+/, '')
    .replace(/[.?!,:;]+$/g, '')
    .replace(/\b(create|build|make|design)\b/gi, '')
    .trim()
    .replace(/\s{2,}/g, ' ')
    || 'New Project';
}

function resolvePreferredModel(
  modelProfile: ModelProfile,
  purpose: 'planner' | 'designer',
): string | undefined {
  if (modelProfile === 'balanced') return undefined;
  if (purpose === 'planner') {
    return modelProfile === 'fast' ? 'llama-3.1-8b-instant' : 'llama-3.3-70b-versatile';
  }
  return modelProfile === 'fast' ? 'llama-3.1-8b-instant' : 'gemini-3-pro-preview';
}

function coerceString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function coerceOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function normalizePlatform(value: unknown): 'mobile' | 'tablet' | 'desktop' {
  const normalized = coerceString(value, 'mobile').trim().toLowerCase();
  if (!normalized) return 'mobile';
  if (['mobile', 'phone', 'smartphone', 'ios', 'android'].includes(normalized)) return 'mobile';
  if (['tablet', 'ipad', 'tab'].includes(normalized)) return 'tablet';
  if (['desktop', 'web', 'browser', 'laptop', 'pc'].includes(normalized)) return 'desktop';
  return 'mobile';
}

function normalizeStylePreset(value: unknown): 'modern' | 'minimal' | 'vibrant' | 'luxury' | 'playful' {
  const normalized = coerceString(value, 'modern').trim().toLowerCase();
  if (!normalized) return 'modern';
  if (['modern', 'contemporary', 'default'].includes(normalized)) return 'modern';
  if (['minimal', 'minimalist', 'clean', 'simple'].includes(normalized)) return 'minimal';
  if (['vibrant', 'bold', 'colorful', 'colourful', 'energetic'].includes(normalized)) return 'vibrant';
  if (['luxury', 'premium', 'elegant', 'refined', 'professional'].includes(normalized)) return 'luxury';
  if (['playful', 'fun', 'friendly', 'warm', 'cozy', 'nostalgic', 'skeuomorphic', 'paper', 'ink'].includes(normalized)) return 'playful';
  return 'modern';
}
