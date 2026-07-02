import { useEffect, useRef } from 'react';
import { makeAnimal, type AnimalController, type AnimalKind, type Mode } from '../engine/pixelpals';

interface PixelPalProps {
  sprite: AnimalKind;
  mode: Mode;
  scale?: number;
  /** CSS render size in px (square). */
  size: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Renders a pixel-art animal on a <canvas> and keeps its behaviour in sync
 * with the `mode` prop. The controller is created once per mount; mode changes
 * flow through `setMode` so the animation transitions cleanly.
 */
export function PixelPal({ sprite, mode, scale = 7, size, className, style }: PixelPalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctrlRef = useRef<AnimalController | null>(null);

  // Recreate the controller when the sprite or scale changes.
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctrl = makeAnimal(cv, { sprite, scale, mode });
    ctrlRef.current = ctrl;
    return () => {
      ctrl.destroy();
      ctrlRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sprite, scale]);

  // Push mode changes to the live controller.
  useEffect(() => {
    ctrlRef.current?.setMode(mode);
  }, [mode]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        width: size,
        height: size,
        imageRendering: 'pixelated',
        ...style,
      }}
    />
  );
}
