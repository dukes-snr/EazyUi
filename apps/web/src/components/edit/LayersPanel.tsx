import { useEffect, useMemo, useRef, useState } from 'react';
import { Component, FileCode2, ImageIcon, Layers, MousePointerSquareDashed, RectangleHorizontal, Type as TypeIcon } from 'lucide-react';
import { useCanvasStore, useDesignStore } from '../../stores';
import { useEditStore } from '../../stores/edit-store';
import { dispatchSelectUid } from '../../utils/editMessaging';
import { ensureEditableUids } from '../../utils/htmlPatcher';
import {
    TreeExpander,
    TreeIcon,
    TreeLabel,
    TreeNode,
    TreeNodeContent,
    TreeNodeTrigger,
    TreeProvider,
    TreeView,
} from '../ui/tree';

type LayerNode = {
    uid: string;
    tagName: string;
    label: string;
    className: string;
    children: LayerNode[];
};

const FRIENDLY_TOKEN_MAP: Record<string, string> = {
    btn: 'Button',
    button: 'Button',
    nav: 'Navigation',
    tx: 'Transaction',
    hero: 'Hero',
    icon: 'Icon',
    badge: 'Badge',
    avatar: 'Avatar',
    user: 'User',
    greeting: 'Greeting',
    name: 'Name',
    wrapper: 'Group',
    wrap: 'Group',
    group: 'Group',
    header: 'Header',
    footer: 'Footer',
    main: 'Main Content',
    section: 'Section',
    card: 'Card',
    title: 'Title',
    desc: 'Description',
    description: 'Description',
    details: 'Details',
    detail: 'Details',
    amount: 'Amount',
    meta: 'Meta',
    actions: 'Actions',
    action: 'Action',
    row: 'Row',
    list: 'List',
    divider: 'Divider',
    home: 'Home',
    budget: 'Budget',
    savings: 'Savings',
    profile: 'Profile',
    notifications: 'Notifications',
    notification: 'Notifications',
    insight: 'Insight',
    balance: 'Balance',
    trend: 'Trend',
    transfer: 'Transfer',
    add: 'Add',
    money: 'Money',
    view: 'View',
    all: 'All',
};

const LABEL_STOP_WORDS = new Set([
    'uid',
    'dash',
    'screen',
    'root',
    'container',
    'inner',
    'outer',
]);

function toTitleCase(value: string) {
    return value
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function normalizeLabelText(value: string) {
    return value.replace(/\s+/g, ' ').trim();
}

function ensureSuffix(value: string, suffix: string) {
    return new RegExp(`\\b${suffix}\\b$`, 'i').test(value) ? value : `${value} ${suffix}`;
}

function humanizeUid(uid: string) {
    const tokens = uid
        .split(/[-_]/)
        .map((token) => token.trim())
        .filter(Boolean)
        .filter((token) => !/^\d+$/.test(token))
        .filter((token) => !LABEL_STOP_WORDS.has(token.toLowerCase()))
        .map((token) => FRIENDLY_TOKEN_MAP[token.toLowerCase()] || token);

    return toTitleCase(tokens.join(' '));
}

function getElementText(element: Element) {
    const text = normalizeLabelText(element.textContent || '');
    if (!text) return '';
    if (text.length > 42) return `${text.slice(0, 39).trim()}...`;
    return text;
}

function getChildHeadingText(element: Element) {
    const heading = Array.from(element.children).find((child) => /^h[1-6]$/i.test(child.tagName));
    return heading ? normalizeLabelText(heading.textContent || '') : '';
}

function buildFriendlyLabel(element: Element, uid: string, tagName: string, className: string) {
    const altText = normalizeLabelText(element.getAttribute('alt') || '');
    const text = getElementText(element);
    const uidLabel = humanizeUid(uid);
    const headingText = getChildHeadingText(element);
    const isMaterialIcon = /material-symbols|material-icons/i.test(className);

    if (isMaterialIcon) {
        return ensureSuffix(toTitleCase((text || uidLabel || 'Material').replace(/[_-]/g, ' ')), 'Icon');
    }

    if (tagName === 'img') {
        if (/avatar|profile/i.test(`${uid} ${altText}`)) return 'Profile Photo';
        return altText || 'Image';
    }

    if (tagName === 'header') {
        return /top|safe/i.test(`${uid} ${className}`) ? 'Top Header' : 'Header';
    }

    if (tagName === 'main') {
        return 'Main Content';
    }

    if (tagName === 'nav') {
        return /bottom/i.test(uid) ? 'Bottom Navigation' : 'Navigation';
    }

    if (tagName === 'section') {
        if (headingText) return ensureSuffix(headingText, 'Section');
        if (uidLabel) return ensureSuffix(uidLabel, 'Section');
        return 'Section';
    }

    if (tagName === 'button') {
        if (text) return ensureSuffix(toTitleCase(text), 'Button');
        if (uidLabel) return ensureSuffix(uidLabel, 'Button');
        return 'Button';
    }

    if (tagName === 'a') {
        if (/nav/i.test(uid)) return ensureSuffix(uidLabel || toTitleCase(text), 'Tab');
        if (text) return ensureSuffix(toTitleCase(text), 'Link');
        return uidLabel || 'Link';
    }

    if (/^h[1-6]$/i.test(tagName)) {
        return text || uidLabel || 'Heading';
    }

    if (tagName === 'p') {
        return text ? ensureSuffix(toTitleCase(text), 'Text') : (uidLabel || 'Text');
    }

    if (tagName === 'span') {
        if (text && text.length <= 24) return uidLabel || toTitleCase(text);
        return uidLabel || 'Label';
    }

    if (tagName === 'div') {
        if (uidLabel) return uidLabel;
        if (headingText) return ensureSuffix(headingText, 'Group');
        return 'Group';
    }

    return uidLabel || toTitleCase(tagName);
}

function buildNode(element: Element): LayerNode | null {
    const uid = element.getAttribute('data-uid');
    if (!uid) return null;
    const tagName = element.tagName.toLowerCase();
    const className = (element.getAttribute('class') || '').trim();
    const label = buildFriendlyLabel(element, uid, tagName, className);

    const children = Array.from(element.children)
        .map((child) => buildNode(child))
        .filter(Boolean) as LayerNode[];

    return { uid, tagName, label, className, children };
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

function getDefaultExpandedIds(nodes: LayerNode[], selectedUid?: string) {
    const initial = new Set<string>(nodes.map((node) => node.uid));
    if (selectedUid) {
        findPathToUid(nodes, selectedUid)
            .slice(0, -1)
            .forEach((uid) => initial.add(uid));
    }
    return Array.from(initial);
}

function getLayerIcon(node: LayerNode) {
    if (node.children.length > 0) return undefined;
    if (/material-symbols|material-icons/i.test(node.className)) {
        return <Component className="size-4" />;
    }
    if (node.tagName === 'img' || node.tagName === 'picture' || node.tagName === 'svg') {
        return <ImageIcon className="size-4" />;
    }
    if (node.tagName === 'button' || node.tagName === 'a') {
        return <MousePointerSquareDashed className="size-4" />;
    }
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'label', 'small', 'strong'].includes(node.tagName)) {
        return <TypeIcon className="size-4" />;
    }
    if (['section', 'div', 'main', 'header', 'footer', 'nav', 'aside', 'article', 'form'].includes(node.tagName)) {
        return <RectangleHorizontal className="size-4" />;
    }
    return <FileCode2 className="size-4" />;
}

