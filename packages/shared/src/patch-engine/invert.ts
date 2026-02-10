// ============================================================================
// Patch Invert - Creates inverse patches for undo operations
// ============================================================================

import type { Patch } from '../types/patch';

/**
 * Create an inverse patch that undoes the given patch.
 * Note: This is a simplified version. The actual inverse is computed
 * during applyPatch with access to the full spec state.
 */
export function invertPatch(patch: Patch): Patch | null {
    switch (patch.op) {
        case 'add':
            // Inverse of add is remove
            if ('node' in patch && typeof patch.node === 'object' && patch.node !== null) {
                const nodeId = (patch.node as { nodeId?: string }).nodeId;
                if (nodeId) {
                    return { op: 'remove', target: nodeId };
                }
            }
            return null;

        case 'remove':
            // Cannot create inverse without knowing the removed content
            // This is handled in applyPatch
            return null;

        case 'update':
            // Cannot create inverse without knowing the old value
            // This is handled in applyPatch
            return null;

        case 'move':
            // Cannot create inverse without knowing the old position
            return null;

        case 'reparent':
            // Cannot create inverse without knowing the old parent
            return null;

        case 'reorder':
            // Cannot create inverse without knowing the old order
            return null;

        case 'updateTokens':
            // Cannot create inverse without knowing the old value
            return null;

        case 'updateScreen':
            // Cannot create inverse without knowing the old value
            return null;

        default:
            return null;
    }
}

/**
 * Invert a series of patches (for undoing a batch operation)
 */
export function invertPatches(patches: Patch[]): Patch[] {
    return patches
        .map(invertPatch)
        .filter((p): p is Patch => p !== null)
        .reverse();
}
