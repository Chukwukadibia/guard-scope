import { ShieldCheck } from 'lucide-react';

export function Brand() {
  return (
    <span className="inline-flex items-center gap-2 text-lg font-semibold text-slate-900">
      <ShieldCheck aria-hidden="true" className="h-6 w-6 text-brand-600" />
      GuardScope
    </span>
  );
}
