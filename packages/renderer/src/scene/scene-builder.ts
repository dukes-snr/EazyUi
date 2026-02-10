// ============================================================================
// Scene Builder - Builds complete Konva scene from a screen
// ============================================================================

import Konva from 'konva';
import type { Screen, DesignTokens, ComponentNode } from '@eazyui/shared';
import { computeLayout, type BoundsMap } from '../layout/yoga-engine';
import { renderNode, type RenderContext } from './node-renderers';

export interface SceneBuildResult {
    group: Konva.Group;
    boundsMap: BoundsMap;
}

/**
 * Build a complete Konva scene from a screen
 */
export function buildScene(
    screen: Screen,
    tokens: DesignTokens,
    selection: { selectedNodeIds: string[]; hoveredNodeId: string | null } = { selectedNodeIds: [], hoveredNodeId: null }
): SceneBuildResult {
    // Compute layout
    const boundsMap = computeLayout(screen, tokens);

    // Create root group
    const rootGroup = new Konva.Group({
        id: `screen-${screen.screenId}`,
    });

    // Add screen background
    const screenBg = new Konva.Rect({
        x: 0,
        y: 0,
        width: screen.width,
        height: screen.height,
        fill: tokens.colors.background,
        listening: true,
        id: `bg-${screen.screenId}`,
    });
    rootGroup.add(screenBg);

    // Recursively render all nodes
    renderNodeTree(screen.root, boundsMap, tokens, selection, rootGroup);

    return { group: rootGroup, boundsMap };
}

/**
 * Recursively render a node tree
 */
function renderNodeTree(
    node: ComponentNode,
    boundsMap: BoundsMap,
    tokens: DesignTokens,
    selection: { selectedNodeIds: string[]; hoveredNodeId: string | null },
    parentGroup: Konva.Group
): void {
    const bounds = boundsMap.get(node.nodeId);
    if (!bounds) return;

    const ctx: RenderContext = {
        tokens,
        bounds,
        isSelected: selection.selectedNodeIds.includes(node.nodeId),
        isHovered: selection.hoveredNodeId === node.nodeId,
    };

    // Render the node
    const nodeGroup = renderNode(node, ctx);
    parentGroup.add(nodeGroup);

    // Render children
    for (const child of node.children) {
        renderNodeTree(child, boundsMap, tokens, selection, parentGroup);
    }
}

/**
 * Update scene with new selection state (efficient update)
 */
export function updateSelectionOverlay(
    layer: Konva.Layer,
    boundsMap: BoundsMap,
    selectedNodeIds: string[],
    hoveredNodeId: string | null,
    boardOffset: { x: number; y: number }
): void {
    // Find or create selection overlay group
    let selectionGroup = layer.findOne('#selection-overlay') as Konva.Group;
    if (!selectionGroup) {
        selectionGroup = new Konva.Group({ id: 'selection-overlay' });
        layer.add(selectionGroup);
    }
    selectionGroup.destroyChildren();

    // Draw selection boxes for selected nodes
    for (const nodeId of selectedNodeIds) {
        const bounds = boundsMap.get(nodeId);
        if (!bounds) continue;

        // Selection outline
        const selectionRect = new Konva.Rect({
            x: boardOffset.x + bounds.x - 1,
            y: boardOffset.y + bounds.y - 1,
            width: bounds.width + 2,
            height: bounds.height + 2,
            stroke: '#6366F1',
            strokeWidth: 2,
            dash: [4, 4],
            listening: false,
        });
        selectionGroup.add(selectionRect);

        // Resize handles at corners
        const handleSize = 8;
        const handles = [
            { x: bounds.x - handleSize / 2, y: bounds.y - handleSize / 2 }, // top-left
            { x: bounds.x + bounds.width - handleSize / 2, y: bounds.y - handleSize / 2 }, // top-right
            { x: bounds.x - handleSize / 2, y: bounds.y + bounds.height - handleSize / 2 }, // bottom-left
            { x: bounds.x + bounds.width - handleSize / 2, y: bounds.y + bounds.height - handleSize / 2 }, // bottom-right
        ];

        for (const handle of handles) {
            const handleRect = new Konva.Rect({
                x: boardOffset.x + handle.x,
                y: boardOffset.y + handle.y,
                width: handleSize,
                height: handleSize,
                fill: '#FFFFFF',
                stroke: '#6366F1',
                strokeWidth: 2,
                listening: false,
            });
            selectionGroup.add(handleRect);
        }
    }

    // Draw hover box for hovered node (if not selected)
    if (hoveredNodeId && !selectedNodeIds.includes(hoveredNodeId)) {
        const bounds = boundsMap.get(hoveredNodeId);
        if (bounds) {
            const hoverRect = new Konva.Rect({
                x: boardOffset.x + bounds.x - 1,
                y: boardOffset.y + bounds.y - 1,
                width: bounds.width + 2,
                height: bounds.height + 2,
                stroke: '#6366F1',
                strokeWidth: 1,
                opacity: 0.5,
                listening: false,
            });
            selectionGroup.add(hoverRect);
        }
    }

    selectionGroup.moveToTop();
    layer.batchDraw();
}
