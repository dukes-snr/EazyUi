// ============================================================================
// Inspector Panel Component
// ============================================================================

import { useMemo, useCallback } from 'react';
import { useDesignStore, useCanvasStore } from '../../stores';
import type { ComponentNode, Patch } from '@eazyui/shared';

export function InspectorPanel() {
    const { spec, getNode, applyPatch } = useDesignStore();
    const { doc } = useCanvasStore();

    const selectedNodeId = doc.selection.selectedNodeIds[0];
    const selectedNode = selectedNodeId ? getNode(selectedNodeId) : null;

    // Get breadcrumb path
    const breadcrumb = useMemo(() => {
        if (!selectedNode || !spec) return [];

        const path: { nodeId: string; type: string }[] = [];

        // Find path to selected node
        for (const screen of spec.screens) {
            const found = findPathToNode(screen.root, selectedNodeId, path);
            if (found) {
                return [{ nodeId: screen.screenId, type: 'Screen' }, ...path];
            }
        }

        return path;
    }, [selectedNode, selectedNodeId, spec]);

    // Update handlers
    const updateProp = useCallback((path: string, value: unknown) => {
        if (!selectedNodeId) return;

        const patch: Patch = {
            op: 'update',
            target: selectedNodeId,
            path: `props.${path}`,
            value,
        };

        applyPatch(patch);
    }, [selectedNodeId, applyPatch]);

    const updateStyle = useCallback((path: string, value: unknown) => {
        if (!selectedNodeId) return;

        const patch: Patch = {
            op: 'update',
            target: selectedNodeId,
            path: `style.${path}`,
            value,
        };

        applyPatch(patch);
    }, [selectedNodeId, applyPatch]);

    const updateLayout = useCallback((path: string, value: unknown) => {
        if (!selectedNodeId) return;

        const patch: Patch = {
            op: 'update',
            target: selectedNodeId,
            path: `layout.${path}`,
            value,
        };

        applyPatch(patch);
    }, [selectedNodeId, applyPatch]);

    if (!selectedNode) {
        return (
            <div className="inspector-panel">
                <div className="inspector-header">
                    <h3>Inspector</h3>
                </div>
                <div className="inspector-empty">
                    <p>Select an element on the canvas to edit its properties</p>
                </div>
            </div>
        );
    }

    return (
        <div className="inspector-panel">
            <div className="inspector-header">
                <h3>{selectedNode.type}</h3>
                <div className="inspector-breadcrumb">
                    {breadcrumb.map((item, index) => (
                        <span key={item.nodeId}>
                            {item.type}
                            {index < breadcrumb.length - 1 && ' › '}
                        </span>
                    ))}
                </div>
            </div>

            <div className="inspector-content">
                {/* Type-specific editors */}
                {selectedNode.type === 'Text' && (
                    <TextEditor node={selectedNode} updateProp={updateProp} updateStyle={updateStyle} />
                )}

                {selectedNode.type === 'Button' && (
                    <ButtonEditor node={selectedNode} updateProp={updateProp} updateStyle={updateStyle} />
                )}

                {selectedNode.type === 'Input' && (
                    <InputEditor node={selectedNode} updateProp={updateProp} />
                )}

                {/* Layout section for container types */}
                {['Row', 'Column', 'Card', 'Section', 'Screen'].includes(selectedNode.type) && (
                    <LayoutEditor node={selectedNode} updateLayout={updateLayout} />
                )}

                {/* Common style section */}
                <StyleEditor
                    node={selectedNode}
                    updateStyle={updateStyle}
                    tokens={spec?.tokens}
                />
            </div>
        </div>
    );
}

// ============================================================================
// Sub-editors
// ============================================================================

interface EditorProps {
    node: ComponentNode;
    updateProp: (path: string, value: unknown) => void;
    updateStyle?: (path: string, value: unknown) => void;
}

