import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRegisterSW } from 'virtual:pwa-register/react';

export function PwaBanners() {
  const { t } = useTranslation();
  const [online, setOnline] = useState(navigator.onLine);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  return (
    <div aria-live="polite">
      {!online && <div className="banner warn">{t('app.offline')}</div>}
      {needRefresh && (
        <div className="banner">
          {t('app.updateReady')}{' '}
          <button className="link" onClick={() => updateServiceWorker(true)}>
            {t('app.update')}
          </button>
        </div>
      )}
    </div>
  );
}
