import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { PublicUser } from '@detektyw/shared';
import { api, errorMessage, fieldErrors } from '../lib/api';
import { useSetMe } from '../lib/auth';
import { Field, FormError } from '../components/Field';
import { AuthHeader } from './LoginPage';

export function RegisterPage() {
  const { t } = useTranslation();
  const setMe = useSetMe();
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const { user } = await api.post<{ user: PublicUser }>('/api/auth/register', {
        email: form.get('email'),
        password: form.get('password'),
        displayName: form.get('displayName'),
        acceptAdultContent: form.get('acceptAdultContent') === 'on',
      });
      setMe(user);
    } catch (err) {
      setError(errorMessage(err));
      setFields(fieldErrors(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AuthHeader />
      <div className="banner warn" role="note">
        {t('app.adultWarning')}
      </div>
      <form className="card stack" onSubmit={onSubmit} noValidate>
        <h2>{t('auth.register')}</h2>
        <Field
          label={t('auth.displayName')}
          name="displayName"
          autoComplete="nickname"
          hint={t('auth.displayNameHint')}
          errors={fields.displayName}
          required
        />
        <Field
          label={t('auth.email')}
          name="email"
          type="email"
          autoComplete="email"
          errors={fields.email}
          required
        />
        <Field
          label={t('auth.password')}
          name="password"
          type="password"
          autoComplete="new-password"
          hint={t('auth.passwordHint')}
          errors={fields.password}
          minLength={10}
          required
        />
        <label className="check">
          <input type="checkbox" name="acceptAdultContent" required />
          <span>{t('auth.acceptAdult')}</span>
        </label>
        {fields.acceptAdultContent && (
          <small className="error" role="alert">
            {fields.acceptAdultContent.join(' ')}
          </small>
        )}
        <FormError message={error} />
        <button className="primary" type="submit" disabled={busy}>
          {t('auth.register')}
        </button>
        <small className="muted">{t('auth.privacy')}</small>
      </form>
      <p className="center">
        {t('auth.haveAccount')} <Link to="/logowanie">{t('auth.login')}</Link>
      </p>
    </>
  );
}
