import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import {
  getPendingVerifications, approveIdentityVerification, approveTradieProfile,
  approveDocumentOnly, rejectVerification, suspendTradieProfile, suspendIdentityVerification
} from '../lib/users';
import type { VerificationRecord, UserProfile } from '../lib/users';
import { supabase } from '../lib/supabase';
import {
  ShieldCheck, UserCheck, ShieldAlert, Award, Loader2, AlertTriangle,
  Check, FileText, CheckCircle, AlertCircle, X, Image as ImageIcon,
  ChevronDown, ChevronUp, User, Briefcase, CreditCard, MessageSquare,
  Camera, TrendingUp, DollarSign, RefreshCw, Activity
} from 'lucide-react';
import { getDisputedJobs, recordAdminDisputeAction, resolveDispute } from '../lib/payments';

// ─── Local Types ─────────────────────────────────────────────────────────────

interface ToastMessage {
  text: string;
  type: 'success' | 'error';
}

export interface ConfirmConfig {
  title: string;
  message: string;
  onConfirm: () => void;
  confirmLabel?: string;
  isDanger?: boolean;
}

type ResolutionAction =
  | 'release_contractor'
  | 'refund_customer'
  | 'manual_split'
  | 'request_evidence'
  | 'escalate'
  | null;

interface ManualSplitAmounts {
  contractorPayout: string;
  customerRefund: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDocumentType(raw: string): string {
  return raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function verificationStatusClass(status: string): string {
  if (status === 'approved') return 'bg-green-500/10 text-green-600 border-green-500/20';
  if (status === 'rejected') return 'bg-red-500/10 text-red-500 border-red-500/20';
  return 'bg-amber-500/10 text-amber-700 border-amber-500/20';
}

const IDENTITY_DOCUMENT_TYPES = ['drivers_license', 'passport', 'proof_of_age', 'other_identity', 'liveness_selfie'];
const TRADIE_DOCUMENT_TYPES = ['contractor_license', 'insurance', 'trade_certificate', 'other_trade_credential'];

interface VerificationCase {
  userId: string;
  user: VerificationRecord['user'];
  identityDocs: VerificationRecord[];
  tradieDocs: VerificationRecord[];
  latestSubmittedAt: number;
  pendingCount: number;
}

function formatJobRef(id: string): string {
  return `#${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

function formatAUD(cents: number): string {
  return (cents / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

function parseDollarInput(val: string): number {
  const parsed = parseFloat(val.replace(/[^0-9.]/g, ''));
  return isNaN(parsed) ? 0 : Math.round(parsed * 100);
}

// ─── Resolution action meta ───────────────────────────────────────────────────

const RESOLUTION_ACTIONS: {
  id: ResolutionAction;
  label: string;
  description: string;
  color: string;
  finalStatus: string;
}[] = [
  {
    id: 'release_contractor',
    label: 'Release full payment to contractor',
    description: 'Work was completed satisfactorily. Release the full secured payment to the contractor.',
    color: 'border-green-500/40 bg-green-500/5 text-green-700',
    finalStatus: 'Completed',
  },
  {
    id: 'refund_customer',
    label: 'Refund customer in full',
    description: 'Work was not completed or was unsatisfactory. Refund the full amount to the customer.',
    color: 'border-blue-500/40 bg-blue-500/5 text-blue-700',
    finalStatus: 'Cancelled / Refunded',
  },
  {
    id: 'manual_split',
    label: 'Manual split',
    description: 'Partial work was completed. Specify exact dollar amounts for contractor and customer.',
    color: 'border-amber-500/40 bg-amber-500/5 text-amber-700',
    finalStatus: 'Completed (Split)',
  },
  {
    id: 'request_evidence',
    label: 'Request more evidence',
    description: 'More information is needed before a decision can be made. Add notes and keep under review.',
    color: 'border-purple-500/40 bg-purple-500/5 text-purple-700',
    finalStatus: 'Disputed (Under Review)',
  },
  {
    id: 'escalate',
    label: 'Escalate / keep under review',
    description: 'This dispute requires further internal review. Add notes and escalate for follow-up.',
    color: 'border-slate-500/40 bg-slate-500/5 text-slate-700',
    finalStatus: 'Disputed (Escalated)',
  },
];

// ─── Sub-component: Dispute Case File ────────────────────────────────────────

interface DisputeCaseFileProps {
  dispute: any;
  onResolved: () => void;
  showToast: (text: string, type?: 'success' | 'error') => void;
  showConfirm: (config: ConfirmConfig) => void;
}

export function DisputeCaseFile({ dispute, onResolved, showToast, showConfirm }: DisputeCaseFileProps) {
  const payment = Array.isArray(dispute.payments) ? dispute.payments[0] : dispute.payments;
  const issues = Array.isArray(dispute.job_issues) ? dispute.job_issues : [];
  const newestIssues = [...issues].sort((a: any, b: any) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const issue = newestIssues.find((candidate: any) => candidate.status === 'open') || newestIssues[0];
  const proofs = Array.isArray(dispute.job_completion_proofs) ? dispute.job_completion_proofs : [];
  const proof = proofs.find((candidate: any) => candidate.id === issue?.proof_id)
    || [...proofs].sort((a: any, b: any) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  const contractor = payment?.payee;
  const isOngoing = dispute.status === 'disputed' && issue?.status === 'open';
  const caseStatus = isOngoing
    ? 'Disputed'
    : issue?.status?.replace(/_/g, ' ') || dispute.status?.replace(/_/g, ' ') || 'Resolved';

  // Section expand states
  const [expanded, setExpanded] = useState(true);
  const [showResolution, setShowResolution] = useState(false);

  // Resolution state
  const [selectedAction, setSelectedAction] = useState<ResolutionAction>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [manualSplit, setManualSplit] = useState<ManualSplitAmounts>({ contractorPayout: '', customerRefund: '' });
  const [submitting, setSubmitting] = useState(false);

  // Evidence/proof image URLs
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([]);
  const [proofUrls, setProofUrls] = useState<string[]>([]);
  const [urlsLoading, setUrlsLoading] = useState(false);

  // Load signed URLs for evidence and proof images
  useEffect(() => {
    const loadUrls = async () => {
      setUrlsLoading(true);
      const fetchSignedUrls = async (paths: string[]) => {
        const urls: string[] = [];
        for (const path of paths || []) {
          try {
            const { data, error } = await supabase.storage
              .from('completion_proofs')
              .createSignedUrl(path, 3600);
            if (!error && data?.signedUrl) urls.push(data.signedUrl);
          } catch { /* skip */ }
        }
        return urls;
      };

      const [ev, pr] = await Promise.all([
        fetchSignedUrls(issue?.attachments || []),
        fetchSignedUrls(proof?.attachments || []),
      ]);
      setEvidenceUrls(ev);
      setProofUrls(pr);
      setUrlsLoading(false);
    };
    loadUrls();
  }, [issue, proof]);

  // Compute preview amounts
  const totalCents = payment?.amount || 0;
  const platformFeeCents = payment?.platform_fee || 0;

  const getPreview = () => {
    if (!selectedAction) return null;
    if (selectedAction === 'release_contractor') {
      const payout = totalCents - platformFeeCents;
      return { contractor: payout, customer: 0, platform: platformFeeCents, split: 100 };
    }
    if (selectedAction === 'refund_customer') {
      return { contractor: 0, customer: totalCents, platform: 0, split: 0 };
    }
    if (selectedAction === 'manual_split') {
      const contractorCents = parseDollarInput(manualSplit.contractorPayout);
      const customerCents = parseDollarInput(manualSplit.customerRefund);
      const platformCents = Math.max(0, totalCents - contractorCents - customerCents);
      // Derive split% from contractor payout relative to (total - fee)
      const netAfterFee = totalCents - platformFeeCents;
      const split = netAfterFee > 0 ? Math.round((contractorCents / netAfterFee) * 100) : 0;
      return { contractor: contractorCents, customer: customerCents, platform: platformCents, split: Math.max(0, Math.min(100, split)) };
    }
    return null;
  };

  const preview = getPreview();

  const validateManualSplit = (): string | null => {
    const c = parseDollarInput(manualSplit.contractorPayout);
    const r = parseDollarInput(manualSplit.customerRefund);
    if (c < 0 || r < 0) return 'Amounts cannot be negative.';
    if (c + r > totalCents) return `Total payout ($${((c + r) / 100).toFixed(2)}) exceeds the payment held (${formatAUD(totalCents)}).`;
    if (c + r === 0) return 'At least one amount must be greater than $0.';
    return null;
  };

  const actionMeta = RESOLUTION_ACTIONS.find(a => a.id === selectedAction);

  const handleConfirmResolution = () => {
    if (!adminNotes.trim()) {
      showToast('Please add admin notes/findings before confirming.', 'error');
      return;
    }
    if (selectedAction === 'manual_split') {
      const err = validateManualSplit();
      if (err) { showToast(err, 'error'); return; }
    }

    const actionLabel = actionMeta?.label || selectedAction;
    const isSoftAction = selectedAction === 'request_evidence' || selectedAction === 'escalate';
    showConfirm({
      title: 'Confirm Dispute Resolution',
      message: isSoftAction
        ? `You are about to apply: "${actionLabel}". This saves an internal admin case note only. The dispute remains open and no party notification is sent.`
        : `You are about to apply: "${actionLabel}". This will update the job status and payment records. This action cannot be undone.`,
      confirmLabel: isSoftAction ? 'Save Internal Note' : 'Confirm Resolution',
      isDanger: selectedAction === 'refund_customer' || selectedAction === 'release_contractor' || selectedAction === 'manual_split',
      onConfirm: async () => {
        setSubmitting(true);
        try {
          if (selectedAction === 'release_contractor') {
            const { error } = await resolveDispute(dispute.id, adminNotes.trim(), 100);
            if (error) throw error;
          } else if (selectedAction === 'refund_customer') {
            const { error } = await resolveDispute(dispute.id, adminNotes.trim(), 0);
            if (error) throw error;
          } else if (selectedAction === 'manual_split' && preview) {
            const { error } = await resolveDispute(dispute.id, adminNotes.trim(), preview.split);
            if (error) throw error;
          } else if (selectedAction === 'request_evidence' || selectedAction === 'escalate') {
            // Soft action: update the issue admin_notes only — job stays in 'disputed'
            const { error } = await recordAdminDisputeAction(dispute.id, selectedAction, adminNotes.trim());
            if (error) throw error;
            showToast(
              selectedAction === 'request_evidence'
                ? 'Admin evidence request recorded. The dispute remains open.'
                : 'Admin escalation recorded. The dispute remains open.',
              'success'
            );
            setShowResolution(false);
            setSelectedAction(null);
            setAdminNotes('');
            setSubmitting(false);
            onResolved();
            return;
          }
          showToast('Dispute resolved. Payment records updated.', 'success');
          onResolved();
        } catch (err: any) {
          showToast(err.message || 'Failed to resolve dispute.', 'error');
        }
        setSubmitting(false);
      }
    });
  };

  return (
    <div className="border-b last:border-b-0">
      {/* Case Header — always visible */}
      <div
        className="p-5 flex items-start justify-between gap-4 cursor-pointer hover:bg-muted/5 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-black text-sm text-foreground leading-tight">{dispute.title}</span>
            <span className={`text-[10px] font-black border px-2 py-0.5 rounded uppercase tracking-wider shrink-0 ${
              isOngoing
                ? 'bg-red-500/10 text-red-600 border-red-500/15'
                : 'bg-green-500/10 text-green-700 border-green-500/20'
            }`}>{caseStatus}</span>
          </div>
          <div className="text-[10px] font-bold text-muted-foreground mt-0.5 flex flex-wrap gap-3">
            <span>Ref: <span className="font-mono text-foreground">{formatJobRef(dispute.id)}</span></span>
            {issue?.created_at && (
              <span>Disputed: <span className="text-foreground">{new Date(issue.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</span></span>
            )}
            {payment && (
              <span>Payment held: <span className="text-foreground font-black">{formatAUD(payment.amount)}</span></span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {payment && (
            <span className="hidden sm:block text-sm font-black text-foreground bg-red-500/5 border border-red-500/10 px-3 py-1 rounded-lg">
              {formatAUD(payment.amount)} held
            </span>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {/* Case Body */}
      {expanded && (
        <div className="px-5 pb-6 space-y-5">

          {/* ── Row: Customer + Contractor ─────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Customer */}
            <div className="p-4 bg-muted/10 border border-border rounded-xl space-y-2">
              <div className="flex items-center gap-1.5 text-[10px] font-black text-muted-foreground uppercase tracking-wider">
                <User className="h-3.5 w-3.5" /> Customer
              </div>
              <div className="space-y-0.5">
                <p className="font-bold text-sm text-foreground">{dispute.customer?.display_name || '—'}</p>
                <p className="text-xs text-muted-foreground font-medium">{dispute.customer?.email || '—'}</p>
                {dispute.customer?.phone && <p className="text-xs text-muted-foreground font-medium">{dispute.customer.phone}</p>}
                <div className="flex flex-wrap gap-1 pt-1">
                  {dispute.customer?.identity_verified && (
                    <span className="text-[10px] font-black bg-blue-500/10 text-blue-600 px-2 py-0.5 rounded">ID Verified ✓</span>
                  )}
                </div>
                {dispute.customer?.id && (
                  <p className="text-[10px] font-mono text-muted-foreground/60 pt-1 break-all">{dispute.customer.id}</p>
                )}
              </div>
            </div>

            {/* Contractor */}
            <div className="p-4 bg-muted/10 border border-border rounded-xl space-y-2">
              <div className="flex items-center gap-1.5 text-[10px] font-black text-muted-foreground uppercase tracking-wider">
                <Briefcase className="h-3.5 w-3.5" /> Contractor
              </div>
              {contractor ? (
                <div className="space-y-0.5">
                  <p className="font-bold text-sm text-foreground">{contractor.display_name || '—'}</p>
                  <p className="text-xs text-muted-foreground font-medium">{contractor.email || '—'}</p>
                  {contractor.phone && <p className="text-xs text-muted-foreground font-medium">{contractor.phone}</p>}
                  {contractor.abn && <p className="text-xs text-muted-foreground font-medium">ABN: {contractor.abn}</p>}
                  {contractor.license_number && <p className="text-xs text-muted-foreground font-medium">Licence: {contractor.license_number}</p>}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {contractor.tradie_verified && (
                      <span className="text-[10px] font-black bg-green-500/10 text-green-600 px-2 py-0.5 rounded">Whitelisted ✓</span>
                    )}
                    {contractor.identity_verified && (
                      <span className="text-[10px] font-black bg-blue-500/10 text-blue-600 px-2 py-0.5 rounded">ID Verified ✓</span>
                    )}
                  </div>
                  {contractor.id && (
                    <p className="text-[10px] font-mono text-muted-foreground/60 pt-1 break-all">{contractor.id}</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground font-semibold italic">No contractor linked to payment record.</p>
              )}
            </div>
          </div>

          {/* ── Customer Complaint ─────────────────────────────────────────── */}
          {issue && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10px] font-black text-muted-foreground uppercase tracking-wider">
                <MessageSquare className="h-3.5 w-3.5" /> Customer Complaint
              </div>
              <div className="p-3.5 bg-red-500/5 border border-red-500/10 rounded-xl">
                <p className="text-sm text-foreground leading-relaxed font-medium italic">"{issue.description}"</p>
              </div>
            </div>
          )}

          {/* ── Completion Proof ───────────────────────────────────────────── */}
          {proof && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[10px] font-black text-muted-foreground uppercase tracking-wider">
                <Camera className="h-3.5 w-3.5" /> Completion Proof (submitted by contractor)
              </div>
              <div className="p-3.5 bg-muted/10 border border-border rounded-xl space-y-2">
                <p className="text-xs font-semibold text-foreground leading-relaxed">{proof.description || 'No notes provided.'}</p>
                {proof.created_at && (
                  <p className="text-[10px] text-muted-foreground font-semibold">
                    Submitted: {new Date(proof.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
                {urlsLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground font-semibold">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading proof images...
                  </div>
                ) : proofUrls.length > 0 ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {proofUrls.map((url, idx) => (
                      <a key={idx} href={url} target="_blank" rel="noopener noreferrer"
                        className="h-20 w-20 border border-border rounded-xl overflow-hidden hover:opacity-80 transition-opacity shadow-sm bg-muted shrink-0"
                      >
                        <img src={url} alt={`Proof ${idx + 1}`} className="h-full w-full object-cover" />
                      </a>
                    ))}
                  </div>
                ) : proof.attachments?.length > 0 ? (
                  <p className="text-xs text-muted-foreground font-semibold italic">Proof images could not be loaded.</p>
                ) : (
                  <p className="text-xs text-muted-foreground font-semibold italic">No proof images were uploaded.</p>
                )}
              </div>
            </div>
          )}

          {/* ── Customer Dispute Evidence ──────────────────────────────────── */}
          {issue?.attachments?.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[10px] font-black text-muted-foreground uppercase tracking-wider">
                <ImageIcon className="h-3.5 w-3.5" /> Customer Evidence Photos ({issue.attachments.length})
              </div>
              {urlsLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-semibold">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading evidence images...
                </div>
              ) : evidenceUrls.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {evidenceUrls.map((url, idx) => (
                    <a key={idx} href={url} target="_blank" rel="noopener noreferrer"
                      className="h-20 w-20 border border-border rounded-xl overflow-hidden hover:opacity-80 transition-opacity shadow-sm bg-muted shrink-0"
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

          {/* ── Payment Breakdown ──────────────────────────────────────────── */}
          {payment && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10px] font-black text-muted-foreground uppercase tracking-wider">
                <CreditCard className="h-3.5 w-3.5" /> Payment Breakdown
              </div>
              <div className="grid grid-cols-3 gap-2 bg-muted/10 border border-border p-4 rounded-xl text-xs font-semibold">
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase block font-bold">Total Held</span>
                  <span className="text-sm font-black text-foreground">{formatAUD(payment.amount)}</span>
                </div>
                <div className="space-y-1 border-l pl-3">
                  <span className="text-[10px] text-muted-foreground uppercase block font-bold">Platform Fee</span>
                  <span className="text-sm font-black text-primary">{formatAUD(payment.platform_fee)}</span>
                </div>
                <div className="space-y-1 border-l pl-3">
                  <span className="text-[10px] text-muted-foreground uppercase block font-bold">Contractor Net</span>
                  <span className="text-sm font-black text-green-600">{formatAUD(payment.amount - payment.platform_fee)}</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Resolution Console ─────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[10px] font-black text-muted-foreground uppercase tracking-wider">
              <FileText className="h-3.5 w-3.5" /> Case Notes / History
            </div>
            <div className="p-4 bg-muted/10 border border-border rounded-xl">
              {issue?.admin_notes ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <span className="text-[10px] font-black text-primary uppercase tracking-wider">Latest internal admin case note</span>
                    {issue.resolved_at && (
                      <span className="text-[10px] font-semibold text-muted-foreground">
                        Resolved {new Date(issue.resolved_at).toLocaleString('en-AU')}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-foreground font-medium whitespace-pre-wrap">{issue.admin_notes}</p>
                  <p className="text-[10px] text-muted-foreground font-semibold">
                    Internal record only. The current schema stores one latest note and does not record a full action timeline or party notifications.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground font-semibold">No internal admin case note has been saved.</p>
              )}
            </div>
          </div>

          {!isOngoing ? (
            <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-xl text-xs font-semibold text-green-700">
              This dispute is completed. Resolution actions are read-only.
            </div>
          ) : !showResolution ? (
            <button
              onClick={() => setShowResolution(true)}
              className="w-full sm:w-auto bg-primary hover:bg-primary/95 text-primary-foreground font-black px-5 py-2.5 rounded-xl text-sm transition shadow active:scale-95 flex items-center gap-2"
            >
              <DollarSign className="h-4 w-4" /> Open Resolution Console
            </button>
          ) : (
            <div className="border border-border rounded-2xl overflow-hidden">
              <div className="px-5 py-4 bg-muted/10 border-b flex items-center justify-between">
                <h5 className="font-extrabold text-sm text-foreground flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" /> Resolution Console
                </h5>
                <button
                  onClick={() => { setShowResolution(false); setSelectedAction(null); setAdminNotes(''); }}
                  className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-5 space-y-5">

                {/* Action selection */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider block">
                    Resolution Decision
                  </label>
                  <div className="space-y-2">
                    {RESOLUTION_ACTIONS.map(action => (
                      <button
                        key={action.id!}
                        onClick={() => setSelectedAction(action.id)}
                        className={`w-full text-left p-3.5 rounded-xl border-2 transition-all text-xs font-semibold ${
                          selectedAction === action.id
                            ? action.color + ' shadow-sm'
                            : 'border-border bg-card text-muted-foreground hover:border-primary/30 hover:bg-muted/10'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <div className={`h-4 w-4 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center ${
                            selectedAction === action.id ? 'border-current' : 'border-muted-foreground/40'
                          }`}>
                            {selectedAction === action.id && <div className="h-2 w-2 rounded-full bg-current" />}
                          </div>
                          <div>
                            <p className="font-bold text-[13px]">{action.label}</p>
                            <p className="text-[11px] opacity-80 mt-0.5 font-medium">{action.description}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Manual split dollar fields */}
                {selectedAction === 'manual_split' && payment && (
                  <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl space-y-3">
                    <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider">
                      Manual Split — Payment held: {formatAUD(totalCents)}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase block">
                          Contractor Payout ($)
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">$</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={manualSplit.contractorPayout}
                            onChange={e => setManualSplit(s => ({ ...s, contractorPayout: e.target.value }))}
                            className="w-full pl-7 pr-3 py-2 text-sm font-bold bg-background border border-border rounded-xl outline-none focus:border-primary/50 text-foreground"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase block">
                          Customer Refund ($)
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">$</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={manualSplit.customerRefund}
                            onChange={e => setManualSplit(s => ({ ...s, customerRefund: e.target.value }))}
                            className="w-full pl-7 pr-3 py-2 text-sm font-bold bg-background border border-border rounded-xl outline-none focus:border-primary/50 text-foreground"
                          />
                        </div>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground font-semibold">
                      Platform fee retained = Total held − Contractor payout − Customer refund. Must not exceed {formatAUD(totalCents)}.
                    </p>
                  </div>
                )}

                {/* Resolution Preview */}
                {selectedAction && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider block">
                      Resolution Preview
                    </label>
                    <div className="p-4 bg-muted/10 border border-border rounded-xl space-y-3">
                      {preview ? (
                        <>
                          <div className="grid grid-cols-3 gap-3 text-xs">
                            <div className="space-y-1 text-center">
                              <p className="text-[10px] text-muted-foreground uppercase font-bold">Customer receives</p>
                              <p className="text-base font-black text-blue-600">{formatAUD(preview.customer)}</p>
                            </div>
                            <div className="space-y-1 text-center border-x border-border">
                              <p className="text-[10px] text-muted-foreground uppercase font-bold">Contractor receives</p>
                              <p className="text-base font-black text-green-600">{formatAUD(preview.contractor)}</p>
                            </div>
                            <div className="space-y-1 text-center">
                              <p className="text-[10px] text-muted-foreground uppercase font-bold">Platform keeps</p>
                              <p className="text-base font-black text-primary">{formatAUD(preview.platform)}</p>
                            </div>
                          </div>
                          <div className="pt-1 border-t border-border">
                            <p className="text-[10px] text-muted-foreground font-semibold">
                              Final job status: <span className="font-black text-foreground">{actionMeta?.finalStatus}</span>
                            </p>
                          </div>
                        </>
                      ) : (
                        <div className="text-center py-2">
                          <p className="text-xs text-muted-foreground font-semibold">
                            Final job status: <span className="font-black text-foreground">{actionMeta?.finalStatus}</span>
                          </p>
                          <p className="text-[11px] text-muted-foreground/70 font-medium mt-0.5">
                            No payment transfer will occur — dispute remains open.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Admin Notes */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider block">
                    Admin Notes / Findings <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    placeholder="State the reasoning, evidence reviewed, findings, and decision rationale..."
                    value={adminNotes}
                    onChange={e => setAdminNotes(e.target.value)}
                    rows={3}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 outline-none text-xs font-semibold focus:border-primary/50 resize-none text-foreground"
                  />
                  <p className="text-[10px] text-muted-foreground font-semibold">
                    Required. These notes will be saved to the dispute record.
                  </p>
                </div>

                {/* Confirm button */}
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={handleConfirmResolution}
                    disabled={submitting || !selectedAction || !adminNotes.trim()}
                    className="bg-primary hover:bg-primary/95 text-primary-foreground font-black px-5 py-2.5 rounded-xl text-sm transition shadow active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    {submitting ? 'Processing...' : 'Confirm Resolution'}
                  </button>
                  <button
                    onClick={() => { setShowResolution(false); setSelectedAction(null); setAdminNotes(''); }}
                    className="bg-secondary hover:bg-secondary/80 text-secondary-foreground font-black px-5 py-2.5 rounded-xl text-sm transition"
                  >
                    Cancel
                  </button>
                </div>

              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Analytics Helper Components ─────────────────────────────────────────────

interface DonutChartItem {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  title: string;
  data: DonutChartItem[];
}

function DonutChart({ title, data }: DonutChartProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let accumulated = 0;
  const slices = data.map((item) => {
    const percentage = total > 0 ? (item.value / total) * 100 : 0;
    const offset = 100 - accumulated + 25; // start at 12 o'clock
    accumulated += percentage;
    return {
      ...item,
      percentage,
      dashArray: `${percentage} ${100 - percentage}`,
      dashOffset: offset % 100,
    };
  });

  return (
    <div className="bg-card border rounded-3xl p-6 space-y-4 shadow-sm flex flex-col justify-between">
      <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{title}</h4>
      {total === 0 ? (
        <div className="h-44 flex items-center justify-center text-xs text-muted-foreground font-semibold">
          No data available
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row items-center gap-6 py-2">
          <div className="relative h-32 w-32 shrink-0">
            <svg viewBox="0 0 36 36" className="w-full h-full transform -scale-x-100">
              {/* Background circle */}
              <circle
                cx="18"
                cy="18"
                r="15.915"
                fill="transparent"
                stroke="var(--muted)"
                strokeWidth="3"
                className="opacity-20"
              />
              {slices.map((slice, index) => slice.value > 0 && (
                <circle
                  key={index}
                  cx="18"
                  cy="18"
                  r="15.915"
                  fill="transparent"
                  stroke={slice.color}
                  strokeWidth="3.8"
                  strokeDasharray={slice.dashArray}
                  strokeDashoffset={slice.dashOffset}
                  className="transition-all duration-500 ease-out"
                />
              ))}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-black text-foreground">{total}</span>
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Total</span>
            </div>
          </div>
          <div className="flex-1 w-full space-y-2">
            {slices.map((slice, index) => (
              <div key={index} className="flex items-center justify-between text-xs font-semibold">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: slice.color }} />
                  <span className="text-muted-foreground truncate max-w-[120px]">{slice.label}</span>
                </div>
                <span className="text-foreground shrink-0">{slice.value} ({Math.round(slice.percentage)}%)</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface CategoryBarChartProps {
  categories: Record<string, number>;
}

function CategoryBarChart({ categories }: CategoryBarChartProps) {
  const categoryLabels: Record<string, string> = {
    plumbing: 'Plumbing',
    electrical: 'Electrical',
    carpentry: 'Carpentry',
    handyman: 'Handyman',
    tiling: 'Tiling',
    painting: 'Painting',
    roofing: 'Roofing',
    landscaping: 'Landscaping',
    plastering: 'Plastering',
    bricklaying: 'Bricklaying',
    concreting: 'Concreting',
    fencing: 'Fencing',
    demolition: 'Demolition',
    cleaning: 'Cleaning',
    other: 'Other'
  };

  const items = Object.entries(categories || {})
    .map(([key, value]) => ({
      label: categoryLabels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      value,
    }))
    .sort((a, b) => b.value - a.value);

  const max = items.reduce((m, item) => Math.max(m, item.value), 0);

  return (
    <div className="bg-card border rounded-3xl p-6 space-y-4 shadow-sm">
      <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Job Categories</h4>
      {items.length === 0 ? (
        <div className="h-44 flex items-center justify-center text-xs text-muted-foreground font-semibold">
          No job category data in this window
        </div>
      ) : (
        <div className="space-y-3.5">
          {items.slice(0, 8).map((item, index) => {
            const pct = max > 0 ? (item.value / max) * 100 : 0;
            return (
              <div key={index} className="space-y-1 text-xs font-semibold">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="text-foreground">{item.value} {item.value === 1 ? 'job' : 'jobs'}</span>
                </div>
                <div className="h-2 w-full bg-muted/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-500 ease-out rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Admin Page ───────────────────────────────────────────────────────────────

export default function Admin() {
  const { user, profile, loading: authLoading } = useAuth();
  const isAdmin = profile?.is_admin === true;

  // Data state
  const [verifications, setVerifications] = useState<VerificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalTradies, setTotalTradies] = useState<number | null>(null);
  const [verifiedTradies, setVerifiedTradies] = useState<number | null>(null);
  const [whitelistedTradiesList, setWhitelistedTradiesList] = useState<UserProfile[]>([]);
  const [disputedJobs, setDisputedJobs] = useState<any[]>([]);

  // Verification action state
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');

  // Toast + Confirm modal state
  const [toastMessage, setToastMessage] = useState<ToastMessage | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<ConfirmConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Analytics state
  const [adminTab, setAdminTab] = useState<'queues' | 'analytics'>('queues');
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [analyticsTimeWindow, setAnalyticsTimeWindow] = useState('all');
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const isRefreshingRef = useRef(false);

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
    if (!isAdmin) return;
    setLoading(true);
    setError(null);

    try {
      const [
        { data: list, error: fetchErr },
        { count: tradiesCount },
        { count: verifiedCount },
        { data: whitelistedList },
        { data: disputesList },
      ] = await Promise.all([
        getPendingVerifications(),
        supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .in('role', ['tradie', 'dual']),
        supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('tradie_verified', true),
        supabase
          .from('users')
          .select('*')
          .eq('tradie_verified', true)
          .order('display_name', { ascending: true }),
        getDisputedJobs(),
      ]);

      if (fetchErr) throw fetchErr;
      setVerifications(list);
      if (tradiesCount !== null) setTotalTradies(tradiesCount);
      if (verifiedCount !== null) setVerifiedTradies(verifiedCount);
      if (whitelistedList) setWhitelistedTradiesList(whitelistedList as UserProfile[]);
      if (disputesList) setDisputedJobs(disputesList);
    } catch (err: any) {
      setError(err.message || 'Failed to load administrator dashboard data.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  const loadAnalytics = useCallback(async (window: string, silent = false) => {
    if (!isAdmin) return;
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    if (!silent) setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const { data, error: err } = await supabase.rpc('get_admin_analytics', {
        p_time_window: window,
      });
      if (err) throw err;
      setAnalyticsData(data);
      setLastUpdated(new Date());
    } catch (err: any) {
      setAnalyticsError(err.message || 'Failed to load marketplace analytics.');
    } finally {
      if (!silent) setAnalyticsLoading(false);
      isRefreshingRef.current = false;
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) loadData();
  }, [isAdmin, loadData]);

  useEffect(() => {
    if (isAdmin && adminTab === 'analytics') {
      // Load initially (full spinner)
      loadAnalytics(analyticsTimeWindow, false);

      // Auto-refresh every 30 seconds (silently in background)
      const interval = setInterval(() => {
        loadAnalytics(analyticsTimeWindow, true);
      }, 30000);

      return () => clearInterval(interval);
    }
  }, [isAdmin, adminTab, analyticsTimeWindow, loadAnalytics]);

  // ─── Verification handlers ─────────────────────────────────────────────────

  const handleApproveIdentity = async (id: string, userId?: string) => {
    setActionLoadingId(id);
    const { error: err } = await approveIdentityVerification(id);

    let wasWhitelisted = false;
    if (!err && userId) {
      const { data: updatedUser } = await supabase
        .from('users')
        .select('tradie_verified')
        .eq('id', userId)
        .single();
      if (updatedUser?.tradie_verified) {
        wasWhitelisted = true;
      }
    }

    setActionLoadingId(null);
    if (err) showToast(err.message || 'Failed to approve identity verification.', 'error');
    else {
      if (wasWhitelisted) {
        showToast('All required proofs approved. Tradie has been whitelisted.', 'success');
      } else {
        showToast('Identity verification approved.', 'success');
      }
      loadData();
    }
  };

  const handleApproveDocumentOnly = async (id: string, userId?: string) => {
    setActionLoadingId(id);
    const { error: err } = await approveDocumentOnly(id);

    let wasWhitelisted = false;
    if (!err && userId) {
      const { data: updatedUser } = await supabase
        .from('users')
        .select('tradie_verified')
        .eq('id', userId)
        .single();
      if (updatedUser?.tradie_verified) {
        wasWhitelisted = true;
      }
    }

    setActionLoadingId(null);
    if (err) showToast(err.message || 'Failed to approve document.', 'error');
    else {
      if (wasWhitelisted) {
        showToast('All required proofs approved. Tradie has been whitelisted.', 'success');
      } else {
        showToast('Document approved.', 'success');
      }
      loadData();
    }
  };

  const handleWhitelistTradie = async (userId: string) => {
    setActionLoadingId(userId);
    const { error: err } = await approveTradieProfile(userId);
    setActionLoadingId(null);
    if (err) showToast(err.message || 'Failed to whitelist tradie.', 'error');
    else { showToast('Tradie profile whitelisted successfully.', 'success'); loadData(); }
  };

  const handleRejectSubmit = async (id: string) => {
    if (!rejectNotes.trim()) { showToast('Please specify rejection notes.', 'error'); return; }
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
        else { showToast('Tradie profile suspended.', 'success'); loadData(); }
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

  // ─── Auth guards ───────────────────────────────────────────────────────────

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

  // ─── Derived data ──────────────────────────────────────────────────────────

  const pendingVerificationCount = verifications.filter(v => v.status === 'pending').length;
  const verificationCases = Array.from(verifications.reduce((cases, item) => {
    const existing = cases.get(item.user_id) || {
      userId: item.user_id,
      user: item.user,
      identityDocs: [],
      tradieDocs: [],
      latestSubmittedAt: 0,
      pendingCount: 0,
    };

    if (!existing.user && item.user) existing.user = item.user;
    if (IDENTITY_DOCUMENT_TYPES.includes(item.document_type)) existing.identityDocs.push(item);
    if (TRADIE_DOCUMENT_TYPES.includes(item.document_type)) existing.tradieDocs.push(item);
    existing.latestSubmittedAt = Math.max(existing.latestSubmittedAt, Date.parse(item.submitted_at) || 0);
    if (item.status === 'pending') existing.pendingCount += 1;

    cases.set(item.user_id, existing);
    return cases;
  }, new Map<string, VerificationCase>()).values()).sort((a, b) => b.latestSubmittedAt - a.latestSubmittedAt);

  const customerIdentityCases = verificationCases.filter(item =>
    item.tradieDocs.length === 0 && item.identityDocs.some(doc => doc.status === 'pending')
  );
  const tradieApprovalCases = verificationCases.filter(item =>
    item.tradieDocs.length > 0 && (!item.user?.tradie_verified || item.pendingCount > 0)
  );
  const identityVerifications = customerIdentityCases.flatMap(item =>
    item.identityDocs.filter(doc => doc.status === 'pending')
  );
  const tradieApplications = tradieApprovalCases;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">

      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
          <ShieldAlert className="h-8 w-8 text-primary" /> Admin Panel
        </h1>
        <p className="text-muted-foreground mt-1">Review trade credentials, manage user security settings, and resolve disputes.</p>
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-border pb-px gap-6">
        <button
          onClick={() => setAdminTab('queues')}
          className={`pb-4 text-sm font-bold border-b-2 transition-all ${
            adminTab === 'queues'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Verification &amp; Disputes Queues
        </button>
        <button
          onClick={() => setAdminTab('analytics')}
          className={`pb-4 text-sm font-bold border-b-2 transition-all ${
            adminTab === 'analytics'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Marketplace Analytics
        </button>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {adminTab === 'queues' && (
        <>
          {/* Stats Row — 4 tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-5 bg-card border rounded-2xl flex items-center justify-between shadow-sm">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Pending Approvals</p>
            <h3 className="text-3xl font-extrabold text-foreground mt-1">
              {loading ? <Loader2 className="h-6 w-6 text-primary animate-spin" /> : pendingVerificationCount}
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
                                  <button onClick={() => setRejectingId(null)} className="px-2 py-1 border rounded-md text-[10px] font-bold text-muted-foreground hover:bg-muted">Cancel</button>
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
                                  onClick={() => handleApproveIdentity(item.id, item.user_id)}
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
                <h3 className="text-lg font-extrabold text-foreground">Tradie Approval Cases</h3>
                <p className="text-xs text-muted-foreground mt-0.5 font-medium">Review identity status, trade credentials, ABNs, insurance, and final tradie whitelisting in one place.</p>
              </div>
              {tradieApplications.length > 0 && (
                <span className="text-xs font-black bg-amber-500/10 text-amber-700 border border-amber-500/20 px-3 py-1 rounded-full">
                  {tradieApplications.length} case{tradieApplications.length === 1 ? '' : 's'}
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
              <div className="p-5 space-y-4">
                {tradieApplications.map((item) => {
                      const user = item.user;
                      const allDocs = [...item.identityDocs, ...item.tradieDocs]
                        .sort((a, b) => Date.parse(a.submitted_at) - Date.parse(b.submitted_at));
                      const isActionLoading = actionLoadingId === item.userId || allDocs.some(doc => actionLoadingId === doc.id);
                      const isAlreadyWhitelisted = !!user?.tradie_verified;
                      const hasIdentityApproval = !!user?.identity_verified;
                      const hasApprovedLicenceProof = item.tradieDocs.some(doc => doc.document_type === 'contractor_license' && doc.status === 'approved');
                      const hasApprovedInsuranceProof = item.tradieDocs.some(doc => doc.document_type === 'insurance' && doc.status === 'approved');
                      const hasAbn = !!user?.abn?.trim();
                      const hasLicenceNumber = !!user?.license_number?.trim();
                      const missingWhitelistRequirements = [
                        !hasIdentityApproval && 'Approve ID first',
                        !hasAbn && 'ABN missing',
                        !hasLicenceNumber && 'Licence number missing',
                        !hasApprovedLicenceProof && 'Licence proof not approved',
                        !hasApprovedInsuranceProof && 'Insurance proof not approved',
                      ].filter(Boolean) as string[];
                      const canWhitelist = !isAlreadyWhitelisted && missingWhitelistRequirements.length === 0;
                      const overallStatus = isAlreadyWhitelisted
                        ? 'Approved'
                        : !hasIdentityApproval
                          ? 'Needs ID'
                          : missingWhitelistRequirements.length === 0
                            ? 'Ready to Approve'
                            : 'Needs Documents';
                      const overallStatusClass = isAlreadyWhitelisted
                        ? 'bg-green-500/10 text-green-600 border-green-500/20'
                        : overallStatus === 'Ready to Approve'
                          ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                          : 'bg-amber-500/10 text-amber-700 border-amber-500/20';

                      return (
                        <div key={item.userId} className="rounded-2xl border bg-background/60 p-5 space-y-5">
                          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="font-black text-foreground">{user?.display_name || 'Unknown User'}</h4>
                                <span className="capitalize text-[10px] font-black bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                                  {user?.role || 'unknown'} role
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground font-semibold mt-1">{user?.email}</p>
                            </div>
                            <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full border w-fit ${overallStatusClass}`}>
                              {overallStatus}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs font-semibold">
                            <div className="rounded-xl bg-muted/20 border p-3">
                              <p className="text-muted-foreground font-black uppercase text-[10px]">UUID</p>
                              <p className="font-mono text-blue-500/80 break-all mt-1">{item.userId}</p>
                            </div>
                            <div className="rounded-xl bg-muted/20 border p-3">
                              <p className="text-muted-foreground font-black uppercase text-[10px]">ABN</p>
                              <p className="text-foreground mt-1">{user?.abn || 'Not provided'}</p>
                            </div>
                            <div className="rounded-xl bg-muted/20 border p-3">
                              <p className="text-muted-foreground font-black uppercase text-[10px]">Licence Number</p>
                              <p className="text-foreground mt-1">{user?.license_number || 'Not provided'}</p>
                            </div>
                            <div className="rounded-xl bg-muted/20 border p-3">
                              <p className="text-muted-foreground font-black uppercase text-[10px]">Trades Offered</p>
                              <p className="text-foreground mt-1">{user?.trades?.join(', ') || 'None'}</p>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <h5 className="text-xs font-black uppercase tracking-wider text-foreground">Verification Proofs</h5>
                            <div className="grid gap-2">
                              {allDocs.map((doc) => {
                                const isDocLoading = actionLoadingId === doc.id;
                                const isDocRejecting = rejectingId === doc.id;
                                return (
                                  <div key={doc.id} className="rounded-xl border bg-card p-3">
                                    <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="text-xs font-black text-foreground">{formatDocumentType(doc.document_type)}</span>
                                          <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${verificationStatusClass(doc.status)}`}>
                                            {doc.status}
                                          </span>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground font-semibold mt-1">
                                          Submitted {new Date(doc.submitted_at).toLocaleDateString('en-AU')}{' '}
                                          {new Date(doc.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                        {doc.document_type === 'liveness_selfie' && (
                                          <p className="text-[10px] text-amber-600 font-bold mt-1">
                                            Expected: Selfie holding up 4 fingers next to face
                                          </p>
                                        )}
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <button onClick={() => handleViewFile(doc.document_url)} className="text-xs text-primary font-bold hover:underline inline-flex items-center gap-1 focus:outline-none">
                                          <FileText className="h-3.5 w-3.5" /> View Upload
                                        </button>
                                        {doc.status === 'pending' && (
                                          <>
                                            <button
                                              onClick={() => { setRejectingId(doc.id); setRejectNotes(''); }}
                                              disabled={isActionLoading}
                                              className="bg-destructive/10 hover:bg-destructive/15 text-destructive font-bold px-3 py-1.5 rounded-xl text-xs transition-all disabled:opacity-50"
                                            >
                                              Reject
                                            </button>
                                            {IDENTITY_DOCUMENT_TYPES.includes(doc.document_type) ? (
                                              <button
                                                onClick={() => handleApproveIdentity(doc.id, doc.user_id)}
                                                disabled={isActionLoading}
                                                className="bg-secondary hover:bg-secondary/80 text-secondary-foreground font-bold px-3 py-1.5 rounded-xl text-xs transition-all disabled:opacity-50 inline-flex items-center gap-1"
                                              >
                                                {isDocLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                                                Approve ID
                                              </button>
                                            ) : (
                                              <button
                                                onClick={() => handleApproveDocumentOnly(doc.id, doc.user_id)}
                                                disabled={isActionLoading}
                                                className="bg-secondary hover:bg-secondary/80 text-secondary-foreground font-bold px-3 py-1.5 rounded-xl text-xs transition-all disabled:opacity-50 inline-flex items-center gap-1"
                                              >
                                                {isDocLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                                                Approve Proof
                                              </button>
                                            )}
                                          </>
                                        )}
                                      </div>
                                    </div>

                                    {isDocRejecting && (
                                      <div className="mt-3 flex flex-col sm:flex-row gap-2">
                                        <textarea
                                          placeholder={`Reason for rejecting ${formatDocumentType(doc.document_type)}...`}
                                          value={rejectNotes}
                                          onChange={(e) => setRejectNotes(e.target.value)}
                                          rows={2}
                                          className="flex-1 text-xs p-2 border rounded-lg bg-background outline-none font-medium text-foreground focus:border-primary/50 resize-none"
                                        />
                                        <div className="flex items-center gap-2">
                                          <button onClick={() => setRejectingId(null)} className="px-3 py-2 border rounded-xl text-xs font-bold text-muted-foreground hover:bg-muted">Cancel</button>
                                          <button
                                            onClick={() => handleRejectSubmit(doc.id)}
                                            disabled={isDocLoading}
                                            className="px-3 py-2 bg-destructive text-white rounded-xl text-xs font-bold hover:bg-destructive/90 transition-all inline-flex items-center gap-1 disabled:opacity-50"
                                          >
                                            {isDocLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                                            Submit Rejection
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div className="rounded-2xl border bg-muted/10 p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                            <div className="space-y-2">
                              <h5 className="text-xs font-black uppercase tracking-wider text-foreground">Final Tradie Approval</h5>
                              <p className="text-xs text-muted-foreground font-semibold">
                                ID, contractor licence proof, and insurance proof must be approved before final whitelisting.
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {[
                                  ['ID approved', hasIdentityApproval],
                                  ['ABN entered', hasAbn],
                                  ['Licence number entered', hasLicenceNumber],
                                  ['Licence proof approved', hasApprovedLicenceProof],
                                  ['Insurance proof approved', hasApprovedInsuranceProof],
                                ].map(([label, passed]) => (
                                  <span key={label as string} className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${passed ? 'bg-green-500/10 text-green-600 border-green-500/20' : 'bg-amber-500/10 text-amber-700 border-amber-500/20'}`}>
                                    {label as string}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div className="lg:text-right space-y-2">
                            {missingWhitelistRequirements.length > 0 && (
                              <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-2 text-[10px] font-bold text-amber-700">
                                {missingWhitelistRequirements.join(', ')}
                              </div>
                            )}
                              <button
                                onClick={() => handleWhitelistTradie(item.userId)}
                                disabled={isActionLoading || !canWhitelist}
                                className="bg-primary hover:bg-primary/95 text-primary-foreground font-bold px-4 py-2 rounded-xl text-xs transition-all shadow-md disabled:opacity-50 inline-flex items-center gap-1"
                              >
                                {actionLoadingId === item.userId && <Loader2 className="h-3 w-3 animate-spin" />}
                                Approve Tradie / Whitelist
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
                              <span className="text-green-600 bg-green-500/10 px-2 py-0.5 rounded w-fit">Whitelisted ✓</span>
                              {item.identity_verified ? (
                                <span className="text-blue-600 bg-blue-500/10 px-2 py-0.5 rounded w-fit">Identity Verified ✓</span>
                              ) : (
                                <span className="text-red-500 bg-red-500/10 px-2 py-0.5 rounded w-fit">Identity Pending ⚠</span>
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
                <p className="text-xs text-muted-foreground mt-0.5 font-medium">
                  Review disputed jobs and resolve secure payments between parties using the case-file console.
                </p>
              </div>
              <div className="flex items-center gap-3">
                {disputedJobs.length > 0 && (
                  <span className="text-xs font-black bg-red-500/10 text-red-600 border border-red-500/20 px-3 py-1 rounded-full">
                    {disputedJobs.length} active
                  </span>
                )}
                <Link
                  to="/admin/disputes"
                  className="bg-primary hover:bg-primary/95 text-primary-foreground font-black px-4 py-2 rounded-xl text-xs transition shadow-sm"
                >
                  Manage Disputes
                </Link>
              </div>
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
              <div className="p-6 text-sm text-muted-foreground font-semibold">
                {disputedJobs.length} active {disputedJobs.length === 1 ? 'case is' : 'cases are'} ready for review in the dispute management area.
              </div>
            )}
          </div>

        </div>
      )}
        </>
      )}

      {adminTab === 'analytics' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          {/* Time window selector and header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-card border p-6 rounded-3xl">
            <div>
              <h2 className="text-lg font-black text-foreground">Marketplace Analytics</h2>
              <p className="text-xs text-muted-foreground font-semibold mt-0.5">
                Monitor beta registrations, job listings, messaging volume, and task progression.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-muted-foreground">Time Window:</span>
              <select
                value={analyticsTimeWindow}
                onChange={(e) => setAnalyticsTimeWindow(e.target.value)}
                className="bg-background border border-border rounded-xl px-3 py-1.5 outline-none focus:border-primary/50 text-xs font-bold"
              >
                <option value="all">All Time</option>
                <option value="30days">Last 30 Days</option>
                <option value="7days">Last 7 Days</option>
              </select>
            </div>
          </div>

          {/* Live Activity Strip */}
          {analyticsData && (
            <div className="bg-card border px-6 py-3 rounded-2xl flex flex-wrap gap-y-2 items-center justify-between text-xs font-bold text-muted-foreground shadow-sm">
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                <span className="flex items-center gap-1.5 text-foreground font-black">
                  <Activity className="h-3.5 w-3.5 text-green-500 animate-pulse" />
                  Live Now: <span className="text-green-500">{analyticsData.live_now?.active_users_5m || 0} active users</span>
                </span>
                <span className="border-r border-border h-4 self-center hidden sm:inline" />
                <span>Today:</span>
                <span>{analyticsData.today?.jobs_posted_today || 0} jobs posted</span>
                <span>{analyticsData.today?.messages_sent_today || 0} messages sent</span>
                <span>
                  {analyticsData.today?.quotes_submitted_today || 0}{' '}
                  {(analyticsData.today?.quotes_submitted_today || 0) === 1 ? 'quote' : 'quotes'} submitted
                </span>
              </div>
              <div className="flex items-center gap-3">
                {lastUpdated && (
                  <span className="text-[10px] text-muted-foreground">
                    Last updated: {lastUpdated.toLocaleTimeString()}
                  </span>
                )}
                <button
                  type="button"
                  disabled={analyticsLoading}
                  onClick={() => void loadAnalytics(analyticsTimeWindow, false)}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all disabled:opacity-50"
                  title="Manual Refresh"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${analyticsLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {analyticsError && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{analyticsError}</span>
            </div>
          )}

          {analyticsLoading && !analyticsData ? (
            <div className="flex flex-col items-center justify-center p-12 bg-card border rounded-3xl gap-4">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
              <p className="text-sm font-semibold text-muted-foreground">Compiling aggregate statistics...</p>
            </div>
          ) : analyticsData ? (
            <div className="space-y-8">
              {/* Marketplace Snapshot */}
              <section className="space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Marketplace Snapshot</h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-5 bg-card border rounded-2xl flex items-center justify-between shadow-sm">
                    <div>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Users</p>
                      <h4 className="text-2xl font-extrabold text-foreground mt-1">
                        {analyticsData.marketplace_snapshot.total_users}
                      </h4>
                    </div>
                    <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <User className="h-5 w-5" />
                    </div>
                  </div>

                  <div className="p-5 bg-card border rounded-2xl flex items-center justify-between shadow-sm">
                    <div>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Customers</p>
                      <h4 className="text-2xl font-extrabold text-foreground mt-1">
                        {analyticsData.marketplace_snapshot.total_customers}
                      </h4>
                    </div>
                    <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <UserCheck className="h-5 w-5" />
                    </div>
                  </div>

                  <div className="p-5 bg-card border rounded-2xl flex items-center justify-between shadow-sm">
                    <div>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Tradies (Verified)</p>
                      <h4 className="text-2xl font-extrabold text-foreground mt-1">
                        {analyticsData.marketplace_snapshot.total_tradies} ({analyticsData.marketplace_snapshot.verified_tradies})
                      </h4>
                    </div>
                    <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Award className="h-5 w-5" />
                    </div>
                  </div>

                  <div className="p-5 bg-card border rounded-2xl flex items-center justify-between shadow-sm">
                    <div>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Average Rating</p>
                      <h4 className="text-2xl font-extrabold text-foreground mt-1">
                        ★ {analyticsData.marketplace_snapshot.average_rating || 'N/A'} ({analyticsData.marketplace_snapshot.total_reviews} reviews)
                      </h4>
                    </div>
                    <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <CheckCircle className="h-5 w-5" />
                    </div>
                  </div>
                </div>
              </section>

              {/* Donut Chart Breakdowns */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <DonutChart
                  title="User Breakdown"
                  data={[
                    { label: 'Customers', value: analyticsData.user_breakdown?.customers || 0, color: '#f97316' },
                    { label: 'Tradies', value: analyticsData.user_breakdown?.tradies || 0, color: '#0f172a' },
                    { label: 'Dual-Role', value: analyticsData.user_breakdown?.dual || 0, color: '#8b5cf6' },
                    { label: 'Admins', value: analyticsData.user_breakdown?.admins || 0, color: '#ef4444' }
                  ]}
                />

                <DonutChart
                  title="Job Status Breakdown"
                  data={[
                    { label: 'Open', value: analyticsData.job_status_breakdown?.open || 0, color: '#22c55e' },
                    { label: 'Accepted', value: analyticsData.job_status_breakdown?.accepted || 0, color: '#3b82f6' },
                    { label: 'Funded Active', value: analyticsData.job_status_breakdown?.funded || 0, color: '#6366f1' },
                    { label: 'Completion Review', value: analyticsData.job_status_breakdown?.review || 0, color: '#f59e0b' },
                    { label: 'Completed', value: analyticsData.job_status_breakdown?.completed || 0, color: '#10b981' },
                    { label: 'Disputed', value: analyticsData.job_status_breakdown?.disputed || 0, color: '#ef4444' }
                  ]}
                />

                <DonutChart
                  title="Verification Breakdown"
                  data={[
                    { label: 'Verified Tradies', value: analyticsData.verification_breakdown?.verified || 0, color: '#22c55e' },
                    { label: 'Pending Docs', value: analyticsData.verification_breakdown?.pending || 0, color: '#f59e0b' },
                    { label: 'Unverified Tradies', value: analyticsData.verification_breakdown?.unverified || 0, color: '#94a3b8' }
                  ]}
                />
              </div>

              {/* Category Bar Chart & Verification Pipeline */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <CategoryBarChart categories={analyticsData.job_categories} />
                </div>

                <div className="space-y-6">
                  {/* Verification Pipeline */}
                  <section className="bg-card border rounded-3xl p-6 space-y-4 shadow-sm">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Verification Pipeline</h4>
                    <div className="divide-y text-sm">
                      <div className="flex justify-between py-2.5 font-semibold">
                        <span className="text-muted-foreground">Pending Docs/Files</span>
                        <span className="text-foreground">{analyticsData.marketplace_snapshot.pending_verifications}</span>
                      </div>
                      <div className="flex justify-between py-2.5 font-semibold">
                        <span className="text-muted-foreground">Pending Review Cases</span>
                        <span className="text-foreground">{analyticsData.marketplace_snapshot.pending_verification_cases}</span>
                      </div>
                      <div className="flex justify-between py-2.5 font-semibold">
                        <span className="text-muted-foreground">Active Public Portfolios</span>
                        <span className="text-foreground">{analyticsData.marketplace_snapshot.public_portfolios} items</span>
                      </div>
                    </div>
                  </section>

                  {/* Beta Activity Indicators */}
                  <section className="bg-card border rounded-3xl p-6 space-y-4 shadow-sm">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Live Counters ({analyticsTimeWindow === 'all' ? 'Cumulative' : analyticsTimeWindow === '30days' ? 'Last 30d' : 'Last 7d'})
                    </h4>
                    <div className="divide-y text-sm">
                      <div className="flex justify-between py-2.5 font-semibold">
                        <span className="text-muted-foreground">New Registrations</span>
                        <span className="text-foreground flex items-center gap-1.5 font-bold">
                          <User className="h-3.5 w-3.5 text-primary" /> {analyticsData.beta_activity.new_users}
                        </span>
                      </div>
                      <div className="flex justify-between py-2.5 font-semibold">
                        <span className="text-muted-foreground">New Jobs Posted</span>
                        <span className="text-foreground flex items-center gap-1.5 font-bold">
                          <Briefcase className="h-3.5 w-3.5 text-primary" /> {analyticsData.beta_activity.new_jobs}
                        </span>
                      </div>
                      <div className="flex justify-between py-2.5 font-semibold">
                        <span className="text-muted-foreground">Messages Sent</span>
                        <span className="text-foreground flex items-center gap-1.5 font-bold">
                          <MessageSquare className="h-3.5 w-3.5 text-primary" /> {analyticsData.beta_activity.new_messages}
                        </span>
                      </div>
                      <div className="flex justify-between py-2.5 font-semibold">
                        <span className="text-muted-foreground">New Reviews Posted</span>
                        <span className="text-foreground flex items-center gap-1.5 font-bold">
                          <CheckCircle className="h-3.5 w-3.5 text-primary" /> {analyticsData.beta_activity.new_reviews}
                        </span>
                      </div>
                    </div>
                  </section>
                </div>
              </div>

              {/* Job Funnel */}
              <section className="bg-card border rounded-3xl p-6 space-y-4 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Job Funnel ({analyticsTimeWindow === 'all' ? 'Cumulative' : analyticsTimeWindow === '30days' ? 'Last 30d' : 'Last 7d'})</h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-center font-bold">
                  <div className="p-4 bg-muted/20 border rounded-xl space-y-1 shadow-sm">
                    <p className="text-[10px] text-muted-foreground uppercase">Jobs Posted</p>
                    <p className="text-xl font-extrabold text-foreground">{analyticsData.job_funnel.jobs_posted}</p>
                  </div>
                  <div className="p-4 bg-muted/20 border rounded-xl space-y-1 shadow-sm">
                    <p className="text-[10px] text-muted-foreground uppercase">Quotes Submitted</p>
                    <p className="text-xl font-extrabold text-foreground">{analyticsData.job_funnel.quotes_submitted}</p>
                  </div>
                  <div className="p-4 bg-muted/20 border rounded-xl space-y-1 shadow-sm">
                    <p className="text-[10px] text-muted-foreground uppercase">Contracts Created</p>
                    <p className="text-xl font-extrabold text-foreground">{analyticsData.job_funnel.quotes_accepted}</p>
                  </div>
                  <div className="p-4 bg-muted/20 border rounded-xl space-y-1 shadow-sm">
                    <p className="text-[10px] text-muted-foreground uppercase">Completed &amp; Released</p>
                    <p className="text-xl font-extrabold text-green-500">{analyticsData.job_funnel.completed_released}</p>
                  </div>
                </div>

                <div className="border rounded-2xl bg-muted/5 p-4 text-xs space-y-3 font-semibold text-muted-foreground shadow-sm">
                  <h4 className="text-foreground font-bold uppercase tracking-wider text-[10px]">Lifecycle Stage Breakdowns:</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <div>
                      <p className="text-[9px]">Funded / Active</p>
                      <p className="text-sm font-extrabold text-foreground mt-0.5">{analyticsData.job_funnel.contracts_active}</p>
                    </div>
                    <div>
                      <p className="text-[9px]">Completion Submitted</p>
                      <p className="text-sm font-extrabold text-foreground mt-0.5">{analyticsData.job_funnel.completions_submitted}</p>
                    </div>
                    <div>
                      <p className="text-[9px]">Under Dispute</p>
                      <p className="text-sm font-extrabold text-red-500 mt-0.5">{analyticsData.job_funnel.disputed}</p>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          ) : (
            <p className="text-sm font-semibold text-muted-foreground">No analytics compiled yet.</p>
          )}
        </div>
      )}

      {/* ── Confirmation Modal ───────────────────────────────────────────────── */}
      {confirmConfig && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-card border border-border w-full max-w-md rounded-2xl shadow-xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-bold text-foreground">{confirmConfig.title}</h3>
              <button onClick={() => setConfirmConfig(null)} className="p-1 rounded-lg hover:bg-muted text-muted-foreground shrink-0">
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
              ? <CheckCircle className="h-4 w-4 shrink-0" />
              : <AlertCircle className="h-4 w-4 shrink-0" />
            }
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

    </div>
  );
}
