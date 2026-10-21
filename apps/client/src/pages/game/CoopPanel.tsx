import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../../lib/api';
import { seatName, useGame } from '../../lib/game';
import { Sheet } from '../../components/Sheet';
import { useToasts } from '../../components/Toasts';

const ROLES = ['Dokumenty i monitoring', 'Przesłuchania', 'Decyzje i budżet', 'Analiza i tablica'];
const REACTIONS = ['👍', '👎', '❓', '❗', '🤔', '👀'];

export function CoopPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { view, act, chat, connected, busy } = useGame();
  const coop = view.coop!;
  const toasts = useToasts();
  const [text, setText] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const me = coop.players.find((p) => p.seat === view.seat);
  const link = coop.inviteCode ? `${location.origin}/dolacz/${coop.inviteCode}` : null;

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [chat.length, open]);

  async function send(kind: 'text' | 'reaction', value: string) {
    try {
      await api.post(`/api/games/${view.id}/chat`, { kind, text: value });
      if (kind === 'text') setText('');
    } catch (err) {
      toasts.push(errorMessage(err), 'error');
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Zespół śledczy" wide>
      <div className="stack">
        <p className="small muted">
          {connected
            ? '🟢 Połączono – zmiany partnera widzisz na bieżąco.'
            : '🟠 Łączenie… zmiany pojawią się po odświeżeniu.'}
        </p>
        {link && (
          <div className="card stack-sm">
            <strong>Zaproś partnera</strong>
            <p className="small">
              Kod: <span className="mono big-code">{coop.inviteCode}</span>
            </p>
            <div className="row-buttons">
              <button
                onClick={async () => {
                  try {
                    if (navigator.share)
                      await navigator.share({ title: 'Detektyw – wspólne śledztwo', url: link });
                    else {
                      await navigator.clipboard.writeText(link);
                      toasts.push('Link skopiowany.', 'success');
                    }
                  } catch {
                    /* anulowano udostępnianie */
                  }
                }}
              >
                Udostępnij link
              </button>
            </div>
          </div>
        )}
        <ul className="list">
          {coop.players.map((p) => (
            <li key={p.seat} className="card player">
              <span>{p.online ? '🟢' : '⚪'}</span>
              <span className="material-main">
                <strong>
                  {p.displayName}
                  {p.seat === view.seat && ' (Ty)'}
                </strong>
                <span className="small muted">{p.role ?? 'bez przydzielonej roli'}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="field">
          <label htmlFor="role">Twoja rola w zespole</label>
          <select
            id="role"
            value={me?.role ?? ''}
            onChange={(e) => act({ type: 'set_role', role: e.target.value })}
          >
            <option value="">— wybierz —</option>
            {ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>

        {coop.proposals.length > 0 && (
          <section className="stack-sm">
            <h3 className="small-heading">Propozycje wymagające zgody</h3>
            {coop.proposals.map((p) => {
              const mine = p.by === view.seat;
              const approved = p.approvals.includes(view.seat);
              return (
                <div key={p.id} className="card stack-sm proposal">
                  <strong>{p.summary}</strong>
                  <span className="small muted">Proponuje: {seatName(view, p.by)}</span>
                  {mine ? (
                    <button
                      disabled={busy}
                      onClick={() => act({ type: 'cancel_proposal', proposalId: p.id })}
                    >
                      Wycofaj
                    </button>
                  ) : approved ? (
                    <span className="small">Zgoda wyrażona.</span>
                  ) : (
                    <div className="row-buttons">
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() => act({ type: 'vote', proposalId: p.id, approve: true })}
                      >
                        Zgadzam się
                      </button>
                      <button
                        className="danger"
                        disabled={busy}
                        onClick={() => act({ type: 'vote', proposalId: p.id, approve: false })}
                      >
                        Odrzucam
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        )}

        <section className="stack-sm">
          <h3 className="small-heading">Czat</h3>
          <div className="transcript chat" ref={logRef} role="log" aria-label="Czat zespołu">
            {chat.length === 0 && <p className="muted narration">Brak wiadomości.</p>}
            {chat.map((m) => (
              <div key={m.id} className="line">
                <span
                  className={`bubble ${m.seat === view.seat ? 'out' : 'in'}${m.kind === 'reaction' ? ' reaction' : ''}`}
                >
                  <span className="small bubble-meta">{m.displayName}: </span>
                  {m.text}
                </span>
              </div>
            ))}
          </div>
          <div className="chips" role="group" aria-label="Szybkie reakcje">
            {REACTIONS.map((r) => (
              <button
                key={r}
                className="chip"
                onClick={() => send('reaction', r)}
                aria-label={`Reakcja ${r}`}
              >
                {r}
              </button>
            ))}
          </div>
          <form
            className="chat-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) void send('text', text.trim());
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={1000}
              placeholder="Napisz do partnera…"
              aria-label="Wiadomość do partnera"
            />
            <button type="submit" disabled={!text.trim()}>
              Wyślij
            </button>
          </form>
        </section>
      </div>
    </Sheet>
  );
}
