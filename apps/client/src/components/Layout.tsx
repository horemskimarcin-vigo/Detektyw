import { NavLink, Outlet } from 'react-router';
import { useTranslation } from 'react-i18next';
import { PwaBanners } from './PwaBanners';

export function Layout() {
  const { t } = useTranslation();
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Przejdź do treści
      </a>
      <header className="topbar">
        <span className="brand">{t('app.name')}</span>
      </header>
      <PwaBanners />
      <main id="main" className="content">
        <Outlet />
      </main>
      <nav className="bottom-nav" aria-label="Główna nawigacja">
        <NavLink to="/" end>
          <span aria-hidden>🗂</span>
          {t('nav.home')}
        </NavLink>
        <NavLink to="/profil">
          <span aria-hidden>👤</span>
          {t('nav.profile')}
        </NavLink>
      </nav>
    </div>
  );
}

export function PublicLayout() {
  return (
    <div className="app-shell public">
      <PwaBanners />
      <main id="main" className="content narrow">
        <Outlet />
      </main>
    </div>
  );
}
