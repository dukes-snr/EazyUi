// ============================================================================
// Canvas Workspace Component - Interactive React Flow Canvas
// ============================================================================

import { useMemo, useCallback, useEffect } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    Node,
    useNodesState,
    useEdgesState,
    ReactFlowProvider,
    NodeChange,
    BackgroundVariant,
    SelectionMode,
    useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useDesignStore, useCanvasStore, useEditStore, useChatStore, useHistoryStore } from '../../stores';
import { DeviceNode } from './DeviceNode';
import { CanvasToolbar } from './CanvasToolbar';
import { MultiSelectToolbar } from './MultiSelectToolbar';

// Define custom node types
const nodeTypes = {
    device: DeviceNode,
};

// Inner component to use React Flow hooks if needed
function CanvasWorkspaceContent() {
    const { spec } = useDesignStore();
    const { doc, selectNodes, updateBoardPosition, focusNodeId, setFocusNodeId, focusNodeIds, setFocusNodeIds, lastExternalUpdate } = useCanvasStore();
    const { isEditMode } = useEditStore();
    const { isGenerating } = useChatStore();
    const { recordSnapshot } = useHistoryStore();
    const { setCenter, fitView } = useReactFlow();

    // Initialize nodes from doc.boards and spec.screens
    const initialNodes = useMemo(() => {
        if (!spec) return [];

        // Map based on boards to respect arrangement order
        return doc.boards.map((board) => {
            const screen = spec.screens.find(s => s.screenId === board.screenId);
            if (!screen) return null;

            return {
                id: screen.screenId,
                type: 'device',
                position: { x: board.x, y: board.y },
                data: {
                    screenId: screen.screenId,
                    html: screen.html,
                    label: screen.name,
                    width: screen.width,
                    height: screen.height,
                    status: screen.status,
                },
                selected: doc.selection.selectedNodeIds.includes(screen.screenId) || doc.selection.selectedBoardId === screen.screenId,
            } as Node;
        }).filter(Boolean) as Node[];
    }, [spec, doc.boards]); // Remove selection from here to avoid re-renders on selection

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, , onEdgesChange] = useEdgesState([]);

    // Handle focusing from chat
    useEffect(() => {
        if (focusNodeId) {
            // Find the node in the current React Flow state
            const targetNode = nodes.find(n => n.id === focusNodeId);

            if (targetNode) {
                // Calculate center of the node
                const width = targetNode.measured?.width ?? (targetNode.data?.width as number) ?? 375;
                const height = targetNode.measured?.height ?? (targetNode.data?.height as number) ?? 812;

                const centerX = targetNode.position.x + width / 2;
                const centerY = targetNode.position.y + height / 2;

                setCenter(centerX, centerY, {
                    zoom: 1,
                    duration: 800
                });

                // Also select it to give visual feedback
                selectNodes([focusNodeId]);
                // Reset focus ID only after successful focus
                setFocusNodeId(null);
            }
        }
    }, [focusNodeId, setCenter, setFocusNodeId, nodes, selectNodes]);

    // Handle focusing a group of nodes from chat/edit flows
    useEffect(() => {
        if (!focusNodeIds || focusNodeIds.length === 0) return;
        const existing = focusNodeIds.filter(id => nodes.some(n => n.id === id));
        if (!existing.length) {
            setFocusNodeIds(null);
            return;
        }

        fitView({
            nodes: existing.map((id) => ({ id })),
            padding: 0.2,
            duration: 900,
            maxZoom: 1.1,
        });
        selectNodes(existing);
        setFocusNodeIds(null);
    }, [focusNodeIds, fitView, nodes, selectNodes, setFocusNodeIds]);

    // Update nodes when structure or selection changes
    // But avoid resetting positions while users are interacting via React Flow
    // Sync selection state separately to avoid full node resets
    useEffect(() => {
        setNodes(nds => nds.map(n => ({
            ...n,
            selected: doc.selection.selectedNodeIds.includes(n.id) || doc.selection.selectedBoardId === n.id
        })));
    }, [doc.selection.selectedNodeIds, doc.selection.selectedBoardId, setNodes]);

    // Sync node data when spec content changes without resetting positions
    useEffect(() => {
        if (!spec) return;
        setNodes(nds => nds.map(n => {
            const screen = spec.screens.find(s => s.screenId === n.id);
            if (!screen) return n;

            const nextData = {
                ...(n.data || {}),
                screenId: screen.screenId,
                html: screen.html,
                label: screen.name,
                width: screen.width,
                height: screen.height,
                status: screen.status,
            };

            return {
                ...n,
                data: nextData,
            };
        }));
    }, [spec, setNodes]);

    // Update nodes when structure changes or external update is triggered
    useEffect(() => {
        const currentIds = nodes.map(n => n.id).join(',');
        const targetIds = initialNodes.map(n => n.id).join(',');
        const hasStructureChange = currentIds !== targetIds;

        // If structure changed or alignment tool was used, we MUST reset nodes
        if (hasStructureChange || lastExternalUpdate) {
            // Apply current positions from doc.boards as well
            const syncedNodes = initialNodes.map(n => {
                const board = doc.boards.find(b => b.screenId === n.id);
                return board ? { ...n, position: { x: board.x, y: board.y } } : n;
            });
            setNodes(syncedNodes);
        }
    }, [initialNodes, setNodes, lastExternalUpdate]); // lastExternalUpdate is key here

    // Global history capture for canvas + design.
    // Skip while generation/edit is running to avoid noisy intermediate states.
    useEffect(() => {
        if (isGenerating) return;
        recordSnapshot({
            spec: spec ? JSON.parse(JSON.stringify(spec)) : null,
            doc: JSON.parse(JSON.stringify(doc)),
        });
    }, [spec, doc, isGenerating, recordSnapshot]);

    // Handle node changes (dragging, selection)
    const handleNodesChange = useCallback(
        (changes: NodeChange[]) => {
            onNodesChange(changes);
        },
        [onNodesChange]
    );

    // Sync React Flow selection to store
    const onSelectionChange = useCallback(({ nodes }: { nodes: Node[] }) => {
        selectNodes(nodes.map((n) => n.id));
    }, [selectNodes]);

    const onNodeDragStop = useCallback((_: React.MouseEvent, node: Node) => {
        updateBoardPosition(node.id, node.position.x, node.position.y);
    }, [updateBoardPosition]);

    const onPaneClick = useCallback(() => {
        selectNodes([]);
    }, [selectNodes]);

    // Derived props based on active tool
    const { activeTool } = useCanvasStore();

    // Select Tool: Selection Box on drag (pan with Space via panActivationKeyCode)
    // Hand Tool: Pan on drag
    const panOnDrag = activeTool === 'hand' ? true : [1, 2]; // Middle/Right click always pans
    const selectionOnDrag = activeTool === 'select';
    const panActivationKeyCode = activeTool === 'select' ? 'Space' : undefined;

    return (
        <div className="canvas-workspace relative h-full w-full">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={handleNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeDragStop={onNodeDragStop}
                onPaneClick={onPaneClick}
                onSelectionChange={onSelectionChange}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
                className="canvas-gallery-bg"
                minZoom={0.05}
                maxZoom={2}

                // Interaction Logic
                panOnDrag={panOnDrag}
                panActivationKeyCode={panActivationKeyCode}
                selectionOnDrag={selectionOnDrag}
                selectionKeyCode={null} // Disable modifier key requirement for selection when in Select mode
                selectionMode={SelectionMode.Partial}

                // Scroll to zoom
                zoomOnScroll={true}
                zoomOnDoubleClick={false}
                panOnScroll={false}

                // Constraints
                translateExtent={[[-Infinity, -Infinity], [Infinity, Infinity]]}
                nodesDraggable={!isEditMode && activeTool === 'select'} // Disable dragging while editing
            >
                <Background
                    variant={BackgroundVariant.Dots}
                    gap={20}
                    size={1}
                    color="#2a313b"
                />
                <Controls
                    className="canvas-controls-hidden hidden" // Hide default controls
                    showZoom={false}
                    showFitView={false}
                    showInteractive={false}
                />
            </ReactFlow>

            <CanvasToolbar />

            {/* Multi-Selection Toolbar */}
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
                <MultiSelectToolbar />
            </div>
        </div>
    );
}

export function CanvasWorkspace() {
    return (
        <ReactFlowProvider>
            <CanvasWorkspaceContent />
        </ReactFlowProvider>
    );
}
