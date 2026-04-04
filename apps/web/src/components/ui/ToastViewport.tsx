import { GooeyToaster } from 'goey-toast';
import { CanvasHelp } from '../canvas/CanvasHelp';
import { useUiStore } from '../../stores';

export function ToastViewport() {
    const { theme } = useUiStore();

    return (
        <>
            <GooeyToaster
                position="bottom-left"
                offset="20px"
                gap={12}
                theme={theme}
                visibleToasts={5}
                spring
                bounce={0.34}
                closeOnEscape
                swipeToDismiss
            />
            <div className="eazy-help-fab">
                <CanvasHelp />
            </div>
        </>
    );
}
