import { useEffect, useId, useRef, type MouseEvent } from 'react';
import { CircleAlert } from 'lucide-react';

import type { SummaryError } from '../../lib/domain/formErrors';

export type { SummaryError };

/**
 * Accessible summary of client-side validation errors (FEATURE_SPEC §6: "summarised on submit").
 * Inline field errors stay in place; this lists each one as a link to its field. On every failed
 * submit (`attempt` changes) focus moves to the summary so screen-reader and keyboard users land on it.
 */
export function ErrorSummary({
  errors,
  attempt,
  headingLevel = 2,
}: {
  errors: SummaryError[];
  /** Incremented on each failed submit; re-focuses the summary even if the errors are unchanged. */
  attempt: number;
  headingLevel?: 2 | 3;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const hasErrors = errors.length > 0;

  useEffect(() => {
    if (hasErrors && attempt > 0) ref.current?.focus();
  }, [attempt, hasErrors]);

  if (!hasErrors) return null;

  const Heading = headingLevel === 3 ? 'h3' : 'h2';

  function goToField(e: MouseEvent<HTMLAnchorElement>, fieldId: string) {
    const el = document.getElementById(fieldId);
    if (!el) return; // fall back to the native in-page link
    e.preventDefault();
    el.focus();
    el.scrollIntoView?.({ block: 'center' });
  }

  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      aria-labelledby={headingId}
      className="rounded-md border-2 border-red-600 bg-red-50 p-4 text-sm text-red-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-700"
    >
      <Heading id={headingId} className="flex items-center gap-2 text-base font-semibold">
        <CircleAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
        There is a problem
      </Heading>
      <ul className="mt-2 list-disc space-y-1 pl-6">
        {errors.map(({ fieldId, message }) => (
          <li key={fieldId}>
            <a
              href={`#${fieldId}`}
              onClick={(e) => goToField(e, fieldId)}
              className="font-medium text-red-800 underline"
            >
              {message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
