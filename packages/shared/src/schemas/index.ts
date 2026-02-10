// ============================================================================
// JSON Schema Export - For Gemini structured output
// ============================================================================

import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';
import {
    LayoutRulesSchema,
    StyleRefSchema,
    DesignTokensSchema,
    InteractionSchema
} from '../types/index';

// Simplified component types for the model
// Essential component types for the model (reduced to avoid state explosion)
export const ALLOWED_COMPONENT_TYPES = [
    'Screen', 'Row', 'Column', 'Stack', 'Card', 'Section', 'Divider',
    'Text', 'Icon', 'Image', 'Button', 'Input', 'TextArea', 'Select',
    'Checkbox', 'Switch', 'Table', 'List', 'ListItem', 'Badge', 'Avatar',
    'NavBar', 'SideBar', 'Tabs', 'TabItem'
] as const;

// ----------------------------------------------------------------------------
// Simplified Design Spec Schema (No recursion, no $ref)
// ----------------------------------------------------------------------------

// Key-Value Pair Schema for dynamic props (avoids empty object issues)
// Using string for value to ensure consistent schema; transformation will handle parsing.
const KeyValueSchema = z.object({
    key: z.string(),
    value: z.string().describe('Value as a string. Numbers and booleans should be represented as strings.')
});

// Simplified schemas for Gemini to avoid "too many states" error
const GenAIStyleSchema = z.object({
    backgroundColor: z.string().optional().describe('Token (tokens.colors.*), Hex, or rgba. e.g. "tokens.colors.background"'),
    color: z.string().optional().describe('Token (tokens.colors.*) or Hex. e.g. "tokens.colors.text"'),
    borderColor: z.string().optional().describe('Token (tokens.colors.*) or Hex'),
    borderWidth: z.number().optional(),
    borderRadius: z.string().optional().describe('Number (as string) or Token (tokens.radius.*).'),
    typography: z.string().optional().describe('Token (tokens.typography.*). e.g. "tokens.typography.h1"'),
    opacity: z.number().optional(),
    shadow: z.string().optional().describe('Token (tokens.shadows.*). e.g. "tokens.shadows.medium"'),
}).describe('Simplified style properties. ALWAYS use tokens for colors and typography when possible.');

const GenAILayoutSchema = z.object({
    flexDirection: z.enum(['row', 'column', 'row-reverse', 'column-reverse']).optional(),
    justifyContent: z.enum(['flex-start', 'center', 'flex-end', 'space-between', 'space-around']).optional(),
    alignItems: z.enum(['flex-start', 'center', 'flex-end', 'stretch', 'baseline']).optional(),
    alignSelf: z.enum(['auto', 'flex-start', 'flex-end', 'center', 'baseline', 'stretch']).optional(),
    gap: z.string().optional().describe('Number (as string) or Token (tokens.spacing.*). REQUIRED between children in Row/Column.'),
    padding: z.string().optional().describe('Number (as string) or Token (tokens.spacing.*). REQUIRED for Screen and Card containers.'),
    margin: z.string().optional().describe('Number (as string) or Token (tokens.spacing.*)'),
    width: z.string().optional().describe('Number (px as string) or "100%", "auto" etc.'),
    height: z.string().optional().describe('Number (px as string) or "100%", "auto" etc.'),
    maxWidth: z.string().optional().describe('Limit width for better readability on desktop.'),
    position: z.enum(['relative', 'absolute']).optional(),
    zIndex: z.number().optional(),
}).describe('Simplified layout properties. ALWAYS use spacing tokens (tokens.spacing.*) for padding, margin, and gap.');

// Fixed-depth recursion for Gemini (5 levels)
const L5_Leaf = z.object({
    nodeId: z.string(),
    type: z.enum(ALLOWED_COMPONENT_TYPES),
    props: z.array(KeyValueSchema).describe('Props as key-value pairs'),
    style: GenAIStyleSchema.optional(),
    layout: GenAILayoutSchema.optional(),
});

const L4_Node = z.object({
    nodeId: z.string(),
    type: z.enum(ALLOWED_COMPONENT_TYPES),
    props: z.array(KeyValueSchema).describe('Props as key-value pairs'),
    style: GenAIStyleSchema.optional(),
    layout: GenAILayoutSchema.optional(),
    children: z.array(L5_Leaf).describe('Child components (leaf level) - use for atoms like Text, Image, Button'),
});

const L3_Node = z.object({
    nodeId: z.string(),
    type: z.enum(ALLOWED_COMPONENT_TYPES),
    props: z.array(KeyValueSchema).describe('Props as key-value pairs'),
    style: GenAIStyleSchema.optional(),
    layout: GenAILayoutSchema.optional(),
    children: z.array(L4_Node).describe('Child components'),
});

const L2_Node = z.object({
    nodeId: z.string(),
    type: z.enum(ALLOWED_COMPONENT_TYPES),
    props: z.array(KeyValueSchema).describe('Props as key-value pairs'),
    style: GenAIStyleSchema.optional(),
    layout: GenAILayoutSchema.optional(),
    children: z.array(L3_Node).describe('Child components'),
});

