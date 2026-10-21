import { useEffect, useRef, useState } from 'react';
import type { HotspotView, MaterialView } from '@detektyw/shared';
import { MATERIAL_TYPES, useGame } from '../../lib/game';
import { MiniMarkdown } from '../../components/MiniMarkdown';
import { ZoomPan } from '../../components/ZoomPan';
import { useToasts } from '../../components/Toasts';

export function MaterialViewer({ material: m }: { material: MaterialView }) {
  const { view, act } = useGame();
  const toasts = useToasts();
  const docRef = useRef<HTMLDivElement>(null);
  const opened = useRef(false);

  useEffect(() => {
    if (!m.read && !opened.current) {
      opened.current = true;
      void act({ type: 'open_material', materialId: m.id });
    }
  }, [m.id, m.read, act]);

  const onBoard = view.board.nodes.some((n) => n.ref === m.id);

  async function pinQuote() {
    const sel = window.getSelection()?.toString().trim();
    if (!sel || !docRef.current?.contains(window.getSelection()?.anchorNode ?? null)) {
      toasts.push('Zaznacz fragment tekstu w dokumencie, a potem przypnij go do notatnika.');
      return;
    }
    const r = await act({
      type: 'note_save',
      note: {
        text: '',
        shared: view.mode === 'coop',
        quote: { materialId: m.id, text: sel.slice(0, 1000) },
      },
    });
    if (r) toasts.push('Cytat przypięty w notatniku.', 'success');
  }

  return (
    <article className="material" aria-labelledby={`m-${m.id}`}>
      <header className="material-head">
        <span className="small muted">
          {MATERIAL_TYPES[m.type]?.icon} {MATERIAL_TYPES[m.type]?.label}
        </span>
        <h2 id={`m-${m.id}`}>{m.title}</h2>
        <p className="small muted">{[m.source, m.date].filter(Boolean).join(' · ')}</p>
        {m.summary && <p className="muted">{m.summary}</p>}
        <div className="toolbar">
          <button
            className={m.important ? 'chip active' : 'chip'}
            aria-pressed={m.important}
            onClick={() =>
              act({ type: 'mark_material', materialId: m.id, important: !m.important })
            }
          >
            {m.important ? '★ Ważne' : '☆ Oznacz jako ważne'}
          </button>
          <button
            className="chip"
            disabled={onBoard}
            onClick={async () => {
              const r = await act({
                type: 'board_add',
                node: {
                  kind: 'material',
                  ref: m.id,
                  label: m.title,
                  x: 80 + Math.random() * 600,
                  y: 80 + Math.random() * 400,
                },
              });
              if (r) toasts.push('Dodano do tablicy.', 'success');
            }}
          >
            {onBoard ? '📌 Na tablicy' : '📌 Na tablicę'}
          </button>
          {(m.body.kind === 'document' ||
            m.body.kind === 'press' ||
            m.body.kind === 'messages' ||
            m.body.kind === 'table') && (
            <button className="chip" onClick={pinQuote}>
              ❝ Przypnij zaznaczony cytat
            </button>
          )}
          {m.privateTo === view.seat && view.mode === 'coop' && (
            <button
              className="chip"
              onClick={async () => {
                const r = await act({ type: 'share_material', materialId: m.id });
                if (r) toasts.push('Materiał przekazany partnerowi.', 'success');
              }}
            >
              🤝 Przekaż partnerowi
            </button>
          )}
        </div>
        {m.privateTo === view.seat && view.mode === 'coop' && (
          <p className="small warn-text">
            Ten materiał widzisz tylko Ty. Partner zobaczy go dopiero, gdy mu go przekażesz.
          </p>
        )}
      </header>
      <div ref={docRef}>
        <Body m={m} />
      </div>
    </article>
  );
}

