import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

type Common = { label: string; error?: string; hint?: ReactNode; optional?: boolean };

function describedBy(hintId: string, errId: string, hint?: ReactNode, error?: string) {
  return [hint ? hintId : null, error ? errId : null].filter(Boolean).join(' ') || undefined;
}

function Label({ id, label, optional }: { id: string; label: string; optional?: boolean }) {
  return (
    <label htmlFor={id} className="block text-sm font-medium text-slate-800">
      {label}
      {optional && <span className="ml-1 font-normal text-slate-500">(optional)</span>}
    </label>
  );
}

function Messages({
  hintId,
  errId,
  hint,
  error,
}: {
  hintId: string;
  errId: string;
  hint?: ReactNode;
  error?: string;
}) {
  return (
    <>
      {hint && (
        <p id={hintId} className="mt-1 text-sm text-slate-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="mt-1 text-sm font-medium text-red-700">
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      )}
    </>
  );
}

const control =
  'mt-1 block w-full min-h-11 rounded-md border bg-white px-3 text-base text-slate-900 shadow-sm';

export function TextField({
  label,
  error,
  hint,
  optional,
  id: idProp,
  ...rest
}: Common & InputHTMLAttributes<HTMLInputElement>) {
  // The label, the control and any ErrorSummary link must all use the same id.
  const generatedId = useId();
  const id = idProp ?? generatedId;
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  return (
    <div>
      <Label id={id} label={label} optional={optional} />
      <input
        {...rest}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hintId, errId, hint, error)}
        className={`${control} ${error ? 'border-red-600' : 'border-slate-300'}`}
      />
      <Messages hintId={hintId} errId={errId} hint={hint} error={error} />
    </div>
  );
}

export function SelectField({
  label,
  error,
  hint,
  optional,
  children,
  id: idProp,
  ...rest
}: Common & SelectHTMLAttributes<HTMLSelectElement>) {
  const generatedId = useId();
  const id = idProp ?? generatedId;
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  return (
    <div>
      <Label id={id} label={label} optional={optional} />
      <select
        {...rest}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hintId, errId, hint, error)}
        className={`${control} ${error ? 'border-red-600' : 'border-slate-300'}`}
      >
        {children}
      </select>
      <Messages hintId={hintId} errId={errId} hint={hint} error={error} />
    </div>
  );
}
