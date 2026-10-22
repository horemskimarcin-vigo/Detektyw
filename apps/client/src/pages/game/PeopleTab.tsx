import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { Attitude, Mood, PersonView, Tone } from '@detektyw/shared';
import { foundHotspots, useGame, useGamePath } from '../../lib/game';
import { Confirm, Sheet } from '../../components/Sheet';
import { speakable, type TranscriptEntry } from '@detektyw/shared';
import { TalkingPortrait } from '../../components/TalkingPortrait';
import { VideoAvatar } from '../../components/VideoAvatar';
import {
  primeSpeech,
  useSpeech,
  useVoiceSetting,
  wordStarts,
  type SpeechPart,
} from '../../lib/speech';

const ROLE: Record<PersonView['role'], string> = {
  victim: 'Ofiara',
  suspect: 'Podejrzany',
  witness: 'Świadek',
  other: 'Inna osoba',
};
const MOOD: Record<Mood, string> = {
  calm: 'spokojny',
  uneasy: 'niespokojny',
  nervous: 'zdenerwowany',
  breaking: 'na granicy',
};
const ATTITUDE: Record<Attitude, string> = {
  hostile: 'wrogi',
  guarded: 'nieufny',
  neutral: 'neutralny',
  open: 'otwarty',
};
const TONES: { value: Tone; label: string; hint: string }[] = [
  { value: 'calm', label: 'Spokojnie', hint: 'Rzeczowo, bez presji.' },
  { value: 'empathetic', label: 'Empatycznie', hint: 'Buduje zaufanie, obniża stres.' },
  { value: 'press', label: 'Naciskając', hint: 'Podnosi stres. Za mocno – rozmówca zamilknie.' },
];