function Body({ m }: { m: MaterialView }) {
  const b = m.body;
  switch (b.kind) {
    case 'document':
      return (
        <div className={`paper doc-${b.format}`}>
          {b.header && (
            <dl className="doc-header">
              {b.header.map((h) => (
                <div key={h.label}>
                  <dt>{h.label}</dt>
                  <dd>{h.value}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className="doc-text">
            <MiniMarkdown text={b.text} />
          </div>
          {b.signature && <p className="doc-signature">{b.signature}</p>}
        </div>
      );
    case 'press':
      return (
        <div className="paper newspaper">
          <p className="outlet">{b.outlet}</p>
          <h3 className="headline">{b.headline}</h3>
          {b.lead && <p className="lead">{b.lead}</p>}
          <div className="doc-text columns">
            <MiniMarkdown text={b.text} />
          </div>
          {b.byline && <p className="byline">{b.byline}</p>}
        </div>
      );
    case 'table':
      return (
        <div className="paper">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {b.columns.map((c) => (
                    <th key={c} scope="col">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((c, j) => (
                      <td key={j}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {b.note && (
            <div className="doc-text small">
              <MiniMarkdown text={b.note} />
            </div>
          )}
        </div>
      );
    case 'messages':
      return (
        <div
          className="phone-screen"
          role="log"
          aria-label={`Rozmowa: ${b.participants.join(', ')}`}
        >
          <p className="small muted center">{b.participants.join(' · ')}</p>
          {b.messages.map((msg, i) => (
            <div key={i} className={`bubble ${msg.from === b.participants[0] ? 'out' : 'in'}`}>
              <span className="small bubble-meta">
                {msg.from} · {msg.t}
              </span>
              <span>{msg.text}</span>
            </div>
          ))}
        </div>
      );
    case 'photo':
      return <PhotoBody m={m} />;
    case 'cctv':
      return <CctvBody m={m} />;
  }
}

function Markers({
  hotspots,
  onSelect,
}: {
  hotspots: HotspotView[];
  onSelect: (h: HotspotView) => void;
}) {
  return (
    <>
      {hotspots.map((h) => (
        <button
          key={h.id}
          className="hotspot-marker"
          style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%` }}
          aria-label={`Szczegół: ${h.label}`}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={() => onSelect(h)}
        />
      ))}
    </>
  );
}

function useInspect(materialId: string) {
  const { act } = useGame();
  const toasts = useToasts();
  const [status, setStatus] = useState<string | null>(null);
  const inspect = async (x: number, y: number, zoom: number, frame?: number) => {
    const r = await act({ type: 'inspect', materialId, x, y, zoom, frame });
    if (r?.found) {
      toasts.push(`Zauważono szczegół: ${r.found.label}`, 'success');
      setStatus(null);
    } else if (r) {
      setStatus(
        zoom < 2
          ? 'Nic tu nie widać. Może warto przybliżyć?'
          : 'Nic, co zwracałoby uwagę w tym miejscu.',
      );
    }
  };
  return { inspect, status };
}

function HotspotList({ hotspots }: { hotspots: HotspotView[] }) {
  const { view, act } = useGame();
  if (hotspots.length === 0) return null;
  return (
    <div className="stack-sm">
      <h3 className="small-heading">Zauważone szczegóły</h3>
      <ul className="list">
        {hotspots.map((h) => {
          const onBoard = view.board.nodes.some((n) => n.ref === h.id);
          return (
            <li key={h.id} className="card hotspot-item">
              <div>
                <strong>{h.label}</strong>
                <p className="small">{h.description}</p>
              </div>
              <button
                className="chip"
                disabled={onBoard}
                onClick={() =>
                  act({
                    type: 'board_add',
                    node: {
                      kind: 'hotspot',
                      ref: h.id,
                      label: h.label,
                      x: 100 + Math.random() * 600,
                      y: 100 + Math.random() * 400,
                    },
                  })
                }
              >
                {onBoard ? '📌 Na tablicy' : '📌 Na tablicę'}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PhotoBody({ m }: { m: MaterialView }) {
  const b = m.body as Extract<MaterialView['body'], { kind: 'photo' }>;
  const { inspect, status } = useInspect(m.id);
  const [selected, setSelected] = useState<HotspotView | null>(null);
  return (
    <div className="stack">
      <ZoomPan
        src={b.image}
        alt={b.caption}
        aspect={b.height / b.width}
        onTap={(x, y, z) => inspect(x, y, z)}
        overlay={<Markers hotspots={b.hotspots} onSelect={setSelected} />}
      />
      <p className="small muted">
        {b.caption} Stuknij miejsce na zdjęciu, aby mu się przyjrzeć. Drobne szczegóły wymagają
        przybliżenia.
      </p>
      {status && (
        <p className="small" role="status">
          {status}
        </p>
      )}
      {selected && (
        <p className="card small" role="status">
          <strong>{selected.label}:</strong> {selected.description}
        </p>
      )}
      <HotspotList hotspots={b.hotspots} />
    </div>
  );
}

function CctvBody({ m }: { m: MaterialView }) {
  const b = m.body as Extract<MaterialView['body'], { kind: 'cctv' }>;
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const { inspect, status } = useInspect(m.id);
  const f = b.frames[frame]!;

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(
      () => setFrame((i) => (i + 1 >= b.frames.length ? (setPlaying(false), i) : i + 1)),
      1600,
    );
    return () => clearInterval(t);
  }, [playing, b.frames.length]);

  return (
    <div className="stack">
      <div className="cctv">
        <div className="cctv-osd" aria-hidden>
          <span>
            {b.camera} · {b.location}
          </span>
          <span>{f.t}</span>
        </div>
        <ZoomPan
          key={frame}
          src={f.image}
          alt={`Klatka ${f.t}: ${f.caption}`}
          aspect={9 / 16}
          onTap={(x, y, z) => inspect(x, y, z, frame)}
          overlay={<Markers hotspots={f.hotspots} onSelect={() => undefined} />}
        />
      </div>
      <div className="cctv-controls">
        <button
          className="icon"
          onClick={() => setFrame((i) => Math.max(0, i - 1))}
          disabled={frame === 0}
          aria-label="Poprzednia klatka"
        >
          ⏮
        </button>
        <button
          className="icon"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? 'Pauza' : 'Odtwarzaj'}
        >
          {playing ? '⏸' : '▶'}
        </button>
        <button
          className="icon"
          onClick={() => setFrame((i) => Math.min(b.frames.length - 1, i + 1))}
          disabled={frame === b.frames.length - 1}
          aria-label="Następna klatka"
        >
          ⏭
        </button>
        <input
          type="range"
          min={0}
          max={b.frames.length - 1}
          value={frame}
          onChange={(e) => setFrame(Number(e.target.value))}
          aria-label="Oś czasu nagrania"
          aria-valuetext={f.t}
        />
        <span className="mono small">
          {frame + 1}/{b.frames.length}
        </span>
      </div>
      <p>
        <span className="mono">{f.t}</span> – {f.caption}
      </p>
      {status && (
        <p className="small" role="status">
          {status}
        </p>
      )}
      <HotspotList hotspots={b.frames.flatMap((x) => x.hotspots)} />
      {b.log.length > 0 && (
        <div className="stack-sm">
          <h3 className="small-heading">Dziennik zdarzeń kamery</h3>
          <ol className="cctv-log">
            {b.log.map((l, i) => (
              <li key={i}>
                <button
                  className="link"
                  onClick={() => {
                    const idx = b.frames.findIndex((fr) => fr.t.slice(0, 5) >= l.t.slice(0, 5));
                    if (idx >= 0) setFrame(idx);
                  }}
                >
                  <span className="mono">{l.t}</span>
                </button>{' '}
                {l.text}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
