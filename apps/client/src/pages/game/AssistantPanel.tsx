import { useEffect, useRef, useState } from 'react';
import { seatName, useGame } from '../../lib/game';
import { Sheet } from '../../components/Sheet';

export function AssistantPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { view, act, busy } = useGame();
  const a = view.assistant;
  const [text, setText] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [open]);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [a.messages.length, open]);

  const cooling = a.cooldownUntil && a.cooldownUntil > now;

  return (
    <Sheet open={open} onClose={onClose} title={`${a.name} – ${a.title}`} wide>
      <div className="stack assistant">
        <p className="small muted">
          {a.enabled
            ? `Wykorzystane podpowiedzi: ${a.hintsUsed}. Każda kolejna jest trochę konkretniejsza, ale nigdy nie zdradzi rozwiązania. Liczba podpowiedzi może wpłynąć na epilog.`
            : 'Grasz w trybie bez podpowiedzi.'}
        </p>
        <div className="transcript" ref={logRef} role="log" aria-label="Rozmowa z asystentem">
          {a.messages.length === 0 && (
            <p className="muted narration">
              {a.name} odstawia kubek z kawą. „Jak coś będzie nie tak, wiesz, gdzie mnie szukać. Ale
              najpierw sam przejrzyj papiery.”
            </p>
          )}
          {a.messages.map((m) => (
            <div key={m.id} className="line">
              <span className={`bubble ${m.from === 'player' ? 'out' : 'in'}`}>
                {m.from === 'player' && view.mode === 'coop' && (
                  <span className="small bubble-meta">{seatName(view, m.seat)}: </span>
                )}
                {m.text}
                {m.level && <span className="small bubble-meta"> · wskazówka {m.level}/3</span>}
              </span>
            </div>
          ))}
        </div>
        {a.enabled && (
          <>
            <button
              className="primary"
              disabled={busy}
              onClick={() => act({ type: 'hint_request' })}
            >
              💡 Poproś o wskazówkę
            </button>
            {cooling && (
              <p className="small muted">
                Kolejna, dokładniejsza wskazówka będzie możliwa za kilka minut albo po kilku
                działaniach w śledztwie.
              </p>
            )}
          </>
        )}
        <form
          className="chat-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!text.trim()) return;
            const r = await act({ type: 'assistant_ask', text });
            if (r) setText('');
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            placeholder="Zapytaj o coś…"
            aria-label={`Wiadomość do: ${a.name}`}
          />
          <button type="submit" disabled={busy || !text.trim()}>
            Wyślij
          </button>
        </form>
      </div>
    </Sheet>
  );
}
