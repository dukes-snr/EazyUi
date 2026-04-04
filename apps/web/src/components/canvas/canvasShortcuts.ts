export type CanvasShortcutItem = {
    label: string;
    keys: string[];
    description: string;
};

export type CanvasShortcutGroup = {
    id: string;
    title: string;
    items: CanvasShortcutItem[];
};

export const CANVAS_DOCK_SHORTCUTS = {
    select: ['1'],
    hand: ['2'],
    undo: ['Ctrl/Cmd+Z'],
    redo: ['Ctrl/Cmd+Shift+Z', 'Ctrl/Cmd+Y'],
    zoomOut: ['Ctrl/Cmd+-'],
    zoomIn: ['Ctrl/Cmd++'],
    fit: ['Ctrl/Cmd+0'],
    help: ['?'],
} as const;

export const CANVAS_SHORTCUT_GROUPS: CanvasShortcutGroup[] = [
    {
        id: 'dock',
        title: 'Dock Tools',
        items: [
            { label: 'Select tool', keys: [...CANVAS_DOCK_SHORTCUTS.select], description: 'Switch to selection mode.' },
            { label: 'Pan tool', keys: [...CANVAS_DOCK_SHORTCUTS.hand], description: 'Switch to hand/pan mode.' },
            { label: 'Undo', keys: [...CANVAS_DOCK_SHORTCUTS.undo], description: 'Step back through canvas history.' },
            { label: 'Redo', keys: [...CANVAS_DOCK_SHORTCUTS.redo], description: 'Step forward through canvas history.' },
            { label: 'Zoom out', keys: [...CANVAS_DOCK_SHORTCUTS.zoomOut], description: 'Reduce canvas zoom.' },
            { label: 'Zoom in', keys: [...CANVAS_DOCK_SHORTCUTS.zoomIn], description: 'Increase canvas zoom.' },
            { label: 'Fit to screen', keys: [...CANVAS_DOCK_SHORTCUTS.fit], description: 'Fit active screens into view.' },
            { label: 'Help & shortcuts', keys: [...CANVAS_DOCK_SHORTCUTS.help], description: 'Open the shortcuts popup from anywhere on canvas.' },
        ],
    },
    {
        id: 'canvas',
        title: 'Canvas Actions',
        items: [
            { label: 'Focus selected screens', keys: ['F'], description: 'Center the current selection.' },
            { label: 'Select all screens', keys: ['Ctrl/Cmd+A'], description: 'Select every screen on the canvas.' },
            { label: 'Copy selected screens', keys: ['Ctrl/Cmd+C'], description: 'Copy the current screen selection.' },
            { label: 'Paste screens', keys: ['Ctrl/Cmd+V'], description: 'Paste copied screens onto the canvas.' },
            { label: 'Duplicate selected screens', keys: ['Ctrl/Cmd+D'], description: 'Duplicate the current selection.' },
            { label: 'Delete selected screens', keys: ['Delete', 'Backspace'], description: 'Remove selected screens.' },
            { label: 'Clear selection / exit edit mode', keys: ['Esc'], description: 'Clear the current selection or exit edit mode.' },
            { label: 'Nudge selection', keys: ['Arrow keys'], description: 'Move selected screens by 1px.' },
            { label: 'Nudge selection faster', keys: ['Shift + Arrow keys'], description: 'Move selected screens by 10px.' },
            { label: 'Temporary pan', keys: ['Hold Space'], description: 'Pan while in select mode without switching tools.' },
        ],
    },
    {
        id: 'edit-mode',
        title: 'Edit Mode',
        items: [
            { label: 'Undo element edits', keys: ['Ctrl/Cmd+Z'], description: 'Undo the last patch on the active screen.' },
            { label: 'Redo element edits', keys: ['Ctrl/Cmd+Shift+Z', 'Ctrl/Cmd+Y'], description: 'Redo the next patch on the active screen.' },
            { label: 'Delete selected element', keys: ['Delete', 'Backspace'], description: 'Remove the selected DOM element.' },
            { label: 'Deselect element / exit edit', keys: ['Esc'], description: 'Clear element selection, then exit edit mode.' },
        ],
    },
];

export function formatShortcutKeys(keys: string[]) {
    return keys.join(' / ');
}

