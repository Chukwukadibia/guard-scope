import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <main id="main" className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-xl font-semibold text-slate-900">Page not found</h1>
      <Link to="/" className="mt-4 inline-block text-sm text-brand-700 underline">
        Go to GuardScope
      </Link>
    </main>
  );
}
