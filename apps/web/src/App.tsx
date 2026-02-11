// ============================================================================
// Main App Component
// ============================================================================

import { useEffect } from 'react';
import { ChatPanel } from './components/chat/ChatPanel';
import { CanvasWorkspace } from './components/canvas/CanvasWorkspace';
import { EditPanel } from './components/edit/EditPanel';

import { useDesignStore, useCanvasStore, useEditStore } from './stores';

import './styles/App.css';

function App() {
    const { spec, reset: resetDesign } = useDesignStore();
    const { isEditMode } = useEditStore();


    // Initialize with empty state
    useEffect(() => {
        if (!spec) {
            resetDesign();
        }
    }, [spec, resetDesign]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {


            // Space for panning
            if (e.code === 'Space' && !e.repeat) {
                useCanvasStore.getState().setSpacePressed(true);
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                useCanvasStore.getState().setSpacePressed(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    return (
        <div className={`app-layout ${isEditMode ? 'edit-mode' : ''}`}>
            <ChatPanel />
            <CanvasWorkspace />
            <EditPanel />
        </div>
    );
}

export default App;
