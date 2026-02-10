// ============================================================================
// Yoga Layout Engine - Computes layout bounds from DesignSpec
// ============================================================================

import Yoga, { Node as YogaNode, Edge, Gutter, FlexDirection, Justify, Align, Wrap, PositionType } from 'yoga-layout';
import type { ComponentNode, Screen, DesignTokens, LayoutRules, StyleValue } from '@eazyui/shared';

// Computed bounds for each node
export interface ComputedBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

// Bounds map: nodeId -> computed bounds
export type BoundsMap = Map<string, ComputedBounds>;

/**
 * Resolve a style value to a number (handling token references)
 */
function resolveStyleValue(value: StyleValue | undefined, tokens: DesignTokens): number | undefined {
    if (value === undefined) return undefined;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        // Handle token references like "tokens.spacing.md"
        if (value.startsWith('tokens.')) {
            const path = value.substring(7).split('.');
            let current: unknown = tokens;
            for (const part of path) {
                if (current && typeof current === 'object') {
                    current = (current as Record<string, unknown>)[part];
                } else {
                    return undefined;
                }
            }
            return typeof current === 'number' ? current : undefined;
        }
        // Handle percentage or other string values
        if (value.endsWith('%')) {
            return undefined; // Let Yoga handle percentages
        }
        return parseFloat(value) || undefined;
    }
    return undefined;
}

/**
 * Map flex direction string to Yoga enum
 */
function mapFlexDirection(dir: string | undefined): FlexDirection {
    switch (dir) {
        case 'row': return FlexDirection.Row;
        case 'row-reverse': return FlexDirection.RowReverse;
        case 'column': return FlexDirection.Column;
        case 'column-reverse': return FlexDirection.ColumnReverse;
        default: return FlexDirection.Column;
    }
}

/**
 * Map justify content string to Yoga enum
 */
function mapJustifyContent(justify: string | undefined): Justify {
    switch (justify) {
        case 'flex-start': return Justify.FlexStart;
        case 'flex-end': return Justify.FlexEnd;
        case 'center': return Justify.Center;
        case 'space-between': return Justify.SpaceBetween;
        case 'space-around': return Justify.SpaceAround;
        case 'space-evenly': return Justify.SpaceEvenly;
        default: return Justify.FlexStart;
    }
}

/**
 * Map align items/self string to Yoga enum
 */
function mapAlign(align: string | undefined): Align {
    switch (align) {
        case 'flex-start': return Align.FlexStart;
        case 'flex-end': return Align.FlexEnd;
        case 'center': return Align.Center;
        case 'stretch': return Align.Stretch;
        case 'baseline': return Align.Baseline;
        default: return Align.Stretch;
    }
}

/**
 * Map flex wrap string to Yoga enum
 */
function mapFlexWrap(wrap: string | undefined): Wrap {
    switch (wrap) {
        case 'nowrap': return Wrap.NoWrap;
        case 'wrap': return Wrap.Wrap;
        case 'wrap-reverse': return Wrap.WrapReverse;
        default: return Wrap.NoWrap;
    }
}

/**
 * Apply layout rules to a Yoga node
 */
