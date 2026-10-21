import { useState } from 'react';
import { Link } from 'react-router';
import type { Accusation } from '@detektyw/shared';
import { foundHotspots, useGame, useGamePath } from '../../lib/game';
import { Confirm } from '../../components/Sheet';
import { Portrait } from './PeopleTab';

export function AccusationView() {
  const gp = useGamePath();
  const { view, act, busy } = useGame();
  const o = view.accusationOptions;
  const [suspectId, setSuspect] = useState('');
  const [evidence, setEvidence] = useState<string[]>([]);
  const [motiveId, setMotive] = useState('');
  const [meansId, setMeans] = useState('');
  const [opportunityId, setOpp] = useState('');
  const [confirm, setConfirm] = useState<'accuse' | 'close' | null>(null);
  const coop = view.mode === 'coop' && (view.coop?.players.length ?? 0) > 1;
  const hotspots = foundHotspots(view);
  const ready = suspectId && evidence.length > 0 && motiveId && meansId && opportunityId;
  const accusation: Accusation = { suspectId, evidence, motiveId, meansId, opportunityId };
  const suspectName = o.suspects.find((s) => s.id === suspectId)?.name;

  const toggle = (id: string) =>
    setEvidence((e) =>
      e.includes(id) ? e.filter((x) => x !== id) : e.length >= o.maxEvidence ? e : [...e, id],
    );

  const submit = () =>
    act(
      confirm === 'close'
        ? coop
          ? { type: 'propose', proposal: { kind: 'close_case' } }
          : { type: 'close_case' }
        : coop
          ? { type: 'propose', proposal: { kind: 'accusation', accusation } }
          : { type: 'accuse', accusation },
    );

  return (
    <div className="stack-lg accusation">
      <Link to={gp('sledztwo')}>← Śledztwo</Link>
      <header>
        <h1>Akt oskarżenia</h1>
        <p className="muted">
          Wskaż sprawcę i uzasadnij oskarżenie. Prokurator oceni siłę dowodów i spójność
          rozumowania. Ta decyzja kończy śledztwo
          {coop ? ' i wymaga zgody obu śledczych' : ''}.
        </p>
      </header>

      <fieldset className="stack-sm">
        <legend className="small-heading">1. Kogo oskarżasz?</legend>
        <div className="suspects">
          {o.suspects.map((s) => {
            const p = view.people.find((x) => x.id === s.id)!;
            return (
              <label key={s.id} className={`suspect${suspectId === s.id ? ' active' : ''}`}>
                <input
                  type="radio"
                  name="suspect"
                  value={s.id}
                  checked={suspectId === s.id}
                  onChange={() => setSuspect(s.id)}
                />
                <Portrait p={p} size={56} />
                <span>{s.name}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <Choice
        legend="2. Motyw"
        name="motive"
        options={o.motives}
        value={motiveId}
        onChange={setMotive}
      />
      <Choice
        legend="3. Sposób działania"
        name="means"
        options={o.means}
        value={meansId}
        onChange={setMeans}
      />
      <Choice
        legend="4. Okoliczności i sposobność"
        name="opp"
        options={o.opportunities}
        value={opportunityId}
        onChange={setOpp}
      />

      <fieldset className="stack-sm">
        <legend className="small-heading">
          5. Kluczowe dowody ({evidence.length}/{o.maxEvidence})
        </legend>
        <ul className="list evidence-list">
          {[
            ...hotspots.map((h) => ({ id: h.id, label: `🔍 ${h.label}`, sub: h.materialTitle })),
            ...view.materials.map((m) => ({ id: m.id, label: m.title, sub: m.source })),
          ].map((e) => (
            <li key={e.id}>
              <label className="check evidence">
                <input
                  type="checkbox"
                  checked={evidence.includes(e.id)}
                  onChange={() => toggle(e.id)}
                  disabled={!evidence.includes(e.id) && evidence.length >= o.maxEvidence}
                />
                <span>
                  {e.label}
                  {e.sub && <span className="small muted"> · {e.sub}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <div className="stack">
        <button className="primary" disabled={!ready || busy} onClick={() => setConfirm('accuse')}>
          {coop ? 'Zaproponuj akt oskarżenia' : 'Złóż akt oskarżenia'}
        </button>
        <button className="danger" disabled={busy} onClick={() => setConfirm('close')}>
          {coop ? 'Zaproponuj umorzenie' : 'Umorzenie – zamknij sprawę bez oskarżenia'}
        </button>
      </div>

      <Confirm
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === 'close' ? 'Umorzyć śledztwo?' : 'Złożyć akt oskarżenia?'}
        confirmLabel={coop ? 'Wyślij propozycję' : 'Tak, ostatecznie'}
        danger={confirm === 'close'}
        onConfirm={() => void submit()}
      >
        {confirm === 'close' ? (
          <p>Sprawa zostanie zamknięta bez wskazania sprawcy. Tego nie da się cofnąć.</p>
        ) : (
          <p>
            Oskarżasz: <strong>{suspectName}</strong>. Po złożeniu aktu oskarżenia śledztwo się
            kończy.
          </p>
        )}
      </Confirm>
    </div>
  );
}

function Choice({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  options: { id: string; text: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <fieldset className="stack-sm">
      <legend className="small-heading">{legend}</legend>
      {options.length === 0 && (
        <p className="small muted">Nie masz jeszcze podstaw do żadnej tezy.</p>
      )}
      {options.map((opt) => (
        <label key={opt.id} className={`option${value === opt.id ? ' active' : ''}`}>
          <input
            type="radio"
            name={name}
            value={opt.id}
            checked={value === opt.id}
            onChange={() => onChange(opt.id)}
          />
          <span>{opt.text}</span>
        </label>
      ))}
    </fieldset>
  );
}