export function PeopleTab() {
  const gp = useGamePath();
  const { view } = useGame();
  const { pid } = useParams();
  const navigate = useNavigate();
  const selected = view.people.find((p) => p.id === pid);
  const groups: PersonView['role'][] = ['victim', 'suspect', 'witness', 'other'];

  return (
    <div className={`split${selected ? ' has-detail' : ''}`}>
      <section className="split-list" aria-label="Osoby w sprawie">
        {groups.map((g) => {
          const people = view.people.filter((p) => p.role === g);
          if (!people.length) return null;
          return (
            <div key={g} className="stack-sm">
              <h2 className="small-heading">
                {g === 'victim'
                  ? 'Ofiara'
                  : g === 'suspect'
                    ? 'Podejrzani'
                    : g === 'witness'
                      ? 'Świadkowie'
                      : 'Inne osoby'}
              </h2>
              <ul className="list">
                {people.map((p) => (
                  <li key={p.id}>
                    <Link
                      to={gp(`osoby/${p.id}`)}
                      className={`person-row${p.id === pid ? ' active' : ''}`}
                    >
                      <Portrait p={p} size={48} />
                      <span className="material-main">
                        <strong>{p.name}</strong>
                        <span className="small muted">{p.title}</span>
                      </span>
                      {p.interview?.inSession && <span className="pill new">rozmowa</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>
      <section className="split-detail" aria-label="Karta osoby">
        {selected ? (
          <>
            <button className="link back-link" onClick={() => navigate(gp('osoby'))}>
              ← Osoby
            </button>
            <PersonCard key={selected.id} p={selected} />
          </>
        ) : (
          <p className="muted center desktop-only">Wybierz osobę z listy.</p>
        )}
      </section>
    </div>
  );
}

export function Portrait({ p, size }: { p: { name: string; portrait?: string }; size: number }) {
  if (p.portrait)
    return <img className="portrait" src={p.portrait} alt="" width={size} height={size} />;
  const initials = p.name
    .split(' ')
    .map((x) => x[0])
    .join('')
    .slice(0, 2);
  return (
    <span className="portrait initials" style={{ width: size, height: size }} aria-hidden>
      {initials}
    </span>
  );
}

function PersonCard({ p }: { p: PersonView }) {
  const gp = useGamePath();
  const { view, act } = useGame();
  const onBoard = view.board.nodes.some((n) => n.ref === p.id);
  return (
    <article className="stack">
      <header className="person-head">
        <Portrait p={p} size={88} />
        <div>
          <span className={`pill role-${p.role}`}>{ROLE[p.role]}</span>
          <h2>{p.name}</h2>
          <p className="muted">
            {p.title}
            {p.age ? `, ${p.age} l.` : ''}
          </p>
        </div>
      </header>
      <p>{p.bio}</p>
      <div className="toolbar">
        <button
          className="chip"
          disabled={onBoard}
          onClick={() =>
            act({
              type: 'board_add',
              node: {
                kind: 'person',
                ref: p.id,
                label: p.name,
                x: 100 + Math.random() * 600,
                y: 100 + Math.random() * 400,
              },
            })
          }
        >
          {onBoard ? '📌 Na tablicy' : '📌 Na tablicę'}
        </button>
      </div>
      {p.facts.length > 0 && (
        <section>
          <h3 className="small-heading">Co już wiesz</h3>
          <ul>
            {p.facts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </section>
      )}
      {p.relations.length > 0 && (
        <section>
          <h3 className="small-heading">Powiązania</h3>
          <ul>
            {p.relations.map((r) => (
              <li key={r.personId}>
                <Link to={gp(`osoby/${r.personId}`)}>
                  {view.people.find((x) => x.id === r.personId)?.name}
                </Link>{' '}
                – {r.label}
              </li>
            ))}
          </ul>
        </section>
      )}
      {p.interview && <Interview p={p} />}
    </article>
  );
}

function Interview({ p }: { p: PersonView }) {
  const { view, act, busy } = useGame();
  const iv = p.interview!;
  const [tone, setTone] = useState<Tone>('calm');
  const [confirmStart, setConfirmStart] = useState(false);
  const [confront, setConfront] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const sessions = [...new Set(iv.transcript.map((t) => t.session))];
  const voiced = !!(p.voice && (p.portrait || p.video));
  const toPart = (t: TranscriptEntry): SpeechPart => ({ text: speakable(t), audio: t.audio });
  const [sound, setSound] = useVoiceSetting();
  const { state: speech, speak, stop } = useSpeech();
  const seen = useRef(iv.transcript.length);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [iv.transcript.length]);

  // Nowe kwestie rozmówcy (także zadane przez partnera w kooperacji) – na głos. Historia przy wejściu – nie.
  useEffect(() => {
    const fresh = iv.transcript.slice(seen.current);
    seen.current = iv.transcript.length;
    if (!voiced || !fresh.length) return;
    const parts = fresh.map(toPart).filter((x) => x.text);
    if (parts.length) void speak(parts, p.voice!, sound);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iv.transcript.length]);

  const lastSpoken = [...iv.transcript]
    .reverse()
    .map(toPart)
    .find((x) => x.text);
  return (
    <section
      className="stack interview"
      aria-labelledby="iv-head"
      onPointerDownCapture={voiced && sound ? primeSpeech : undefined}
    >
      <h3 id="iv-head" className="small-heading">
        Przesłuchanie
      </h3>
      {voiced && (iv.inSession || speech.talking) && (
        <div className="iv-stage">
          {p.video ? (
            <VideoAvatar
              idle={p.video.idle}
              talk={p.video.talk}
              poster={p.portrait}
              talking={speech.talking}
              size={200}
              label={`${p.name}${speech.talking ? ' mówi' : ''}`}
            />
          ) : (
            <TalkingPortrait
              src={p.portrait!}
              mouth={p.voice!.mouth}
              talking={speech.talking}
              word={speech.word}
              size={200}
              label={`${p.name}${speech.talking ? ' mówi' : ''}`}
            />
          )}
          <div className="iv-stage-side">
            <Subtitle text={speech.text} word={speech.word} />
            {speech.talking && !speech.audible && sound && (
              <p className="small muted">
                Brak nagrania i polskiego głosu w przeglądarce – napisy bez dźwięku.
              </p>
            )}
            <div className="toolbar">
              <button
                className="chip"
                aria-pressed={sound}
                onClick={() => setSound(!sound)}
                title="Głos postaci (synteza mowy przeglądarki)"
              >
                {sound ? '🔊 Głos: wł.' : '🔇 Głos: wył.'}
              </button>
              {speech.talking ? (
                <button className="chip" onClick={stop}>
                  ⏹ Przerwij
                </button>
              ) : (
                lastSpoken && (
                  <button
                    className="chip"
                    onClick={() => void speak([lastSpoken], p.voice!, sound)}
                  >
                    ↻ Powtórz
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      )}
      <div className="interview-status">
        <span>
          Nastrój: <strong>{MOOD[iv.mood]}</strong>
        </span>
        <span>
          Nastawienie: <strong>{ATTITUDE[iv.attitude]}</strong>
        </span>
        <span>
          Rozmowy: <strong>{iv.sessions}</strong>
        </span>
      </div>

      {iv.transcript.length > 0 && (
        <div className="transcript" ref={logRef} role="log" aria-label="Protokół rozmów">
          {sessions.map((s) => (
            <div key={s} className="stack-sm">
              <p className="small muted center">— rozmowa {s} —</p>
              {iv.transcript
                .filter((t) => t.session === s)
                .map((t, i) => (
                  <div key={i} className={`line line-${t.kind}`}>
                    {t.kind === 'question' || t.kind === 'confront' ? (
                      <span className="bubble out">
                        {t.text}
                        {t.tone && (
                          <span className="small bubble-meta">
                            {' '}
                            ({TONES.find((x) => x.value === t.tone)?.label.toLowerCase()})
                          </span>
                        )}
                      </span>
                    ) : t.kind === 'system' || t.kind === 'opening' ? (
                      <p className="small muted narration">{t.text}</p>
                    ) : (
                      <span className="bubble in">{t.text}</span>
                    )}
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}

      {iv.inSession ? (
        <div className="stack">
          <fieldset className="segmented">
            <legend>Ton pytania</legend>
            {TONES.map((t) => (
              <label
                key={t.value}
                className={tone === t.value ? 'active' : undefined}
                title={t.hint}
              >
                <input
                  type="radio"
                  name="tone"
                  value={t.value}
                  checked={tone === t.value}
                  onChange={() => setTone(t.value)}
                />
                {t.label}
              </label>
            ))}
          </fieldset>
          <p className="small muted">
            {TONES.find((t) => t.value === tone)?.hint} Pozostało pytań w tej rozmowie:{' '}
            {iv.questionsLeft}.
          </p>
          {iv.questions.length === 0 ? (
            <p className="muted">
              Nie masz w tej chwili nowych pytań. Okaż dowód albo zakończ rozmowę.
            </p>
          ) : (
            <ul className="list">
              {iv.questions.map((q) => (
                <li key={q.id}>
                  <button
                    className="question"
                    disabled={busy}
                    onClick={() => act({ type: 'ask', personId: p.id, questionId: q.id, tone })}
                  >
                    {q.text}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="row-buttons">
            <button onClick={() => setConfront(true)} disabled={busy}>
              🗂️ Okaż dowód
            </button>
            <button onClick={() => act({ type: 'end_interview', personId: p.id })} disabled={busy}>
              Zakończ rozmowę
            </button>
          </div>
          <EvidencePicker
            open={confront}
            onClose={() => setConfront(false)}
            title={`Okaż dowód: ${p.name}`}
            onPick={(evidence) => {
              setConfront(false);
              void act({ type: 'confront', personId: p.id, evidence, tone });
            }}
          />
        </div>
      ) : iv.available ? (
        <>
          <button
            className="primary"
            onClick={() => setConfirmStart(true)}
            disabled={busy || view.budget.time < 1}
          >
            {iv.sessions === 0 ? 'Rozpocznij przesłuchanie' : 'Wezwij ponownie'}
          </button>
          <Confirm
            open={confirmStart}
            onClose={() => setConfirmStart(false)}
            title="Przesłuchanie"
            confirmLabel="Wezwij"
            onConfirm={() => act({ type: 'start_interview', personId: p.id })}
          >
            <p>
              Rozmowa z: <strong>{p.name}</strong> zajmie pół dnia śledztwa. Zostało Ci{' '}
              {view.budget.time / 2} dni.
            </p>
          </Confirm>
        </>
      ) : (
        <p className="muted">{iv.unavailableReason}</p>
      )}
    </section>
  );
}

/** Napisy: słowa już wypowiedziane wyraźne, kolejne przygaszone. */
function Subtitle({ text, word }: { text: string; word: number }) {
  if (!text)
    return (
      <p className="iv-subtitle muted small">
        Zadaj pytanie – odpowiedź usłyszysz i przeczytasz tutaj.
      </p>
    );
  const starts = wordStarts(text);
  const spoken = word >= starts.length ? text.length : (starts[word + 1] ?? text.length);
  return (
    <p className="iv-subtitle" aria-hidden>
      <span>{text.slice(0, spoken)}</span>
      <span className="iv-subtitle-rest">{text.slice(spoken)}</span>
    </p>
  );
}

export function EvidencePicker({
  open,
  onClose,
  title,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  onPick: (ref: string) => void;
}) {
  const { view } = useGame();
  const [q, setQ] = useState('');
  const hotspots = foundHotspots(view);
  const match = (s: string) => s.toLowerCase().includes(q.toLowerCase());
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <input
        type="search"
        placeholder="Szukaj…"
        aria-label="Szukaj dowodu"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {hotspots.length > 0 && (
        <>
          <h3 className="small-heading">Szczegóły ze zdjęć i nagrań</h3>
          <ul className="list">
            {hotspots
              .filter((h) => match(h.label))
              .map((h) => (
                <li key={h.id}>
                  <button className="question" onClick={() => onPick(h.id)}>
                    🔍 {h.label} <span className="small muted">({h.materialTitle})</span>
                  </button>
                </li>
              ))}
          </ul>
        </>
      )}
      <h3 className="small-heading">Materiały</h3>
      <ul className="list">
        {view.materials
          .filter((m) => match(m.title))
          .map((m) => (
            <li key={m.id}>
              <button className="question" onClick={() => onPick(m.id)}>
                {m.title}
              </button>
            </li>
          ))}
      </ul>
    </Sheet>
  );
}
