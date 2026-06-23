import { useState, useEffect, useCallback } from 'react';
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
  Camera, TrendingUp, DollarSign
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

function DisputeCaseFile({ dispute, onResolved, showToast, showConfirm }: DisputeCaseFileProps) {
  const payment = Array.isArray(dispute.payments) ? dispute.payments[0] : dispute.payments;
  const issue = dispute.job_issues?.[0];
  const proof = dispute.job_completion_proofs?.[0];
  const contractor = payment?.payee;

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
    showConfirm({
      title: 'Confirm Dispute Resolution',
      message: `You are about to apply: "${actionLabel}". This will update the job status and payment records. This action cannot be undone.`,
      confirmLabel: 'Confirm Resolution',
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
            const { error } = await supabase
              .from('job_issues')
              .update({ admin_notes: adminNotes.trim() })
              .eq('job_id', dispute.id)
              .eq('status', 'open');
            if (error) throw error;
            showToast(
              selectedAction === 'request_evidence'
                ? 'Dispute kept under review. Admin notes saved. Contact parties for more evidence.'
                : 'Dispute escalated. Admin notes saved.',
              'success'
            );
            setShowResolution(false);
            setSelectedAction(null);
            setAdminNotes('');
            setSubmitting(false);
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
            <span className="text-[10px] font-black bg-red-500/10 text-red-600 border border-red-500/15 px-2 py-0.5 rounded uppercase tracking-wider shrink-0">Disputed</span>
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
          {!showResolution ? (
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

  // Verification action state
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');

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
      const { data: list, error: fetchErr } = await getPendingVerifications();
      if (fetchErr) throw fetchErr;
      setVerifications(list);

      const { count: tradiesCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .in('role', ['tradie', 'dual']);
      if (tradiesCount !== null) setTotalTradies(tradiesCount);

      const { count: verifiedCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('tradie_verified', true);
      if (verifiedCount !== null) setVerifiedTradies(verifiedCount);

      const { data: whitelistedList } = await supabase
        .from('users')
        .select('*')
        .eq('tradie_verified', true)
        .order('display_name', { ascending: true });
      if (whitelistedList) setWhitelistedTradiesList(whitelistedList as UserProfile[]);

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

  // ─── Verification handlers ─────────────────────────────────────────────────

  const handleApproveIdentity = async (id: string) => {
    setActionLoadingId(id);
    const { error: err } = await approveIdentityVerification(id);
    setActionLoadingId(null);
    if (err) showToast(err.message || 'Failed to approve identity verification.', 'error');
    else { showToast('Identity verification approved.', 'success'); loadData(); }
  };

  const handleApproveDocumentOnly = async (id: string) => {
    setActionLoadingId(id);
    const { error: err } = await approveDocumentOnly(id);
    setActionLoadingId(null);
    if (err) showToast(err.message || 'Failed to approve document.', 'error');
    else { showToast('Document approved.', 'success'); loadData(); }
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

  const identityVerifications = verifications.filter(v =>
    ['drivers_license', 'passport', 'proof_of_age', 'other_identity'].includes(v.document_type)
  );
  const tradieApplications = verifications.filter(v =>
    ['contractor_license', 'insurance', 'trade_certificate', 'other_trade_credential'].includes(v.document_type)
  );

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
                              <span className="inline-flex items-center text-[10px] font-bold bg-green-500/15 text-green-600 px-2 py-0.5 rounded mt-1.5">Whitelisted ✓</span>
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
                            <button onClick={() => handleViewFile(item.document_url)} className="text-xs text-primary font-bold hover:underline inline-flex items-center gap-1 focus:outline-none">
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
              <div>
                {disputedJobs.map((dispute) => (
                  <DisputeCaseFile
                    key={dispute.id}
                    dispute={dispute}
                    onResolved={loadData}
                    showToast={showToast}
                    showConfirm={showConfirm}
                  />
                ))}
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