function LayerTreeNode({
    node,
    level,
    isLast,
    parentPath,
}: {
    node: LayerNode;
    level: number;
    isLast: boolean;
    parentPath: boolean[];
}) {
    const { screenId, selected } = useEditStore();
    const hasChildren = node.children.length > 0;
    const isSelected = selected?.uid === node.uid;

    return (
        <TreeNode
            nodeId={node.uid}
            level={level}
            isLast={isLast}
            parentPath={parentPath}
            data-layer-uid={node.uid}
        >
            <TreeNodeTrigger
                hasChildren={hasChildren}
                className={`min-h-9 gap-0 rounded-xl border px-2.5 py-2 text-[var(--ui-text)] transition-colors ${isSelected
                    ? 'border-[color:color-mix(in_srgb,var(--ui-primary)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--ui-primary)_14%,var(--ui-surface-2))] ring-1 ring-[color:color-mix(in_srgb,var(--ui-primary)_16%,transparent)]'
                    : 'border-transparent hover:border-[color:color-mix(in_srgb,var(--ui-border)_85%,transparent)] hover:bg-[color:color-mix(in_srgb,var(--ui-surface-2)_85%,transparent)]'
                    }`}
                onClick={() => {
                    if (!screenId) return;
                    dispatchSelectUid(screenId, node.uid);
                }}
            >
                <TreeExpander hasChildren={hasChildren} />
                <TreeIcon hasChildren={hasChildren} icon={getLayerIcon(node)} />
                <TreeLabel className={`text-[12px] font-medium ${isSelected ? 'text-[var(--ui-text)]' : 'text-[var(--ui-text)]'}`}>
                    {node.label}
                </TreeLabel>
                <span className={`ml-2 shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] ${isSelected
                    ? 'border-[color:color-mix(in_srgb,var(--ui-primary)_24%,transparent)] bg-[color:color-mix(in_srgb,var(--ui-primary)_10%,transparent)] text-[var(--ui-text)]'
                    : 'border-[color:color-mix(in_srgb,var(--ui-border)_85%,transparent)] bg-[color:color-mix(in_srgb,var(--ui-surface-2)_92%,transparent)] text-[var(--ui-text-subtle)]'
                    }`}>
                    {node.tagName}
                </span>
            </TreeNodeTrigger>
            <TreeNodeContent hasChildren={hasChildren}>
                {node.children.map((child, index) => (
                    <LayerTreeNode
                        key={child.uid}
                        node={child}
                        level={level + 1}
                        isLast={index === node.children.length - 1}
                        parentPath={[...parentPath, isLast]}
                    />
                ))}
            </TreeNodeContent>
        </TreeNode>
    );
}

