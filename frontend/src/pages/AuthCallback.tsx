import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    const finishOAuthSignIn = async () => {
      const params = new URLSearchParams(window.location.search);
      const oauthError = params.get('error_description') || params.get('error');

      if (oauthError) {
        if (!disposed) setError(oauthError);
        return;
      }

      const { data, error: sessionError } = await supabase.auth.getSession();

      if (disposed) return;

      if (sessionError) {
        console.error('OAuth callback session error:', sessionError.message);
        setError(sessionError.message || 'Google sign-in could not be completed.');
        return;
      }

      if (data.session) {
        navigate('/', { replace: true });
        return;
      }

      const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          navigate('/', { replace: true });
        }
      });

      window.setTimeout(async () => {
        if (disposed) return;

        const { data: retryData, error: retryError } = await supabase.auth.getSession();

        if (disposed) return;

        if (retryData.session) {
          navigate('/', { replace: true });
        } else {
          if (retryError) {
            console.error('OAuth callback retry error:', retryError.message);
          }
          authListener.subscription.unsubscribe();
          setError('Google sign-in did not complete. Please try again.');
        }
      }, 2500);
    };

    void finishOAuthSignIn();

    return () => {
      disposed = true;
    };
  }, [navigate]);

  return (
    <div className="max-w-md mx-auto my-12 bg-card border border-border rounded-3xl shadow-xl p-8 text-center space-y-5">
      {error ? (
        <>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-500">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-black tracking-tight">Sign-in could not be completed</h1>
            <p className="text-sm font-semibold text-muted-foreground">{error}</p>
          </div>
          <Link
            to="/login"
            className="inline-flex items-center justify-center bg-primary text-primary-foreground text-sm font-bold px-5 py-3 rounded-xl hover:bg-primary/95 shadow-md active:scale-95 transition-all"
          >
            Back to sign in
          </Link>
        </>
      ) : (
        <>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-black tracking-tight">Completing Google sign-in</h1>
            <p className="text-sm font-semibold text-muted-foreground">Please wait while TradieHubAU confirms your session.</p>
          </div>
        </>
      )}
    </div>
  );
}
