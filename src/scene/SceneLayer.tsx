import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { DemoVisual, Phosphor, Scene } from './Scene';

export interface SceneHandle {
  enter: (onGlass: () => void) => Promise<void>;
  exit: () => Promise<void>;
  burst: () => void;
  /** Send a gate down the demo's road. */
  gate: () => void;
  /** Tell the demo which shot the film has cut to. */
  cut: (index: number) => void;
}

interface Props {
  /** The mode to start in. Later changes go through the handle, which animates them. */
  initialMode: 'attract' | 'inside';
  phosphor: Phosphor;
  rain: boolean;
  /** What the demo is showing, or null when it does not have the screen. */
  demo: DemoVisual | null;
  /** The music's beat, for the demo to move to. */
  beat: () => number | null;
  onReady: () => void;
  onUnavailable: () => void;
}

/**
 * The canvas and the lifetime of the scene on it. three.js is imported here, dynamically,
 * so it is its own chunk and the terminal never waits for it.
 */
export const SceneLayer = forwardRef<SceneHandle, Props>(function SceneLayer(
  { initialMode, phosphor, rain, demo, beat, onReady, onUnavailable },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const [ready, setReady] = useState(false);
  const callbacks = useRef({ onReady, onUnavailable });
  callbacks.current = { onReady, onUnavailable };
  const initial = useRef({ initialMode, phosphor, rain, beat });

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
        scene.setBeat(initial.current.beat);
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
  useEffect(() => sceneRef.current?.setDemo(demo), [demo, ready]);

  useImperativeHandle(ref, () => ({
    enter: (onGlass) => sceneRef.current?.enter(onGlass) ?? (onGlass(), Promise.resolve()),
    exit: () => sceneRef.current?.exit() ?? Promise.resolve(),
    burst: () => sceneRef.current?.burst(),
    gate: () => sceneRef.current?.gate(),
    cut: (index) => sceneRef.current?.cut(index),
  }));

  return <canvas ref={canvasRef} className="scene" data-ready={ready ? '' : undefined} aria-hidden="true" />;
});