function applyLayoutRules(yogaNode: YogaNode, layout: LayoutRules | undefined, tokens: DesignTokens): void {
    if (!layout) return;

    // Flex properties
    if (layout.flex !== undefined) yogaNode.setFlex(layout.flex);
    if (layout.flexGrow !== undefined) yogaNode.setFlexGrow(layout.flexGrow);
    if (layout.flexShrink !== undefined) yogaNode.setFlexShrink(layout.flexShrink);
    if (layout.flexBasis !== undefined) {
        const basis = typeof layout.flexBasis === 'number' ? layout.flexBasis : parseFloat(layout.flexBasis as string);
        if (!isNaN(basis)) yogaNode.setFlexBasis(basis);
    }

    // Dimensions
    const width = resolveStyleValue(layout.width as StyleValue, tokens);
    const height = resolveStyleValue(layout.height as StyleValue, tokens);
    const minWidth = resolveStyleValue(layout.minWidth as StyleValue, tokens);
    const maxWidth = resolveStyleValue(layout.maxWidth as StyleValue, tokens);
    const minHeight = resolveStyleValue(layout.minHeight as StyleValue, tokens);
    const maxHeight = resolveStyleValue(layout.maxHeight as StyleValue, tokens);

    if (width !== undefined) yogaNode.setWidth(width);
    if (height !== undefined) yogaNode.setHeight(height);
    if (minWidth !== undefined) yogaNode.setMinWidth(minWidth);
    if (maxWidth !== undefined) yogaNode.setMaxWidth(maxWidth);
    if (minHeight !== undefined) yogaNode.setMinHeight(minHeight);
    if (maxHeight !== undefined) yogaNode.setMaxHeight(maxHeight);

    // Padding
    const padding = resolveStyleValue(layout.padding, tokens);
    const paddingTop = resolveStyleValue(layout.paddingTop, tokens) ?? resolveStyleValue(layout.paddingY, tokens) ?? padding;
    const paddingRight = resolveStyleValue(layout.paddingRight, tokens) ?? resolveStyleValue(layout.paddingX, tokens) ?? padding;
    const paddingBottom = resolveStyleValue(layout.paddingBottom, tokens) ?? resolveStyleValue(layout.paddingY, tokens) ?? padding;
    const paddingLeft = resolveStyleValue(layout.paddingLeft, tokens) ?? resolveStyleValue(layout.paddingX, tokens) ?? padding;

    if (paddingTop !== undefined) yogaNode.setPadding(Edge.Top, paddingTop);
    if (paddingRight !== undefined) yogaNode.setPadding(Edge.Right, paddingRight);
    if (paddingBottom !== undefined) yogaNode.setPadding(Edge.Bottom, paddingBottom);
    if (paddingLeft !== undefined) yogaNode.setPadding(Edge.Left, paddingLeft);

    // Margin
    const margin = resolveStyleValue(layout.margin, tokens);
    const marginTop = resolveStyleValue(layout.marginTop, tokens) ?? resolveStyleValue(layout.marginY, tokens) ?? margin;
    const marginRight = resolveStyleValue(layout.marginRight, tokens) ?? resolveStyleValue(layout.marginX, tokens) ?? margin;
    const marginBottom = resolveStyleValue(layout.marginBottom, tokens) ?? resolveStyleValue(layout.marginY, tokens) ?? margin;
    const marginLeft = resolveStyleValue(layout.marginLeft, tokens) ?? resolveStyleValue(layout.marginX, tokens) ?? margin;

    if (marginTop !== undefined) yogaNode.setMargin(Edge.Top, marginTop);
    if (marginRight !== undefined) yogaNode.setMargin(Edge.Right, marginRight);
    if (marginBottom !== undefined) yogaNode.setMargin(Edge.Bottom, marginBottom);
    if (marginLeft !== undefined) yogaNode.setMargin(Edge.Left, marginLeft);

    // Gap
    const gap = resolveStyleValue(layout.gap, tokens);
    // Yoga v3 uses Gutter.All instead of Edge.All for gap
    if (gap !== undefined) yogaNode.setGap(Gutter.All, gap);

    // Flex container properties
    yogaNode.setFlexDirection(mapFlexDirection(layout.flexDirection));
    yogaNode.setJustifyContent(mapJustifyContent(layout.justifyContent));
    yogaNode.setAlignItems(mapAlign(layout.alignItems));
    yogaNode.setFlexWrap(mapFlexWrap(layout.flexWrap));

    if (layout.alignSelf) {
        yogaNode.setAlignSelf(mapAlign(layout.alignSelf));
    }

    // Positioning
    if (layout.position === 'absolute') {
        yogaNode.setPositionType(PositionType.Absolute);
        const top = resolveStyleValue(layout.top as StyleValue, tokens);
        const right = resolveStyleValue(layout.right as StyleValue, tokens);
        const bottom = resolveStyleValue(layout.bottom as StyleValue, tokens);
        const left = resolveStyleValue(layout.left as StyleValue, tokens);
        if (top !== undefined) yogaNode.setPosition(Edge.Top, top);
        if (right !== undefined) yogaNode.setPosition(Edge.Right, right);
        if (bottom !== undefined) yogaNode.setPosition(Edge.Bottom, bottom);
        if (left !== undefined) yogaNode.setPosition(Edge.Left, left);
    }
}

