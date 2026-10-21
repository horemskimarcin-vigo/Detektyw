import { useId, type InputHTMLAttributes } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  errors?: string[];
}

export function Field({ label, hint, errors, ...input }: Props) {
  const id = useId();
  const describedBy = [hint && `${id}-hint`, errors?.length && `${id}-err`]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...input}
      />
      {hint && (
        <small id={`${id}-hint`} className="hint">
          {hint}
        </small>
      )}
      {errors?.length ? (
        <small id={`${id}-err`} className="error" role="alert">
          {errors.join(' ')}
        </small>
      ) : null}
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p className="form-error" role="alert">
      {message}
    </p>
  );
}
