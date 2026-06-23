import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../components/AuthProvider';
import { getPendingVerifications, approveIdentityVerification, approveTradieProfile, approveDocumentOnly, rejectVerification, suspendTradieProfile, suspendIdentityVerification } from '../lib/users';
import type { VerificationRecord, UserProfile } from '../lib/users';
import { supabase } from '../lib/supabase';
import {
  ShieldCheck, UserCheck, ShieldAlert, Award, Loader2, AlertTriangle,
  Check, FileText, CheckCircle, AlertCircle, X, Image as ImageIcon
} from 'lucide-react';
import { getDisputedJobs, resolveDispute } from '../lib/payments';

// ─── Local Types ─────────────────────────────────────────────────────────────

interface ToastMessage {
  text: string;
  type: 'success' | 'error';
}

interface ConfirmConfig {
  title: string;
  message: string;
  onConfirm: () => void;
  confirmLabel?: string;
  isDanger?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDocumentType(raw: string): string {
  return raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatJobRef(id: string): string {
  return `#${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

function formatAUD(cents: number): string {
  return (cents / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

// ─── Admin Page ───────────────────────────────────────────────────────────────

export default function Admin() {
  const { user, profile, loading: authLoading } = useAuth();

  // Data state
  const [verifications, setVerifications] = useState<VerificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalTradies, setTotalTradies] = useState<number | null>(null);
  const [verifiedTradies, setVerifiedTradies] = useState<number | null>(null);
  const [whitelistedTradiesList, setWhitelistedTradiesList] = useState<UserProfile[]>([]);
  const [disputedJobs, setDisputedJobs] = useState<any[]>([]);

  // Action state
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [resolvingDisputeId, setResolvingDisputeId] = useState<string | null>(null);
  const [resolutionText, setResolutionText] = useState('');
  const [splitPercentage, setSplitPercentage] = useState<number>(50);
  const [disputeActionLoading, setDisputeActionLoading] = useState(false);

  // Evidence images per dispute (keyed by job id)
  const [evidenceUrls, setEvidenceUrls] = useState<Record<string, string[]>>({});
  const [evidenceLoading, setEvidenceLoading] = useState<Record<string, boolean>>({});

  // Toast + Confirm modal state
  const [toastMessage, setToastMessage] = useState<ToastMessage | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<ConfirmConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ─── Toast helper ──────────────────────────────────────────────────────────

  const showToast = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4500);
  }, []);

  const showConfirm = useCallback((config: ConfirmConfig) => {
    setConfirmConfig(config);
  }, []);

  // ─── Data loading ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!profile?.is_admin) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Pending verifications
      const { data: list, error: fetchErr } = await getPendingVerifications();
      if (fetchErr) throw fetchErr;
      setVerifications(list);

      // 2. Total tradies count
      const { count: tradiesCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .in('role', ['tradie', 'dual']);
      if (tradiesCount !== null) setTotalTradies(tradiesCount);

      // 3. Whitelisted tradies count
      const { count: verifiedCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('tradie_verified', true);
      if (verifiedCount !== null) setVerifiedTradies(verifiedCount);

      // 4. Whitelisted tradies list
      const { data: whitelistedList } = await supabase
        .from('users')
        .select('*')
        .eq('tradie_verified', true)
        .order('display_name', { ascending: true });
      if (whitelistedList) setWhitelistedTradiesList(whitelistedList as UserProfile[]);

      // 5. Active disputes
      const { data: disputesList } = await getDisputedJobs();
      if (disputesList) setDisputedJobs(disputesList);
    } catch (err: any) {
      setError(err.message || 'Failed to load administrator dashboard data.');
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    if (profile) loadData();
  }, [profile, loadData]);

  // ─── Load evidence images for a dispute ───────────────────────────────────

  const loadEvidenceUrls = useCallback(async (jobId: string, attachments: string[]) => {
    if (!attachments || attachments.length === 0) return;
    setEvidenceLoading(prev => ({ ...prev, [jobId]: true }));
    const urls: string[] = [];
    for (const path of attachments) {
      try {
        const { data, error: sErr } = await supabase.storage
          .from('completion_proofs')
          .createSignedUrl(path, 3600);
        if (!sErr && data?.signedUrl) urls.push(data.signedUrl);
      } catch (e) {
        console.error('Evidence URL error:', e);
      }
    }
    setEvidenceUrls(prev => ({ ...prev, [jobId]: urls }));
    setEvidenceLoading(prev => ({ ...prev, [jobId]: false }));
  }, []);

  useEffect(() => {
    for (const job of disputedJobs) {
      const issue = job.job_issues?.[0];
      if (issue?.attachments?.length > 0 && !evidenceUrls[job.id]) {
        loadEvidenceUrls(job.id, issue.attachments);
      }
    }
  }, [disputedJobs, loadEvidenceUrls, evidenceUrls]);

  // ─── Action Handlers ───────────────────────────────────────────────────────

  const handleApproveIdentity = async (id: string) => {
    setActionLoadingId(id);
    const { error: err } = await approveIdentityVerification(id);
    setActionLoadingId(null);
    if (err) showToast(err.message || 'Failed to approve identity verification.', 'error');
    else { showToast('Identity verification approved successfully.', 'success'); loadData(); }
  };

  const handleApproveDocumentOnly = async (id: string) => {
    setActionLoadingId(id);
    const { error: err } = await approveDocumentOnly(id);
    setActionLoadingId(null);
    if (err) showToast(err.message || 'Failed to approve document.', 'error');
    else { showToast('Document approved successfully.', 'success'); loadData(); }
  };

  const handleWhitelistTradie = async (userId: string) => {
    setActionLoadingId(userId);
    const { error: err } = await approveTradieProfile(userId);
    setActionLoadingId(null);
    if (err) showToast(err.message || 'Failed to whitelist tradie.', 'error');
    else { showToast('Tradie profile whitelisted successfully.', 'success'); loadData(); }
  };

  const handleRejectSubmit = async (id: string) => {
    if (!rejectNotes.trim()) {
      showToast('Please specify rejection notes.', 'error');
      return;
    }
    setActionLoadingId(id);
    const { error: err } = await rejectVerification(id, rejectNotes.trim());
    setActionLoadingId(null);
    setRejectingId(null);
    setRejectNotes('');
    if (err) showToast(err.message || 'Failed to reject verification.', 'error');
    else { showToast('Verification rejected.', 'success'); loadData(); }
  };

  const handleSuspendTradie = (userId: string) => {
    showConfirm({
      title: 'Suspend Tradie Profile',
      message: 'Are you sure you want to suspend this tradie? Their whitelist status will be revoked and their role will be downgraded back to a customer. This action can be reversed by re-whitelisting.',
      confirmLabel: 'Suspend Tradie',
      isDanger: true,
      onConfirm: async () => {
        setActionLoadingId(userId);
        const { error: err } = await suspendTradieProfile(userId);
        setActionLoadingId(null);
        if (err) showToast(err.message || 'Failed to suspend tradie.', 'error');
        else { showToast('Tradie profile suspended successfully.', 'success'); loadData(); }
      }
    });
  };

  const handleSuspendIdentity = (userId: string) => {
    showConfirm({
      title: 'Revoke Identity Verification',
      message: 'Are you sure you want to revoke identity verification for this user? They will need to re-submit their documents.',
      confirmLabel: 'Revoke ID',
      isDanger: true,
      onConfirm: async () => {
        setActionLoadingId(userId);
        const { error: err } = await suspendIdentityVerification(userId);
        setActionLoadingId(null);
        if (err) showToast(err.message || 'Failed to revoke identity verification.', 'error');
        else { showToast('Identity verification revoked.', 'success'); loadData(); }
      }
    });
  };

  const handleResolveDispute = async (jobId: string) => {
    if (!resolutionText.trim()) {
      showToast('Please enter resolution notes.', 'error');
      return;
    }
    setDisputeActionLoading(true);
    const { error: err } = await resolveDispute(jobId, resolutionText.trim(), splitPercentage);
    setDisputeActionLoading(false);
    if (err) showToast(err.message || 'Failed to resolve dispute.', 'error');
    else {
      showToast('Dispute resolved successfully. Payments have been processed.', 'success');
      setResolvingDisputeId(null);
      setResolutionText('');
      setSplitPercentage(50);
      loadData();
    }
  };

  const handleViewFile = async (documentUrl: string) => {
    try {
      const { data, error: signedUrlErr } = await supabase.storage
        .from('verifications')
        .createSignedUrl(documentUrl, 60);
      if (signedUrlErr) throw signedUrlErr;
      if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      showToast(err.message || 'Failed to generate secure download link.', 'error');
    }
  };

  // ─── Loading / Access Guard ────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-card border rounded-2xl max-w-md mx-auto my-12 gap-4">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
        <p className="text-sm font-semibold text-muted-foreground">Checking credentials...</p>
      </div>
    );
  }

  if (!user || !profile?.is_admin) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 bg-card border border-border rounded-3xl shadow-xl text-center space-y-6">
        <div className="h-16 w-16 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center mx-auto border border-red-500/20">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black text-foreground">Access Denied</h2>
          <p className="text-sm text-muted-foreground leading-relaxed font-semibold">
            This dashboard is restricted to staff administrators. Please switch to an admin account to proceed.
          </p>
        </div>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const identityVerifications = verifications.filter(v =>
    ['drivers_license', 'passport', 'proof_of_age', 'other_identity'].includes(v.document_type)
  );
  const tradieApplications = verifications.filter(v =>
    ['contractor_license', 'insurance', 'trade_certificate', 'other_trade_credential'].includes(v.document_type)
  );

  return (
    <div className="space-y-8">

      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
          <ShieldAlert className="h-8 w-8 text-primary" /> Admin Panel
        </h1>
        <p className="text-muted-foreground mt-1">Review trade credentials, manage user security settings, and resolve disputes.</p>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Stats Row — 4 tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-5 bg-card border rounded-2xl flex items-center justify-between shadow-sm">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Pending Approvals</p>
            <h3 className="text-3xl font-extrabold text-foreground mt-1">
              {loading ? <Loader2 className="h-6 w-6 text-primary animate-spin" /> : verifications.length}
            </h3>
          </div>
          <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <UserCheck className="h-5 w-5" />
          </div>
        </div>

        <div className="p-5 bg-card border rounded-2xl flex items-center justify-between shadow-sm">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Tradies</p>
            <h3 className="text-3xl font-extrabold text-foreground mt-1">
              {totalTradies === null ? <Loader2 className="h-6 w-6 text-primary animate-spin" /> : totalTradies}
            </h3>
          </div>
          <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <ShieldCheck className="h-5 w-5" />
          </div>
        </div>

        <div className="p-5 bg-card border rounded-2xl flex items-center justify-between shadow-sm">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Whitelisted</p>
            <h3 className="text-3xl font-extrabold text-foreground mt-1">
              {verifiedTradies === null ? <Loader2 className="h-6 w-6 text-primary animate-spin" /> : verifiedTradies}
            </h3>
          </div>
          <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Award className="h-5 w-5" />
          </div>
        </div>

        <div className="p-5 bg-card border rounded-2xl flex items-center justify-between shadow-sm">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Active Disputes</p>
            <h3 className={`text-3xl font-extrabold mt-1 ${disputedJobs.length > 0 ? 'text-red-500' : 'text-foreground'}`}>
              {loading ? <Loader2 className="h-6 w-6 text-primary animate-spin" /> : disputedJobs.length}
            </h3>
          </div>
          <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${disputedJobs.length > 0 ? 'bg-red-500/10 text-red-500' : 'bg-muted text-muted-foreground'}`}>
            <ShieldAlert className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Queues Section */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-card border rounded-3xl gap-4">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
          <p className="text-sm font-semibold text-muted-foreground">Fetching pending queues...</p>
        </div>
      ) : (
        <div className="space-y-8">

          {/* ── 1. Identity Verifications Queue ─────────────────────────────── */}
          <div className="bg-card border rounded-3xl overflow-hidden shadow-sm">
            <div className="p-6 border-b bg-muted/10 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-extrabold text-foreground">Pending Customer Identity Verifications</h3>
                <p className="text-xs text-muted-foreground mt-0.5 font-medium">Verify driver's licences, passports, and other photo ID documents.</p>
              </div>
              {identityVerifications.length > 0 && (
                <span className="text-xs font-black bg-amber-500/10 text-amber-700 border border-amber-500/20 px-3 py-1 rounded-full">
                  {identityVerifications.length} pending
                </span>
              )}
            </div>
            {identityVerifications.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <div className="h-12 w-12 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto">
                  <Check className="h-6 w-6 text-green-500" />
                </div>
                <h4 className="font-bold text-sm text-foreground">All Caught Up!</h4>
                <p className="text-xs text-muted-foreground font-semibold">No pending identity checks to review.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-muted/30 text-[10px] font-bold text-muted-foreground border-b uppercase tracking-wider">
                      <th className="p-4 pl-6">User</th>
                      <th className="p-4">Role</th>
                      <th className="p-4">Document Type</th>
                      <th className="p-4">Submitted</th>
                      <th className="p-4">File</th>
                      <th className="p-4 pr-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-sm font-semibold">
                    {identityVerifications.map((item) => {
                      const isActionLoading = actionLoadingId === item.id;
                      const isRejecting = rejectingId === item.id;
                      return (
                        <tr key={item.id} className="hover:bg-muted/5">
                          <td className="p-4 pl-6">
                            <div className="font-bold text-foreground">{item.user?.display_name || 'Unknown User'}</div>
                            <div className="text-xs text-muted-foreground font-medium">{item.user?.email}</div>
                          </td>
                          <td className="p-4">
                            <span className="capitalize text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-md font-bold">
                              {item.user?.role || '—'}
                            </span>
                          </td>
                          <td className="p-4">
                            <span className="text-xs bg-muted text-muted-foreground px-2.5 py-0.5 rounded-md font-bold">
                              {formatDocumentType(item.document_type)}
                            </span>
                          </td>
                          <td className="p-4 text-xs font-semibold text-muted-foreground">
                            {new Date(item.submitted_at).toLocaleDateString('en-AU')}{' '}
                            {new Date(item.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="p-4">
                            <button
                              onClick={() => handleViewFile(item.document_url)}
                              className="text-xs text-primary font-bold hover:underline flex items-center gap-1.5 focus:outline-none"
                            >
                              <FileText className="h-3.5 w-3.5" /> View File
                            </button>
                          </td>
                          <td className="p-4 pr-6 text-right">
                            {isRejecting ? (
                              <div className="flex flex-col gap-2 max-w-xs ml-auto">
                                <textarea
                                  placeholder="Reason for rejection..."
                                  value={rejectNotes}
                                  onChange={(e) => setRejectNotes(e.target.value)}
                                  rows={2}
                                  className="w-full text-xs p-2 border rounded-lg bg-background outline-none font-medium text-foreground focus:border-primary/50 resize-none"
                                />
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    onClick={() => setRejectingId(null)}
                                    className="px-2 py-1 border rounded-md text-[10px] font-bold text-muted-foreground hover:bg-muted"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => handleRejectSubmit(item.id)}
                                    disabled={isActionLoading}
                                    className="px-2.5 py-1 bg-destructive text-white rounded-md text-[10px] font-bold hover:bg-destructive/90 transition-all flex items-center gap-1 disabled:opacity-50"
                                  >
                                    {isActionLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                                    Submit Rejection
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-x-2">
                                <button
                                  onClick={() => { setRejectingId(item.id); setRejectNotes(''); }}
                                  disabled={isActionLoading}
                                  className="bg-destructive/10 hover:bg-destructive/15 text-destructive font-bold px-3.5 py-1.5 rounded-xl text-xs transition-all disabled:opacity-50"
                                >
                                  Reject
                                </button>
                                <button
                                  onClick={() => handleApproveIdentity(item.id)}
                                  disabled={isActionLoading}
                                  className="bg-primary hover:bg-primary/95 text-primary-foreground font-bold px-3.5 py-1.5 rounded-xl text-xs transition-all shadow-sm disabled:opacity-50 inline-flex items-center gap-1"
                                >
                                  {isActionLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                                  Approve ID
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── 2. Tradie Whitelist Applications Queue ───────────────────────── */}
          <div className="bg-card border rounded-3xl overflow-hidden shadow-sm">
            <div className="p-6 border-b bg-muted/10 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-extrabold text-foreground">Pending Tradie Whitelist Applications</h3>
                <p className="text-xs text-muted-foreground mt-0.5 font-medium">Verify contractor licences, public liability insurance, ABNs, and whitelist profiles.</p>
              </div>
              {tradieApplications.length > 0 && (
                <span className="text-xs font-black bg-amber-500/10 text-amber-700 border border-amber-500/20 px-3 py-1 rounded-full">
                  {tradieApplications.length} pending
                </span>
              )}
            </div>
            {tradieApplications.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <div className="h-12 w-12 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto">
                  <Check className="h-6 w-6 text-green-500" />
                </div>
                <h4 className="font-bold text-sm text-foreground">All Caught Up!</h4>
                <p className="text-xs text-muted-foreground font-semibold">No pending tradie applications to review.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-muted/30 text-[10px] font-bold text-muted-foreground border-b uppercase tracking-wider">
                      <th className="p-4 pl-6">Tradie Candidate</th>
                      <th className="p-4">ABN & Licence</th>
                      <th className="p-4">Document / File</th>
                      <th className="p-4">Submitted</th>
                      <th className="p-4 pr-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-sm font-semibold">
                    {tradieApplications.map((item) => {
                      const isActionLoading = actionLoadingId === item.id || actionLoadingId === item.user_id;
                      const isRejecting = rejectingId === item.id;
                      const isAlreadyWhitelisted = item.user?.tradie_verified;
                      return (
                        <tr key={item.id} className="hover:bg-muted/5">
                          <td className="p-4 pl-6">
                            <div className="font-bold text-foreground">{item.user?.display_name || 'Unknown User'}</div>
                            <div className="text-xs text-muted-foreground font-medium">{item.user?.email}</div>
                            {isAlreadyWhitelisted && (
                              <span className="inline-flex items-center text-[10px] font-bold bg-green-500/15 text-green-600 px-2 py-0.5 rounded mt-1.5">
                                Whitelisted ✓
                              </span>
                            )}
                          </td>
                          <td className="p-4 text-xs font-semibold">
                            <div className="text-foreground"><span className="text-muted-foreground">ABN:</span> {item.user?.abn || 'N/A'}</div>
                            <div className="text-foreground mt-0.5"><span className="text-muted-foreground">Licence:</span> {item.user?.license_number || 'N/A'}</div>
                            <div className="text-foreground mt-0.5"><span className="text-muted-foreground">Trades:</span> {item.user?.trades?.join(', ') || 'None'}</div>
                          </td>
                          <td className="p-4">
                            <div className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded w-fit font-bold mb-1.5">
                              {formatDocumentType(item.document_type)}
                            </div>
                            <button
                              onClick={() => handleViewFile(item.document_url)}
                              className="text-xs text-primary font-bold hover:underline inline-flex items-center gap-1 focus:outline-none"
                            >
                              <FileText className="h-3.5 w-3.5" /> View Upload
                            </button>
                          </td>
                          <td className="p-4 text-xs font-semibold text-muted-foreground">
                            {new Date(item.submitted_at).toLocaleDateString('en-AU')}{' '}
                            {new Date(item.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="p-4 pr-6 text-right">
                            {isRejecting ? (
                              <div className="flex flex-col gap-2 max-w-xs ml-auto">
                                <textarea
                                  placeholder="Reason for rejection..."
                                  value={rejectNotes}
                                  onChange={(e) => setRejectNotes(e.target.value)}
                                  rows={2}
                                  className="w-full text-xs p-2 border rounded-lg bg-background outline-none font-medium text-foreground focus:border-primary/50 resize-none"
                                />
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    onClick={() => setRejectingId(null)}
                                    className="px-2 py-1 border rounded-md text-[10px] font-bold text-muted-foreground hover:bg-muted"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => handleRejectSubmit(item.id)}
                                    disabled={isActionLoading}
                                    className="px-2.5 py-1 bg-destructive text-white rounded-md text-[10px] font-bold hover:bg-destructive/90 transition-all flex items-center gap-1 disabled:opacity-50"
                                  >
                                    {isActionLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                                    Submit Rejection
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col sm:flex-row justify-end items-end sm:items-center gap-2">
                                <button
                                  onClick={() => { setRejectingId(item.id); setRejectNotes(''); }}
                                  disabled={isActionLoading}
                                  className="bg-destructive/10 hover:bg-destructive/15 text-destructive font-bold px-3 py-1.5 rounded-xl text-xs transition-all disabled:opacity-50"
                                >
                                  Reject Doc
                                </button>
                                <button
                                  onClick={() => handleApproveDocumentOnly(item.id)}
                                  disabled={isActionLoading}
                                  className="bg-secondary hover:bg-secondary/80 text-secondary-foreground font-bold px-3 py-1.5 rounded-xl text-xs transition-all disabled:opacity-50"
                                >
                                  Approve Doc
                                </button>
                                <button
                                  onClick={() => handleWhitelistTradie(item.user_id)}
                                  disabled={isActionLoading || isAlreadyWhitelisted}
                                  className="bg-primary hover:bg-primary/95 text-primary-foreground font-bold px-3.5 py-1.5 rounded-xl text-xs transition-all shadow-md disabled:opacity-50 inline-flex items-center gap-1"
                                >
                                  {isActionLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                                  Whitelist Tradie
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── 3. Active Whitelisted Tradies Directory ──────────────────────── */}
          <div className="bg-card border rounded-3xl overflow-hidden shadow-sm">
            <div className="p-6 border-b bg-muted/10">
              <h3 className="text-lg font-extrabold text-foreground">Active Whitelisted Tradies</h3>
              <p className="text-xs text-muted-foreground mt-0.5 font-medium">Manage and review currently whitelisted active tradies. Suspend or revoke credentials as required.</p>
            </div>
            {whitelistedTradiesList.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mx-auto">
                  <ShieldAlert className="h-6 w-6 text-muted-foreground/50" />
                </div>
                <h4 className="font-bold text-sm text-foreground">No Whitelisted Tradies</h4>
                <p className="text-xs text-muted-foreground font-semibold">There are no currently whitelisted tradie profiles in the database.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-muted/30 text-[10px] font-bold text-muted-foreground border-b uppercase tracking-wider">
                      <th className="p-4 pl-6">Tradie</th>
                      <th className="p-4">ABN & Licence</th>
                      <th className="p-4">Trust Status</th>
                      <th className="p-4 pr-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-sm font-semibold">
                    {whitelistedTradiesList.map((item) => {
                      const isActionLoading = actionLoadingId === item.id;
                      return (
                        <tr key={item.id} className="hover:bg-muted/5">
                          <td className="p-4 pl-6">
                            <div className="font-bold text-foreground">{item.display_name}</div>
                            <div className="text-xs text-muted-foreground font-medium">{item.email}</div>
                            <div className="text-[10px] text-muted-foreground/75 font-semibold mt-0.5">
                              UUID: <span className="font-mono text-blue-500/80">{item.id || 'unavailable'}</span>
                            </div>
                          </td>
                          <td className="p-4 text-xs font-semibold">
                            <div className="text-foreground"><span className="text-muted-foreground">ABN:</span> {item.abn || 'N/A'}</div>
                            <div className="text-foreground mt-0.5"><span className="text-muted-foreground">Licence:</span> {item.license_number || 'N/A'}</div>
                          </td>
                          <td className="p-4">
                            <div className="flex flex-col gap-1 text-[10px] font-extrabold uppercase tracking-wide">
                              <span className="text-green-600 bg-green-500/10 px-2 py-0.5 rounded w-fit">
                                Whitelisted ✓
                              </span>
                              {item.identity_verified ? (
                                <span className="text-blue-600 bg-blue-500/10 px-2 py-0.5 rounded w-fit">
                                  Identity Verified ✓
                                </span>
                              ) : (
                                <span className="text-red-500 bg-red-500/10 px-2 py-0.5 rounded w-fit">
                                  Identity Pending ⚠
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-4 pr-6 text-right">
                            <div className="flex justify-end gap-2">
                              {item.identity_verified && (
                                <button
                                  onClick={() => handleSuspendIdentity(item.id)}
                                  disabled={isActionLoading}
                                  className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 font-bold px-3 py-1.5 rounded-xl text-xs transition-all disabled:opacity-50"
                                >
                                  Revoke ID
                                </button>
                              )}
                              <button
                                onClick={() => handleSuspendTradie(item.id)}
                                disabled={isActionLoading}
                                className="bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold px-3 py-1.5 rounded-xl text-xs transition-all disabled:opacity-50"
                              >
                                Suspend Tradie
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── 4. Active Job Disputes ───────────────────────────────────────── */}
          <div className="bg-card border rounded-3xl overflow-hidden shadow-sm">
            <div className="p-6 border-b bg-muted/10 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-extrabold text-foreground flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-red-500" /> Active Job Disputes
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 font-medium">Review disputed jobs and release or split secure payments between parties.</p>
              </div>
              {disputedJobs.length > 0 && (
                <span className="text-xs font-black bg-red-500/10 text-red-600 border border-red-500/20 px-3 py-1 rounded-full">
                  {disputedJobs.length} active
                </span>
              )}
            </div>

            {disputedJobs.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <div className="h-12 w-12 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto">
                  <Check className="h-6 w-6 text-green-500" />
                </div>
                <h4 className="font-bold text-sm text-foreground">No Active Disputes</h4>
                <p className="text-xs text-muted-foreground font-semibold max-w-sm mx-auto">
                  All payment disputes have been resolved or no disputes have been raised yet.
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {disputedJobs.map((dispute) => {
                  const payment = dispute.payments?.[0];
                  const issue = dispute.job_issues?.[0];
                  const isResolving = resolvingDisputeId === dispute.id;
                  const jobEvidenceUrls = evidenceUrls[dispute.id] || [];
                  const isEvidenceLoading = evidenceLoading[dispute.id];

                  return (
                    <div key={dispute.id} className="p-6 space-y-4">
                      {/* Dispute Header */}
                      <div className="flex justify-between items-start gap-4">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-extrabold text-base text-foreground leading-tight">{dispute.title}</h4>
                            <span className="text-[10px] font-black bg-red-500/10 text-red-600 border border-red-500/15 px-2 py-0.5 rounded uppercase tracking-wider">Disputed</span>
                          </div>
                          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                            Job Ref: <span className="font-mono text-foreground">{formatJobRef(dispute.id)}</span>
                            {issue?.created_at && (
                              <span className="ml-3">
                                Disputed: <span className="text-foreground">{new Date(issue.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-semibold text-muted-foreground space-y-0.5 pt-1">
                            <div>Customer: <span className="text-foreground">{dispute.customer?.display_name} — {dispute.customer?.email}</span></div>
                            <div>Contractor: <span className="text-foreground">{payment?.payee?.display_name} — {payment?.payee?.email}</span></div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          {payment && (
                            <div className="bg-red-500/5 border border-red-500/10 rounded-xl px-4 py-2.5 text-center">
                              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Payment Held</p>
                              <p className="text-lg font-black text-foreground">{formatAUD(payment.amount)}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Customer Complaint */}
                      {issue && (
                        <div className="p-3.5 bg-red-500/5 border border-red-500/10 rounded-xl space-y-1">
                          <span className="font-bold text-red-500 block uppercase text-[10px] tracking-wider">Customer Complaint:</span>
                          <p className="text-sm text-foreground leading-relaxed font-medium italic">"{issue.description}"</p>
                        </div>
                      )}

                      {/* Customer Evidence Photos */}
                      {issue?.attachments?.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                            <ImageIcon className="h-3.5 w-3.5" /> Customer Evidence Photos ({issue.attachments.length})
                          </p>
                          {isEvidenceLoading ? (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground font-semibold">
                              <Loader2 className="h-4 w-4 animate-spin" /> Loading evidence images...
                            </div>
                          ) : jobEvidenceUrls.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {jobEvidenceUrls.map((url, idx) => (
                                <a
                                  key={idx}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="h-20 w-20 border border-border rounded-xl overflow-hidden hover:opacity-80 transition-opacity shadow-sm bg-muted flex items-center justify-center shrink-0"
                                >
                                  <img src={url} alt={`Evidence ${idx + 1}`} className="h-full w-full object-cover" />
                                </a>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground font-semibold">Evidence images could not be loaded.</p>
                          )}
                        </div>
                      )}

                      {/* Resolution Tool */}
                      {isResolving ? (
                        <div className="p-5 bg-muted/20 border rounded-2xl space-y-4">
                          <h5 className="font-extrabold text-foreground text-sm">Dispute Resolution Tool</h5>
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Resolution Verdict Notes</label>
                            <textarea
                              placeholder="State the reason/findings for the resolution..."
                              value={resolutionText}
                              onChange={(e) => setResolutionText(e.target.value)}
                              className="w-full bg-background border border-border rounded-xl px-3 py-2 outline-none text-xs font-semibold focus:border-primary/50 resize-none"
                              rows={3}
                            />
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between text-[10px] font-bold text-muted-foreground uppercase">
                              <span>Payout Split</span>
                              <span className="text-primary font-extrabold">{splitPercentage}% to Tradie / {100 - splitPercentage}% to Customer</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={splitPercentage}
                              onChange={(e) => setSplitPercentage(parseInt(e.target.value))}
                              className="w-full accent-primary cursor-pointer"
                            />
                            {payment && (
                              <div className="grid grid-cols-3 gap-2 bg-background border p-3 rounded-xl text-[10px] font-semibold text-left mt-2">
                                <div className="space-y-1">
                                  <span className="text-muted-foreground uppercase block">Customer Refund</span>
                                  <span className="text-sm font-black text-blue-500">
                                    {formatAUD(Math.round((payment.amount * (100 - splitPercentage)) / 100))}
                                  </span>
                                </div>
                                <div className="space-y-1 border-l pl-2">
                                  <span className="text-muted-foreground uppercase block">Tradie Payout</span>
                                  <span className="text-sm font-black text-green-600">
                                    {formatAUD(Math.round(((payment.amount - payment.platform_fee) * splitPercentage) / 100))}
                                  </span>
                                </div>
                                <div className="space-y-1 border-l pl-2">
                                  <span className="text-muted-foreground uppercase block">Fee Retained</span>
                                  <span className="text-sm font-black text-primary">
                                    {formatAUD(Math.round((payment.platform_fee * splitPercentage) / 100))}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => handleResolveDispute(dispute.id)}
                              disabled={disputeActionLoading}
                              className="bg-primary hover:bg-primary/95 text-primary-foreground font-black px-4 py-2 rounded-xl text-xs transition shadow active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
                            >
                              {disputeActionLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                              {disputeActionLoading ? 'Processing...' : 'Confirm Resolution'}
                            </button>
                            <button
                              onClick={() => setResolvingDisputeId(null)}
                              disabled={disputeActionLoading}
                              className="bg-secondary hover:bg-secondary/80 text-secondary-foreground font-black px-4 py-2 rounded-xl text-xs transition"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setResolvingDisputeId(dispute.id);
                            setResolutionText('');
                            setSplitPercentage(50);
                          }}
                          className="bg-primary hover:bg-primary/95 text-primary-foreground font-black px-4 py-2 rounded-xl text-xs transition shadow active:scale-95"
                        >
                          Resolve Dispute
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      )}

      {/* ── Confirmation Modal ───────────────────────────────────────────────── */}
      {confirmConfig && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-card border border-border w-full max-w-md rounded-2xl shadow-xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-bold text-foreground">{confirmConfig.title}</h3>
              <button
                onClick={() => setConfirmConfig(null)}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground font-semibold leading-relaxed">{confirmConfig.message}</p>
            <div className="flex justify-end gap-3 pt-1">
              <button
                onClick={() => setConfirmConfig(null)}
                className="bg-secondary text-secondary-foreground font-bold px-4 py-2 rounded-xl hover:bg-secondary/80 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setConfirmConfig(null);
                  confirmConfig.onConfirm();
                }}
                className={`font-black px-4 py-2 rounded-xl transition-all text-sm shadow-sm active:scale-95 ${
                  confirmConfig.isDanger
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-primary hover:bg-primary/95 text-primary-foreground'
                }`}
              >
                {confirmConfig.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast Notification ───────────────────────────────────────────────── */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-[80] animate-in slide-in-from-bottom-5 duration-300">
          <div className={`p-4 rounded-xl border shadow-lg flex items-center gap-2.5 max-w-md font-bold text-xs ${
            toastMessage.type === 'success'
              ? 'bg-green-500/10 border-green-500/20 text-green-600'
              : 'bg-red-500/10 border-red-500/20 text-red-500'
          }`}>
            {toastMessage.type === 'success'
              ? <CheckCircle className="h-4.5 w-4.5 shrink-0" />
              : <AlertCircle className="h-4.5 w-4.5 shrink-0" />
            }
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

    </div>
  );
}
