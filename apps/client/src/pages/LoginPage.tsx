import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { PublicUser } from '@detektyw/shared';
import { api, errorMessage } from '../lib/api';
import { useSetMe } from '../lib/auth';
import { Field, FormError } from '../components/Field';

export function AuthHeader() {
  const { t } = useTranslation();
  return (
    <header className="auth-header">
      <img src="/icon.svg" alt="" width={72} height={72} />
      <h1>{t('app.name')}</h1>
      <p className="muted">{t('app.tagline')}</p>
    </header>
  );
}

export function LoginPage() {
  const { t } = useTranslation();
  const setMe = useSetMe();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const { user } = await api.post<{ user: PublicUser }>('/api/auth/login', {
        email: form.get('email'),
        password: form.get('password'),
      });
      setMe(user);
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AuthHeader />
      <form className="card stack" onSubmit={onSubmit} noValidate>
        <h2>{t('auth.login')}</h2>
        <Field label={t('auth.email')} name="email" type="email" autoComplete="email" required />
        <Field
          label={t('auth.password')}
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <FormError message={error} />
        <button className="primary" type="submit" disabled={busy}>
          {t('auth.login')}
        </button>
        <Link to="/reset-hasla" className="small">
          {t('auth.forgot')}
        </Link>
      </form>
      <p className="center">
        {t('auth.noAccount')} <Link to="/rejestracja">{t('auth.register')}</Link>
      </p>
    </>
  );
}
