import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { MaterialView } from '@detektyw/shared';
import { MATERIAL_TYPES, timeLabel, useGame, useGamePath } from '../../lib/game';
import { MiniMarkdown } from '../../components/MiniMarkdown';
import { MaterialViewer } from './MaterialViewer';

type StatusFilter = 'all' | 'new' | 'important';

export function FolderTab() {
  const gp = useGamePath();
  const { view } = useGame();
  const { mid } = useParams();
  const navigate = useNavigate();
  const [type, setType] = useState<string>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const selected = view.materials.find((m) => m.id === mid);

  const types = useMemo(() => [...new Set(view.materials.map((m) => m.type))], [view.materials]);
  const list = view.materials.filter(
    (m) =>
      (type === 'all' || m.type === type) &&
      (status === 'all' || (status === 'new' ? m.isNew : m.important)) &&
      (!query ||
        `${m.title} ${m.summary ?? ''} ${m.source ?? ''}`
          .toLowerCase()
          .includes(query.toLowerCase())),
  );

  return (
    <div className={`split${selected ? ' has-detail' : ''}`}>
      <section className="split-list" aria-label="Materiały w teczce">
        <Briefing />
        <div className="filters">
          <input
            type="search"
            placeholder="Szukaj w teczce…"
            aria-label="Szukaj w teczce"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="chips" role="group" aria-label="Rodzaj materiału">
            <button
              className={type === 'all' ? 'chip active' : 'chip'}
              onClick={() => setType('all')}
              aria-pressed={type === 'all'}
            >
              Wszystkie ({view.materials.length})
            </button>
            {types.map((t) => (
              <button
                key={t}
                className={type === t ? 'chip active' : 'chip'}
                onClick={() => setType(t)}
                aria-pressed={type === t}
              >
                {MATERIAL_TYPES[t]?.icon} {MATERIAL_TYPES[t]?.label}
              </button>
            ))}
          </div>
          <div className="chips" role="group" aria-label="Stan">
            {(
              [
                ['all', 'Wszystkie'],
                ['new', 'Nowe'],
                ['important', 'Ważne ★'],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                className={status === v ? 'chip active' : 'chip'}
                onClick={() => setStatus(v)}
                aria-pressed={status === v}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        {list.length === 0 ? (
          <p className="muted">Brak materiałów spełniających kryteria.</p>
        ) : (
          <ul className="list material-list">
            {list.map((m) => (
              <MaterialRow key={m.id} m={m} active={m.id === mid} />
            ))}
          </ul>
        )}
      </section>
      <section className="split-detail" aria-label="Podgląd materiału">
        {selected ? (
          <>
            <button className="link back-link" onClick={() => navigate(gp('teczka'))}>
              ← Teczka
            </button>
            <MaterialViewer key={selected.id} material={selected} />
          </>
        ) : (
          <p className="muted center desktop-only">Wybierz materiał z listy.</p>
        )}
      </section>
    </div>
  );
}

function MaterialRow({ m, active }: { m: MaterialView; active: boolean }) {
  const gp = useGamePath();
  const { view } = useGame();
  return (
    <li>
      <Link
        to={gp(`teczka/${m.id}`)}
        className={`material-row${active ? ' active' : ''}${m.isNew ? ' unread' : ''}`}
        aria-current={active ? 'true' : undefined}
      >
        <span className="material-icon" aria-hidden>
          {MATERIAL_TYPES[m.type]?.icon}
        </span>
        <span className="material-main">
          <span className="material-title">
            {m.title}
            {m.important && <span aria-label="ważne"> ★</span>}
          </span>
          <span className="small muted">
            {[m.source, m.date].filter(Boolean).join(' · ')}
            {m.unlockedAt > 0 && ` · w teczce od: ${timeLabel(m.unlockedAt)}`}
          </span>
        </span>
        {m.isNew && <span className="pill new">nowy</span>}
        {m.privateTo !== undefined && view.mode === 'coop' && (
          <span className="pill">tylko Ty</span>
        )}
      </Link>
    </li>
  );
}

function Briefing() {
  const { view } = useGame();
  const key = `dt:briefing:${view.id}`;
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(key) !== 'closed';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, open ? 'open' : 'closed');
    } catch {
      /* ignorujemy */
    }
  }, [open, key]);
  return (
    <details
      className="card briefing"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary>
        <strong>Odprawa: {view.briefing.title}</strong>
      </summary>
      <div className="doc-text">
        <MiniMarkdown text={view.briefing.text} />
      </div>
    </details>
  );
}
