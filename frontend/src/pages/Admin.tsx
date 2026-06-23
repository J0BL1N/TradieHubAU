import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../components/AuthProvider';
import { getPendingVerifications, approveIdentityVerification, approveTradieProfile, approveDocumentOnly, rejectVerification, suspendTradieProfile, suspendIdentityVerification } from '../lib/users';
import type { VerificationRecord, UserProfile } from '../lib/users';
import { supabase } from '../lib/supabase';
import { ShieldCheck, UserCheck, ShieldAlert, Award, Loader2, AlertTriangle, Check, FileText } from 'lucide-react';
import { getDisputedJobs, resolveDispute } from '../lib/payments';

export default function Admin() {
  const { user, profile, loading: authLoading } = useAuth();
  const [verifications, setVerifications] = useState<VerificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Stats
  const [totalTradies, setTotalTradies] = useState<number | null>(null);
  const [verifiedTradies, setVerifiedTradies] = useState<number | null>(null);
  const [whitelistedTradiesList, setWhitelistedTradiesList] = useState<UserProfile[]>([]);

  // Disputes & payments state
  const [disputedJobs, setDisputedJobs] = useState<any[]>([]);
  const [resolvingDisputeId, setResolvingDisputeId] = useState<string | null>(null);
  const [resolutionText, setResolutionText] = useState('');
  const [splitPercentage, setSplitPercentage] = useState<number>(50);
  const [disputeActionLoading, setDisputeActionLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!profile?.is_admin) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch pending verifications
      const { data: list, error: fetchErr } = await getPendingVerifications();
      if (fetchErr) throw fetchErr;
      setVerifications(list);

      // 2. Query total tradies count
      const { count: tradiesCount, error: countErr1 } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .in('role', ['tradie', 'dual']);
      if (!countErr1 && tradiesCount !== null) {
        setTotalTradies(tradiesCount);
      }

      // 3. Query whitelisted/verified tradies count
      const { count: verifiedCount, error: countErr2 } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('tradie_verified', true);
      if (!countErr2 && verifiedCount !== null) {
        setVerifiedTradies(verifiedCount);
      }

      // 4. Query active whitelisted tradies list
      const { data: whitelistedList, error: whitelistedErr } = await supabase
        .from('users')
        .select('*')
        .eq('tradie_verified', true)
        .order('display_name', { ascending: true });
      if (!whitelistedErr && whitelistedList) {
        setWhitelistedTradiesList(whitelistedList as UserProfile[]);
      }

      // 5. Query active disputes
      const { data: disputesList, error: disputesErr } = await getDisputedJobs();
      if (!disputesErr && disputesList) {
        setDisputedJobs(disputesList);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load administrator dashboard data.');
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    if (profile) {
      loadData();
    }
  }, [profile, loadData]);

  const handleApproveIdentity = async (id: string) => {
    setActionLoadingId(id);
    const { error: approveErr } = await approveIdentityVerification(id);
    setActionLoadingId(null);

    if (approveErr) {
      alert(approveErr.message || 'Failed to approve identity verification.');
    } else {
      loadData();
    }
  };

  const handleApproveDocumentOnly = async (id: string) => {
    setActionLoadingId(id);
    const { error: approveErr } = await approveDocumentOnly(id);
    setActionLoadingId(null);

    if (approveErr) {
      alert(approveErr.message || 'Failed to approve document.');
    } else {
      loadData();
    }
  };

  const handleWhitelistTradie = async (userId: string) => {
    setActionLoadingId(userId);
    const { error: whitelistErr } = await approveTradieProfile(userId);
    setActionLoadingId(null);

    if (whitelistErr) {
      alert(whitelistErr.message || 'Failed to whitelist tradie.');
    } else {
      alert('Tradie profile has been successfully whitelisted!');
      loadData();
    }
  };

  const handleRejectSubmit = async (id: string) => {
    if (!rejectNotes.trim()) {
      alert('Please specify rejection notes.');
      return;
    }

    setActionLoadingId(id);
    const { error: rejectErr } = await rejectVerification(id, rejectNotes.trim());
    setActionLoadingId(null);
    setRejectingId(null);
    setRejectNotes('');

    if (rejectErr) {
      alert(rejectErr.message || 'Failed to reject verification.');
    } else {
      loadData();
    }
  };

  const handleSuspendTradie = async (userId: string) => {
    if (!confirm('Are you sure you want to suspend this tradie profile? Their whitelist status will be revoked and their role will be downgraded back to a customer.')) {
      return;
    }
    setActionLoadingId(userId);
    const { error: suspendErr } = await suspendTradieProfile(userId);
    setActionLoadingId(null);

    if (suspendErr) {
      alert(suspendErr.message || 'Failed to suspend tradie.');
    } else {
      alert('Tradie profile suspended successfully.');
      loadData();
    }
  };

  const handleSuspendIdentity = async (userId: string) => {
    if (!confirm('Are you sure you want to revoke identity verification for this user?')) {
      return;
    }
    setActionLoadingId(userId);
    const { error: suspendErr } = await suspendIdentityVerification(userId);
    setActionLoadingId(null);

    if (suspendErr) {
      alert(suspendErr.message || 'Failed to revoke identity verification.');
    } else {
      alert('Identity verification revoked successfully.');
      loadData();
    }
  };

  const handleResolveDispute = async (jobId: string) => {
    if (!resolutionText) {
      alert("Please enter resolution notes.");
      return;
    }
    setDisputeActionLoading(true);
    const { error: resolveErr } = await resolveDispute(jobId, resolutionText, splitPercentage);
    setDisputeActionLoading(false);

    if (resolveErr) {
      alert(resolveErr.message || 'Failed to resolve dispute.');
    } else {
      alert('Dispute resolved successfully!');
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
        .createSignedUrl(documentUrl, 60); // Short-lived 60 seconds link

      if (signedUrlErr) throw signedUrlErr;
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to generate secure download link.');
    }
  };

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-card border rounded-2xl max-w-md mx-auto my-12 gap-4">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
        <p className="text-sm font-semibold text-muted-foreground">Checking credentials...</p>
      </div>
    );
  }

  // Admin access gate
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
          <ShieldAlert className="h-8 w-8 text-primary" /> Admin Panel
        </h1>
        <p className="text-muted-foreground mt-1">Review trade credentials and manage user security settings.</p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4.5 w-4.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="p-6 bg-card border rounded-2xl flex items-center justify-between shadow-sm">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Pending Approvals</p>
            <h3 className="text-3xl font-extrabold text-foreground mt-1">
              {loading ? <Loader2 className="h-7 w-7 text-primary animate-spin" /> : verifications.length}
            </h3>
          </div>
          <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <UserCheck className="h-6 w-6" />
          </div>
        </div>

        <div className="p-6 bg-card border rounded-2xl flex items-center justify-between shadow-sm">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Tradies</p>
            <h3 className="text-3xl font-extrabold text-foreground mt-1">
              {totalTradies === null ? <Loader2 className="h-7 w-7 text-primary animate-spin" /> : totalTradies}
            </h3>
          </div>
          <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <ShieldCheck className="h-6 w-6" />
          </div>
        </div>

        <div className="p-6 bg-card border rounded-2xl flex items-center justify-between shadow-sm">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Whitelisted Tradies</p>
            <h3 className="text-3xl font-extrabold text-foreground mt-1">
              {verifiedTradies === null ? <Loader2 className="h-7 w-7 text-primary animate-spin" /> : verifiedTradies}
            </h3>
          </div>
          <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Award className="h-6 w-6" />
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
          {/* 1. Identity Verifications Queue */}
          <div className="bg-card border rounded-3xl overflow-hidden shadow-sm">
            <div className="p-6 border-b bg-muted/10">
              <h3 className="text-lg font-extrabold text-foreground">Pending Customer Identity Verifications</h3>
              <p className="text-xs text-muted-foreground mt-0.5 font-medium">Verify driver's licenses, passports, and other photo ID files.</p>
            </div>
            {verifications.filter(v => ['drivers_license', 'passport', 'proof_of_age', 'other_identity'].includes(v.document_type)).length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <Check className="h-8 w-8 text-green-500 bg-green-500/10 p-1.5 rounded-full mx-auto" />
                <h4 className="font-bold text-sm text-foreground">All Caught Up!</h4>
                <p className="text-xs text-muted-foreground font-semibold">No pending identity checks to review.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-muted/30 text-[10px] font-bold text-muted-foreground border-b uppercase tracking-wider">
                      <th className="p-4 pl-6">User</th>
                      <th className="p-4">Document Type</th>
                      <th className="p-4">Submission Date</th>
                      <th className="p-4">Document File</th>
                      <th className="p-4 pr-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-sm font-semibold">
                    {verifications
                      .filter(v => ['drivers_license', 'passport', 'proof_of_age', 'other_identity'].includes(v.document_type))
                      .map((item) => {
                        const isActionLoading = actionLoadingId === item.id;
                        const isRejecting = rejectingId === item.id;
                        return (
                          <tr key={item.id} className="hover:bg-muted/5">
                            <td className="p-4 pl-6">
                              <div className="font-bold text-foreground">{item.user?.display_name || 'Unknown User'}</div>
                              <div className="text-xs text-muted-foreground font-medium">{item.user?.email}</div>
                            </td>
                            <td className="p-4">
                              <span className="capitalize text-xs bg-muted text-muted-foreground px-2.5 py-0.5 rounded-md font-bold">
                                {item.document_type.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="p-4 text-xs font-semibold text-muted-foreground">
                              {new Date(item.submitted_at).toLocaleDateString()}{' '}
                              {new Date(item.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="p-4 text-xs text-primary font-bold">
                              <button
                                onClick={() => handleViewFile(item.document_url)}
                                className="hover:underline flex items-center gap-1.5 focus:outline-none"
                              >
                                <FileText className="h-4 w-4" /> View File
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
                                      className="px-2.5 py-1 bg-destructive text-white rounded-md text-[10px] font-bold hover:bg-destructive/90 transition-all flex items-center gap-1"
                                    >
                                      {isActionLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                                      Submit Rejection
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-x-2">
                                  <button
                                    onClick={() => {
                                      setRejectingId(item.id);
                                      setRejectNotes('');
                                    }}
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

          {/* 2. Tradie Whitelist Applications Queue */}
          <div className="bg-card border rounded-3xl overflow-hidden shadow-sm">
            <div className="p-6 border-b bg-muted/10">
              <h3 className="text-lg font-extrabold text-foreground">Pending Tradie Whitelist Applications</h3>
              <p className="text-xs text-muted-foreground mt-0.5 font-medium">Verify contractor licenses, public liability insurance, ABNs, and whitelist profiles.</p>
            </div>
            {verifications.filter(v => ['contractor_license', 'insurance', 'trade_certificate', 'other_trade_credential'].includes(v.document_type)).length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <Check className="h-8 w-8 text-green-500 bg-green-500/10 p-1.5 rounded-full mx-auto" />
                <h4 className="font-bold text-sm text-foreground">All Caught Up!</h4>
                <p className="text-xs text-muted-foreground font-semibold">No pending tradie applications to review.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-muted/30 text-[10px] font-bold text-muted-foreground border-b uppercase tracking-wider">
                      <th className="p-4 pl-6">Tradie Candidate</th>
                      <th className="p-4">ABN & License Details</th>
                      <th className="p-4">Document / File</th>
                      <th className="p-4">Submission Date</th>
                      <th className="p-4 pr-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-sm font-semibold">
                    {verifications
                      .filter(v => ['contractor_license', 'insurance', 'trade_certificate', 'other_trade_credential'].includes(v.document_type))
                      .map((item) => {
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
                              <div className="text-foreground mt-0.5"><span className="text-muted-foreground">License ID:</span> {item.user?.license_number || 'N/A'}</div>
                              <div className="text-foreground mt-0.5"><span className="text-muted-foreground">Trades:</span> {item.user?.trades?.join(', ') || 'None'}</div>
                            </td>
                            <td className="p-4">
                              <div className="capitalize text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded w-fit font-bold mb-1">
                                {item.document_type.replace('_', ' ')}
                              </div>
                              <button
                                onClick={() => handleViewFile(item.document_url)}
                                className="text-xs text-primary font-bold hover:underline inline-flex items-center gap-1 focus:outline-none"
                              >
                                <FileText className="h-3.5 w-3.5" /> View Upload
                              </button>
                            </td>
                            <td className="p-4 text-xs font-semibold text-muted-foreground">
                              {new Date(item.submitted_at).toLocaleDateString()}{' '}
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
                                      className="px-2.5 py-1 bg-destructive text-white rounded-md text-[10px] font-bold hover:bg-destructive/90 transition-all flex items-center gap-1"
                                    >
                                      {isActionLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                                      Submit Rejection
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-col sm:flex-row justify-end items-end sm:items-center gap-2">
                                  <button
                                    onClick={() => {
                                      setRejectingId(item.id);
                                      setRejectNotes('');
                                    }}
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

          {/* 3. Active Whitelisted Tradies Directory */}
          <div className="bg-card border rounded-3xl overflow-hidden shadow-sm">
            <div className="p-6 border-b bg-muted/10">
              <h3 className="text-lg font-extrabold text-foreground">Active Whitelisted Tradies</h3>
              <p className="text-xs text-muted-foreground mt-0.5 font-medium">Manage and review currently whitelisted active tradies. Suspend or revoke credentials as required.</p>
            </div>
            {whitelistedTradiesList.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <ShieldAlert className="h-8 w-8 text-muted-foreground/45 mx-auto" />
                <h4 className="font-bold text-sm text-foreground">No Whitelisted Tradies</h4>
                <p className="text-xs text-muted-foreground font-semibold">There are no currently whitelisted tradie profiles in the database.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-muted/30 text-[10px] font-bold text-muted-foreground border-b uppercase tracking-wider">
                      <th className="p-4 pl-6">Tradie</th>
                      <th className="p-4">ABN & License Details</th>
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
                            <div className="text-foreground mt-0.5"><span className="text-muted-foreground">License ID:</span> {item.license_number || 'N/A'}</div>
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

            {/* 4. Disputes & Protected Payments Queue */}
            <div className="bg-card border p-6 rounded-3xl space-y-4 shadow-sm mt-8">
              <h3 className="text-lg font-extrabold text-foreground flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-red-500" /> Active Job Disputes
              </h3>
              {disputedJobs.length === 0 ? (
                <p className="text-xs text-muted-foreground font-semibold">No active job disputes under review.</p>
              ) : (
                <div className="space-y-4">
                  {disputedJobs.map((dispute) => {
                    const payment = dispute.payments?.[0];
                    const issue = dispute.job_issues?.[0];
                    const isResolving = resolvingDisputeId === dispute.id;

                    return (
                      <div key={dispute.id} className="border p-5 rounded-2xl bg-card space-y-4 font-semibold text-xs text-muted-foreground">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-extrabold text-sm text-foreground">{dispute.title}</h4>
                            <p className="mt-1">Customer: <span className="text-foreground">{dispute.customer?.display_name} ({dispute.customer?.email})</span></p>
                            <p>Contractor: <span className="text-foreground">{payment?.payee?.display_name} ({payment?.payee?.email})</span></p>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-black text-foreground">
                              {payment ? (payment.amount / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' }) : 'N/A'}
                            </span>
                            <p className="text-[10px] text-red-500 font-bold uppercase mt-1">Disputed</p>
                          </div>
                        </div>

                        {issue && (
                          <div className="p-3 bg-red-500/5 border border-red-500/10 rounded-xl">
                            <span className="font-bold text-red-500 block uppercase text-[10px]">Customer Complaint:</span>
                            <p className="text-foreground italic mt-0.5 font-medium font-semibold">"{issue.description}"</p>
                          </div>
                        )}

                        {isResolving ? (
                          <div className="p-4 bg-muted/20 border rounded-xl space-y-3">
                            <h5 className="font-extrabold text-foreground">Dispute Resolution Tool</h5>
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Resolution Verdict Notes</label>
                              <textarea
                                placeholder="State the reason/findings for the resolution..."
                                value={resolutionText}
                                onChange={(e) => setResolutionText(e.target.value)}
                                className="w-full bg-background border border-border rounded-xl px-3 py-2 outline-none text-xs font-semibold focus:border-primary/50"
                                rows={2}
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
                                <div className="mt-3 grid grid-cols-3 gap-2 bg-background border p-3 rounded-xl text-[10px] font-semibold text-left">
                                  <div className="space-y-1">
                                    <span className="text-muted-foreground uppercase block">Customer Refund</span>
                                    <span className="text-xs font-black text-blue-500">
                                      {(((payment.amount) * (100 - splitPercentage)) / 10000).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })}
                                    </span>
                                  </div>
                                  <div className="space-y-1 border-l pl-2">
                                    <span className="text-muted-foreground uppercase block">Tradie Payout</span>
                                    <span className="text-xs font-black text-green-600">
                                      {(((payment.amount - payment.platform_fee) * splitPercentage) / 10000).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })}
                                    </span>
                                  </div>
                                  <div className="space-y-1 border-l pl-2">
                                    <span className="text-muted-foreground uppercase block">Fee Retained</span>
                                    <span className="text-xs font-black text-primary">
                                      {(((payment.platform_fee) * splitPercentage) / 10000).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleResolveDispute(dispute.id)}
                                disabled={disputeActionLoading}
                                className="bg-primary hover:bg-primary/95 text-primary-foreground font-black px-4 py-2 rounded-xl text-xs transition shadow active:scale-95 disabled:opacity-50"
                              >
                                {disputeActionLoading ? 'Saving...' : 'Confirm Resolution'}
                              </button>
                              <button
                                onClick={() => setResolvingDisputeId(null)}
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
        </div>
      )}
    </div>
  );
}
