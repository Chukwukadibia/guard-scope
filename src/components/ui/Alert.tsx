import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info } from 'lucide-react';

type Tone = 'error' | 'success' | 'info';

const tones: Record<Tone, { box: string; Icon: typeof Info; label: string }> = {
  error: { box: 'border-red-200 bg-red-50 text-red-900', Icon: CircleAlert, label: 'Error' },
  success: {
    box: 'border-green-200 bg-green-50 text-green-900',
    Icon: CircleCheck,
    label: 'Success',
  },
  info: { box: 'border-slate-200 bg-white text-slate-800', Icon: Info, label: 'Note' },
};

/** Status is conveyed by text and icon, not colour alone (PRD §12). */
export function Alert({ tone, children, id }: { tone: Tone; children: ReactNode; id?: string }) {
  const { box, Icon, label } = tones[tone];
  return (
    <div
      id={id}
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex gap-2 rounded-md border p-3 text-sm ${box}`}
    >
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        <span className="sr-only">{label}: </span>
        {children}
      </p>
    </div>
  );
}

export function EmptyState({
  title,
  children,
  icon,
}: {
  title: string;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      {icon && <div className="mx-auto mb-3 flex justify-center text-slate-400">{icon}</div>}
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mx-auto mt-2 max-w-md text-sm text-slate-600">{children}</div>
    </section>
  );
}
