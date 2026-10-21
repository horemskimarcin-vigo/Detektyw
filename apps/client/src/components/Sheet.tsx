import { useEffect, useRef, type ReactNode } from 'react';

/** Okno modalne na bazie <dialog> (fokus, Esc, czytniki ekranu). Na telefonie wysuwa się od dołu. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`sheet${wide ? ' wide' : ''}`}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="sheet-inner">
        <header className="sheet-head">
          <h2>{title}</h2>
          <button className="icon" onClick={onClose} aria-label="Zamknij">
            ✕
          </button>
        </header>
        <div className="sheet-body">{open && children}</div>
      </div>
    </dialog>
  );
}

export function Confirm({
  open,
  title,
  children,
  confirmLabel,
  onConfirm,
  onClose,
  danger,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  danger?: boolean;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="stack">
        {children}
        <div className="row-buttons">
          <button onClick={onClose}>Anuluj</button>
          <button
            className={danger ? 'danger' : 'primary'}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
