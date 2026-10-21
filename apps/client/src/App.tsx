import { Navigate, Route, Routes, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMe } from './lib/auth';
import { useApplySettings } from './lib/theme';
import { Layout, PublicLayout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ForgotPasswordPage, ResetPasswordPage } from './pages/ResetPasswordPages';
import { HomePage } from './pages/HomePage';
import { ProfilePage } from './pages/ProfilePage';
import { GameShell } from './pages/game/GameShell';
import { JoinPage } from './pages/JoinPage';

export function App() {
  const { t } = useTranslation();
  const { data: user, isLoading } = useMe();
  const location = useLocation();
  useApplySettings(user?.settings);

  if (isLoading) {
    return (
      <p className="center muted" role="status">
        {t('app.loading')}
      </p>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/logowanie" element={<LoginPage />} />
          <Route path="/rejestracja" element={<RegisterPage />} />
          <Route path="/reset-hasla" element={<ForgotPasswordPage />} />
          <Route path="/reset-hasla/:token" element={<ResetPasswordPage />} />
          <Route
            path="/dolacz/:code"
            element={<Navigate to="/logowanie" replace state={{ from: location.pathname }} />}
          />
          <Route
            path="*"
            element={<Navigate to="/logowanie" replace state={{ from: location.pathname }} />}
          />
        </Route>
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/gra/:id/*" element={<GameShell />} />
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/profil" element={<ProfilePage />} />
        <Route path="/dolacz/:code" element={<JoinPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
