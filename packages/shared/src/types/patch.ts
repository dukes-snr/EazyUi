// ============================================================================
// Patch System - Operations for modifying the DesignSpec
// ============================================================================

import { z } from 'zod';

// Patch Operation Types
export const PatchOpSchema = z.enum([
    'add',      // Add a new node
    'remove',   // Remove a node
    'update',   // Update node properties
    'move',     // Move node to different position in parent's children
    'reparent', // Move node to a different parent
    'reorder',  // Reorder children array
    'updateTokens', // Update design tokens
    'updateScreen', // Update screen properties
]);

export type PatchOp = z.infer<typeof PatchOpSchema>;

// Add Patch - adds a new node
export const AddPatchSchema = z.object({
    op: z.literal('add'),
    target: z.string().describe('Parent nodeId or screenId'),
    index: z.number().optional().describe('Index to insert at, defaults to end'),
    node: z.record(z.any()).describe('The new node to add'),
});

export type AddPatch = z.infer<typeof AddPatchSchema>;

// Remove Patch - removes a node
export const RemovePatchSchema = z.object({
    op: z.literal('remove'),
    target: z.string().describe('nodeId to remove'),
});

export type RemovePatch = z.infer<typeof RemovePatchSchema>;

// Update Patch - updates node properties
export const UpdatePatchSchema = z.object({
    op: z.literal('update'),
    target: z.string().describe('nodeId to update'),
    path: z.string().describe('Dot-notation path to property (e.g., "props.content", "style.backgroundColor")'),
    value: z.unknown().describe('New value'),
});

export type UpdatePatch = z.infer<typeof UpdatePatchSchema>;

// Move Patch - moves node within same parent
export const MovePatchSchema = z.object({
    op: z.literal('move'),
    target: z.string().describe('nodeId to move'),
    toIndex: z.number().describe('New index in parent children'),
});

export type MovePatch = z.infer<typeof MovePatchSchema>;

// Reparent Patch - moves node to different parent
export const ReparentPatchSchema = z.object({
    op: z.literal('reparent'),
    target: z.string().describe('nodeId to reparent'),
    newParent: z.string().describe('New parent nodeId'),
    index: z.number().optional().describe('Index in new parent, defaults to end'),
});

export type ReparentPatch = z.infer<typeof ReparentPatchSchema>;

// Reorder Patch - reorders children of a node
export const ReorderPatchSchema = z.object({
    op: z.literal('reorder'),
    target: z.string().describe('Parent nodeId'),
    order: z.array(z.string()).describe('New order of child nodeIds'),
});

export type ReorderPatch = z.infer<typeof ReorderPatchSchema>;

// Update Tokens Patch
export const UpdateTokensPatchSchema = z.object({
    op: z.literal('updateTokens'),
    path: z.string().describe('Dot-notation path in tokens (e.g., "colors.primary")'),
    value: z.unknown().describe('New value'),
});

export type UpdateTokensPatch = z.infer<typeof UpdateTokensPatchSchema>;

// Update Screen Patch
export const UpdateScreenPatchSchema = z.object({
    op: z.literal('updateScreen'),
    target: z.string().describe('screenId'),
    path: z.string().describe('Property path (e.g., "name", "width")'),
    value: z.unknown().describe('New value'),
});

export type UpdateScreenPatch = z.infer<typeof UpdateScreenPatchSchema>;

// Union of all patch types
export const PatchSchema = z.union([
    AddPatchSchema,
    RemovePatchSchema,
    UpdatePatchSchema,
    MovePatchSchema,
    ReparentPatchSchema,
    ReorderPatchSchema,
    UpdateTokensPatchSchema,
    UpdateScreenPatchSchema,
]);

export type Patch = z.infer<typeof PatchSchema>;

// Patch with inverse (for undo)
export interface PatchWithInverse {
    patch: Patch;
    inverse: Patch;
}

// Patch Group - multiple patches applied together (atomic operation)
export const PatchGroupSchema = z.object({
    id: z.string(),
    patches: z.array(PatchSchema),
    description: z.string().optional(),
    timestamp: z.number(),
});

export type PatchGroup = z.infer<typeof PatchGroupSchema>;

// Validate patches array
export function validatePatches(patches: unknown[]): { success: true; data: Patch[] } | { success: false; errors: z.ZodError[] } {
    const results = patches.map(p => PatchSchema.safeParse(p));
    const errors = results.filter((r): r is { success: false; error: z.ZodError } => !r.success);

    if (errors.length > 0) {
        return { success: false, errors: errors.map(e => e.error) };
    }

    return { success: true, data: results.map(r => (r as { success: true; data: Patch }).data) };
}
