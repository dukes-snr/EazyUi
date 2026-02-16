import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Layers } from 'lucide-react';
import { useCanvasStore, useDesignStore } from '../../stores';
import { useEditStore } from '../../stores/edit-store';
import { dispatchSelectUid } from '../../utils/editMessaging';
import { ensureEditableUids } from '../../utils/htmlPatcher';

type LayerNode = {
    uid: string;
    tagName: string;
    label: string;
    children: LayerNode[];
};

function buildNode(element: Element): LayerNode | null {
    const uid = element.getAttribute('data-uid');
    if (!uid) return null;
    const tagName = element.tagName.toLowerCase();
    const className = (element.getAttribute('class') || '').trim();
    const idName = (element.getAttribute('id') || '').trim();
    const label = idName ? `${tagName}#${idName}` : className ? `${tagName}.${className.split(/\s+/)[0]}` : tagName;

    const children = Array.from(element.children)
        .map((child) => buildNode(child))
        .filter(Boolean) as LayerNode[];

    return { uid, tagName, label, children };
}

function parseLayerTree(html: string): LayerNode[] {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const root = doc.body;
    if (!root) return [];
    return Array.from(root.children)
        .map((child) => buildNode(child))
        .filter(Boolean) as LayerNode[];
}

function findPathToUid(nodes: LayerNode[], targetUid: string): string[] {
    for (const node of nodes) {
        if (node.uid === targetUid) return [node.uid];
        const childPath = findPathToUid(node.children, targetUid);
        if (childPath.length > 0) return [node.uid, ...childPath];
    }
    return [];
}

function LayerRow({
    node,
    depth,
    selectedUid,
    collapsed,
    onToggle,
    onSelect,
}: {
    node: LayerNode;
    depth: number;
    selectedUid?: string;
    collapsed: Record<string, boolean>;
    onToggle: (uid: string) => void;
    onSelect: (uid: string) => void;
}) {
    const hasChildren = node.children.length > 0;
    const isCollapsed = Boolean(collapsed[node.uid]);
    const isSelected = selectedUid === node.uid;

    return (
        <>
            <div
                className={`layers-row ${isSelected ? 'selected' : ''}`}
                data-layer-uid={node.uid}
                style={{ paddingLeft: `${10 + depth * 14}px` }}
            >
                <button
                    type="button"
                    className="layers-toggle"
                    onClick={() => hasChildren && onToggle(node.uid)}
                    disabled={!hasChildren}
                    title={hasChildren ? (isCollapsed ? 'Expand' : 'Collapse') : 'No children'}
                >
                    {hasChildren ? (isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />) : <span className="layers-dot" />}
                </button>
                <button
                    type="button"
                    className="layers-label"
                    onClick={() => onSelect(node.uid)}
                    title={`${node.tagName} (${node.uid})`}
                >
                    {node.label}
                </button>
            </div>
            {hasChildren && !isCollapsed && node.children.map((child) => (
                <LayerRow
                    key={child.uid}
                    node={child}
                    depth={depth + 1}
                    selectedUid={selectedUid}
                    collapsed={collapsed}
                    onToggle={onToggle}
                    onSelect={onSelect}
                />
            ))}
        </>
    );
}

export function LayersPanel() {
    const { spec, updateScreen } = useDesignStore();
    const { setFocusNodeId } = useCanvasStore();
    const { isEditMode, screenId, selected, setActiveScreen } = useEditStore();
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

    const activeScreen = useMemo(() => {
        if (!spec || !screenId) return null;
        return spec.screens.find((s) => s.screenId === screenId) || null;
    }, [spec, screenId]);

    const tree = useMemo(() => {
        if (!activeScreen?.html) return [];
        return parseLayerTree(activeScreen.html);
    }, [activeScreen?.html]);

    useEffect(() => {
        const selectedUid = selected?.uid;
        if (!selectedUid || tree.length === 0) return;

        const path = findPathToUid(tree, selectedUid);
        if (path.length === 0) return;

        // Ensure all ancestors are expanded so selected node becomes visible.
        setCollapsed((prev) => {
            let changed = false;
            const next = { ...prev };
            for (const uid of path.slice(0, -1)) {
                if (next[uid]) {
                    next[uid] = false;
                    changed = true;
                }
            }
            return changed ? next : prev;
        });

        // Scroll selected row into view once expansion has rendered.
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
                const selectedRow = document.querySelector(`.layers-tree [data-layer-uid="${selectedUid}"]`) as HTMLElement | null;
                selectedRow?.scrollIntoView({ block: 'nearest' });
            });
        });
    }, [selected?.uid, tree]);

    if (!isEditMode) return null;

    return (
        <aside className="layers-panel">
            <div className="layers-panel-header">
                <div className="layers-panel-title">
                    <Layers size={14} />
                    <span>Layers</span>
                </div>
                <select
                    value={screenId || ''}
                    onChange={(e) => {
                        const nextId = e.target.value;
                        if (!nextId || !spec) return;
                        const next = spec.screens.find((s) => s.screenId === nextId);
                        if (!next) return;
                        const ensured = ensureEditableUids(next.html);
                        if (ensured !== next.html) {
                            updateScreen(nextId, ensured, next.status, next.width, next.height, next.name);
                        }
                        setActiveScreen(nextId, ensured);
                        setFocusNodeId(nextId);
                    }}
                    className="layers-screen-select"
                >
                    {(spec?.screens || []).map((screen) => (
                        <option key={screen.screenId} value={screen.screenId}>
                            {screen.name}
                        </option>
                    ))}
                </select>
            </div>
            <div className="layers-tree">
                {tree.length === 0 && (
                    <div className="layers-empty">No editable structure found.</div>
                )}
                {tree.map((node) => (
                    <LayerRow
                        key={node.uid}
                        node={node}
                        depth={0}
                        selectedUid={selected?.uid}
                        collapsed={collapsed}
                        onToggle={(uid) => setCollapsed((prev) => ({ ...prev, [uid]: !prev[uid] }))}
                        onSelect={(uid) => {
                            if (!screenId) return;
                            dispatchSelectUid(screenId, uid);
                        }}
                    />
                ))}
            </div>
        </aside>
    );
}
