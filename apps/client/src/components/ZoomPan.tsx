import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  src: string;
  alt: string;
  aspect: number; // wysokość / szerokość
  /** Dotknięcie bez przesuwania: współrzędne 0–1 względem obrazu oraz bieżące przybliżenie. */
  onTap?: (x: number, y: number, zoom: number) => void;
  overlay?: ReactNode;
  maxZoom?: number;
}

/** Podgląd obrazu z przybliżaniem (szczypanie, kółko, przyciski, dwuklik) i przesuwaniem. */
export function ZoomPan({ src, alt, aspect, onTap, overlay, maxZoom = 5 }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    moved: boolean;
    startDist?: number;
    startZoom?: number;
    last?: { x: number; y: number };
  }>({ moved: false });

  const clampPan = useCallback((p: { x: number; y: number }, z: number) => {
    const el = box.current;
    if (!el) return p;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const maxX = (w * (z - 1)) / 2;
    const maxY = (h * (z - 1)) / 2;
    return { x: Math.max(-maxX, Math.min(maxX, p.x)), y: Math.max(-maxY, Math.min(maxY, p.y)) };
  }, []);

  const setZoomAt = useCallback(
    (z: number) => {
      const nz = Math.max(1, Math.min(maxZoom, z));
      setZoom(nz);
      setPan((p) => clampPan({ x: (p.x * nz) / zoom, y: (p.y * nz) / zoom }, nz));
    },
    [zoom, maxZoom, clampPan],
  );

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoomAt(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoom, setZoomAt]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1)
      gesture.current = { moved: false, last: { x: e.clientX, y: e.clientY } };
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        moved: true,
        startDist: Math.hypot(a!.x - b!.x, a!.y - b!.y),
        startZoom: zoom,
      };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (pointers.current.size === 2 && g.startDist) {
      const [a, b] = [...pointers.current.values()];
      setZoomAt((g.startZoom ?? 1) * (Math.hypot(a!.x - b!.x, a!.y - b!.y) / g.startDist));
    } else if (pointers.current.size === 1 && g.last) {
      const dx = e.clientX - g.last.x;
      const dy = e.clientY - g.last.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) g.moved = true;
      g.last = { x: e.clientX, y: e.clientY };
      if (zoom > 1) setPan((p) => clampPan({ x: p.x + dx, y: p.y + dy }, zoom));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const wasSingle = pointers.current.size === 1;
    pointers.current.delete(e.pointerId);
    if (wasSingle && !gesture.current.moved && onTap && box.current) {
      const r = box.current.getBoundingClientRect();
      // Odwrócenie transformacji: środek + przesunięcie, skala.
      const cx = r.width / 2;
      const cy = r.height / 2;
      const px = (e.clientX - r.left - cx - pan.x) / zoom + cx;
      const py = (e.clientY - r.top - cy - pan.y) / zoom + cy;
      const x = px / r.width;
      const y = py / r.height;
      if (x >= 0 && x <= 1 && y >= 0 && y <= 1) onTap(x, y, zoom);
    }
  };

  return (
    <div className="zoompan">
      <div
        ref={box}
        className="zoompan-box"
        style={{ aspectRatio: `${1 / aspect}` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
        onDoubleClick={() => setZoomAt(zoom >= 2.5 ? 1 : zoom * 2)}
      >
        <div
          className="zoompan-layer"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          <img src={src} alt={alt} draggable={false} />
          {overlay}
        </div>
      </div>
      <div className="zoompan-controls">
        <button
          className="icon"
          onClick={() => setZoomAt(zoom / 1.5)}
          aria-label="Oddal"
          disabled={zoom <= 1}
        >
          −
        </button>
        <span className="small muted" aria-live="polite">
          {Math.round(zoom * 100)}%
        </span>
        <button
          className="icon"
          onClick={() => setZoomAt(zoom * 1.5)}
          aria-label="Przybliż"
          disabled={zoom >= maxZoom}
        >
          +
        </button>
        <button
          className="icon"
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          aria-label="Widok całości"
        >
          ⤢
        </button>
      </div>
    </div>
  );
}
