// ============================================================================
// Node Renderers - Konva shape creation for each component type
// ============================================================================

import Konva from 'konva';
import type { ComponentNode, DesignTokens, StyleRef, StyleValue } from '@eazyui/shared';
import type { ComputedBounds } from '../layout/yoga-engine';

/**
 * Resolve a style value to a string (for colors, etc.)
 */
function resolveColor(value: StyleValue | undefined, tokens: DesignTokens): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value === 'string') {
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
            return typeof current === 'string' ? current : undefined;
        }
        return value;
    }
    return undefined;
}

/**
 * Resolve a number style value
 */
function resolveNumber(value: StyleValue | undefined, tokens: DesignTokens): number | undefined {
    if (value === undefined) return undefined;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
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
        const parsed = parseFloat(value);
        return isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
}

/**
 * Get typography style from tokens
 */
function getTypographyStyle(typographyKey: string | undefined, tokens: DesignTokens) {
    if (!typographyKey) return tokens.typography.bodyMedium;
    const key = typographyKey.startsWith('tokens.typography.')
        ? typographyKey.substring(18)
        : typographyKey;
    return (tokens.typography as Record<string, typeof tokens.typography.bodyMedium>)[key] || tokens.typography.bodyMedium;
}

export interface RenderContext {
    tokens: DesignTokens;
    bounds: ComputedBounds;
    isSelected: boolean;
    isHovered: boolean;
}

/**
 * Render a background rectangle for a node
 */
function renderBackground(
    node: ComponentNode,
    ctx: RenderContext
): Konva.Rect | null {
    const { tokens, bounds } = ctx;
    const style = node.style;

    const bgColor = resolveColor(style?.backgroundColor, tokens);
    const borderColor = resolveColor(style?.borderColor, tokens);
    const borderWidth = style?.borderWidth ?? 0;
    const borderRadius = resolveNumber(style?.borderRadius, tokens) ?? 0;

    if (!bgColor && !borderColor) return null;

    return new Konva.Rect({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        fill: bgColor,
        stroke: borderColor,
        strokeWidth: borderWidth,
        cornerRadius: borderRadius,
        listening: true,
        id: node.nodeId,
    });
}

/**
 * Render a Text node
 */
function renderText(
    node: ComponentNode,
    ctx: RenderContext
): Konva.Group {
    const { tokens, bounds } = ctx;
    const props = node.props as {
        content?: string;
        text?: string; // Gemini often uses 'text' instead of 'content'
        variant?: string;
        align?: 'left' | 'center' | 'right';
    };
    const style = node.style;

    const group = new Konva.Group({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
    });

    const typography = getTypographyStyle(props.variant || style?.typography, tokens);
    const textColor = resolveColor(style?.color, tokens) ?? tokens.colors.text;

    const text = new Konva.Text({
        text: props.content || props.text || '',
        fontSize: typography.fontSize,
        fontFamily: typography.fontFamily,
        fontStyle: typeof typography.fontWeight === 'number' && typography.fontWeight >= 600 ? 'bold' : 'normal',
        fill: textColor,
        width: bounds.width,
        height: bounds.height,
        align: props.align || 'left',
        verticalAlign: 'middle',
        listening: true,
        id: node.nodeId,
    });

    group.add(text);
    return group;
}

/**
 * Render a Button node
 */
function renderButton(
    node: ComponentNode,
    ctx: RenderContext
): Konva.Group {
    const { tokens, bounds } = ctx;
    const props = node.props as {
        label?: string;
        variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
        disabled?: boolean;
    };
    const style = node.style;

    const group = new Konva.Group({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
    });

    // Determine colors based on variant
    let bgColor = tokens.colors.primary;
    let textColor = tokens.colors.textInverse;
    let borderColor: string | undefined;

    switch (props.variant) {
        case 'secondary':
            bgColor = tokens.colors.secondary;
            break;
        case 'outline':
            bgColor = 'transparent';
            textColor = tokens.colors.primary;
            borderColor = tokens.colors.primary;
            break;
        case 'ghost':
            bgColor = 'transparent';
            textColor = tokens.colors.text;
            break;
        case 'danger':
            bgColor = tokens.colors.error;
            break;
    }

    // Override with explicit style
    bgColor = resolveColor(style?.backgroundColor, tokens) ?? bgColor;
    textColor = resolveColor(style?.color, tokens) ?? textColor;

    const borderRadius = resolveNumber(style?.borderRadius, tokens) ?? tokens.radius.md;

    // Background
    const bg = new Konva.Rect({
        width: bounds.width,
        height: bounds.height,
        fill: bgColor,
        stroke: borderColor,
        strokeWidth: borderColor ? 1 : 0,
        cornerRadius: borderRadius,
        opacity: props.disabled ? 0.5 : 1,
    });
    group.add(bg);

    // Label
    const label = new Konva.Text({
        text: props.label || 'Button',
        fontSize: tokens.typography.label.fontSize,
        fontFamily: tokens.typography.label.fontFamily,
        fontStyle: 'bold',
        fill: textColor,
        width: bounds.width,
        height: bounds.height,
        align: 'center',
        verticalAlign: 'middle',
        listening: true,
        id: node.nodeId,
    });
    group.add(label);

    return group;
}

