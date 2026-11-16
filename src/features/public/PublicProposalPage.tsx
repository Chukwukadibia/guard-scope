import { Brand } from '../../components/layout/Brand';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

/** Reserved for client approval links (Phase 5). Until then, every link is reported as unavailable. */
export function PublicProposalPage() {
  useDocumentTitle('Proposal');
  return (
    <main id="main" className="mx-auto max-w-md px-4 py-16 text-center">
      <Brand />
      <h1 className="mt-6 text-xl font-semibold text-slate-900">This link isn&apos;t available</h1>
      <p className="mt-2 text-sm text-slate-600">
        Please ask the person who sent it to share a new link.
      </p>
    </main>
  );
}