/**
 * Get default layout rules for a component type
 */
function getDefaultLayoutForType(type: string): Partial<LayoutRules> {
    switch (type) {
        case 'Row':
            return { flexDirection: 'row', alignItems: 'center' };
        case 'Column':
            return { flexDirection: 'column' };
        case 'Screen':
            return { flexDirection: 'column', flex: 1 };
        case 'Card':
            return { flexDirection: 'column' };
        case 'Text':
            return { flexShrink: 0 }; // Prevent text from shrinking
        case 'Button':
            return {
                paddingX: 'tokens.spacing.md',
                paddingY: 'tokens.spacing.sm',
                minWidth: 80,
                minHeight: 44,
            };
        case 'Badge':
            return { minWidth: 40, minHeight: 24 };
        case 'Avatar':
            return { width: 40, height: 40 };
        case 'Icon':
            return { width: 24, height: 24 };
        case 'Input':
            return { height: 44, minWidth: 120, paddingX: 'tokens.spacing.sm' };
        case 'NavBar':
            return { flexDirection: 'row', height: 56, width: '100%' as unknown as number };
        default:
            return {};
    }
}

/**
 * Build a Yoga node tree from a component node
 */
function buildYogaTree(node: ComponentNode, tokens: DesignTokens): YogaNode {
    const yogaNode = Yoga.Node.create();

    // Merge default layout with node's layout
    const defaultLayout = getDefaultLayoutForType(node.type);
    const mergedLayout = { ...defaultLayout, ...node.layout };

    // Apply layout rules
    applyLayoutRules(yogaNode, mergedLayout, tokens);

    // Build children
    node.children.forEach((child: ComponentNode, index: number) => {
        const childYogaNode = buildYogaTree(child, tokens);
        yogaNode.insertChild(childYogaNode, index);
    });

    return yogaNode;
}

/**
 * Extract computed bounds from Yoga tree
 */
function extractBounds(
    yogaNode: YogaNode,
    node: ComponentNode,
    boundsMap: BoundsMap,
    parentX: number = 0,
    parentY: number = 0
): void {
    const layout = yogaNode.getComputedLayout();
    const x = parentX + layout.left;
    const y = parentY + layout.top;

    boundsMap.set(node.nodeId, {
        x,
        y,
        width: layout.width,
        height: layout.height,
    });

    // Process children
    node.children.forEach((child: ComponentNode, index: number) => {
        const childYogaNode = yogaNode.getChild(index);
        if (childYogaNode) {
            extractBounds(childYogaNode, child, boundsMap, x, y);
        }
    });
}

/**
 * Compute layout for a screen
 */
export function computeLayout(screen: Screen, tokens: DesignTokens): BoundsMap {
    const boundsMap: BoundsMap = new Map();

    // Create root Yoga node with screen dimensions
    const rootYogaNode = Yoga.Node.create();
    rootYogaNode.setWidth(screen.width);
    rootYogaNode.setHeight(screen.height);
    rootYogaNode.setFlexDirection(FlexDirection.Column);

    // Build the tree under root
    const contentYogaNode = buildYogaTree(screen.root, tokens);
    rootYogaNode.insertChild(contentYogaNode, 0);

    // Calculate layout
    rootYogaNode.calculateLayout(screen.width, screen.height);

    // Extract bounds
    extractBounds(contentYogaNode, screen.root, boundsMap);

    // Cleanup
    rootYogaNode.freeRecursive();

    return boundsMap;
}

/**
 * Compute layout for all screens in a spec
 */
export function computeAllLayouts(
    screens: Screen[],
    tokens: DesignTokens
): Map<string, BoundsMap> {
    const allBounds = new Map<string, BoundsMap>();

    for (const screen of screens) {
        allBounds.set(screen.screenId, computeLayout(screen, tokens));
    }

    return allBounds;
}
