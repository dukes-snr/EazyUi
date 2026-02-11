import { parse, serialize } from 'parse5';

export type HtmlPatch =
    | { op: 'set_text'; uid: string; text: string }
    | { op: 'set_style'; uid: string; style: Record<string, string> }
    | { op: 'set_attr'; uid: string; attr: Record<string, string> }
    | { op: 'set_classes'; uid: string; add?: string[]; remove?: string[] };

type Node = any;

function getAttr(node: Node, name: string): string | null {
    const attr = node.attrs?.find((a: any) => a.name === name);
    return attr ? attr.value : null;
}

function setAttr(node: Node, name: string, value: string) {
    if (!node.attrs) node.attrs = [];
    const existing = node.attrs.find((a: any) => a.name === name);
    if (existing) {
        existing.value = value;
    } else {
        node.attrs.push({ name, value });
    }
}

function hasAttr(node: Node, name: string) {
    return !!node.attrs?.some((a: any) => a.name === name);
}

function findByUid(node: Node, uid: string): Node | null {
    if (node.nodeName && getAttr(node, 'data-uid') === uid) return node;
    if (node.childNodes) {
        for (const child of node.childNodes) {
            const found = findByUid(child, uid);
            if (found) return found;
        }
    }
    return null;
}

function updateText(node: Node, text: string) {
    node.childNodes = [
        {
            nodeName: '#text',
            value: text,
            parentNode: node
        }
    ];
}

function parseStyle(styleText: string) {
    const entries = styleText
        .split(';')
        .map(s => s.trim())
        .filter(Boolean)
        .map(s => s.split(':').map(p => p.trim()));
    const map: Record<string, string> = {};
    for (const [k, v] of entries) {
        if (k && v) map[k] = v;
    }
    return map;
}

function toStyleText(style: Record<string, string>) {
    return Object.entries(style)
        .map(([k, v]) => `${k}: ${v}`)
        .join('; ');
}

const EDITABLE_TAGS = new Set([
    'html', 'body',
    'header', 'nav', 'main', 'section', 'article', 'aside', 'footer',
    'div', 'p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'button', 'a', 'img', 'input', 'textarea', 'select', 'label',
    'ul', 'ol', 'li', 'figure', 'figcaption', 'form', 'table', 'thead',
    'tbody', 'tr', 'td', 'th',
]);

function createUidFactory(existing: Set<string>) {
    let counter = 0;
    return () => {
        let uid = '';
        do {
            uid = `uid_${Date.now().toString(36)}_${(counter++).toString(36)}`;
        } while (existing.has(uid));
        existing.add(uid);
        return uid;
    };
}

function collectExistingUids(node: Node, set: Set<string>) {
    const uid = getAttr(node, 'data-uid');
    if (uid) set.add(uid);
    if (node.childNodes) {
        for (const child of node.childNodes) {
            collectExistingUids(child, set);
        }
    }
}

function addEditableAttrs(node: Node, inHead: boolean, createUid: () => string) {
    if (inHead) {
        return;
    }
    if (node.nodeName && EDITABLE_TAGS.has(node.nodeName)) {
        if (!hasAttr(node, 'data-editable')) {
            setAttr(node, 'data-editable', 'true');
        }
        if (!hasAttr(node, 'data-uid')) {
            setAttr(node, 'data-uid', createUid());
        }
        if (node.nodeName === 'body' && !hasAttr(node, 'data-screen-root')) {
            setAttr(node, 'data-screen-root', 'true');
        }
    }
}

function walk(node: Node, inHead: boolean, createUid: () => string) {
    const nextInHead = inHead || node.nodeName === 'head';
    if (node.nodeName && node.nodeName !== '#text' && node.nodeName !== '#document') {
        addEditableAttrs(node, nextInHead, createUid);
    }
    if (node.childNodes) {
        for (const child of node.childNodes) {
            walk(child, nextInHead, createUid);
        }
    }
}

export function ensureEditableUids(html: string): string {
    const doc = parse(html);
    const existing = new Set<string>();
    collectExistingUids(doc, existing);
    const createUid = createUidFactory(existing);
    walk(doc, false, createUid);
    return serialize(doc);
}

export function applyPatchToHtml(html: string, patch: HtmlPatch): string {
    const doc = parse(html);
    const target = findByUid(doc, patch.uid);
    if (!target) return html;

    if (patch.op === 'set_text') {
        updateText(target, patch.text);
    }

    if (patch.op === 'set_style') {
        const current = parseStyle(getAttr(target, 'style') || '');
        const next = { ...current, ...patch.style };
        setAttr(target, 'style', toStyleText(next));
    }

    if (patch.op === 'set_attr') {
        Object.entries(patch.attr).forEach(([key, value]) => {
            setAttr(target, key, value);
        });
    }

    if (patch.op === 'set_classes') {
        const current = (getAttr(target, 'class') || '').split(/\s+/).filter(Boolean);
        const remove = patch.remove || [];
        const add = patch.add || [];
        const filtered = current.filter(c => !remove.includes(c));
        const next = Array.from(new Set([...filtered, ...add]));
        setAttr(target, 'class', next.join(' '));
    }

    return serialize(doc);
}
