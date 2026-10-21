import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ActionResponse,
  ActionResult,
  ChatMessageView,
  GameAction,
  GameView,
  ServerEvent,
} from '@detektyw/shared';
import { api, ApiRequestError, errorMessage } from './api';
import { useToasts } from '../components/Toasts';

const CACHE_PREFIX = 'dt:game:';

/** Kopia widoku do czytania materiałów offline (tylko na tym urządzeniu). */
function saveOffline(view: GameView) {
  try {
    localStorage.setItem(CACHE_PREFIX + view.id, JSON.stringify(view));
  } catch {
    /* brak miejsca lub zablokowany storage – działamy dalej bez kopii */
  }
}

function loadOffline(id: string): GameView | undefined {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + id);
    return raw ? (JSON.parse(raw) as GameView) : undefined;
  } catch {
    return undefined;
  }
}

export function clearOfflineGames() {
  try {
    for (const key of Object.keys(localStorage))
      if (key.startsWith(CACHE_PREFIX)) localStorage.removeItem(key);
  } catch {
    /* ignorujemy */
  }
}

export function useGameQuery(id: string) {
  return useQuery({
    queryKey: ['game', id],
    queryFn: async () => {
      const view = await api.get<GameView>(`/api/games/${id}`);
      saveOffline(view);
      return view;
    },
    placeholderData: () => loadOffline(id),
    refetchInterval: (q) => (q.state.data?.mode === 'coop' ? 60_000 : false),
  });
}

interface GameCtx {
  view: GameView;
  act: (action: GameAction) => Promise<ActionResult | null>;
  busy: boolean;
  chat: ChatMessageView[];
  connected: boolean;
}

const Ctx = createContext<GameCtx | null>(null);

export function useGame(): GameCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useGame poza GameProvider');
  return ctx;
}

export function GameProvider({ view, children }: { view: GameView; children: ReactNode }) {
  const qc = useQueryClient();
  const toasts = useToasts();
  const id = view.id;
  const { chat, connected } = useRealtime(id, view.mode === 'coop', view.version);

  const mutation = useMutation({
    mutationFn: (action: GameAction) =>
      api.post<ActionResponse>(`/api/games/${id}/actions`, { action }),
    onSuccess: (res) => {
      qc.setQueryData(['game', id], res.view);
      saveOffline(res.view);
    },
  });

  const act = useCallback(
    async (action: GameAction) => {
      try {
        const res = await mutation.mutateAsync(action);
        return res.result;
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 409)
          void qc.invalidateQueries({ queryKey: ['game', id] });
        toasts.push(errorMessage(err), 'error');
        return null;
      }
    },
    [mutation, qc, id, toasts],
  );

  return (
    <Ctx.Provider value={{ view, act, busy: mutation.isPending, chat, connected }}>
      {children}
    </Ctx.Provider>
  );
}