export function LayersPanel() {
    const { spec, updateScreen } = useDesignStore();
    const { setFocusNodeId } = useCanvasStore();
    const { isEditMode, screenId, selected, setActiveScreen } = useEditStore();
    const treeViewportRef = useRef<HTMLDivElement | null>(null);
    const [expandedIds, setExpandedIds] = useState<string[]>([]);

    const activeScreen = useMemo(() => {
        if (!spec || !screenId) return null;
        return spec.screens.find((s) => s.screenId === screenId) || null;
    }, [spec, screenId]);

    const tree = useMemo(() => {
        if (!activeScreen?.html) return [];
        return parseLayerTree(activeScreen.html);
    }, [activeScreen?.html]);

    useEffect(() => {
        setExpandedIds(getDefaultExpandedIds(tree, selected?.uid));
    }, [screenId, tree]);

    useEffect(() => {
        const selectedUid = selected?.uid;
        if (!selectedUid || tree.length === 0) return;

        const path = findPathToUid(tree, selectedUid);
        if (path.length === 0) return;

        setExpandedIds((prev) => Array.from(new Set([...prev, ...path.slice(0, -1)])));

        const attemptScroll = () => {
            const viewport = treeViewportRef.current;
            const selectedRow = treeViewportRef.current?.querySelector(`[data-tree-node-id="${selectedUid}"]`) as HTMLElement | null;
            if (!viewport || !selectedRow) return;

            const viewportRect = viewport.getBoundingClientRect();
            const rowRect = selectedRow.getBoundingClientRect();
            const rowCenter = rowRect.top - viewportRect.top + rowRect.height / 2;
            const viewportHeight = viewport.clientHeight;
            const centerBandStart = viewportHeight * 0.45;
            const centerBandEnd = viewportHeight * 0.55;

            if (rowCenter >= centerBandStart && rowCenter <= centerBandEnd) {
                return;
            }

            const targetScrollTop = viewport.scrollTop + rowCenter - viewportHeight / 2;
            viewport.scrollTo({
                top: Math.max(0, targetScrollTop),
                behavior: 'auto',
            });
        };

        const timerIds = [0, 90, 180, 320, 460].map((delay) =>
            window.setTimeout(attemptScroll, delay)
        );

        return () => {
            timerIds.forEach((timerId) => window.clearTimeout(timerId));
        };
    }, [selected?.uid, tree]);

    if (!isEditMode) return null;

    return (
        <aside className="layers-panel" data-guide-id="edit-layers-panel">
            <div className="flex h-full min-h-0 flex-col bg-[var(--ui-surface-1)] text-[var(--ui-text)]">
                <div className="border-b border-[var(--ui-border)] px-4 pb-4 pt-4">
                    <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--ui-text)]">
                        <Layers size={14} />
                        <span>Layers</span>
                    </div>
                    <p className="mt-1 text-[11px] text-[var(--ui-text-subtle)]">
                        Inspect the editable structure of the current screen.
                    </p>
                    <select
                        data-guide-id="edit-screen-selector"
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
                        className="mt-3 h-10 w-full rounded-xl border border-[color:color-mix(in_srgb,var(--ui-border)_92%,transparent)] bg-[var(--ui-surface-2)] px-3 text-[12px] text-[var(--ui-text)] outline-none transition-colors focus:border-[var(--ui-focus-border)]"
                    >
                        {(spec?.screens || []).map((screen) => (
                            <option key={screen.screenId} value={screen.screenId}>
                                {screen.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div
                    ref={treeViewportRef}
                    data-guide-id="edit-layer-tree"
                    className="min-h-0 flex-1 overflow-auto px-2 py-3"
                >
                    {tree.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-[color:color-mix(in_srgb,var(--ui-border)_88%,transparent)] bg-[color:color-mix(in_srgb,var(--ui-surface-2)_55%,transparent)] px-4 py-5 text-[12px] text-[var(--ui-text-subtle)]">
                            No editable structure found.
                        </div>
                    ) : (
                        <TreeProvider
                            expandedIds={expandedIds}
                            onExpandedChange={setExpandedIds}
                            selectedIds={selected?.uid ? [selected.uid] : []}
                            onSelectionChange={(nextSelection) => {
                                const nextUid = nextSelection[0];
                                if (!screenId || !nextUid) return;
                                dispatchSelectUid(screenId, nextUid);
                            }}
                            indent={18}
                            className="w-full"
                        >
                            <TreeView className="p-0">
                                {tree.map((node, index) => (
                                    <LayerTreeNode
                                        key={node.uid}
                                        node={node}
                                        level={0}
                                        isLast={index === tree.length - 1}
                                        parentPath={[]}
                                    />
                                ))}
                            </TreeView>
                        </TreeProvider>
                    )}
                </div>
            </div>
        </aside>
    );
}
