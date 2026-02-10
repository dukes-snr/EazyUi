// ============================================================================
// Hit Testing - Determine which node was clicked
// ============================================================================

import type { BoundsMap, ComputedBounds } from '../layout/yoga-engine';
import type { ComponentNode } from '@eazyui/shared';

/**
 * Hit test a point against the bounds map
 * Returns the nodeId of the topmost (deepest in tree) node at the point
 */
export function hitTest(
    point: { x: number; y: number },
    boundsMap: BoundsMap,
    rootNode: ComponentNode
): string | null {
    // Walk tree in reverse order (children first) to find topmost element
    return hitTestNode(point, boundsMap, rootNode);
}

function hitTestNode(
    point: { x: number; y: number },
    boundsMap: BoundsMap,
    node: ComponentNode
): string | null {
    // Check children first (they're on top)
    for (let i = node.children.length - 1; i >= 0; i--) {
        const childHit = hitTestNode(point, boundsMap, node.children[i]);
        if (childHit) return childHit;
    }

    // Check this node
    const bounds = boundsMap.get(node.nodeId);
    if (bounds && isPointInBounds(point, bounds)) {
        return node.nodeId;
    }

    return null;
}

function isPointInBounds(point: { x: number; y: number }, bounds: ComputedBounds): boolean {
    return (
        point.x >= bounds.x &&
        point.x <= bounds.x + bounds.width &&
        point.y >= bounds.y &&
        point.y <= bounds.y + bounds.height
    );
}

/**
 * Find all nodes at a point (for debugging or multi-select)
 */
export function hitTestAll(
    point: { x: number; y: number },
    boundsMap: BoundsMap,
    rootNode: ComponentNode
): string[] {
    const hits: string[] = [];
    collectHits(point, boundsMap, rootNode, hits);
    return hits;
}

function collectHits(
    point: { x: number; y: number },
    boundsMap: BoundsMap,
    node: ComponentNode,
    hits: string[]
): void {
    const bounds = boundsMap.get(node.nodeId);
    if (bounds && isPointInBounds(point, bounds)) {
        hits.push(node.nodeId);
    }

    for (const child of node.children) {
        collectHits(point, boundsMap, child, hits);
    }
}

/**
 * Get the breadcrumb path from root to a specific node
 */
export function getNodeBreadcrumb(
    nodeId: string,
    rootNode: ComponentNode
): ComponentNode[] {
    const path: ComponentNode[] = [];
    findNodePath(nodeId, rootNode, path);
    return path;
}

function findNodePath(
    nodeId: string,
    node: ComponentNode,
    path: ComponentNode[]
): boolean {
    path.push(node);

    if (node.nodeId === nodeId) {
        return true;
    }

    for (const child of node.children) {
        if (findNodePath(nodeId, child, path)) {
            return true;
        }
    }

    path.pop();
    return false;
}

/**
 * Check if a point is within a board's area
 */
export function isPointInBoard(
    point: { x: number; y: number },
    board: { x: number; y: number; width: number; height: number }
): boolean {
    return isPointInBounds(point, board);
}

/**
 * Find which board contains a point
 */
export function findBoardAtPoint(
    point: { x: number; y: number },
    boards: Array<{ boardId: string; x: number; y: number; width: number; height: number }>
): string | null {
    // Check in reverse order (topmost first - last rendered)
    for (let i = boards.length - 1; i >= 0; i--) {
        if (isPointInBoard(point, boards[i])) {
            return boards[i].boardId;
        }
    }
    return null;
}
