import { useState } from 'react';
import { Link, NavLink, useParams } from 'react-router';
import type { NoteView, TimelineEntryView } from '@detektyw/shared';
import { foundHotspots, seatName, useGame, useRefLabel, useGamePath } from '../../lib/game';
import { Sheet } from '../../components/Sheet';
import { BoardView } from './BoardView';

export function AnalysisTab() {
  const gp = useGamePath();
  const { sub = 'tablica' } = useParams();
  return (
    <div className="stack">
      <nav className="segmented-nav" aria-label="Narzędzia analizy">
        <NavLink to={gp('analiza/tablica')} className={sub === 'tablica' ? 'active' : undefined}>
          Tablica
        </NavLink>
        <NavLink to={gp('analiza/os-czasu')}>Oś czasu</NavLink>
        <NavLink to={gp('analiza/notatnik')}>Notatnik</NavLink>
      </nav>
      {sub === 'os-czasu' ? <TimelineView /> : sub === 'notatnik' ? <NotesView /> : <BoardView />}
    </div>
  );
}

/* ---------------- oś czasu ---------------- */

function TimelineView() {
  const { view, act } = useGame();
  const label = useRefLabel();
  const [editing, setEditing] = useState<TimelineEntryView | 'new' | null>(null);
  return (
    <div className="stack">
      <p className="small muted">
        Ułóż wydarzenia tak, jak Twoim zdaniem przebiegały. Gra nie podpowiada właściwej kolejności
        – to Twoja wersja zdarzeń.
      </p>
      <button className="primary" onClick={() => setEditing('new')}>
        ＋ Dodaj wydarzenie
      </button>
      {view.timeline.length === 0 ? (
        <p className="muted">Oś czasu jest pusta.</p>
      ) : (
        <ol className="timeline">
          {view.timeline.map((e, i) => (
            <li key={e.id} className="timeline-item">
              <span className="timeline-time mono">{e.time || '?'}</span>
              <div className="timeline-body">
                <p>{e.label}</p>
                {e.refs.length > 0 && (
                  <p className="small muted">Źródła: {e.refs.map(label).join(', ')}</p>
                )}
                <div className="toolbar">
                  <button
                    className="chip"
                    disabled={i === 0}
                    onClick={() => act({ type: 'timeline_move', entryId: e.id, direction: -1 })}
                    aria-label="W górę"
                  >
                    ↑
                  </button>
                  <button
                    className="chip"
                    disabled={i === view.timeline.length - 1}
                    onClick={() => act({ type: 'timeline_move', entryId: e.id, direction: 1 })}
                    aria-label="W dół"
                  >
                    ↓
                  </button>
                  <button className="chip" onClick={() => setEditing(e)}>
                    ✎ Edytuj
                  </button>
                  <button
                    className="chip danger"
                    onClick={() => act({ type: 'timeline_delete', entryId: e.id })}
                  >
                    🗑
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      <TimelineSheet entry={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function TimelineSheet({
  entry,
  onClose,
}: {
  entry: TimelineEntryView | 'new' | null;
  onClose: () => void;
}) {
  const { view, act } = useGame();
  const current = entry === 'new' ? undefined : (entry ?? undefined);
  const [refs, setRefs] = useState<string[]>([]);
  const sources = [
    ...view.materials.map((m) => ({ id: m.id, label: m.title })),
    ...foundHotspots(view).map((h) => ({ id: h.id, label: `🔍 ${h.label}` })),
    ...view.people.map((p) => ({ id: p.id, label: `👤 ${p.name}` })),
  ];
  return (
    <Sheet
      open={entry !== null}
      onClose={onClose}
      title={current ? 'Edytuj wydarzenie' : 'Nowe wydarzenie'}
    >
      <form
        className="stack"
        key={current?.id ?? 'new'}
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const r = await act({
            type: 'timeline_save',
            entry: {
              id: current?.id,
              time: String(f.get('time') ?? ''),
              label: String(f.get('label') ?? ''),
              refs: refs.length ? refs : (current?.refs ?? []),
            },
          });
          if (r) {
            setRefs([]);
            onClose();
          }
        }}
      >
        <div className="field">
          <label htmlFor="tl-time">Kiedy</label>
          <input
            id="tl-time"
            name="time"
            defaultValue={current?.time}
            placeholder="np. pt 21:40"
            maxLength={40}
          />
        </div>
        <div className="field">
          <label htmlFor="tl-label">Co się wydarzyło</label>
          <input
            id="tl-label"
            name="label"
            defaultValue={current?.label}
            required
            maxLength={400}
          />
        </div>
        <fieldset className="stack-sm">
          <legend className="small-heading">Na czym to opierasz? (opcjonalnie)</legend>
          <div className="ref-list">
            {sources.map((s) => {
              const checked = (refs.length ? refs : (current?.refs ?? [])).includes(s.id);
              return (
                <label key={s.id} className="check">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const base = refs.length ? refs : (current?.refs ?? []);
                      setRefs(
                        checked ? base.filter((x) => x !== s.id) : [...base, s.id].slice(0, 10),
                      );
                    }}
                  />
                  <span>{s.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <button className="primary" type="submit">
          Zapisz
        </button>
      </form>
    </Sheet>
  );
}

/* ---------------- notatnik ---------------- */

function NotesView() {
  const gp = useGamePath();
  const { view, act } = useGame();
  const label = useRefLabel();
  const [editing, setEditing] = useState<NoteView | 'new' | null>(null);
  const coop = view.mode === 'coop';
  return (
    <div className="stack">
      <button className="primary" onClick={() => setEditing('new')}>
        ＋ Nowa notatka
      </button>
      <p className="small muted">
        Cytaty przypinasz, zaznaczając fragment dokumentu w teczce i wybierając „Przypnij zaznaczony
        cytat”.
      </p>
      {view.notes.length === 0 && <p className="muted">Notatnik jest pusty.</p>}
      <ul className="list">
        {[...view.notes].reverse().map((n) => (
          <li key={n.id} className="card note">
            {n.quote && (
              <blockquote>
                „{n.quote.text}”
                <footer className="small">
                  — <Link to={gp(`teczka/${n.quote.materialId}`)}>{label(n.quote.materialId)}</Link>
                </footer>
              </blockquote>
            )}
            {n.text && <p className="note-text">{n.text}</p>}
            <p className="small muted">
              {coop && (n.shared ? `wspólna · ${seatName(view, n.author)}` : 'prywatna')}
            </p>
            <div className="toolbar">
              <button className="chip" onClick={() => setEditing(n)}>
                ✎ Edytuj
              </button>
              <button
                className="chip danger"
                onClick={() => act({ type: 'note_delete', noteId: n.id })}
              >
                🗑 Usuń
              </button>
            </div>
          </li>
        ))}
      </ul>
      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Nowa notatka' : 'Edytuj notatkę'}
      >
        <form
          className="stack"
          key={editing === 'new' ? 'new' : editing?.id}
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const current = editing === 'new' ? undefined : (editing ?? undefined);
            const r = await act({
              type: 'note_save',
              note: {
                id: current?.id,
                text: String(f.get('text') ?? ''),
                shared: coop ? f.get('shared') === 'on' : false,
              },
            });
            if (r) setEditing(null);
          }}
        >
          <div className="field">
            <label htmlFor="note-text">Treść</label>
            <textarea
              id="note-text"
              name="text"
              rows={6}
              maxLength={4000}
              defaultValue={editing !== 'new' ? editing?.text : ''}
            />
          </div>
          {coop && (
            <label className="check">
              <input
                type="checkbox"
                name="shared"
                defaultChecked={editing === 'new' ? true : editing?.shared}
              />
              <span>Wspólna – widzi ją partner</span>
            </label>
          )}
          <button className="primary" type="submit">
            Zapisz
          </button>
        </form>
      </Sheet>
    </div>
  );
}
