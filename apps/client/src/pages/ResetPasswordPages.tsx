import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { api, errorMessage, fieldErrors } from '../lib/api';
import { Field, FormError } from '../components/Field';
import { AuthHeader } from './LoginPage';

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError(null);
    try {
      await api.post('/api/auth/password-reset/request', { email: form.get('email') });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <>
      <AuthHeader />
      <div className="card stack">
        <h2>{t('auth.resetTitle')}</h2>
        {sent ? (
          <p role="status">{t('auth.resetSent')}</p>
        ) : (
          <form className="stack" onSubmit={onSubmit} noValidate>
            <p className="muted">{t('auth.resetIntro')}</p>
            <Field
              label={t('auth.email')}
              name="email"
              type="email"
              autoComplete="email"
              required
            />
            <FormError message={error} />
            <button className="primary" type="submit">
              {t('auth.resetSend')}
            </button>
          </form>
        )}
        <Link to="/logowanie">{t('app.back')}</Link>
      </div>
    </>
  );
}

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const { token } = useParams();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError(null);
    setFields({});
    try {
      await api.post('/api/auth/password-reset/confirm', { token, password: form.get('password') });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
      setFields(fieldErrors(err));
    }
  }

  return (
    <>
      <AuthHeader />
      <div className="card stack">
        <h2>{t('auth.resetSet')}</h2>
        {done ? (
          <>
            <p role="status">{t('auth.resetDone')}</p>
            <Link className="button primary" to="/logowanie">
              {t('auth.login')}
            </Link>
          </>
        ) : (
          <form className="stack" onSubmit={onSubmit} noValidate>
            <Field
              label={t('auth.newPassword')}
              name="password"
              type="password"
              autoComplete="new-password"
              hint={t('auth.passwordHint')}
              errors={fields.password}
              required
            />
            <FormError message={error} />
            <button className="primary" type="submit">
              {t('auth.resetSet')}
            </button>
          </form>
        )}
      </div>
    </>
  );
}
