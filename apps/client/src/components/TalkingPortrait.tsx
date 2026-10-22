import { useEffect, useRef } from 'react';
import type { PersonVoice } from '@detektyw/shared';

/**
 * Portret, który „mówi”: dolna część twarzy (od linii ust do brody) to druga kopia zdjęcia,
 * przesuwana w dół – odsłania pod sobą ciemne wnętrze ust. Do tego oddech i lekki ruch głowy.
 * Rytm otwierania ust to sylaby (~4–5 na sekundę) z krótkim domknięciem na początku każdego słowa.
 */
export function TalkingPortrait({
  src,
  mouth,
  talking,
  word,
  size,
  label,
}: {
  src: string;
  mouth: PersonVoice['mouth'];
  talking: boolean;
  word: number;
  size: number;
  label: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const jaw = useRef<HTMLImageElement>(null);
  const live = useRef({ talking, wordAt: 0 });
  live.current.talking = talking;

  useEffect(() => {
    live.current.wordAt = performance.now();
  }, [word]);

  useEffect(() => {
    const reduce =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      document.documentElement.hasAttribute('data-reduce-motion');
    if (reduce) return;
    let frame = 0;
    let open = 0;
    let phase = 0;
    let amp = 0.8;
    let last = performance.now();
    const drop = size * mouth.w * 0.17;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      let target = 0;
      if (live.current.talking) {
        const prev = phase;
        phase += dt * Math.PI * 2 * 4.4;
        if (Math.floor(prev / Math.PI) !== Math.floor(phase / Math.PI))
          amp = 0.45 + Math.random() * 0.55;
        target = Math.abs(Math.sin(phase)) * amp;
        // granica słowa: usta na chwilę się domykają
        if (now - live.current.wordAt < 70) target *= 0.25;
      }
      open += (target - open) * Math.min(1, dt * 22);
      const t = now / 1000;
      const breathe = 1 + Math.sin((t * Math.PI * 2) / 4.2) * 0.006;
      const sway = live.current.talking ? Math.sin(t * 1.3) * 0.6 + Math.sin(t * 2.9) * 0.25 : 0;
      const nod = live.current.talking ? Math.sin(t * 2.1) * size * 0.003 : 0;
      if (wrap.current)
        wrap.current.style.transform = `translateY(${nod.toFixed(2)}px) rotate(${sway.toFixed(2)}deg) scale(${breathe.toFixed(4)})`;
      if (jaw.current) jaw.current.style.transform = `translateY(${(open * drop).toFixed(2)}px)`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [mouth.w, size]);

  const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
  const jawMask = `radial-gradient(ellipse ${pct(mouth.w * 1.25)} ${pct(mouth.chin * 1.25)} at ${pct(mouth.x)} ${pct(mouth.y)}, #000 62%, transparent 100%)`;
  return (
    <div
      className="talking-frame"
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    >
      <div className="talking" ref={wrap}>
        <img src={src} alt="" draggable={false} />
        <span
          className="talking-mouth"
          style={{
            left: pct(mouth.x - mouth.w * 0.36),
            top: pct(mouth.y - mouth.w * 0.04),
            width: pct(mouth.w * 0.72),
            height: pct(mouth.w * 0.34),
          }}
        />
        <img
          ref={jaw}
          src={src}
          alt=""
          draggable={false}
          className="talking-jaw"
          style={{
            clipPath: `inset(${pct(mouth.y)} 0 0 0)`,
            WebkitMaskImage: jawMask,
            maskImage: jawMask,
          }}
        />
      </div>
    </div>
  );
}
