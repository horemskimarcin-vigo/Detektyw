import { useRef, useState } from 'react';
import type { BoardNodeKind, BoardNodeView } from '@detektyw/shared';
import { foundHotspots, useGame } from '../../lib/game';
import { Sheet } from '../../components/Sheet';

const W = 168;
const H = 60;
const KIND_LABEL: Record<BoardNodeKind, string> = {
  person: 'Osoba',
  material: 'Dowód',
  hotspot: 'Szczegół',
  location: 'Miejsce',
  note: 'Notatka',
  time: 'Czas',
};

function wrap(label: string, max = 22): string[] {
  const words = label.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max) {
      if (cur) lines.push(cur);
      cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  if (lines.length > 2) return [lines[0]!, lines[1]!.slice(0, max - 1) + '…'];
  return lines;
}

export function BoardView() {
  const { view, act } = useGame();
  const { nodes, edges } = view.board;
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; moved: boolean } | null>(
    null,
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [linkMode, setLinkMode] = useState(false);
  const [pendingLink, setPendingLink] = useState<{ from: string; to: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<BoardNodeView | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const start = useRef<{ px: number; py: number; nx: number; ny: number } | null>(null);

  const width = Math.max(1400, ...nodes.map((n) => n.x + W + 80));
  const height = Math.max(900, ...nodes.map((n) => n.y + H + 80));
  const pos = (n: BoardNodeView) =>
    drag?.id === n.id ? { x: drag.x, y: drag.y } : { x: n.x, y: n.y };
  const byId = new Map(nodes.map((n) => [n.id, n]));

  function svgPoint(e: React.PointerEvent) {
    const svg = svgRef.current!;
    const r = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * width,
      y: ((e.clientY - r.top) / r.height) * height,
    };
  }

  function onNodeDown(e: React.PointerEvent, n: BoardNodeView) {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const p = svgPoint(e);
    start.current = { px: p.x, py: p.y, nx: n.x, ny: n.y };
    setDrag({ id: n.id, x: n.x, y: n.y, moved: false });
  }
  function onNodeMove(e: React.PointerEvent) {
    if (!drag || !start.current) return;
    const p = svgPoint(e);
    const dx = p.x - start.current.px;
    const dy = p.y - start.current.py;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 6) return;
    setDrag({
      id: drag.id,
      x: Math.max(0, start.current.nx + dx),
      y: Math.max(0, start.current.ny + dy),
      moved: true,
    });
  }
  function onNodeUp(n: BoardNodeView) {
    const d = drag;
    setDrag(null);
    start.current = null;
    if (d?.moved) {
      void act({ type: 'board_move', nodeId: n.id, x: Math.round(d.x), y: Math.round(d.y) });
      return;
    }
    tapNode(n.id);
  }
  function tapNode(id: string) {
    setSelectedEdge(null);
    if (linkMode) {
      if (!linkFrom) setLinkFrom(id);
      else if (linkFrom !== id) {
        setPendingLink({ from: linkFrom, to: id });
        setLinkFrom(null);
        setLinkMode(false);
      }
      return;
    }
    setSelected((s) => (s === id ? null : id));
  }

  const sel = selected ? byId.get(selected) : undefined;

  return (
    <div className="stack board">
      <div className="toolbar">
        <button className="chip" onClick={() => setAdding(true)}>
          ＋ Dodaj
        </button>
        <button
          className={linkMode ? 'chip active' : 'chip'}
          aria-pressed={linkMode}
          disabled={nodes.length < 2}
          onClick={() => {
            setLinkMode((m) => !m);
            setLinkFrom(null);
          }}
        >
          〰 Połącz
        </button>
        {sel && (
          <>
            <button className="chip" onClick={() => setEditing(sel)}>
              ✎ Opis
            </button>
            <button
              className="chip danger"
              onClick={() => {
                void act({ type: 'board_remove', nodeId: sel.id });
                setSelected(null);
              }}
            >
              🗑 Zdejmij
            </button>
          </>
        )}
        {selectedEdge && (
          <button
            className="chip danger"
            onClick={() => {
              void act({ type: 'board_unlink', edgeId: selectedEdge });
              setSelectedEdge(null);
            }}
          >
            ✂ Usuń połączenie
          </button>
        )}
      </div>
      <p className="small muted" role="status">
        {linkMode
          ? linkFrom
            ? 'Wybierz drugi element, który chcesz połączyć.'
            : 'Wybierz pierwszy element połączenia.'
          : 'Przeciągaj karteczki, łącz je nitką i opisuj powiązania. Tablica jest tylko Twoją interpretacją – gra jej nie ocenia.'}
      </p>
      <div className="board-scroll">
        <svg
          ref={svgRef}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="board-svg"
          role="img"
          aria-label="Tablica dowodowa"
          onPointerDown={() => {
            setSelected(null);
            setSelectedEdge(null);
          }}
        >
          <defs>
            <pattern id="cork" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="4" cy="6" r="1" className="cork-dot" />
              <circle cx="16" cy="18" r="1" className="cork-dot" />
            </pattern>
          </defs>
          <rect width={width} height={height} fill="url(#cork)" className="board-bg" />
          {edges.map((e) => {
            const a = byId.get(e.from);
            const b = byId.get(e.to);
            if (!a || !b) return null;
            const pa = pos(a);
            const pb = pos(b);
            const x1 = pa.x + W / 2;
            const y1 = pa.y + H / 2;
            const x2 = pb.x + W / 2;
            const y2 = pb.y + H / 2;
            return (
              <g
                key={e.id}
                className={`edge${selectedEdge === e.id ? ' selected' : ''}`}
                onPointerDown={(ev) => {
                  ev.stopPropagation();
                  setSelectedEdge(e.id);
                  setSelected(null);
                }}
              >
                <line x1={x1} y1={y1} x2={x2} y2={y2} className="edge-hit" />
                <line x1={x1} y1={y1} x2={x2} y2={y2} className="edge-line" />
                {e.label && (
                  <text
                    x={(x1 + x2) / 2}
                    y={(y1 + y2) / 2 - 6}
                    textAnchor="middle"
                    className="edge-label"
                  >
                    {e.label}
                  </text>
                )}
              </g>
            );
          })}
          {nodes.map((n) => {
            const p = pos(n);
            const lines = wrap(n.label);
            return (
              <g
                key={n.id}
                transform={`translate(${p.x} ${p.y})`}
                className={`node node-${n.kind}${selected === n.id ? ' selected' : ''}${linkFrom === n.id ? ' linking' : ''}`}
                onPointerDown={(e) => onNodeDown(e, n)}
                onPointerMove={onNodeMove}
                onPointerUp={() => onNodeUp(n)}
              >
                <rect width={W} height={H} rx="6" />
                <circle cx={W / 2} cy="4" r="5" className="pin" />
                <text x="10" y="20" className="node-kind">
                  {KIND_LABEL[n.kind]}
                </text>
                {lines.map((l, i) => (
                  <text key={i} x="10" y={38 + i * 15} className="node-label">
                    {l}
                  </text>
                ))}
              </g>
            );
          })}
        </svg>
      </div>

      <details className="card">
        <summary>
          Lista elementów tablicy ({nodes.length}) i połączeń ({edges.length})
        </summary>
        <ul>
          {nodes.map((n) => (
            <li key={n.id}>
              <button className="link" onClick={() => tapNode(n.id)}>
                {KIND_LABEL[n.kind]}: {n.label}
              </button>
            </li>
          ))}
        </ul>
        <ul>
          {edges.map((e) => (
            <li key={e.id}>
              {byId.get(e.from)?.label} ↔ {byId.get(e.to)?.label}
              {e.label ? ` (${e.label})` : ''}{' '}
              <button className="link" onClick={() => act({ type: 'board_unlink', edgeId: e.id })}>
                usuń
              </button>
            </li>
          ))}
        </ul>
      </details>

      <AddNodeSheet open={adding} onClose={() => setAdding(false)} />
      <TextSheet
        open={!!pendingLink}
        title="Opis powiązania"
        label="Co łączy te elementy? (opcjonalnie)"
        initial=""
        onClose={() => setPendingLink(null)}
        onSave={(label) => {
          if (pendingLink)
            void act({
              type: 'board_link',
              from: pendingLink.from,
              to: pendingLink.to,
              label: label || undefined,
            });
          setPendingLink(null);
        }}
      />
      <TextSheet
        open={!!editing}
        title="Opis karteczki"
        label="Treść"
        initial={editing?.label ?? ''}
        onClose={() => setEditing(null)}
        onSave={(label) => {
          if (editing && label) void act({ type: 'board_update', nodeId: editing.id, label });
          setEditing(null);
        }}
      />
    </div>
  );
}

