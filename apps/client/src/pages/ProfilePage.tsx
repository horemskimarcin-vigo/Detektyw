import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { PublicUser, UserSettings } from '@detektyw/shared';
import { api, errorMessage, fieldErrors } from '../lib/api';
import { useMe, useSetMe } from '../lib/auth';
import { Field, FormError } from '../components/Field';

export function ProfilePage() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const setMe = useSetMe();
  if (!me) return null;

  async function saveSettings(patch: Partial<UserSettings>) {
    const { user } = await api.patch<{ user: PublicUser }>('/api/account', { settings: patch });
    setMe(user);
  }

  async function logout() {
    await api.post('/api/auth/logout');
    setMe(null);
  }

  return (
    <div className="stack-lg">
      <h1>{t('profile.title')}</h1>
      <DisplayNameForm user={me} />

      <section className="card stack" aria-labelledby="appearance">
        <h2 id="appearance">{t('profile.appearance')}</h2>
        <fieldset className="segmented">
          <legend>{t('profile.theme')}</legend>
          {(
            [
              ['dark', t('profile.themeDark')],
              ['light', t('profile.themeLight')],
              ['system', t('profile.themeSystem')],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className={me.settings.theme === value ? 'active' : undefined}>
              <input
                type="radio"
                name="theme"
                value={value}
                checked={me.settings.theme === value}
                onChange={() => saveSettings({ theme: value })}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <div className="field">
          <label htmlFor="fontScale">
            {t('profile.fontScale')}: {Math.round(me.settings.fontScale * 100)}%
          </label>
          <input
            id="fontScale"
            type="range"
            min={0.85}
            max={1.5}
            step={0.05}
            defaultValue={me.settings.fontScale}
            onChange={(e) =>
              document.documentElement.style.setProperty('--font-scale', e.target.value)
            }
            onPointerUp={(e) => saveSettings({ fontScale: Number(e.currentTarget.value) })}
            onKeyUp={(e) => saveSettings({ fontScale: Number(e.currentTarget.value) })}
          />
        </div>
        <Toggle
          label={t('profile.reduceMotion')}
          checked={me.settings.reduceMotion}
          onChange={(v) => saveSettings({ reduceMotion: v })}
        />
      </section>

      <section className="card stack" aria-labelledby="assistant">
        <h2 id="assistant">{t('profile.assistant')}</h2>
        <Toggle
          label={t('profile.assistantProactive')}
          checked={me.settings.assistantProactive}
          onChange={(v) => saveSettings({ assistantProactive: v })}
        />
        <Toggle
          label={t('profile.noHintsChallenge')}
          checked={me.settings.noHintsChallenge}
          onChange={(v) => saveSettings({ noHintsChallenge: v })}
        />
      </section>

      <PasswordForm />

      <section className="card stack" aria-labelledby="data">
        <h2 id="data">{t('profile.data')}</h2>
        <a className="button" href="/api/account/export" download>
          {t('profile.export')}
        </a>
        <button onClick={logout}>{t('auth.logout')}</button>
        <DeleteAccount onDeleted={() => setMe(null)} />
      </section>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function DisplayNameForm({ user }: { user: PublicUser }) {
  const { t } = useTranslation();
  const setMe = useSetMe();
  const [status, setStatus] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setFields({});
    try {
      const res = await api.patch<{ user: PublicUser }>('/api/account', {
        displayName: form.get('displayName'),
      });
      setMe(res.user);
      setStatus(t('profile.saved'));
    } catch (err) {
      setFields(fieldErrors(err));
      setStatus(null);
    }
  }

  return (
    <form className="card stack" onSubmit={onSubmit}>
      <p className="small muted">{user.email}</p>
      <Field
        label={t('auth.displayName')}
        name="displayName"
        defaultValue={user.displayName}
        errors={fields.displayName}
        required
      />
      {status && <p role="status">{status}</p>}
      <button type="submit">{t('profile.save')}</button>
    </form>
  );
}

function PasswordForm() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    setError(null);
    setFields({});
    setStatus(null);
    try {
      await api.post('/api/account/password', {
        currentPassword: form.get('currentPassword'),
        newPassword: form.get('newPassword'),
      });
      formEl.reset();
      setStatus(t('profile.passwordChanged'));
    } catch (err) {
      setError(errorMessage(err));
      setFields(fieldErrors(err));
    }
  }

  return (
    <form className="card stack" onSubmit={onSubmit} aria-labelledby="security">
      <h2 id="security">{t('profile.security')}</h2>
      <Field
        label={t('auth.currentPassword')}
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        errors={fields.currentPassword}
        required
      />
      <Field
        label={t('auth.newPassword')}
        name="newPassword"
        type="password"
        autoComplete="new-password"
        hint={t('auth.passwordHint')}
        errors={fields.newPassword}
        required
      />
      <FormError message={error} />
      {status && <p role="status">{status}</p>}
      <button type="submit">{t('profile.changePassword')}</button>
    </form>
  );
}

function DeleteAccount({ onDeleted }: { onDeleted: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await api.delete('/api/account', { password: form.get('password') });
      onDeleted();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (!open) {
    return (
      <button className="danger" onClick={() => setOpen(true)}>
        {t('profile.deleteAccount')}
      </button>
    );
  }
  return (
    <form className="stack danger-zone" onSubmit={onSubmit}>
      <p>{t('profile.deleteWarning')}</p>
      <Field
        label={t('auth.password')}
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      <FormError message={error} />
      <button className="danger" type="submit">
        {t('profile.deleteConfirm')}
      </button>
    </form>
  );
}
