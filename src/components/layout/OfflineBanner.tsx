import { WifiOff } from 'lucide-react';
import { useOnline } from '../../hooks/useOnline';

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-sm text-amber-950"
    >
      <WifiOff aria-hidden="true" className="h-4 w-4" />
      You&apos;re offline. Changes can&apos;t be saved until your connection returns.
    </div>
  );
}