function TextEditor({ node, updateProp }: EditorProps) {
    const props = node.props as { content?: string; variant?: string; align?: string };

    return (
        <div className="inspector-section">
            <h4>Text</h4>

            <div className="inspector-field">
                <label>Content</label>
                <textarea
                    value={props.content || ''}
                    onChange={(e) => updateProp('content', e.target.value)}
                />
            </div>

            <div className="inspector-field">
                <label>Variant</label>
                <select
                    value={props.variant || 'bodyMedium'}
                    onChange={(e) => updateProp('variant', e.target.value)}
                >
                    <option value="displayLarge">Display Large</option>
                    <option value="displayMedium">Display Medium</option>
                    <option value="displaySmall">Display Small</option>
                    <option value="headingLarge">Heading Large</option>
                    <option value="headingMedium">Heading Medium</option>
                    <option value="headingSmall">Heading Small</option>
                    <option value="bodyLarge">Body Large</option>
                    <option value="bodyMedium">Body Medium</option>
                    <option value="bodySmall">Body Small</option>
                    <option value="caption">Caption</option>
                    <option value="label">Label</option>
                </select>
            </div>

            <div className="inspector-field">
                <label>Align</label>
                <select
                    value={props.align || 'left'}
                    onChange={(e) => updateProp('align', e.target.value)}
                >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                </select>
            </div>
        </div>
    );
}

function ButtonEditor({ node, updateProp }: EditorProps) {
    const props = node.props as { label?: string; variant?: string; disabled?: boolean };

    return (
        <div className="inspector-section">
            <h4>Button</h4>

            <div className="inspector-field">
                <label>Label</label>
                <input
                    type="text"
                    value={props.label || ''}
                    onChange={(e) => updateProp('label', e.target.value)}
                />
            </div>

            <div className="inspector-field">
                <label>Variant</label>
                <select
                    value={props.variant || 'primary'}
                    onChange={(e) => updateProp('variant', e.target.value)}
                >
                    <option value="primary">Primary</option>
                    <option value="secondary">Secondary</option>
                    <option value="outline">Outline</option>
                    <option value="ghost">Ghost</option>
                    <option value="danger">Danger</option>
                </select>
            </div>

            <div className="inspector-field">
                <label>
                    <input
                        type="checkbox"
                        checked={props.disabled || false}
                        onChange={(e) => updateProp('disabled', e.target.checked)}
                    />
                    {' '}Disabled
                </label>
            </div>
        </div>
    );
}

function InputEditor({ node, updateProp }: { node: ComponentNode; updateProp: (path: string, value: unknown) => void }) {
    const props = node.props as { placeholder?: string; label?: string; inputType?: string };

    return (
        <div className="inspector-section">
            <h4>Input</h4>

            <div className="inspector-field">
                <label>Label</label>
                <input
                    type="text"
                    value={props.label || ''}
                    onChange={(e) => updateProp('label', e.target.value)}
                />
            </div>

            <div className="inspector-field">
                <label>Placeholder</label>
                <input
                    type="text"
                    value={props.placeholder || ''}
                    onChange={(e) => updateProp('placeholder', e.target.value)}
                />
            </div>

            <div className="inspector-field">
                <label>Type</label>
                <select
                    value={props.inputType || 'text'}
                    onChange={(e) => updateProp('inputType', e.target.value)}
                >
                    <option value="text">Text</option>
                    <option value="email">Email</option>
                    <option value="password">Password</option>
                    <option value="number">Number</option>
                    <option value="tel">Phone</option>
                </select>
            </div>
        </div>
    );
}

