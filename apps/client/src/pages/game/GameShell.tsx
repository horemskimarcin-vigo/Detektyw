import { useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useParams } from 'react-router';
import { GameProvider, useGame, useGameQuery, useGamePath } from '../../lib/game';
import { errorMessage } from '../../lib/api';
import { PwaBanners } from '../../components/PwaBanners';
import { FolderTab } from './FolderTab';
import { PeopleTab } from './PeopleTab';
import { InvestigationTab } from './InvestigationTab';
import { AccusationView } from './AccusationView';
import { AnalysisTab } from './AnalysisTab';
import { AssistantPanel } from './AssistantPanel';
import { CoopPanel } from './CoopPanel';
import { EndingScreen } from './EndingScreen';

export function GameShell() {
  const { id } = useParams();
  const game = useGameQuery(id!);
  if (game.isLoading && !game.data) {
    return (
      <p className="center muted" role="status">
        Otwieram teczkę…
      </p>
    );
  }
  if (!game.data) {
    return (
      <div className="content narrow stack">
        <p className="form-error">{errorMessage(game.error)}</p>
        <Link to="/">Wróć do listy spraw</Link>
      </div>
    );
  }
  return (
    <GameProvider view={game.data}>
      <GameLayout />
    </GameProvider>
  );
}

const TABS = [
  { to: 'teczka', label: 'Teczka', icon: '🗂️' },
  { to: 'osoby', label: 'Osoby', icon: '👥' },
  { to: 'sledztwo', label: 'Śledztwo', icon: '⚖️' },
  { to: 'analiza', label: 'Analiza', icon: '🧩' },
];

function GameLayout() {
  const gp = useGamePath();
  const { view } = useGame();
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [coopOpen, setCoopOpen] = useState(false);
  const newCount = view.materials.filter((m) => m.isNew).length;
  const pendingVotes =
    view.coop?.proposals.filter((p) => !p.approvals.includes(view.seat)).length ?? 0;

  if (view.phase === 'finished') return <EndingScreen />;

  return (
    <div className="game-shell">
      <a className="skip-link" href="#game-main">
        Przejdź do treści
      </a>
      <header className="game-top">
        <Link to="/" className="icon-link" aria-label="Wróć do listy spraw">
          ←
        </Link>
        <div className="game-title">
          <strong>{view.caseTitle}</strong>
          <span className="small muted">
            {view.clock.label} · zostało {view.budget.time / 2} dni
          </span>
        </div>
        {view.coop && (
          <button
            className="icon badge-host"
            onClick={() => setCoopOpen(true)}
            aria-label="Zespół i czat"
          >
            👥{pendingVotes > 0 && <span className="badge">{pendingVotes}</span>}
          </button>
        )}
        <button
          className="icon badge-host"
          onClick={() => setAssistantOpen(true)}
          aria-label={`Asystent: ${view.assistant.name}`}
        >
          🕵️{view.assistant.offerHelp && <span className="badge dot" aria-hidden />}
        </button>
      </header>
      <PwaBanners />
      {view.phase === 'deadline' && (
        <div className="banner warn" role="alert">
          Termin minął. Możesz jeszcze analizować materiały, ale pozostała już tylko decyzja: akt
          oskarżenia albo umorzenie. <Link to={gp('sledztwo/oskarzenie')}>Przejdź do decyzji</Link>
        </div>
      )}
      {view.assistant.offerHelp && (
        <button className="banner offer" onClick={() => setAssistantOpen(true)}>
          {view.assistant.name}: „Widzę, że krążysz wokół tych samych papierów. Chcesz pogadać?”
        </button>
      )}
      {pendingVotes > 0 && (
        <button className="banner" onClick={() => setCoopOpen(true)}>
          Partner czeka na Twoją zgodę ({pendingVotes}). Otwórz panel zespołu.
        </button>
      )}
      <div className="game-body">
        <nav className="game-nav" aria-label="Sekcje śledztwa">
          {TABS.map((t) => (
            <NavLink key={t.to} to={gp(t.to)}>
              <span aria-hidden>{t.icon}</span>
              <span>{t.label}</span>
              {t.to === 'teczka' && newCount > 0 && (
                <span className="badge" aria-label={`${newCount} nowych`}>
                  {newCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <main id="game-main" className="game-main">
          <Routes>
            <Route index element={<Navigate to="teczka" replace />} />
            <Route path="teczka" element={<FolderTab />} />
            <Route path="teczka/:mid" element={<FolderTab />} />
            <Route path="osoby" element={<PeopleTab />} />
            <Route path="osoby/:pid" element={<PeopleTab />} />
            <Route path="sledztwo" element={<InvestigationTab />} />
            <Route path="sledztwo/oskarzenie" element={<AccusationView />} />
            <Route path="analiza" element={<AnalysisTab />} />
            <Route path="analiza/:sub" element={<AnalysisTab />} />
            <Route path="*" element={<Navigate to="teczka" replace />} />
          </Routes>
        </main>
      </div>
      <AssistantPanel open={assistantOpen} onClose={() => setAssistantOpen(false)} />
      {view.coop && <CoopPanel open={coopOpen} onClose={() => setCoopOpen(false)} />}
    </div>
  );
}
