import { useEffect, useRef, type ComponentProps } from 'react';
import * as THREE from 'three';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores';

type DottedSurfaceProps = Omit<ComponentProps<'div'>, 'ref'>;

type DottedSurfaceScene = {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    points: THREE.Points;
    geometry: THREE.BufferGeometry;
    material: THREE.PointsMaterial;
};

export function DottedSurface({ className, children, ...props }: DottedSurfaceProps) {
    const theme = useUiStore((state) => state.theme);
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<DottedSurfaceScene | null>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const SEPARATION = 150;
        const AMOUNTX = 40;
        const AMOUNTY = 60;
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const fogColor = new THREE.Color(theme === 'dark' ? '#07111d' : '#f8fbff');
        const dotColor = new THREE.Color(theme === 'dark' ? '#d8e4f5' : '#0f172a');

        const scene = new THREE.Scene();
        scene.fog = new THREE.Fog(fogColor, 2000, 10000);

        const initialWidth = Math.max(container.clientWidth, 1);
        const initialHeight = Math.max(container.clientHeight, 1);
        const camera = new THREE.PerspectiveCamera(60, initialWidth / initialHeight, 1, 10000);
        camera.position.set(0, 355, 1220);

        const renderer = new THREE.WebGLRenderer({
            alpha: true,
            antialias: true,
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(initialWidth, initialHeight, false);
        renderer.setClearColor(fogColor, 0);
        container.appendChild(renderer.domElement);

        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(AMOUNTX * AMOUNTY * 3);
        const colors = new Float32Array(AMOUNTX * AMOUNTY * 3);

        let pointer = 0;
        for (let ix = 0; ix < AMOUNTX; ix++) {
            for (let iy = 0; iy < AMOUNTY; iy++) {
                const x = ix * SEPARATION - (AMOUNTX * SEPARATION) / 2;
                const z = iy * SEPARATION - (AMOUNTY * SEPARATION) / 2;

                positions[pointer] = x;
                positions[pointer + 1] = 0;
                positions[pointer + 2] = z;

                colors[pointer] = dotColor.r;
                colors[pointer + 1] = dotColor.g;
                colors[pointer + 2] = dotColor.b;
                pointer += 3;
            }
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: theme === 'dark' ? 8 : 7,
            vertexColors: true,
            transparent: true,
            opacity: theme === 'dark' ? 0.8 : 0.7,
            sizeAttenuation: true,
        });

        const points = new THREE.Points(geometry, material);
        scene.add(points);

        let count = 0;
        let animationId = 0;

        const resize = () => {
            const width = Math.max(container.clientWidth, 1);
            const height = Math.max(container.clientHeight, 1);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height, false);
        };

        const animate = () => {
            animationId = window.requestAnimationFrame(animate);

            const positionAttribute = geometry.attributes.position as THREE.BufferAttribute;
            const array = positionAttribute.array as Float32Array;

            let index = 0;
            for (let ix = 0; ix < AMOUNTX; ix++) {
                for (let iy = 0; iy < AMOUNTY; iy++) {
                    array[(index * 3) + 1] = prefersReducedMotion
                        ? 0
                        : (Math.sin((ix + count) * 0.3) * 50) + (Math.sin((iy + count) * 0.5) * 50);
                    index += 1;
                }
            }

            positionAttribute.needsUpdate = true;
            renderer.render(scene, camera);
            count += prefersReducedMotion ? 0.02 : 0.1;
        };

        const resizeObserver = new ResizeObserver(() => resize());
        resizeObserver.observe(container);
        animate();

        sceneRef.current = {
            scene,
            camera,
            renderer,
            points,
            geometry,
            material,
        };

        return () => {
            resizeObserver.disconnect();

            if (!sceneRef.current) return;

            window.cancelAnimationFrame(animationId);
            sceneRef.current.geometry.dispose();
            sceneRef.current.material.dispose();
            sceneRef.current.scene.remove(sceneRef.current.points);
            sceneRef.current.renderer.dispose();

            if (container.contains(sceneRef.current.renderer.domElement)) {
                container.removeChild(sceneRef.current.renderer.domElement);
            }

            sceneRef.current = null;
        };
    }, [theme]);

    return (
        <div
            ref={containerRef}
            className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
            {...props}
        >
            {children}
        </div>
    );
}