/** WebSocket: zmiany partnera, obecność, czat. Automatyczne wznawianie po rozłączeniu. */
function useRealtime(gameId: string, enabled: boolean, version: number) {
  const qc = useQueryClient();
  const [chat, setChat] = useState<ChatMessageView[]>([]);
  const [connected, setConnected] = useState(false);
  const versionRef = useRef(version);
  versionRef.current = version;

  useEffect(() => {
    if (!enabled) return;
    let ws: WebSocket | null = null;
    let stopped = false;
    let retry = 0;
    let ping: ReturnType<typeof setInterval> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    api
      .get<{ messages: ChatMessageView[] }>(`/api/games/${gameId}/chat`)
      .then((r) => setChat(r.messages))
      .catch(() => undefined);

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/api/games/${gameId}/ws`);
      ws.onopen = () => {
        retry = 0;
        setConnected(true);
        ping = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send('ping'), 25_000);
        // Po wznowieniu połączenia mogliśmy coś przegapić.
        void qc.invalidateQueries({ queryKey: ['game', gameId] });
      };
      ws.onmessage = (e) => {
        if (e.data === 'pong') return;
        const ev = JSON.parse(e.data as string) as ServerEvent;
        if (ev.type === 'changed' && ev.version > versionRef.current) {
          void qc.invalidateQueries({ queryKey: ['game', gameId] });
        } else if (ev.type === 'presence') {
          qc.setQueryData<GameView>(['game', gameId], (v) =>
            v?.coop
              ? {
                  ...v,
                  coop: {
                    ...v.coop,
                    players: v.coop.players.map((p) => ({
                      ...p,
                      online: ev.online.includes(p.seat),
                    })),
                  },
                }
              : v,
          );
        } else if (ev.type === 'chat') {
          setChat((c) =>
            c.some((m) => m.id === ev.message.id) ? c : [...c, ev.message].slice(-200),
          );
        }
      };
      ws.onclose = () => {
        setConnected(false);
        clearInterval(ping);
        if (stopped) return;
        retry++;
        timer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(retry, 5)));
      };
    };
    connect();
    return () => {
      stopped = true;
      clearInterval(ping);
      clearTimeout(timer);
      ws?.close();
    };
  }, [gameId, enabled, qc]);

  return { chat, connected };
}

/* ---------- pomocnicze dla widoków ---------- */

export const MATERIAL_TYPES: Record<string, { label: string; icon: string }> = {
  autopsy: { label: 'Medycyna sądowa', icon: '🩺' },
  report: { label: 'Raporty i notatki', icon: '📄' },
  press: { label: 'Prasa', icon: '📰' },
  testimony: { label: 'Zeznania', icon: '🗣️' },
  cctv: { label: 'Monitoring', icon: '📹' },
  photo: { label: 'Zdjęcia', icon: '📷' },
  phone: { label: 'Billingi', icon: '📞' },
  bank: { label: 'Finanse', icon: '💳' },
  messages: { label: 'Wiadomości', icon: '💬' },
  inventory: { label: 'Spisy i protokoły', icon: '📋' },
  lab: { label: 'Laboratorium', icon: '🧪' },
  field: { label: 'Wywiad środowiskowy', icon: '🏘️' },
  other: { label: 'Inne', icon: '📁' },
};

export function useRefLabel() {
  const { view } = useGame();
  return useCallback(
    (ref: string) => {
      const m = view.materials.find((x) => x.id === ref);
      if (m) return m.title;
      const p = view.people.find((x) => x.id === ref);
      if (p) return p.name;
      for (const mat of view.materials) {
        const hs =
          mat.body.kind === 'photo'
            ? mat.body.hotspots
            : mat.body.kind === 'cctv'
              ? mat.body.frames.flatMap((f) => f.hotspots)
              : [];
        const h = hs.find((x) => x.id === ref);
        if (h) return h.label;
      }
      return '–';
    },
    [view],
  );
}

export function foundHotspots(view: GameView) {
  return view.materials.flatMap((m) =>
    m.body.kind === 'photo'
      ? m.body.hotspots.map((h) => ({ ...h, materialTitle: m.title }))
      : m.body.kind === 'cctv'
        ? m.body.frames.flatMap((f) => f.hotspots.map((h) => ({ ...h, materialTitle: m.title })))
        : [],
  );
}

export function timeLabel(units: number) {
  const day = Math.floor(units / 2) + 1;
  return `dzień ${day}, ${units % 2 === 0 ? 'rano' : 'popołudnie'}`;
}

export function seatName(view: GameView, seat?: number) {
  return (
    view.coop?.players.find((p) => p.seat === seat)?.displayName ??
    (seat === view.seat ? 'Ty' : 'Partner')
  );
}

/** Ścieżki bezwzględne w obrębie gry (trasy z „*” w React Router rozwiązują ścieżki względne od pełnego URL). */
export function useGamePath() {
  const { view } = useGame();
  return useCallback((sub: string) => `/gra/${view.id}/${sub}`, [view.id]);
}