const GenAIComponentSchema = z.object({
    nodeId: z.string(),
    type: z.enum(ALLOWED_COMPONENT_TYPES),
    props: z.array(KeyValueSchema).describe('Props as key-value pairs'),
    style: GenAIStyleSchema.optional(),
    layout: GenAILayoutSchema.optional(),
    children: z.array(L2_Node).describe('Child components - MUST generate deeply nested structures for complex items'),
});

const GenAIScreenSchema = z.object({
    screenId: z.string(),
    name: z.string(),
    width: z.number(),
    height: z.number(),
    root: GenAIComponentSchema
});

const GenAIDesignSpecSchema = z.object({
    screens: z.array(GenAIScreenSchema),
});

const rawDesignSpecSchema = zodToJsonSchema(GenAIDesignSpecSchema, {
    target: 'openApi3',
    $refStrategy: 'none',
});

// Helper to clean schema for Gemini (removes unsupported additionalProperties)
function cleanSchema(schema: any): any {
    if (typeof schema !== 'object' || schema === null) return schema;

    if (Array.isArray(schema)) {
        return schema.map(cleanSchema);
    }

    const newSchema = { ...schema };
    // Gemini does not support 'additionalProperties' in response schema
    if ('additionalProperties' in newSchema) {
        delete newSchema.additionalProperties;
    }

    for (const key in newSchema) {
        newSchema[key] = cleanSchema(newSchema[key]);
    }

    return newSchema;
}

export const designSpecJsonSchema = cleanSchema(rawDesignSpecSchema);

// ----------------------------------------------------------------------------
// Simplified Patch Schema
// ----------------------------------------------------------------------------

const PatchOpSchema = z.enum([
    'add', 'remove', 'update', 'move',
    'reparent', 'reorder', 'updateTokens', 'updateScreen'
]);

const AddPatchSchema = z.object({
    op: z.literal('add'),
    target: z.string(),
    index: z.number().optional(),
    node: GenAIComponentSchema
});

const RemovePatchSchema = z.object({
    op: z.literal('remove'),
    target: z.string()
});

const UpdatePatchSchema = z.object({
    op: z.literal('update'),
    target: z.string(),
    path: z.string(),
    value: z.unknown()
});

const MovePatchSchema = z.object({
    op: z.literal('move'),
    target: z.string(),
    toIndex: z.number()
});

const ReparentPatchSchema = z.object({
    op: z.literal('reparent'),
    target: z.string(),
    newParent: z.string(),
    index: z.number().optional()
});

const ReorderPatchSchema = z.object({
    op: z.literal('reorder'),
    target: z.string(),
    order: z.array(z.string())
});

const UpdateTokensPatchSchema = z.object({
    op: z.literal('updateTokens'),
    path: z.string(),
    value: z.unknown()
});

const UpdateScreenPatchSchema = z.object({
    op: z.literal('updateScreen'),
    target: z.string(),
    path: z.string(),
    value: z.unknown()
});

// Explicit union for clear JSON schema generation
const GenAIPatchSchema = z.union([
    AddPatchSchema,
    RemovePatchSchema,
    UpdatePatchSchema,
    MovePatchSchema,
    ReparentPatchSchema,
    ReorderPatchSchema,
    UpdateTokensPatchSchema,
    UpdateScreenPatchSchema
]);

const rawPatchArraySchema = zodToJsonSchema(z.array(GenAIPatchSchema), {
    target: 'openApi3',
    $refStrategy: 'none',
});

export const patchArrayJsonSchema = cleanSchema(rawPatchArraySchema);

// Style presets export (kept for compatibility)
export type StylePreset = 'minimal' | 'modern' | 'futuristic' | 'playful' | 'corporate' | 'elegant';

export const STYLE_PRESET_TOKENS: Record<StylePreset, Partial<{ colors: Record<string, string> }>> = {
    minimal: { colors: { primary: '#18181B', secondary: '#71717A', background: '#FFFFFF', surface: '#F4F4F5' } },
    modern: { colors: { primary: '#6366F1', secondary: '#8B5CF6', background: '#0F172A', surface: '#1E293B' } },
    futuristic: { colors: { primary: '#00F5FF', secondary: '#FF00FF', background: '#0A0A0A', surface: '#1A1A2E' } },
    playful: { colors: { primary: '#F97316', secondary: '#F472B6', background: '#FFF7ED', surface: '#FFEDD5' } },
    corporate: { colors: { primary: '#2563EB', secondary: '#3B82F6', background: '#F8FAFC', surface: '#E2E8F0' } },
    elegant: { colors: { primary: '#7C3AED', secondary: '#A78BFA', background: '#1E1B4B', surface: '#312E81' } },
};

export type PlatformPreset = 'mobile' | 'tablet' | 'desktop' | 'responsive';

export const PLATFORM_DIMENSIONS: Record<PlatformPreset, { width: number; height: number }> = {
    mobile: { width: 375, height: 812 },
    tablet: { width: 768, height: 1024 },
    desktop: { width: 1440, height: 900 },
    responsive: { width: 1440, height: 900 },
};
