import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CheckCircle, Loader2, ShieldAlert, X } from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import { getDisputeJob } from '../lib/payments';
import { DisputeCaseFile } from './Admin';
import type { ConfirmConfig } from './Admin';
import { supabase } from '../lib/supabase';

interface ToastMessage {
  text: string;
  type: 'success' | 'error';
}

export default function AdminDisputeCase() {
  const { jobId } = useParams();
  const { user, profile, loading: authLoading } = useAuth();
  const [dispute, setDispute] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<ToastMessage | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<ConfirmConfig | null>(null);

  const showToast = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4500);
  }, []);

  const loadCase = useCallback(async (options?: { silent?: boolean }) => {
    if (!profile?.is_admin || !jobId) return;
    if (!options?.silent) {
      setLoading(true);
    }
    setError(null);
    const { data, error: fetchError } = await getDisputeJob(jobId);
    if (fetchError) setError(fetchError.message || 'Failed to load dispute case.');
    else setDispute(data);
    setLoading(false);
  }, [jobId, profile]);

  useEffect(() => { loadCase(); }, [loadCase]);

  // Realtime sync for this specific dispute case
  useEffect(() => {
    if (!profile?.is_admin || !jobId) return;

    const channel = supabase
      .channel(`admin-dispute-case-sync:${jobId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'job_issues',
          filter: `job_id=eq.${jobId}`
        },
        () => {
          void loadCase({ silent: true });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payments',
          filter: `job_id=eq.${jobId}`
        },
        () => {
          void loadCase({ silent: true });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'jobs',
          filter: `id=eq.${jobId}`
        },
        () => {
          void loadCase({ silent: true });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profile, jobId, loadCase]);

  if (authLoading) return <div className="p-12 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!user || !profile?.is_admin) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 bg-card border rounded-3xl text-center space-y-3">
        <ShieldAlert className="h-10 w-10 text-red-500 mx-auto" />
        <h2 className="text-2xl font-black">Access Denied</h2>
        <p className="text-sm text-muted-foreground font-semibold">This area is restricted to staff administrators.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin/disputes" className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="h-4 w-4" /> Manage disputes
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight">Dispute Case</h1>
        <p className="text-muted-foreground mt-1">Full case file, internal notes, evidence, payment details, and resolution controls.</p>
      </div>

      {loading ? (
        <div className="p-12 bg-card border rounded-3xl flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : error ? (
        <div className="p-5 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-600 font-semibold flex items-center gap-2">
          <AlertCircle className="h-5 w-5" /> {error}
        </div>
      ) : !dispute ? (
        <div className="p-10 bg-card border rounded-3xl text-center space-y-2">
          <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto" />
          <h2 className="font-extrabold">Dispute case not found</h2>
          <p className="text-sm text-muted-foreground font-semibold">No dispute record exists for this job.</p>
        </div>
      ) : (
        <div className="bg-card border rounded-3xl overflow-hidden shadow-sm">
          <DisputeCaseFile
            dispute={dispute}
            onResolved={() => loadCase({ silent: true })}
            showToast={showToast}
            showConfirm={setConfirmConfig}
          />
        </div>
      )}

      {confirmConfig && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-card border w-full max-w-md rounded-2xl shadow-xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-bold">{confirmConfig.title}</h3>
              <button onClick={() => setConfirmConfig(null)} className="p-1 rounded-lg hover:bg-muted text-muted-foreground"><X className="h-4 w-4" /></button>
            </div>
            <p className="text-sm text-muted-foreground font-semibold leading-relaxed">{confirmConfig.message}</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmConfig(null)} className="bg-secondary px-4 py-2 rounded-xl font-bold text-sm">Cancel</button>
              <button
                onClick={() => { const action = confirmConfig.onConfirm; setConfirmConfig(null); action(); }}
                className={`px-4 py-2 rounded-xl font-black text-sm ${confirmConfig.isDanger ? 'bg-red-600 text-white' : 'bg-primary text-primary-foreground'}`}
              >
                {confirmConfig.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-[80] bg-card border rounded-2xl shadow-xl p-4 flex items-center gap-3 max-w-sm">
          {toastMessage.type === 'success' ? <CheckCircle className="h-5 w-5 text-green-500" /> : <AlertCircle className="h-5 w-5 text-red-500" />}
          <span className="text-sm font-bold">{toastMessage.text}</span>
        </div>
      )}
    </div>
  );
}