function TextSheet({
  open,
  title,
  label,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  label: string;
  initial: string;
  onClose: () => void;
  onSave: (v: string) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(String(new FormData(e.currentTarget).get('v') ?? '').trim());
        }}
      >
        <div className="field">
          <label htmlFor="board-text">{label}</label>
          <input id="board-text" name="v" defaultValue={initial} maxLength={200} autoFocus />
        </div>
        <button className="primary" type="submit">
          Zapisz
        </button>
      </form>
    </Sheet>
  );
}

function AddNodeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { view, act } = useGame();
  const on = new Set(view.board.nodes.map((n) => n.ref).filter(Boolean));
  const place = () => ({
    x: 60 + Math.round(Math.random() * 700),
    y: 60 + Math.round(Math.random() * 500),
  });
  const add = async (kind: BoardNodeKind, label: string, ref?: string) => {
    await act({ type: 'board_add', node: { kind, ref, label, ...place() } });
  };
  const [kind, setKind] = useState<'note' | 'location' | 'time'>('note');
  return (
    <Sheet open={open} onClose={onClose} title="Dodaj do tablicy">
      <div className="stack">
        <form
          className="stack-sm card"
          onSubmit={(e) => {
            e.preventDefault();
            const label = String(new FormData(e.currentTarget).get('label') ?? '').trim();
            if (label) {
              void add(kind, label);
              e.currentTarget.reset();
            }
          }}
        >
          <strong>Własna karteczka</strong>
          <div className="chips">
            {(['note', 'location', 'time'] as const).map((k) => (
              <button
                type="button"
                key={k}
                className={kind === k ? 'chip active' : 'chip'}
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <input
            name="label"
            maxLength={200}
            placeholder="np. „Parking za domem” albo „21:40”"
            aria-label="Treść karteczki"
          />
          <button type="submit">Przypnij</button>
        </form>
        <Group
          title="Osoby"
          items={view.people.map((p) => ({ id: p.id, label: p.name }))}
          on={on}
          onAdd={(i) => add('person', i.label, i.id)}
        />
        <Group
          title="Szczegóły"
          items={foundHotspots(view).map((h) => ({ id: h.id, label: h.label }))}
          on={on}
          onAdd={(i) => add('hotspot', i.label, i.id)}
        />
        <Group
          title="Materiały"
          items={view.materials.map((m) => ({ id: m.id, label: m.title }))}
          on={on}
          onAdd={(i) => add('material', i.label, i.id)}
        />
      </div>
    </Sheet>
  );
}

function Group({
  title,
  items,
  on,
  onAdd,
}: {
  title: string;
  items: { id: string; label: string }[];
  on: Set<string | undefined>;
  onAdd: (i: { id: string; label: string }) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="stack-sm">
      <h3 className="small-heading">{title}</h3>
      <ul className="list">
        {items.map((i) => (
          <li key={i.id}>
            <button className="question" disabled={on.has(i.id)} onClick={() => onAdd(i)}>
              {on.has(i.id) ? '✓ ' : '＋ '}
              {i.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
