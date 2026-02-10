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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useDesignStore, useCanvasStore } from '../../stores';
import { DeviceNode } from './DeviceNode';

// Define custom node types
const nodeTypes = {
    device: DeviceNode,
};

// Inner component to use React Flow hooks if needed
function CanvasWorkspaceContent() {
    const { spec } = useDesignStore();
    const { doc, isSpacePressed, selectNodes, updateBoardPosition } = useCanvasStore();

    // Initialize nodes from doc.boards and spec.screens
    // We use internal React Flow state for performance, but sync back to store
    const initialNodes = useMemo(() => {
        if (!spec) return [];

        return spec.screens.map((screen, index) => {
            // Find existing board position or default
            const board = doc.boards.find(b => b.screenId === screen.screenId) || {
                boardId: screen.screenId,
                x: index * (screen.width + 100),
                y: 0
            };

            return {
                id: screen.screenId,
                type: 'device',
                position: { x: board.x, y: board.y },
                data: {
                    html: screen.html,
                    label: screen.name,
                    width: screen.width,
                    height: screen.height,
                    status: screen.status,
                },
                // Add selected state if needed, though React Flow handles it
                selected: doc.selection.selectedNodeIds.includes(screen.screenId) || doc.selection.selectedBoardId === screen.screenId,
            } as Node;
        });
    }, [spec, doc.boards, doc.selection.selectedNodeIds, doc.selection.selectedBoardId]);

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, , onEdgesChange] = useEdgesState([]);

    // Update nodes when spec changes (e.g. new generation)
    useEffect(() => {
        setNodes(initialNodes);
    }, [initialNodes, setNodes]);

    // Handle node changes (dragging, selection)
    const handleNodesChange = useCallback(
        (changes: NodeChange[]) => {
            onNodesChange(changes);

            changes.forEach((change) => {
                // Sync dragging changes back to store
                if (change.type === 'position' && change.position) {
                    // Update store for this node
                    updateBoardPosition(change.id, change.position.x, change.position.y);
                }
            });
        },
        [onNodesChange, updateBoardPosition]
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

    return (
        <div className="canvas-workspace">
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
                className="bg-slate-950"
                minZoom={0.1}
                maxZoom={2}
                // Toggle drag/select behavior based on Space key (Figma style)
                panOnDrag={isSpacePressed}
                selectionOnDrag={!isSpacePressed}
                selectionMode={!isSpacePressed ? SelectionMode.Partial : undefined}
            >
                <Background
                    variant={BackgroundVariant.Dots}
                    gap={20}
                    size={1}
                    color="#334155"
                />
                <Controls
                    className="canvas-controls-custom"
                />
            </ReactFlow>
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
