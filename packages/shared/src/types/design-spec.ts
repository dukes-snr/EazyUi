// ============================================================================
// Design Spec - The model-controlled source of truth
// ============================================================================

import { z } from 'zod';
import { DesignTokensSchema } from './tokens';
import { ComponentTypeSchema, LayoutRulesSchema, StyleRefSchema } from './components';

// Component Node Schema (recursive) - using interface for proper recursive typing
export interface ComponentNode {
    nodeId: string;
    type: z.infer<typeof ComponentTypeSchema>;
    props: Record<string, unknown>;
    style?: z.infer<typeof StyleRefSchema>;
    layout?: z.infer<typeof LayoutRulesSchema>;
    children: ComponentNode[];
}

// Create the recursive schema without type annotation to avoid circular reference issues
const BaseComponentNodeSchema = z.object({
    nodeId: z.string().describe('Stable unique identifier for this node'),
    type: ComponentTypeSchema,
    props: z.record(z.any()).describe('Type-specific props'),
    style: StyleRefSchema.optional(),
    layout: LayoutRulesSchema.optional(),
});

export const ComponentNodeSchema: z.ZodType<ComponentNode> = BaseComponentNodeSchema.extend({
    children: z.lazy(() => z.array(ComponentNodeSchema)).default([]),
}) as z.ZodType<ComponentNode>;

// Screen Schema
export const ScreenSchema = z.object({
    screenId: z.string().describe('Unique screen identifier'),
    name: z.string().describe('Human-readable screen name'),
    width: z.number().default(375).describe('Screen width in pixels'),
    height: z.number().default(812).describe('Screen height in pixels'),
    root: ComponentNodeSchema.describe('Root component node'),
});

export type Screen = z.infer<typeof ScreenSchema>;

// Interaction Schema (navigation between screens)
export const InteractionSchema = z.object({
    interactionId: z.string(),
    trigger: z.object({
        nodeId: z.string().describe('Node that triggers the interaction'),
        event: z.enum(['click', 'hover', 'focus']),
    }),
    action: z.object({
        type: z.enum(['navigate', 'toggle', 'show', 'hide']),
        targetScreenId: z.string().optional(),
        targetNodeId: z.string().optional(),
    }),
});

export type Interaction = z.infer<typeof InteractionSchema>;

// Complete Design Spec Schema
export const DesignSpecSchema = z.object({
    id: z.string().describe('Unique project identifier'),
    name: z.string().describe('Project name'),
    version: z.number().default(1).describe('Schema version'),
    createdAt: z.string().datetime().optional(),
    updatedAt: z.string().datetime().optional(),
    tokens: DesignTokensSchema.describe('Design tokens (colors, typography, spacing, etc.)'),
    screens: z.array(ScreenSchema).describe('Array of screens/artboards'),
    interactions: z.array(InteractionSchema).optional().describe('Screen navigation interactions'),
});

export type DesignSpec = z.infer<typeof DesignSpecSchema>;

// Validation limits
export const SPEC_LIMITS = {
    MAX_SCREENS: 20,
    MAX_NODES_PER_SCREEN: 100,
    MAX_NESTING_DEPTH: 10,
    MAX_TEXT_LENGTH: 1000,
    MAX_CHILDREN_PER_NODE: 50,
};

// Validate a design spec with limits
export function validateDesignSpec(spec: unknown): { success: true; data: DesignSpec } | { success: false; error: z.ZodError } {
    const result = DesignSpecSchema.safeParse(spec);
    if (!result.success) {
        return { success: false, error: result.error };
    }

    // Additional limit checks
    const data = result.data;

    if (data.screens.length > SPEC_LIMITS.MAX_SCREENS) {
        return {
            success: false,
            error: new z.ZodError([{
                code: 'custom',
                path: ['screens'],
                message: `Too many screens. Maximum is ${SPEC_LIMITS.MAX_SCREENS}`,
            }]),
        };
    }

    return { success: true, data };
}

// Helper to count nodes in a tree
export function countNodes(node: ComponentNode): number {
    return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
}

// Helper to get max depth of a tree
export function getMaxDepth(node: ComponentNode, currentDepth = 1): number {
    if (node.children.length === 0) return currentDepth;
    return Math.max(...node.children.map(child => getMaxDepth(child, currentDepth + 1)));
}

// Find a node by ID in the spec
export function findNodeById(spec: DesignSpec, nodeId: string): { screen: Screen; node: ComponentNode; path: string[] } | null {
    for (const screen of spec.screens) {
        const result = findNodeInTree(screen.root, nodeId, [screen.screenId]);
        if (result) {
            return { screen, ...result };
        }
    }
    return null;
}

function findNodeInTree(node: ComponentNode, nodeId: string, path: string[]): { node: ComponentNode; path: string[] } | null {
    if (node.nodeId === nodeId) {
        return { node, path: [...path, nodeId] };
    }
    for (const child of node.children) {
        const result = findNodeInTree(child, nodeId, [...path, node.nodeId]);
        if (result) return result;
    }
    return null;
}

// Find parent of a node
export function findParentNode(spec: DesignSpec, nodeId: string): { screen: Screen; parent: ComponentNode; childIndex: number } | null {
    for (const screen of spec.screens) {
        const result = findParentInTree(screen.root, nodeId);
        if (result) {
            return { screen, ...result };
        }
    }
    return null;
}

function findParentInTree(node: ComponentNode, nodeId: string): { parent: ComponentNode; childIndex: number } | null {
    for (let i = 0; i < node.children.length; i++) {
        if (node.children[i].nodeId === nodeId) {
            return { parent: node, childIndex: i };
        }
        const result = findParentInTree(node.children[i], nodeId);
        if (result) return result;
    }
    return null;
}
