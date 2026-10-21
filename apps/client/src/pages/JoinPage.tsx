import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, errorMessage } from '../lib/api';

export function JoinPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api
      .post<{ id: string }>('/api/games/join', { code })
      .then((r) => navigate(`/gra/${r.id}`, { replace: true }))
      .catch((e) => setError(errorMessage(e)));
  }, [code, navigate]);
  return (
    <div className="stack">
      <h1>Dołączanie do śledztwa</h1>
      {error ? (
        <>
          <p className="form-error">{error}</p>
          <Link to="/">Wróć do spraw</Link>
        </>
      ) : (
        <p className="muted">Sprawdzam zaproszenie…</p>
      )}
    </div>
  );
}
