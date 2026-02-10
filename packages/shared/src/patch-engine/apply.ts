// ============================================================================
// Patch Apply - Immutably applies patches to a DesignSpec
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import type {
    DesignSpec,
    ComponentNode,
    Screen
} from '../types/design-spec';
import type {
    Patch,
    AddPatch,
    RemovePatch,
    UpdatePatch,
    MovePatch,
    ReparentPatch,
    ReorderPatch,
    UpdateTokensPatch,
    UpdateScreenPatch,
    PatchWithInverse
} from '../types/patch';

/**
 * Apply a single patch to a DesignSpec, returning a new spec and the inverse patch
 */
export function applyPatch(spec: DesignSpec, patch: Patch): { spec: DesignSpec; inverse: Patch } {
    switch (patch.op) {
        case 'add':
            return applyAddPatch(spec, patch as AddPatch);
        case 'remove':
            return applyRemovePatch(spec, patch as RemovePatch);
        case 'update':
            return applyUpdatePatch(spec, patch as UpdatePatch);
        case 'move':
            return applyMovePatch(spec, patch as MovePatch);
        case 'reparent':
            return applyReparentPatch(spec, patch as ReparentPatch);
        case 'reorder':
            return applyReorderPatch(spec, patch as ReorderPatch);
        case 'updateTokens':
            return applyUpdateTokensPatch(spec, patch as UpdateTokensPatch);
        case 'updateScreen':
            return applyUpdateScreenPatch(spec, patch as UpdateScreenPatch);
        default:
            throw new Error(`Unknown patch operation: ${(patch as Patch).op}`);
    }
}

/**
 * Apply multiple patches in sequence
 */
export function applyPatches(spec: DesignSpec, patches: Patch[]): { spec: DesignSpec; inverses: Patch[] } {
    let currentSpec = spec;
    const inverses: Patch[] = [];

    for (const patch of patches) {
        const result = applyPatch(currentSpec, patch);
        currentSpec = result.spec;
        inverses.unshift(result.inverse); // Reverse order for undo
    }

    return { spec: currentSpec, inverses };
}

// ============================================================================
// Individual Patch Implementations
// ============================================================================

function applyAddPatch(spec: DesignSpec, patch: AddPatch): { spec: DesignSpec; inverse: Patch } {
    const newNode = patch.node as ComponentNode;

    // Ensure node has an ID
    if (!newNode.nodeId) {
        newNode.nodeId = uuidv4();
    }

    // Find target (could be a screen root or a node)
    const targetScreen = spec.screens.find(s => s.screenId === patch.target);

    if (targetScreen) {
        // Adding to screen root's children
        const newChildren = [...targetScreen.root.children];
        const index = patch.index ?? newChildren.length;
        newChildren.splice(index, 0, newNode);

        return {
            spec: {
                ...spec,
                screens: spec.screens.map(s =>
                    s.screenId === patch.target
                        ? { ...s, root: { ...s.root, children: newChildren } }
                        : s
                ),
            },
            inverse: { op: 'remove', target: newNode.nodeId },
        };
    }

    // Find node target
    const newSpec = deepCloneSpec(spec);
    const parentNode = findNodeInSpec(newSpec, patch.target);

    if (!parentNode) {
        throw new Error(`Add patch target not found: ${patch.target}`);
    }

    const index = patch.index ?? parentNode.children.length;
    parentNode.children.splice(index, 0, newNode);

    return {
        spec: newSpec,
        inverse: { op: 'remove', target: newNode.nodeId },
    };
}

function applyRemovePatch(spec: DesignSpec, patch: RemovePatch): { spec: DesignSpec; inverse: Patch } {
    const newSpec = deepCloneSpec(spec);

    for (const screen of newSpec.screens) {
        const result = removeNodeFromTree(screen.root, patch.target);
        if (result.removed) {
            return {
                spec: newSpec,
                inverse: {
                    op: 'add',
                    target: result.parentId,
                    index: result.index,
                    node: result.removed,
                },
            };
        }
    }

    throw new Error(`Remove patch target not found: ${patch.target}`);
}

function applyUpdatePatch(spec: DesignSpec, patch: UpdatePatch): { spec: DesignSpec; inverse: Patch } {
    const newSpec = deepCloneSpec(spec);
    const node = findNodeInSpec(newSpec, patch.target);

    if (!node) {
        throw new Error(`Update patch target not found: ${patch.target}`);
    }

    const oldValue = getNestedValue(node, patch.path);
    setNestedValue(node, patch.path, patch.value);

    return {
        spec: newSpec,
        inverse: { op: 'update', target: patch.target, path: patch.path, value: oldValue },
    };
}

function applyMovePatch(spec: DesignSpec, patch: MovePatch): { spec: DesignSpec; inverse: Patch } {
    const newSpec = deepCloneSpec(spec);

    for (const screen of newSpec.screens) {
        const parent = findParentOfNode(screen.root, patch.target);
        if (parent) {
            const currentIndex = parent.children.findIndex(c => c.nodeId === patch.target);
            if (currentIndex === -1) continue;

            const [node] = parent.children.splice(currentIndex, 1);
            const insertIndex = patch.toIndex > currentIndex ? patch.toIndex - 1 : patch.toIndex;
            parent.children.splice(insertIndex, 0, node);

            return {
                spec: newSpec,
                inverse: { op: 'move', target: patch.target, toIndex: currentIndex },
            };
        }
    }

    throw new Error(`Move patch target not found: ${patch.target}`);
}

