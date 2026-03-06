import { z } from 'zod';

export const ProjectIdSchema = z.string().min(1);
export const ModelProfileSchema = z.enum(['fast', 'balanced', 'quality']);

export const ProjectGetContextInputSchema = z.object({
  projectId: ProjectIdSchema,
  includeHtml: z.boolean().optional().default(false),
  htmlLimit: z.number().int().min(100).max(30000).optional().default(3000),
});

export const ProjectCreateInputSchema = z.object({
  name: z.string().min(1),
  platform: z.string().optional().default('mobile'),
  stylePreset: z.string().optional().default('modern'),
  description: z.string().optional(),
  idempotencyKey: z.string().min(8).max(180).optional(),
});

export const ProjectCreateFromPromptInputSchema = z.object({
  prompt: z.string().min(1),
  name: z.string().min(1).optional(),
  platform: z.string().optional().default('mobile'),
  stylePreset: z.string().optional().default('modern'),
  modelProfile: ModelProfileSchema.optional().default('balanced'),
  temperature: z.number().min(0).max(2).optional(),
  idempotencyKey: z.string().min(8).max(180).optional(),
});

export const DesignSystemAcceptInitialInputSchema = z.object({
  projectId: ProjectIdSchema,
  modelProfile: ModelProfileSchema.optional().default('balanced'),
  temperature: z.number().min(0).max(2).optional(),
  idempotencyKey: z.string().min(8).max(180).optional(),
  expectedUpdatedAt: z.string().optional(),
});

export const PlannerRouteInputSchema = z.object({
  projectId: ProjectIdSchema,
  prompt: z.string().min(1),
  platform: z.string().optional(),
  stylePreset: z.string().optional(),
  modelProfile: ModelProfileSchema.optional().default('balanced'),
  temperature: z.number().min(0).max(2).optional(),
  referenceScreenIds: z.array(z.string()).optional(),
});

export const ScreenGenerateInputSchema = z.object({
  projectId: ProjectIdSchema.optional(),
  prompt: z.string().min(1),
  platform: z.string().optional(),
  stylePreset: z.string().optional(),
  modelProfile: ModelProfileSchema.optional().default('balanced'),
  targetScreenNames: z.array(z.string().min(1)).optional(),
  temperature: z.number().min(0).max(2).optional(),
  expectedUpdatedAt: z.string().optional(),
  idempotencyKey: z.string().min(8).max(180).optional(),
});

export const ScreenEditInputSchema = z.object({
  projectId: ProjectIdSchema,
  screenId: z.string().min(1),
  instruction: z.string().min(1),
  html: z.string().min(1).optional(),
  modelProfile: ModelProfileSchema.optional().default('balanced'),
  temperature: z.number().min(0).max(2).optional(),
  expectedUpdatedAt: z.string().optional(),
  idempotencyKey: z.string().min(8).max(180).optional(),
});

export const ScreenMultiEditInputSchema = z.object({
  projectId: ProjectIdSchema,
  screenIds: z.array(z.string().min(1)).min(1),
  instruction: z.string().min(1),
  modelProfile: ModelProfileSchema.optional().default('balanced'),
  temperature: z.number().min(0).max(2).optional(),
  expectedUpdatedAt: z.string().optional(),
  idempotencyKey: z.string().min(8).max(180).optional(),
});

export const DesignSystemUpdateInputSchema = z.object({
  projectId: ProjectIdSchema,
  prompt: z.string().min(1).optional(),
  patch: z.record(z.any()).optional(),
  applyToExistingScreens: z.boolean().optional().default(true),
  modelProfile: ModelProfileSchema.optional().default('balanced'),
  temperature: z.number().min(0).max(2).optional(),
  expectedUpdatedAt: z.string().optional(),
  idempotencyKey: z.string().min(8).max(180).optional(),
});

export const ProjectSaveInputSchema = z.object({
  projectId: ProjectIdSchema,
  reason: z.string().optional(),
  designSpec: z.record(z.any()).optional(),
  canvasDoc: z.any().optional(),
  chatState: z.any().optional(),
  expectedUpdatedAt: z.string().optional(),
  idempotencyKey: z.string().min(8).max(180).optional(),
});

export const ProjectExportInputSchema = z.object({
  projectId: ProjectIdSchema,
  format: z.enum(['png', 'zip', 'html']),
  screenIds: z.array(z.string()).optional(),
});

export const ResourceReadInputSchema = z.object({
  uri: z.string().min(1),
});

export const ToolCallInputSchema = z.object({
  name: z.string().min(1),
  arguments: z.record(z.any()).optional().default({}),
});