/**
 * Render an Input node
 */
function renderInput(
    node: ComponentNode,
    ctx: RenderContext
): Konva.Group {
    const { tokens, bounds } = ctx;
    const props = node.props as {
        placeholder?: string;
        value?: string;
        label?: string;
    };
    const style = node.style;

    const group = new Konva.Group({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
    });

    const bgColor = resolveColor(style?.backgroundColor, tokens) ?? tokens.colors.surface;
    const borderColor = resolveColor(style?.borderColor, tokens) ?? tokens.colors.border;
    const borderRadius = resolveNumber(style?.borderRadius, tokens) ?? tokens.radius.md;

    // Background
    const bg = new Konva.Rect({
        width: bounds.width,
        height: bounds.height,
        fill: bgColor,
        stroke: borderColor,
        strokeWidth: 1,
        cornerRadius: borderRadius,
    });
    group.add(bg);

    // Value or placeholder text
    const text = new Konva.Text({
        text: props.value || props.placeholder || '',
        fontSize: tokens.typography.bodyMedium.fontSize,
        fontFamily: tokens.typography.bodyMedium.fontFamily,
        fill: props.value
            ? resolveColor(style?.color, tokens) ?? tokens.colors.text
            : tokens.colors.textMuted,
        width: bounds.width - 16,
        height: bounds.height,
        align: 'left',
        verticalAlign: 'middle',
        x: 8,
        listening: true,
        id: node.nodeId,
    });
    group.add(text);

    return group;
}

/**
 * Render a Card node
 */
function renderCard(
    node: ComponentNode,
    ctx: RenderContext
): Konva.Rect {
    const { tokens, bounds } = ctx;
    const style = node.style;
    const props = node.props as { elevated?: boolean };

    const bgColor = resolveColor(style?.backgroundColor, tokens) ?? tokens.colors.surface;
    const borderRadius = resolveNumber(style?.borderRadius, tokens) ?? tokens.radius.lg;

    // Get shadow preset
    const shadowKey = style?.shadow ?? (props.elevated ? 'md' : 'sm');
    const shadow = tokens.shadows[shadowKey as keyof typeof tokens.shadows] ?? tokens.shadows.sm;

    return new Konva.Rect({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        fill: bgColor,
        cornerRadius: borderRadius,
        shadowBlur: shadow.blur,
        shadowOffsetX: shadow.offsetX,
        shadowOffsetY: shadow.offsetY,
        shadowColor: shadow.color,
        listening: true,
        id: node.nodeId,
    });
}

/**
 * Render a Divider node
 */
function renderDivider(
    node: ComponentNode,
    ctx: RenderContext
): Konva.Line {
    const { tokens, bounds } = ctx;
    const style = node.style;
    const props = node.props as { orientation?: 'horizontal' | 'vertical'; thickness?: number };

    const color = resolveColor(style?.borderColor, tokens) ?? tokens.colors.border;
    const thickness = props.thickness ?? 1;
    const isVertical = props.orientation === 'vertical';

    const points = isVertical
        ? [bounds.x + bounds.width / 2, bounds.y, bounds.x + bounds.width / 2, bounds.y + bounds.height]
        : [bounds.x, bounds.y + bounds.height / 2, bounds.x + bounds.width, bounds.y + bounds.height / 2];

    return new Konva.Line({
        points,
        stroke: color,
        strokeWidth: thickness,
        listening: true,
        id: node.nodeId,
    });
}

/**
 * Render a Badge node
 */
