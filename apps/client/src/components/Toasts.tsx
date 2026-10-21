import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type Kind = 'info' | 'error' | 'success';
interface Toast {
  id: number;
  text: string;
  kind: Kind;
}

const Ctx = createContext<{ push: (text: string, kind?: Kind) => void }>({ push: () => undefined });

export function useToasts() {
  return useContext(Ctx);
}

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Kind = 'info') => {
    const id = nextId++;
    setToasts((t) => [...t.slice(-3), { id, text, kind }]);
    setTimeout(
      () => setToasts((t) => t.filter((x) => x.id !== id)),
      kind === 'error' ? 6000 : 4500,
    );
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast ${t.kind}`}
            onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}
          >
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