function LayoutEditor({ node, updateLayout }: { node: ComponentNode; updateLayout: (path: string, value: unknown) => void }) {
    const layout = node.layout || {};

    const spacingOptions = ['xxs', 'xs', 'sm', 'md', 'lg', 'xl', 'xxl'];

    return (
        <div className="inspector-section">
            <h4>Layout</h4>

            <div className="inspector-field">
                <label>Padding</label>
                <div className="spacing-grid">
                    {spacingOptions.map(size => (
                        <button
                            key={size}
                            className={`spacing-btn ${layout.padding === `tokens.spacing.${size}` ? 'active' : ''}`}
                            onClick={() => updateLayout('padding', `tokens.spacing.${size}`)}
                        >
                            {size}
                        </button>
                    ))}
                </div>
            </div>

            <div className="inspector-field">
                <label>Gap</label>
                <div className="spacing-grid">
                    {spacingOptions.map(size => (
                        <button
                            key={size}
                            className={`spacing-btn ${layout.gap === `tokens.spacing.${size}` ? 'active' : ''}`}
                            onClick={() => updateLayout('gap', `tokens.spacing.${size}`)}
                        >
                            {size}
                        </button>
                    ))}
                </div>
            </div>

            <div className="inspector-field">
                <label>Justify Content</label>
                <select
                    value={layout.justifyContent || 'flex-start'}
                    onChange={(e) => updateLayout('justifyContent', e.target.value)}
                >
                    <option value="flex-start">Start</option>
                    <option value="flex-end">End</option>
                    <option value="center">Center</option>
                    <option value="space-between">Space Between</option>
                    <option value="space-around">Space Around</option>
                </select>
            </div>

            <div className="inspector-field">
                <label>Align Items</label>
                <select
                    value={layout.alignItems || 'stretch'}
                    onChange={(e) => updateLayout('alignItems', e.target.value)}
                >
                    <option value="flex-start">Start</option>
                    <option value="flex-end">End</option>
                    <option value="center">Center</option>
                    <option value="stretch">Stretch</option>
                </select>
            </div>
        </div>
    );
}

interface StyleEditorProps {
    node: ComponentNode;
    updateStyle: (path: string, value: unknown) => void;
    tokens?: { colors: Record<string, string> };
}

function StyleEditor({ node, updateStyle, tokens }: StyleEditorProps) {
    const style = node.style || {};
    const colors = tokens?.colors || {};

    const colorKeys = ['primary', 'secondary', 'background', 'surface', 'text', 'textMuted', 'success', 'warning', 'error'];

    const radiusOptions = ['none', 'xs', 'sm', 'md', 'lg', 'xl', 'xxl', 'full'];

    return (
        <div className="inspector-section">
            <h4>Style</h4>

            <div className="inspector-field">
                <label>Background Color</label>
                <div className="color-grid">
                    {colorKeys.map(key => (
                        <div
                            key={key}
                            className={`color-swatch ${style.backgroundColor === `tokens.colors.${key}` ? 'active' : ''}`}
                            style={{ backgroundColor: colors[key] || '#333' }}
                            onClick={() => updateStyle('backgroundColor', `tokens.colors.${key}`)}
                            title={key}
                        />
                    ))}
                </div>
            </div>

            <div className="inspector-field">
                <label>Text Color</label>
                <div className="color-grid">
                    {colorKeys.map(key => (
                        <div
                            key={key}
                            className={`color-swatch ${style.color === `tokens.colors.${key}` ? 'active' : ''}`}
                            style={{ backgroundColor: colors[key] || '#333' }}
                            onClick={() => updateStyle('color', `tokens.colors.${key}`)}
                            title={key}
                        />
                    ))}
                </div>
            </div>

            <div className="inspector-field">
                <label>Border Radius</label>
                <div className="spacing-grid">
                    {radiusOptions.map(size => (
                        <button
                            key={size}
                            className={`spacing-btn ${style.borderRadius === `tokens.radius.${size}` ? 'active' : ''}`}
                            onClick={() => updateStyle('borderRadius', `tokens.radius.${size}`)}
                        >
                            {size}
                        </button>
                    ))}
                </div>
            </div>

            <div className="inspector-field">
                <label>Shadow</label>
                <select
                    value={style.shadow || 'none'}
                    onChange={(e) => updateStyle('shadow', e.target.value)}
                >
                    <option value="none">None</option>
                    <option value="sm">Small</option>
                    <option value="md">Medium</option>
                    <option value="lg">Large</option>
                    <option value="xl">Extra Large</option>
                </select>
            </div>
        </div>
    );
}

// ============================================================================
// Helpers
// ============================================================================

function findPathToNode(
    node: ComponentNode,
    targetId: string,
    path: { nodeId: string; type: string }[]
): boolean {
    if (node.nodeId === targetId) {
        path.push({ nodeId: node.nodeId, type: node.type });
        return true;
    }

    for (const child of node.children) {
        if (findPathToNode(child, targetId, path)) {
            path.unshift({ nodeId: node.nodeId, type: node.type });
            return true;
        }
    }

    return false;
}