function renderBadge(
    node: ComponentNode,
    ctx: RenderContext
): Konva.Group {
    const { tokens, bounds } = ctx;
    const props = node.props as {
        text?: string;
        variant?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error';
    };
    const style = node.style;

    const group = new Konva.Group({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
    });

    // Determine colors based on variant
    let bgColor = tokens.colors.surface;
    let textColor = tokens.colors.text;

    switch (props.variant) {
        case 'primary':
            bgColor = tokens.colors.primaryLight;
            textColor = tokens.colors.primaryDark;
            break;
        case 'secondary':
            bgColor = tokens.colors.secondaryLight;
            textColor = tokens.colors.secondaryDark;
            break;
        case 'success':
            bgColor = tokens.colors.success + '33';
            textColor = tokens.colors.success;
            break;
        case 'warning':
            bgColor = tokens.colors.warning + '33';
            textColor = tokens.colors.warning;
            break;
        case 'error':
            bgColor = tokens.colors.error + '33';
            textColor = tokens.colors.error;
            break;
    }

    bgColor = resolveColor(style?.backgroundColor, tokens) ?? bgColor;
    textColor = resolveColor(style?.color, tokens) ?? textColor;

    const bg = new Konva.Rect({
        width: bounds.width,
        height: bounds.height,
        fill: bgColor,
        cornerRadius: tokens.radius.full,
    });
    group.add(bg);

    const text = new Konva.Text({
        text: props.text || '',
        fontSize: tokens.typography.caption.fontSize,
        fontFamily: tokens.typography.caption.fontFamily,
        fill: textColor,
        width: bounds.width,
        height: bounds.height,
        align: 'center',
        verticalAlign: 'middle',
        listening: true,
        id: node.nodeId,
    });
    group.add(text);

    return group;
}

/**
 * Render a Checkbox node
 */
function renderCheckbox(
    node: ComponentNode,
    ctx: RenderContext
): Konva.Group {
    const { tokens, bounds } = ctx;
    const props = node.props as { label?: string; checked?: boolean };
    const style = node.style;

    const group = new Konva.Group({
        x: bounds.x,
        y: bounds.y,
    });

    const boxSize = 20;
    const bgColor = props.checked ? tokens.colors.primary : tokens.colors.surface;
    const borderColor = props.checked ? tokens.colors.primary : tokens.colors.border;

    // Checkbox box
    const box = new Konva.Rect({
        width: boxSize,
        height: boxSize,
        fill: bgColor,
        stroke: borderColor,
        strokeWidth: 2,
        cornerRadius: tokens.radius.sm,
        y: (bounds.height - boxSize) / 2,
    });
    group.add(box);

    // Checkmark
    if (props.checked) {
        const check = new Konva.Line({
            points: [4, 10, 8, 14, 16, 6],
            stroke: tokens.colors.textInverse,
            strokeWidth: 2,
            lineCap: 'round',
            lineJoin: 'round',
            y: (bounds.height - boxSize) / 2,
        });
        group.add(check);
    }

    // Label
    if (props.label) {
        const textColor = resolveColor(style?.color, tokens) ?? tokens.colors.text;
        const label = new Konva.Text({
            text: props.label,
            fontSize: tokens.typography.bodyMedium.fontSize,
            fontFamily: tokens.typography.bodyMedium.fontFamily,
            fill: textColor,
            x: boxSize + 8,
            height: bounds.height,
            verticalAlign: 'middle',
            listening: true,
            id: node.nodeId,
        });
        group.add(label);
    }

    return group;
}

/**
 * Render a Switch node
 */
function renderSwitch(
    node: ComponentNode,
    ctx: RenderContext
): Konva.Group {
    const { tokens, bounds } = ctx;
    const props = node.props as { label?: string; checked?: boolean };
    const style = node.style;

    const group = new Konva.Group({
        x: bounds.x,
        y: bounds.y,
    });

    const trackWidth = 44;
    const trackHeight = 24;
    const knobSize = 20;
    const bgColor = props.checked ? tokens.colors.primary : tokens.colors.border;

    // Track
    const track = new Konva.Rect({
        width: trackWidth,
        height: trackHeight,
        fill: bgColor,
        cornerRadius: trackHeight / 2,
        y: (bounds.height - trackHeight) / 2,
    });
    group.add(track);

    // Knob
    const knob = new Konva.Circle({
        radius: knobSize / 2,
        fill: '#FFFFFF',
        x: props.checked ? trackWidth - knobSize / 2 - 2 : knobSize / 2 + 2,
        y: bounds.height / 2,
        shadowBlur: 2,
        shadowOffsetY: 1,
        shadowColor: 'rgba(0,0,0,0.2)',
    });
    group.add(knob);

    // Label
    if (props.label) {
        const textColor = resolveColor(style?.color, tokens) ?? tokens.colors.text;
        const label = new Konva.Text({
            text: props.label,
            fontSize: tokens.typography.bodyMedium.fontSize,
            fontFamily: tokens.typography.bodyMedium.fontFamily,
            fill: textColor,
            x: trackWidth + 8,
            height: bounds.height,
            verticalAlign: 'middle',
            listening: true,
            id: node.nodeId,
        });
        group.add(label);
    }

    return group;
}

/**
 * Render an Avatar node
 */
