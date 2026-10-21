import type { ApiError } from '@detektyw/shared';

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public body: ApiError,
  ) {
    super(body.message);
  }
}

function csrfToken(): string | undefined {
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith('dt_csrf='))
    ?.slice('dt_csrf='.length);
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  // Pierwsze żądanie modyfikujące bez ciasteczka CSRF – pobierz je zwykłym GET-em.
  if (method !== 'GET' && !csrfToken()) await fetch('/api/auth/me', { credentials: 'same-origin' });
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(method !== 'GET' ? { 'x-csrf-token': csrfToken() ?? '' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({ error: 'network', message: 'Błąd połączenia.' }));
  if (!res.ok) throw new ApiRequestError(res.status, data as ApiError);
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body: unknown = {}) => request<T>('POST', url, body),
  patch: <T>(url: string, body: unknown = {}) => request<T>('PATCH', url, body),
  delete: <T>(url: string, body: unknown = {}) => request<T>('DELETE', url, body),
};

export function fieldErrors(err: unknown): Record<string, string[]> {
  return err instanceof ApiRequestError ? (err.body.fields ?? {}) : {};
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) return err.body.message;
  return 'Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.';
}
