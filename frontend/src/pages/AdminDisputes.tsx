import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle, FolderOpen, Loader2, ShieldAlert } from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import { getAllDisputeJobs } from '../lib/payments';

function formatJobRef(id: string): string {
  return `#${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

function formatAUD(cents = 0): string {
  return (cents / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

function getPrimaryIssue(dispute: any) {
  const issues = dispute.job_issues || [];
  return issues.find((issue: any) => issue.status === 'open') || issues[0];
}

function DisputeList({ disputes, emptyText }: { disputes: any[]; emptyText: string }) {
  if (disputes.length === 0) {
    return <div className="p-8 text-center text-sm text-muted-foreground font-semibold">{emptyText}</div>;
  }

  return (
    <div className="divide-y divide-border">
      {disputes.map(dispute => {
        const issue = getPrimaryIssue(dispute);
        const payment = Array.isArray(dispute.payments) ? dispute.payments[0] : dispute.payments;
        const contractor = payment?.payee;
        const status = issue?.status === 'open' && dispute.status === 'disputed'
          ? 'Ongoing'
          : issue?.status?.replace(/_/g, ' ') || dispute.status?.replace(/_/g, ' ');

        return (
          <article key={dispute.id} className="p-5 grid grid-cols-1 xl:grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 items-center">
            <div className="min-w-0">
              <h3 className="font-extrabold text-foreground truncate">{dispute.title}</h3>
              <p className="text-xs text-muted-foreground font-semibold mt-1">
                Job ref <span className="font-mono text-foreground">{formatJobRef(dispute.id)}</span>
              </p>
            </div>
            <div className="text-xs">
              <p className="text-[10px] uppercase tracking-wider font-black text-muted-foreground">Parties</p>
              <p className="font-bold text-foreground mt-1">{dispute.customer?.display_name || 'Unknown customer'}</p>
              <p className="font-semibold text-muted-foreground">{contractor?.display_name || 'Unknown contractor'}</p>
            </div>
            <div className="text-xs">
              <p className="text-[10px] uppercase tracking-wider font-black text-muted-foreground">Disputed</p>
              <p className="font-bold text-foreground mt-1">
                {issue?.created_at ? new Date(issue.created_at).toLocaleDateString('en-AU') : 'Unknown'}
              </p>
            </div>
            <div className="text-xs">
              <p className="text-[10px] uppercase tracking-wider font-black text-muted-foreground">Amount held</p>
              <p className="font-black text-foreground mt-1">{formatAUD(payment?.amount)}</p>
              <span className={`inline-flex mt-1 px-2 py-0.5 rounded-full text-[10px] font-black capitalize ${
                status === 'Ongoing' ? 'bg-red-500/10 text-red-600' : 'bg-green-500/10 text-green-700'
              }`}>{status}</span>
            </div>
            <Link
              to={`/admin/disputes/${dispute.id}`}
              className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/95 text-primary-foreground font-black px-4 py-2.5 rounded-xl text-xs transition shadow-sm"
            >
              <FolderOpen className="h-4 w-4" /> Open Case
            </Link>
          </article>
        );
      })}
    </div>
  );
}

export default function AdminDisputes() {
  const { user, profile, loading: authLoading } = useAuth();
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDisputes = useCallback(async () => {
    if (!profile?.is_admin) return;
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await getAllDisputeJobs();
    if (fetchError) setError(fetchError.message || 'Failed to load dispute cases.');
    else setDisputes(data);
    setLoading(false);
  }, [profile]);

  useEffect(() => { loadDisputes(); }, [loadDisputes]);

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

  const ongoing = disputes.filter(dispute => dispute.status === 'disputed' && getPrimaryIssue(dispute)?.status === 'open');
  const completed = disputes.filter(dispute => !ongoing.includes(dispute));

  return (
    <div className="space-y-8">
      <div>
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="h-4 w-4" /> Admin dashboard
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
          <ShieldAlert className="h-8 w-8 text-primary" /> Manage Disputes
        </h1>
        <p className="text-muted-foreground mt-1">Review ongoing cases and access completed dispute records.</p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      {loading ? (
        <div className="p-12 bg-card border rounded-3xl flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <>
          <section className="bg-card border rounded-3xl overflow-hidden shadow-sm">
            <header className="p-6 border-b bg-muted/10 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-extrabold flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-red-500" /> Ongoing disputes</h2>
                <p className="text-xs text-muted-foreground font-medium mt-1">Open cases with secured payments still under review.</p>
              </div>
              <span className="text-xs font-black bg-red-500/10 text-red-600 px-3 py-1 rounded-full">{ongoing.length}</span>
            </header>
            <DisputeList disputes={ongoing} emptyText="No ongoing disputes." />
          </section>

          <section className="bg-card border rounded-3xl overflow-hidden shadow-sm">
            <header className="p-6 border-b bg-muted/10 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-extrabold flex items-center gap-2"><CheckCircle className="h-5 w-5 text-green-600" /> Completed/resolved disputes</h2>
                <p className="text-xs text-muted-foreground font-medium mt-1">Read-only case files for disputes that are no longer open.</p>
              </div>
              <span className="text-xs font-black bg-green-500/10 text-green-700 px-3 py-1 rounded-full">{completed.length}</span>
            </header>
            <DisputeList disputes={completed} emptyText="No completed disputes." />
          </section>
        </>
      )}
    </div>
  );
}
