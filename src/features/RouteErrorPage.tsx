import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

/** Shown instead of a blank screen if a page fails unexpectedly. No technical details are exposed (PRD §10.5). */
export function RouteErrorPage() {
  useDocumentTitle('Something went wrong');
  return (
    <main id="main" className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-xl font-semibold text-slate-900">Something went wrong</h1>
      <p className="mt-2 text-sm text-slate-600">
        Please reload the page. If it keeps happening, try again later.
      </p>
      <Link to="/" className="mt-4 inline-block text-sm text-brand-700 underline">
        Go to the dashboard
      </Link>
    </main>
  );
}