function applyReparentPatch(spec: DesignSpec, patch: ReparentPatch): { spec: DesignSpec; inverse: Patch } {
    const newSpec = deepCloneSpec(spec);

    // First, find and remove the node from its current parent
    let removedNode: ComponentNode | null = null;
    let oldParentId: string = '';
    let oldIndex: number = 0;

    for (const screen of newSpec.screens) {
        const result = removeNodeFromTree(screen.root, patch.target);
        if (result.removed) {
            removedNode = result.removed;
            oldParentId = result.parentId;
            oldIndex = result.index;
            break;
        }
    }

    if (!removedNode) {
        throw new Error(`Reparent patch target not found: ${patch.target}`);
    }

    // Then, add to new parent
    const newParent = findNodeInSpec(newSpec, patch.newParent);
    if (!newParent) {
        throw new Error(`Reparent new parent not found: ${patch.newParent}`);
    }

    const insertIndex = patch.index ?? newParent.children.length;
    newParent.children.splice(insertIndex, 0, removedNode);

    return {
        spec: newSpec,
        inverse: { op: 'reparent', target: patch.target, newParent: oldParentId, index: oldIndex },
    };
}

function applyReorderPatch(spec: DesignSpec, patch: ReorderPatch): { spec: DesignSpec; inverse: Patch } {
    const newSpec = deepCloneSpec(spec);
    const parent = findNodeInSpec(newSpec, patch.target);

    if (!parent) {
        throw new Error(`Reorder patch target not found: ${patch.target}`);
    }

    const oldOrder = parent.children.map(c => c.nodeId);
    const childMap = new Map(parent.children.map(c => [c.nodeId, c]));

    parent.children = patch.order
        .map(id => childMap.get(id))
        .filter((c): c is ComponentNode => c !== undefined);

    return {
        spec: newSpec,
        inverse: { op: 'reorder', target: patch.target, order: oldOrder },
    };
}

function applyUpdateTokensPatch(spec: DesignSpec, patch: UpdateTokensPatch): { spec: DesignSpec; inverse: Patch } {
    const newSpec = deepCloneSpec(spec);
    const oldValue = getNestedValue(newSpec.tokens, patch.path);
    setNestedValue(newSpec.tokens, patch.path, patch.value);

    return {
        spec: newSpec,
        inverse: { op: 'updateTokens', path: patch.path, value: oldValue },
    };
}

function applyUpdateScreenPatch(spec: DesignSpec, patch: UpdateScreenPatch): { spec: DesignSpec; inverse: Patch } {
    const newSpec = deepCloneSpec(spec);
    const screen = newSpec.screens.find(s => s.screenId === patch.target);

    if (!screen) {
        throw new Error(`UpdateScreen patch target not found: ${patch.target}`);
    }

    const oldValue = getNestedValue(screen, patch.path);
    setNestedValue(screen, patch.path, patch.value);

    return {
        spec: newSpec,
        inverse: { op: 'updateScreen', target: patch.target, path: patch.path, value: oldValue },
    };
}

// ============================================================================
// Helper Functions
// ============================================================================

function deepCloneSpec(spec: DesignSpec): DesignSpec {
    return JSON.parse(JSON.stringify(spec));
}

function findNodeInSpec(spec: DesignSpec, nodeId: string): ComponentNode | null {
    for (const screen of spec.screens) {
        const node = findNodeInTree(screen.root, nodeId);
        if (node) return node;
    }
    return null;
}

function findNodeInTree(node: ComponentNode, nodeId: string): ComponentNode | null {
    if (node.nodeId === nodeId) return node;
    for (const child of node.children) {
        const found = findNodeInTree(child, nodeId);
        if (found) return found;
    }
    return null;
}

function findParentOfNode(node: ComponentNode, nodeId: string): ComponentNode | null {
    for (const child of node.children) {
        if (child.nodeId === nodeId) return node;
        const found = findParentOfNode(child, nodeId);
        if (found) return found;
    }
    return null;
}

function removeNodeFromTree(
    node: ComponentNode,
    nodeId: string,
    parentId: string = ''
): { removed: ComponentNode; parentId: string; index: number } | { removed: null } {
    for (let i = 0; i < node.children.length; i++) {
        if (node.children[i].nodeId === nodeId) {
            const [removed] = node.children.splice(i, 1);
            return { removed, parentId: node.nodeId, index: i };
        }
        const result = removeNodeFromTree(node.children[i], nodeId, node.nodeId);
        if (result.removed) return result;
    }
    return { removed: null };
}

function getNestedValue(obj: unknown, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
        if (current === null || current === undefined) return undefined;
        current = (current as Record<string, unknown>)[part];
    }
    return current;
}

function setNestedValue(obj: unknown, path: string, value: unknown): void {
    const parts = path.split('.');
    let current = obj as Record<string, unknown>;
    for (let i = 0; i < parts.length - 1; i++) {
        if (current[parts[i]] === undefined) {
            current[parts[i]] = {};
        }
        current = current[parts[i]] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = value;
}
