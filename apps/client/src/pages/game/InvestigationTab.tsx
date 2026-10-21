import { useState } from 'react';
import { Link } from 'react-router';
import type { DecisionView } from '@detektyw/shared';
import { seatName, timeLabel, useGame, useGamePath } from '../../lib/game';
import { Confirm } from '../../components/Sheet';

const CATEGORY: Record<DecisionView['category'], string> = {
  lab: 'Laboratorium',
  police: 'Zlecenia dla policji',
  warrant: 'Wnioski do prokuratora',
  arrest: 'Zatrzymania',
  press: 'Media',
  witness: 'Świadkowie',
  expert: 'Eksperci',
  other: 'Inne',
};

export function Meter({
  label,
  value,
  max,
  unit,
}: {
  label: string;
  value: number;
  max: number;
  unit?: string;
}) {
  return (
    <div className="meter">
      <div className="meter-label">
        <span>{label}</span>
        <strong>
          {value}
          {unit} / {max}
          {unit}
        </strong>
      </div>
      <div
        className="meter-bar"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={label}
      >
        <span
          style={{ width: `${max ? (value / max) * 100 : 0}%` }}
          className={value / max <= 0.25 ? 'low' : undefined}
        />
      </div>
    </div>
  );
}

function costText(d: DecisionView) {
  const parts = [];
  if (d.cost.time) parts.push(`${d.cost.time / 2} dnia`);
  if (d.cost.lab) parts.push(`${d.cost.lab} zlec. lab.`);
  if (d.cost.police) parts.push(`${d.cost.police} zlec. policji`);
  if (d.cost.patience) parts.push(`${d.cost.patience} cierpliwości prokuratora`);
  return parts.join(' · ') || 'bez kosztów';
}

export function InvestigationTab() {
  const gp = useGamePath();
  const { view, act, busy } = useGame();
  const [pick, setPick] = useState<DecisionView | null>(null);
  const [waitConfirm, setWaitConfirm] = useState(false);
  const b = view.budget;
  const categories = [...new Set(view.decisions.map((d) => d.category))];
  const coop = view.mode === 'coop' && (view.coop?.players.length ?? 0) > 1;

  return (
    <div className="stack-lg investigation">
      <section className="card stack" aria-labelledby="budget-h">
        <h2 id="budget-h">Budżet śledztwa</h2>
        <p className="muted">{view.clock.label}</p>
        <div className="meters">
          <Meter label="Czas (dni)" value={b.time / 2} max={b.timeMax / 2} />
          <Meter label="Zlecenia dla laboratorium" value={b.lab} max={b.labMax} />
          <Meter label="Zlecenia dla policji" value={b.police} max={b.policeMax} />
          <Meter label="Cierpliwość prokuratora" value={b.patience} max={b.patienceMax} />
        </div>
        {view.pending.length > 0 && (
          <div>
            <h3 className="small-heading">Oczekujesz na wyniki</h3>
            <ul>
              {view.pending.map((p, i) => (
                <li key={i}>
                  {p.label} – spodziewane: {timeLabel(p.readyAt)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {view.phase === 'investigation' && (
          <button onClick={() => setWaitConfirm(true)} disabled={busy || b.time < 1}>
            ⏳ Przeczekaj pół dnia
          </button>
        )}
        <Link className="button primary" to={gp('sledztwo/oskarzenie')}>
          ⚖️ Akt oskarżenia albo umorzenie
        </Link>
      </section>

      {view.phase === 'investigation' && (
        <section aria-labelledby="dec-h" className="stack">
          <h2 id="dec-h">Decyzje śledcze</h2>
          {view.decisions.length === 0 && (
            <p className="muted">
              Nie masz teraz żadnych nowych możliwości. Szukaj tropów w materiałach i rozmowach.
            </p>
          )}
          {categories.map((c) => (
            <div key={c} className="stack-sm">
              <h3 className="small-heading">{CATEGORY[c]}</h3>
              <ul className="list">
                {view.decisions
                  .filter((d) => d.category === c)
                  .map((d) => (
                    <li key={d.id} className="card decision">
                      <div className="stack-sm">
                        <strong>{d.title}</strong>
                        <p className="small">{d.description}</p>
                        <p className="small muted">
                          Koszt: {costText(d)}
                          {d.delay > 0 && ` · wyniki po ok. ${d.delay / 2} dnia`}
                          {d.key && coop && ' · wymaga zgody partnera'}
                        </p>
                        {d.lateWarning && (
                          <p className="small warn-text">Wyniki mogą nie zdążyć przed terminem.</p>
                        )}
                      </div>
                      <button onClick={() => setPick(d)} disabled={busy || !d.affordable}>
                        {d.affordable
                          ? d.key && coop
                            ? 'Zaproponuj'
                            : 'Zdecyduj'
                          : 'Brak środków'}
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {view.taken.length > 0 && (
        <section aria-labelledby="taken-h" className="stack-sm">
          <h2 id="taken-h">Podjęte decyzje</h2>
          <ul className="list">
            {view.taken.map((t) => (
              <li key={t.id} className="card">
                <strong>{t.title}</strong>
                <p className="small">{t.outcome}</p>
                <p className="small muted">
                  {timeLabel(t.at)}
                  {view.mode === 'coop' && ` · ${seatName(view, t.by)}`}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="journal-h" className="stack-sm">
        <h2 id="journal-h">Dziennik śledztwa</h2>
        <ol className="journal">
          {view.journal.slice(0, 80).map((j, i) => (
            <li key={i} className={`journal-${j.kind}`}>
              <span className="small muted">{timeLabel(j.at)}</span> {j.text}
            </li>
          ))}
        </ol>
      </section>

      <Confirm
        open={!!pick}
        onClose={() => setPick(null)}
        title={pick?.title ?? ''}
        confirmLabel={pick?.key && coop ? 'Zaproponuj partnerowi' : 'Potwierdź'}
        onConfirm={() => {
          if (!pick) return;
          void act(
            pick.key && coop
              ? { type: 'propose', proposal: { kind: 'decision', decisionId: pick.id } }
              : { type: 'take_decision', decisionId: pick.id },
          );
        }}
      >
        <p>{pick?.description}</p>
        <p className="small muted">Koszt: {pick && costText(pick)}. Decyzji nie da się cofnąć.</p>
      </Confirm>
      <Confirm
        open={waitConfirm}
        onClose={() => setWaitConfirm(false)}
        title="Przeczekać?"
        confirmLabel="Czekam"
        onConfirm={() => act({ type: 'wait' })}
      >
        <p>Minie pół dnia śledztwa. Przydaje się, gdy czekasz na wyniki zleceń.</p>
      </Confirm>
    </div>
  );
}
