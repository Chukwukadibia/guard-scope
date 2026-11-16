import { Spinner } from '../ui/Button';

export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner label="Loading GuardScope…" />
    </div>
  );
}
