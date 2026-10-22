import { useEffect, useRef } from 'react';

/**
 * Animowana postać: dwie zapętlone animacje w tym samym kadrze – cisza i mówienie.
 * Podczas mówienia widać pętlę mówienia, potem płynny powrót do ciszy.
 */
export function VideoAvatar({
  idle,
  talk,
  poster,
  talking,
  size,
  label,
}: {
  idle: string;
  talk: string;
  poster?: string;
  talking: boolean;
  size: number;
  label: string;
}) {
  const talkRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = talkRef.current;
    if (!v) return;
    if (talking) {
      // każda wypowiedź od początku pętli mówienia (usta zaczynają się ruszać razem z głosem)
      v.currentTime = 0;
      void v.play().catch(() => undefined);
    } else {
      const t = window.setTimeout(() => v.pause(), 300);
      return () => window.clearTimeout(t);
    }
  }, [talking]);

  return (
    <div
      className="talking-frame video-avatar"
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    >
      <video src={idle} poster={poster} muted loop playsInline autoPlay preload="auto" />
      <video
        ref={talkRef}
        src={talk}
        muted
        loop
        playsInline
        preload="auto"
        className={talking ? 'on' : undefined}
      />
    </div>
  );
}
