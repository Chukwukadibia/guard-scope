import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './features/auth/AuthProvider';
import { router } from './routes';
import { isSupabaseConfigured } from './lib/supabase';

export default function App() {
  if (!isSupabaseConfigured) {
    return (
      <main className="mx-auto max-w-md p-8">
        <h1 className="text-xl font-semibold">GuardScope is not configured</h1>
        <p className="mt-2 text-sm text-slate-600">
          Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (see .env.example).
        </p>
      </main>
    );
  }
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