function renderAvatar(
    node: ComponentNode,
    ctx: RenderContext
): Konva.Group {
    const { tokens, bounds } = ctx;
    const props = node.props as { name?: string; src?: string; size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' };

    const sizes = { xs: 24, sm: 32, md: 40, lg: 56, xl: 72 };
    const size = sizes[props.size || 'md'];

    const group = new Konva.Group({
        x: bounds.x,
        y: bounds.y,
    });

    // Circle background
    const bg = new Konva.Circle({
        radius: size / 2,
        fill: tokens.colors.primary,
        x: size / 2,
        y: size / 2,
        listening: true,
        id: node.nodeId,
    });
    group.add(bg);

    // Initials if no image
    if (!props.src && props.name) {
        const initials = props.name
            .split(' ')
            .map(word => word[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);

        const text = new Konva.Text({
            text: initials,
            fontSize: size * 0.4,
            fontFamily: tokens.typography.label.fontFamily,
            fontStyle: 'bold',
            fill: tokens.colors.textInverse,
            width: size,
            height: size,
            align: 'center',
            verticalAlign: 'middle',
        });
        group.add(text);
    }

    return group;
}

/**
 * Render an Image node (placeholder - actual image loading requires async handling)
 */
function renderImage(
    node: ComponentNode,
    ctx: RenderContext
): Konva.Group {
    const { tokens, bounds } = ctx;
    const props = node.props as { src?: string; alt?: string };
    const style = node.style;

    const group = new Konva.Group({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
    });

    const borderRadius = resolveNumber(style?.borderRadius, tokens) ?? 0;
    const bgColor = resolveColor(style?.backgroundColor, tokens) ?? tokens.colors.surface;

    // Image placeholder rectangle
    const placeholder = new Konva.Rect({
        width: bounds.width,
        height: bounds.height,
        fill: bgColor,
        cornerRadius: borderRadius,
        stroke: tokens.colors.border,
        strokeWidth: 1,
        listening: true,
        id: node.nodeId,
    });
    group.add(placeholder);

    // Image icon placeholder (centered)
    const iconSize = Math.min(bounds.width, bounds.height) * 0.3;
    const icon = new Konva.Text({
        text: '🖼',
        fontSize: iconSize,
        width: bounds.width,
        height: bounds.height,
        align: 'center',
        verticalAlign: 'middle',
    });
    group.add(icon);

    return group;
}

/**
 * Render an Icon node
 */
function renderIcon(
    node: ComponentNode,
    ctx: RenderContext
): Konva.Group {
    const { tokens, bounds } = ctx;
    const props = node.props as { name?: string; icon?: string; size?: number };
    const style = node.style;

    const group = new Konva.Group({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
    });

    const iconName = props.name || props.icon || 'circle';
    const iconColor = resolveColor(style?.color, tokens) ?? tokens.colors.text;
    const size = props.size || Math.min(bounds.width, bounds.height) || 24;

    // Icon placeholder - render as a simple circle with first letter
    const circle = new Konva.Circle({
        x: size / 2,
        y: size / 2,
        radius: size / 2,
        fill: tokens.colors.surface,
        stroke: iconColor,
        strokeWidth: 1.5,
        listening: true,
        id: node.nodeId,
    });
    group.add(circle);

    // Icon letter
    const letter = new Konva.Text({
        text: iconName.charAt(0).toUpperCase(),
        fontSize: size * 0.5,
        fontFamily: tokens.typography.label.fontFamily,
        fontStyle: 'bold',
        fill: iconColor,
        width: size,
        height: size,
        align: 'center',
        verticalAlign: 'middle',
    });
    group.add(letter);

    return group;
}

/**
 * Main renderer function - renders a node based on its type
 */
export function renderNode(
    node: ComponentNode,
    ctx: RenderContext
): Konva.Group {
    const group = new Konva.Group({
        id: `group-${node.nodeId}`,
    });

    switch (node.type) {
        case 'Text':
            group.add(renderText(node, ctx));
            break;

        case 'Button':
            group.add(renderButton(node, ctx));
            break;

        case 'Input':
        case 'TextArea':
            group.add(renderInput(node, ctx));
            break;

        case 'Card':
            group.add(renderCard(node, ctx));
            break;

        case 'Divider':
            group.add(renderDivider(node, ctx));
            break;

        case 'Badge':
            group.add(renderBadge(node, ctx));
            break;

        case 'Checkbox':
            group.add(renderCheckbox(node, ctx));
            break;

        case 'Switch':
            group.add(renderSwitch(node, ctx));
            break;

        case 'Avatar':
            group.add(renderAvatar(node, ctx));
            break;

        case 'Image':
            group.add(renderImage(node, ctx));
            break;

        case 'Icon':
            group.add(renderIcon(node, ctx));
            break;

        case 'Row':
        case 'Column':
        case 'Stack':
        case 'Grid':
        case 'Screen':
        case 'Section':
        case 'List':
        case 'NavBar':
        case 'SideBar':
        case 'Tabs':
        default: {
            // Container nodes - render background if styled
            const bg = renderBackground(node, ctx);
            if (bg) group.add(bg);
            break;
        }
    }

    return group;
}
