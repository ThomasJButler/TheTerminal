import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Phosphor, Scene } from './Scene';

export interface SceneHandle {
  enter: (onGlass: () => void) => Promise<void>;
  exit: () => Promise<void>;
  burst: () => void;
}

interface Props {
  /** The mode to start in. Later changes go through the handle, which animates them. */
  initialMode: 'attract' | 'inside';
  phosphor: Phosphor;
  rain: boolean;
  onReady: () => void;
  onUnavailable: () => void;
}

/**
 * The canvas and the lifetime of the scene on it. three.js is imported here, dynamically,
 * so it is its own chunk and the terminal never waits for it.
 */
export const SceneLayer = forwardRef<SceneHandle, Props>(function SceneLayer(
  { initialMode, phosphor, rain, onReady, onUnavailable },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const [ready, setReady] = useState(false);
  const callbacks = useRef({ onReady, onUnavailable });
  callbacks.current = { onReady, onUnavailable };
  const initial = useRef({ initialMode, phosphor, rain });

  useEffect(() => {
    let cancelled = false;
    import('./Scene')
      .then(({ Scene }) => {
        if (cancelled || !canvasRef.current) return;
        const scene = new Scene(canvasRef.current, {
          mode: initial.current.initialMode,
          phosphor: initial.current.phosphor,
        });
        scene.setRain(initial.current.rain);
        sceneRef.current = scene;
        setReady(true);
        callbacks.current.onReady();
      })
      .catch(() => !cancelled && callbacks.current.onUnavailable());
    return () => {
      cancelled = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => sceneRef.current?.setPhosphor(phosphor), [phosphor, ready]);
  useEffect(() => sceneRef.current?.setRain(rain), [rain, ready]);

  useImperativeHandle(ref, () => ({
    enter: (onGlass) => sceneRef.current?.enter(onGlass) ?? (onGlass(), Promise.resolve()),
    exit: () => sceneRef.current?.exit() ?? Promise.resolve(),
    burst: () => sceneRef.current?.burst(),
  }));

  return <canvas ref={canvasRef} className="scene" data-ready={ready ? '' : undefined} aria-hidden="true" />;
});
