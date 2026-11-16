import type { ReactNode } from 'react';
import { OfflineBanner } from './OfflineBanner';
import { Brand } from './Brand';

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <OfflineBanner />
      <main id="main" className="mx-auto flex max-w-md flex-col px-4 py-10 sm:py-16">
        <div className="mb-6 text-center">
          <Brand />
          <p className="mt-1 text-sm text-slate-600">
            Know what&apos;s included. Charge for what&apos;s extra.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="mb-4 text-xl font-semibold text-slate-900">{title}</h1>
          {children}
        </div>
      </main>
    </div>
  );
}
