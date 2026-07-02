import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchJobById, fetchJobWorkspaceImages, fetchJobs, getPublicJobLocation, hydrateJobsWithPublicCustomers } from '../lib/jobs';
import type { Job } from '../lib/jobs';
import {
  submitApplication,
  getMyApplicationForJob,
  getApplicationsForJob,
  getMyApplications,
  fetchQuoteLineItemsByApplicationIds,
  groupQuoteLineItemsByApplication,
  fetchAcceptedQuoteLineItemsByJobIds
} from '../lib/applications';
import type { Application, QuoteLineItem, AcceptedQuoteLineItem } from '../lib/applications';
import { toggleSavedItem, getSavedItemIds } from '../lib/saved';
import {
  fetchEarlyReleaseRequestsForJob,
  createEarlyReleaseRequest,
  cancelEarlyReleaseRequest,
  fetchEarlyReleaseCapSummaryForJob,
  reviewEarlyReleaseRequest
} from '../lib/earlyReleases';
import type { EarlyReleaseRequest, EarlyReleaseRequestPayload, EarlyReleaseCapSummary } from '../lib/earlyReleases';
import { fetchJobEvidenceTimeline } from '../lib/timeline';
import type { TimelineEvent } from '../lib/timeline';
import { useAuth } from '../components/AuthProvider';
import {
  Search, MapPin, DollarSign, Briefcase, AlertTriangle,
  SlidersHorizontal, X, Clock, User, Filter, RefreshCw,
  Bookmark, BookmarkCheck, Send, CheckCircle, AlertCircle,
  FileText, Loader2, Lock, Upload, Mail, Phone, MessageSquare,
  Image as ImageIcon, Star, Plus, Trash2
} from 'lucide-react';
import { 
  acceptQuote, submitCompletionProof, raiseJobIssue, approveJobCompletion, 
  getPaymentForJob, getCompletionProofsForJob, getIssuesForJob, simulatePaymentFunding,
  getLedgerForPayment
} from '../lib/payments';
import {
  fetchVariationRequestsForJob,
  createVariationRequest,
  cancelVariationRequest,
  reviewVariationRequest
} from '../lib/variations';
import type { VariationLineType, VariationRequest } from '../lib/variations';
import { supabase } from '../lib/supabase';
import { fetchInvoiceDetailsByJob } from '../lib/invoices';
import type { JobInvoiceLineItem } from '../lib/invoices';
import {
  getRegionsForState,
  getSuburbsForRegion,
  loadAustralianLocations,
  formatSuburbOption
} from '../lib/auLocations';
import type { AustralianLocationOption } from '../lib/auLocations';
import {
  getMyTradieReviewForJob,
  submitTradieReview,
} from '../lib/reviews';
import type { MyReview } from '../lib/reviews';


// ─── Application Modal ────────────────────────────────────────────────────────

interface ApplyModalProps {
  job: Job;
  existingApplication: Application | null;
  onClose: () => void;
  onSuccess: (app: Application, lines: QuoteLineItem[]) => void;
}

interface FormLineItem {
  label: string;
  quantity: number;
  unit_price: number;
  line_type: 'labour' | 'materials' | 'callout' | 'disposal' | 'other';
}

interface VariationFormLineItem {
  label: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_type: VariationLineType;
}

type JobDetailTab = 'overview' | 'contract' | 'requests' | 'evidence';

function ApplyModal({ job, existingApplication, onClose, onSuccess }: ApplyModalProps) {
  const { user, profile } = useAuth();
  const [message, setMessage] = useState('');
  const [availability, setAvailability] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Gating check states
  const [isGated, setIsGated] = useState(false);
  const [gateMessage, setGateMessage] = useState<string | null>(null);
  const [checkingGate, setCheckingGate] = useState(true);

  useEffect(() => {
    async function runGatingCheck() {
      if (!user || !profile) {
        setCheckingGate(false);
        return;
      }

      // 1. Role Check
      if (profile.role === 'customer') {
        setIsGated(true);
        setGateMessage('Only contractors can quote on jobs.');
        setCheckingGate(false);
        return;
      }

      // 2. Base Verification Check
      if (!profile.tradie_verified) {
        setIsGated(true);
        setGateMessage('Your contractor profile must be verified by admin before you can quote.');
        setCheckingGate(false);
        return;
      }

      // 3. Trade category matching
      try {
        const userState = profile.state || 'VIC';

        // Fetch rules
        const { data: rules, error: rulesErr } = await supabase
          .from('trade_requirement_rules')
          .select('*, required_licence_type:trade_licence_types(*)')
          .in('trade_id', job.categories)
          .eq('state_code', userState);

        if (rulesErr) throw rulesErr;

        // Fetch user's approved, unexpired credentials
        const { data: approvedCreds, error: credsErr } = await supabase
          .from('user_trade_credentials')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'approved')
          .gt('expiry_date', new Date().toISOString().split('T')[0]);

        if (credsErr) throw credsErr;

        const hardGatedCategories = [
          'electrical', 'plumbing', 'gasfitting', 'roof_plumbing', 'building',
          'hvac', 'pest_control', 'asbestos_removal', 'demolition', 'solar_installer',
          'security_installer'
        ];

        for (const categoryId of job.categories) {
          // If handyman, block them from bidding on regulated jobs
          if (profile.trades && profile.trades.includes('handyman') && hardGatedCategories.includes(categoryId)) {
            setIsGated(true);
            setGateMessage(`General Handyman profiles are not permitted to quote on regulated ${categoryId} work.`);
            setCheckingGate(false);
            return;
          }

          // Find rule
          const rule = rules?.find(r => r.trade_id === categoryId);
          if (rule && rule.licence_requirement_level === 'required') {
            const hasCredential = approvedCreds?.some(c => c.licence_type_id === rule.required_licence_type_id);
            if (!hasCredential) {
              setIsGated(true);
              const licenceTypeName = rule.required_licence_type?.name || 'appropriate licence';
              setGateMessage(`This job requires a verified "${licenceTypeName}" for ${userState}. Please upload your licence in your Profile.`);
              setCheckingGate(false);
              return;
            }
          }
        }
      } catch (err) {
        console.error('Error verifying job gating requirements:', err);
      } finally {
        setCheckingGate(false);
      }
    }

    void runGatingCheck();
  }, [user, profile, job]);

  // Line items state
  const [lineItems, setLineItems] = useState<FormLineItem[]>([
    { label: 'Labour', quantity: 1, unit_price: 0, line_type: 'labour' }
  ]);

  // Loading submitted line items if already applied
  const [loadedLineItems, setLoadedLineItems] = useState<QuoteLineItem[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);

  useEffect(() => {
    if (existingApplication && existingApplication.status !== 'withdrawn') {
      setLoadingLines(true);
      fetchQuoteLineItemsByApplicationIds([existingApplication.id])
        .then(({ data }) => {
          if (data) {
            setLoadedLineItems(data);
          }
        })
        .finally(() => {
          setLoadingLines(false);
        });
    }
  }, [existingApplication]);

  const handleAddLine = () => {
    setLineItems([
      ...lineItems,
      { label: '', quantity: 1, unit_price: 0, line_type: 'labour' }
    ]);
  };

  const handleRemoveLine = (index: number) => {
    setLineItems(lineItems.filter((_, idx) => idx !== index));
  };

  const handleLineChange = (index: number, field: keyof FormLineItem, value: any) => {
    const updated = [...lineItems];
    updated[index] = {
      ...updated[index],
      [field]: value
    };
    setLineItems(updated);
  };

  const calculatedTotal = lineItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!user) {
      setError('You must be signed in to apply.');
      return;
    }

    if (job.customer_id === user.id) {
      setError("You can't quote on your own job.");
      return;
    }

    if (message.trim().length < 20) {
      setError('Your message must be at least 20 characters.');
      return;
    }

    if (lineItems.length === 0) {
      setError('Please add at least one quote line item.');
      return;
    }

    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      if (!item.label.trim()) {
        setError(`Line item #${i + 1} must have a label.`);
        return;
      }
      if (item.quantity <= 0) {
        setError(`Line item #${i + 1} must have a quantity greater than 0.`);
        return;
      }
      if (item.unit_price < 0) {
        setError(`Line item #${i + 1} cannot have a negative unit price.`);
        return;
      }
    }

    if (calculatedTotal <= 0) {
      setError('The total quote estimate must be greater than $0.');
      return;
    }

    setSubmitting(true);
    const { data, error: submitErr } = await submitApplication({
      job_id: job.id,
      customer_id: job.customer_id,
      message: message.trim(),
      estimate: calculatedTotal,
      availability: availability.trim() || null,
      line_items: lineItems,
    });

    setSubmitting(false);

    if (submitErr) {
      if ((submitErr as any).code === '23505') {
        setError('You have already applied for this job.');
      } else {
        setError(submitErr.message || 'Failed to submit application. Please try again.');
      }
      return;
    }

    if (data) {
      // Fetch the created line items for local state update
      const { data: lines } = await fetchQuoteLineItemsByApplicationIds([data.id]);
      onSuccess(data as Application, lines || []);
    }
  };

  // If already applied, show existing application summary with line items
  if (existingApplication && existingApplication.status !== 'withdrawn') {
    return (
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
        <div className="bg-card border border-border w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden">
          <div className="p-6 border-b flex items-start justify-between gap-4">
            <h3 className="text-xl font-extrabold text-foreground">Application Submitted</h3>
            <button onClick={onClose} className="p-1.5 rounded-lg border hover:bg-muted text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-600">
              <CheckCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <div className="text-sm font-semibold">
                You have already submitted an application for this job.
              </div>
            </div>
            <div className="space-y-4 text-sm font-medium text-muted-foreground bg-muted/30 p-4 rounded-xl border">
              <div className="flex justify-between">
                <span className="text-xs font-bold uppercase tracking-wider">Status</span>
                <span className={`font-bold capitalize ${
                  existingApplication.status === 'accepted' ? 'text-green-500' :
                  existingApplication.status === 'declined' ? 'text-red-500' : 'text-amber-500'
                }`}>{existingApplication.status}</span>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider block border-b pb-1">Itemised Quote Breakdown</span>
                {loadingLines ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                ) : loadedLineItems.length > 0 ? (
                  <div className="space-y-2">
                    <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                      {loadedLineItems.map((item) => (
                        <div key={item.id} className="flex justify-between items-center text-xs bg-background/50 border p-2 rounded-lg">
                          <div className="min-w-0 flex-1 pr-2">
                            <span className="font-semibold text-foreground truncate block">{item.label}</span>
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
                              {item.line_type} | {item.quantity} x ${item.unit_price.toLocaleString()}
                            </span>
                          </div>
                          <span className="font-bold text-foreground shrink-0">${item.line_total.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                    <div className="border-t pt-2 flex justify-between font-bold text-foreground">
                      <span>Total Quote Amount</span>
                      <span>${existingApplication.estimate?.toLocaleString()}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic py-2">
                    Detailed quote breakdown not available for this older quote.
                  </p>
                )}
              </div>

              {existingApplication.availability && (
                <div className="flex justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider">Availability</span>
                  <span className="text-foreground">{existingApplication.availability}</span>
                </div>
              )}
              <div className="border-t pt-2">
                <p className="text-xs font-bold uppercase tracking-wider mb-1">Your Message</p>
                <p className="text-foreground leading-relaxed whitespace-pre-wrap">{existingApplication.message}</p>
              </div>
            </div>
          </div>
          <div className="p-6 border-t flex justify-end">
            <button onClick={onClose} className="bg-secondary text-secondary-foreground font-bold px-5 py-2.5 rounded-xl hover:bg-secondary/80 transition-colors text-sm">
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (checkingGate) {
    return (
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
        <div className="bg-card border border-border w-full max-w-md rounded-3xl shadow-2xl p-6 flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
          <p className="text-sm font-semibold text-muted-foreground">Verifying licensing & gating guidelines...</p>
        </div>
      </div>
    );
  }

  if (isGated) {
    return (
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
        <div className="bg-card border border-border w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
          <div className="p-6 border-b flex items-start justify-between gap-4">
            <h3 className="text-xl font-extrabold text-foreground">Quote Submission Blocked</h3>
            <button onClick={onClose} className="p-1.5 rounded-lg border hover:bg-muted text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <div className="text-sm font-semibold leading-relaxed text-left">
                {gateMessage}
              </div>
            </div>
            <p className="text-xs text-muted-foreground font-semibold leading-relaxed text-left">
              Licensing rules vary by state, licence class, and job scope. Ensure your credentials are up to date in your Profile settings before bidding.
            </p>
          </div>
          <div className="p-6 border-t flex justify-end">
            <button onClick={onClose} className="bg-secondary text-secondary-foreground font-bold px-5 py-2.5 rounded-xl hover:bg-secondary/80 transition-colors text-sm">
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-card border border-border w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-6 border-b flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-extrabold text-foreground">Apply for Job</h3>
            <p className="text-sm text-muted-foreground font-semibold mt-0.5 line-clamp-1">{job.title}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg border hover:bg-muted text-muted-foreground shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl text-[10px] text-muted-foreground font-semibold leading-relaxed text-left">
            Before quoting, confirm you are licensed, insured, qualified, and competent for this exact job scope and location. Requirements vary by state, licence class, and job scope. This is not legal, building, tax, or insurance advice.
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Message */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground uppercase tracking-wider">
              Cover Message <span className="text-red-400">*</span>
            </label>
            <textarea
              rows={3}
              placeholder="Introduce yourself and explain why you're the right tradie for this job. Include relevant experience, approach, and any questions you have..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full bg-background border border-border rounded-xl px-4 py-3 outline-none focus:border-primary/50 text-sm font-medium leading-relaxed transition-all resize-none"
              required
            />
            <p className={`text-[10px] font-semibold ${message.trim().length < 20 ? 'text-muted-foreground' : 'text-green-500'}`}>
              {message.trim().length} / 20 min characters
            </p>
          </div>

          {/* Line Items Section */}
          <div className="space-y-2 border-t pt-3">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-foreground uppercase tracking-wider">
                Quote Line Items <span className="text-red-400">*</span>
              </label>
              <button
                type="button"
                onClick={handleAddLine}
                className="text-[10px] font-bold uppercase tracking-wider text-primary hover:underline flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Add Line
              </button>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {lineItems.map((item, idx) => (
                <div key={idx} className="flex flex-col md:flex-row gap-2 items-start border p-3 rounded-xl bg-muted/20 relative">
                  {/* Label */}
                  <div className="flex-1 w-full space-y-1">
                    <input
                      type="text"
                      placeholder="e.g. Living room electrical wiring"
                      value={item.label}
                      onChange={(e) => handleLineChange(idx, 'label', e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-primary/50"
                      required
                    />
                  </div>

                  {/* Type select */}
                  <div className="w-full md:w-32">
                    <select
                      value={item.line_type}
                      onChange={(e) => handleLineChange(idx, 'line_type', e.target.value as any)}
                      className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-primary/50"
                    >
                      <option value="labour">Labour</option>
                      <option value="materials">Materials</option>
                      <option value="callout">Callout</option>
                      <option value="disposal">Disposal</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2 w-full md:w-auto">
                    {/* Quantity */}
                    <div className="w-16">
                      <input
                        type="number"
                        min="0.0001"
                        step="any"
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={(e) => handleLineChange(idx, 'quantity', parseFloat(e.target.value) || 0)}
                        className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs font-semibold text-center outline-none focus:border-primary/50"
                        required
                      />
                    </div>

                    <span className="text-xs text-muted-foreground">×</span>

                    {/* Unit Price */}
                    <div className="w-20 relative">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Price"
                        value={item.unit_price || ''}
                        onChange={(e) => handleLineChange(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                        className="w-full pl-5 pr-2 py-1.5 bg-background border border-border rounded-lg text-xs font-semibold outline-none focus:border-primary/50"
                        required
                      />
                      <DollarSign className="absolute left-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    </div>

                    {/* Total */}
                    <div className="min-w-[60px] text-right font-bold text-xs text-foreground pr-2 pl-1">
                      ${((item.quantity || 0) * (item.unit_price || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>

                    {/* Remove button */}
                    {lineItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveLine(idx)}
                        className="p-1 rounded text-red-500 hover:bg-red-500/10 transition-colors animate-fade-in"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t pt-3">
            {/* Total quote sum */}
            <div className="space-y-1 flex flex-col justify-center">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Calculated Quote</span>
              <span className="text-lg font-black text-primary">
                ${calculatedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            {/* Availability */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-foreground uppercase tracking-wider">
                Availability
              </label>
              <input
                type="text"
                placeholder="e.g. This weekend"
                value={availability}
                onChange={(e) => setAvailability(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-xl outline-none focus:border-primary/50 text-xs font-semibold transition-all"
              />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 text-primary text-[10px] font-semibold leading-relaxed flex items-start gap-2">
            <FileText className="h-4 w-4 shrink-0 mt-0.5" />
            <span>Your contact details are kept private. The customer will contact you through the platform if they choose your application.</span>
          </div>
        </form>

        <div className="p-6 border-t flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="bg-secondary text-secondary-foreground font-bold px-5 py-2.5 rounded-xl hover:bg-secondary/80 transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-primary text-primary-foreground font-bold px-6 py-2.5 rounded-xl hover:bg-primary/95 transition-all shadow-md text-sm active:scale-95 disabled:opacity-50 flex items-center gap-2"
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Submitting...</>
            ) : (
              <><Send className="h-4 w-4" /> Submit Application</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Application Success Screen ───────────────────────────────────────────────

function ApplicationSuccessModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-card border border-border w-full max-w-sm rounded-3xl shadow-2xl p-8 text-center space-y-5">
        <div className="h-16 w-16 rounded-full bg-green-500/10 border border-green-500/20 text-green-500 flex items-center justify-center mx-auto">
          <CheckCircle className="h-9 w-9" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-2xl font-extrabold text-foreground">Application Sent!</h3>
          <p className="text-sm text-muted-foreground font-semibold leading-relaxed">
            Your application has been submitted. The customer will review it and reach out if they're interested.
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-full bg-primary text-primary-foreground font-bold py-3 rounded-xl hover:bg-primary/95 transition-all shadow-md text-sm active:scale-95"
        >
          Back to Jobs
        </button>
      </div>
    </div>
  );
}

const categoryOptions = [
  { id: 'electrical', label: 'Electrical' },
  { id: 'plumbing', label: 'Plumbing' },
  { id: 'carpentry', label: 'Carpentry' },
  { id: 'painting', label: 'Painting' },
  { id: 'tiling', label: 'Tiling' },
  { id: 'building', label: 'Building' },
  { id: 'gardening', label: 'Gardening' },
  { id: 'cleaning', label: 'Cleaning' },
  { id: 'handyman', label: 'Handyman' },
  { id: 'other', label: 'Other' },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Jobs() {
  const { user, profile } = useAuth();
  const userId = user?.id;
  const [searchParams, setSearchParams] = useSearchParams();

  const isVerifiedTradie = !!(profile?.role && ['tradie', 'dual'].includes(profile.role) && profile.tradie_verified);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Custom toast and confirmation modal states
  const [modalConfirmConfig, setModalConfirmConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);

  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);

  const showToast = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
  }, []);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Save state: set of saved job IDs for the current user
  const [savedJobIds, setSavedJobIds] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);

  // Invoicing state
  const [activeInvoice, setActiveInvoice] = useState<any>(null);
  const [invoiceModalLoading, setInvoiceModalLoading] = useState(false);

  const handleOpenInvoice = async (jobId: string, invoiceType: 'customer_receipt' | 'tradie_payout_statement', jobStatus: string) => {
    if (jobStatus !== 'completed') {
      showToast("Invoice is available after the job is completed and payment is released.", 'error');
      return;
    }

    setInvoiceModalLoading(true);
    try {
      const { data, error: err } = await fetchInvoiceDetailsByJob(jobId, invoiceType);
      if (err) {
        if (err.code === 'PGRST116' || err.message?.includes('permission') || err.message?.includes('authorized') || err.message?.includes('RLS')) {
          showToast("You do not have permission to view this invoice.", 'error');
        } else {
          showToast(err.message || "Failed to fetch invoice details.", 'error');
        }
        return;
      }
      if (data && data.length > 0) {
        setActiveInvoice(data[0]);
      } else {
        showToast("Invoice/receipt not found or you are not authorized to view it.", 'error');
      }
    } catch (err: any) {
      showToast("Failed to fetch invoice details.", 'error');
    } finally {
      setInvoiceModalLoading(false);
    }
  };

  const handleCreateEarlyReleaseRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJob || !user) return;

    const amt = parseFloat(erAmount);
    if (isNaN(amt) || amt <= 0) {
      showToast("Please enter a valid, positive amount.", 'error');
      return;
    }

    if (!erTitle.trim()) {
      showToast("Request title is required.", 'error');
      return;
    }

    if (!earlyReleaseCapSummary?.can_request) {
      showToast(
        earlyReleaseCapSummary?.unavailable_reason ||
        "Early release requests are unavailable for this job.",
        'error'
      );
      return;
    }

    if (earlyReleaseCapSummary.requires_quote_line_link && !erSelectedLineId) {
      showToast("Please link this request to an accepted quote line item.", 'error');
      return;
    }

    const selectedLineCap = getSelectedEarlyReleaseLineCap();
    if (selectedLineCap && amt > selectedLineCap.remaining) {
      showToast("This request exceeds the allowed early release cap for this job or quote line.", 'error');
      return;
    }

    const visibleLimit = getVisibleEarlyReleaseLimit();
    if (visibleLimit !== null && amt > visibleLimit) {
      showToast("This request exceeds the allowed early release cap for this job or quote line.", 'error');
      return;
    }

    const app = myApplications.get(selectedJob.id);
    if (!app || app.status !== 'accepted') {
      showToast("Cannot create request: accepted application not found.", 'error');
      return;
    }

    setIsSubmittingEr(true);
    try {
      const payload: EarlyReleaseRequestPayload = {
        job_id: selectedJob.id,
        application_id: app.id,
        tradie_id: user.id,
        customer_id: selectedJob.customer_id,
        accepted_quote_line_item_id: erSelectedLineId || null,
        request_type: erRequestType,
        title: erTitle.trim(),
        description: erDescription.trim() || undefined,
        amount: amt
      };

      const { error } = await createEarlyReleaseRequest(payload);
      if (error) throw error;

      showToast("Early release request submitted successfully.", 'success');
      setErTitle('');
      setErAmount('');
      setErDescription('');
      setErSelectedLineId('');
      setShowErForm(false);

      const [{ data: erRequests }, { data: capSummary }] = await Promise.all([
        fetchEarlyReleaseRequestsForJob(selectedJob.id),
        fetchEarlyReleaseCapSummaryForJob(selectedJob.id)
      ]);
      setEarlyReleaseRequests(erRequests || []);
      setEarlyReleaseCapSummary(capSummary || null);
    } catch (err: any) {
      const message = err.message || 'Failed to submit early release request.';
      showToast(
        message.includes('cap') || message.includes('quote line')
          ? "This request exceeds the allowed early release cap for this job or quote line."
          : message,
        'error'
      );
    } finally {
      setIsSubmittingEr(false);
    }
  };

  const handleCancelEarlyReleaseRequest = async (requestId: string) => {
    if (!selectedJob) return;
    if (!confirm("Are you sure you want to cancel this early release request?")) return;

    try {
      const { error } = await cancelEarlyReleaseRequest(requestId);
      if (error) throw error;

      showToast("Early release request cancelled.", 'success');
      const [{ data: erRequests }, { data: capSummary }] = await Promise.all([
        fetchEarlyReleaseRequestsForJob(selectedJob.id),
        fetchEarlyReleaseCapSummaryForJob(selectedJob.id)
      ]);
      setEarlyReleaseRequests(erRequests || []);
      setEarlyReleaseCapSummary(capSummary || null);
    } catch (err: any) {
      showToast(err.message || 'Failed to cancel request.', 'error');
    }
  };

  const handleOpenEarlyReleaseReview = (request: EarlyReleaseRequest) => {
    setReviewingEarlyRelease(request);
    setEarlyReleaseReviewNote(request.review_note || '');
  };

  const handleReviewEarlyReleaseRequest = async (
    decision: 'approved' | 'rejected',
    requestOverride?: EarlyReleaseRequest
  ) => {
    const requestToReview = requestOverride || reviewingEarlyRelease;
    if (!selectedJob || !requestToReview) return;

    setSubmittingEarlyReleaseReview(decision);
    try {
      const { error } = await reviewEarlyReleaseRequest(
        requestToReview.id,
        decision,
        requestOverride ? requestOverride.review_note || '' : earlyReleaseReviewNote
      );
      if (error) throw error;

      showToast(
        decision === 'approved'
          ? 'Early release request approved. No funds have been released.'
          : 'Early release request rejected.',
        'success'
      );

      setReviewingEarlyRelease(null);
      setEarlyReleaseReviewNote('');

      const [{ data: erRequests }, { data: capSummary }] = await Promise.all([
        fetchEarlyReleaseRequestsForJob(selectedJob.id),
        fetchEarlyReleaseCapSummaryForJob(selectedJob.id)
      ]);
      setEarlyReleaseRequests(erRequests || []);
      setEarlyReleaseCapSummary(capSummary || null);
    } catch (err: any) {
      const message = err.message || 'Failed to review early release request.';
      showToast(
        message.includes('cap')
          ? "This request can't be approved because it would exceed the early release cap."
          : message,
        'error'
      );
    } finally {
      setSubmittingEarlyReleaseReview(null);
    }
  };

  const resetVariationForm = () => {
    setVariationTitle('');
    setVariationReason('');
    setVariationLineItems([
      { label: '', description: '', quantity: 1, unit_price: 0, line_type: 'labour' }
    ]);
  };

  const handleAddVariationLine = () => {
    setVariationLineItems(prev => [
      ...prev,
      { label: '', description: '', quantity: 1, unit_price: 0, line_type: 'labour' }
    ]);
  };

  const handleRemoveVariationLine = (index: number) => {
    setVariationLineItems(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleVariationLineChange = (
    index: number,
    field: keyof VariationFormLineItem,
    value: string | number
  ) => {
    setVariationLineItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const refreshVariationRequests = async (jobId: string) => {
    const { data } = await fetchVariationRequestsForJob(jobId);
    setJobVariations(data);
  };

  const handleCreateVariationRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJob) return;

    if (!variationTitle.trim()) {
      showToast('Variation title is required.', 'error');
      return;
    }

    if (variationLineItems.length === 0) {
      showToast('Please add at least one variation line item.', 'error');
      return;
    }

    for (let i = 0; i < variationLineItems.length; i++) {
      const item = variationLineItems[i];
      if (!item.label.trim()) {
        showToast(`Variation line #${i + 1} needs a label.`, 'error');
        return;
      }
      if ((Number(item.quantity) || 0) <= 0) {
        showToast(`Variation line #${i + 1} needs a quantity greater than 0.`, 'error');
        return;
      }
      if ((Number(item.unit_price) || 0) < 0) {
        showToast(`Variation line #${i + 1} cannot have a negative unit price.`, 'error');
        return;
      }
    }

    if (variationFormTotal <= 0) {
      showToast('Variation total must be greater than $0.', 'error');
      return;
    }

    setSubmittingVariation(true);
    try {
      const { error } = await createVariationRequest({
        job_id: selectedJob.id,
        title: variationTitle.trim(),
        reason: variationReason.trim() || null,
        line_items: variationLineItems.map(item => ({
          label: item.label.trim(),
          description: item.description.trim() || null,
          quantity: Number(item.quantity) || 0,
          unit_price: Number(item.unit_price) || 0,
          line_type: item.line_type
        }))
      });
      if (error) throw error;

      showToast('Variation request submitted for customer review.', 'success');
      resetVariationForm();
      setShowVariationForm(false);
      await refreshVariationRequests(selectedJob.id);
    } catch (err: any) {
      showToast(err.message || 'Failed to submit variation request.', 'error');
    } finally {
      setSubmittingVariation(false);
    }
  };

  const handleCancelVariationRequest = async (requestId: string) => {
    if (!selectedJob) return;
    if (!confirm('Cancel this pending variation request?')) return;

    try {
      const { error } = await cancelVariationRequest(requestId);
      if (error) throw error;

      showToast('Variation request cancelled.', 'success');
      await refreshVariationRequests(selectedJob.id);
    } catch (err: any) {
      showToast(err.message || 'Failed to cancel variation request.', 'error');
    }
  };

  const handleOpenVariationReview = (request: VariationRequest) => {
    setReviewingVariation(request);
    setVariationReviewNote(request.review_note || '');
  };

  const handleReviewVariationRequest = async (decision: 'approved' | 'rejected') => {
    if (!selectedJob || !reviewingVariation) return;

    setSubmittingVariationReview(decision);
    try {
      const { error } = await reviewVariationRequest(
        reviewingVariation.id,
        decision,
        variationReviewNote
      );
      if (error) throw error;

      showToast(
        decision === 'approved'
          ? 'Variation approved. No funds have been released.'
          : 'Variation rejected.',
        'success'
      );

      setReviewingVariation(null);
      setVariationReviewNote('');
      await refreshVariationRequests(selectedJob.id);
    } catch (err: any) {
      showToast(err.message || 'Failed to review variation request.', 'error');
    } finally {
      setSubmittingVariationReview(null);
    }
  };

  // Applications: map of job_id → Application (for jobs the user has applied to)
  const [myApplications, setMyApplications] = useState<Map<string, Application>>(new Map());

  // Quote line items: map of application_id → QuoteLineItem[]
  const [quoteLineItems, setQuoteLineItems] = useState<Record<string, QuoteLineItem[]>>({});

  // Accepted quote line items for the active contract
  const [acceptedQuoteLines, setAcceptedQuoteLines] = useState<AcceptedQuoteLineItem[]>([]);
  const [loadingAcceptedLines, setLoadingAcceptedLines] = useState(false);

  // Early release requests state
  const [earlyReleaseRequests, setEarlyReleaseRequests] = useState<EarlyReleaseRequest[]>([]);
  const [earlyReleaseCapSummary, setEarlyReleaseCapSummary] = useState<EarlyReleaseCapSummary | null>(null);
  const [loadingEarlyReleases, setLoadingEarlyReleases] = useState(false);

  // Job evidence timeline state
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  // Early release form state
  const [erRequestType, setErRequestType] = useState<'materials' | 'fuel' | 'mobilisation' | 'permit' | 'equipment' | 'other'>('materials');
  const [erTitle, setErTitle] = useState('');
  const [erAmount, setErAmount] = useState('');
  const [erDescription, setErDescription] = useState('');
  const [erSelectedLineId, setErSelectedLineId] = useState<string>('');
  const [isSubmittingEr, setIsSubmittingEr] = useState(false);
  const [showErForm, setShowErForm] = useState(false);
  const [reviewingEarlyRelease, setReviewingEarlyRelease] = useState<EarlyReleaseRequest | null>(null);
  const [earlyReleaseReviewNote, setEarlyReleaseReviewNote] = useState('');
  const [submittingEarlyReleaseReview, setSubmittingEarlyReleaseReview] = useState<'approved' | 'rejected' | null>(null);

  // Itemised variation form state
  const [showVariationForm, setShowVariationForm] = useState(false);
  const [variationTitle, setVariationTitle] = useState('');
  const [variationReason, setVariationReason] = useState('');
  const [variationLineItems, setVariationLineItems] = useState<VariationFormLineItem[]>([
    { label: '', description: '', quantity: 1, unit_price: 0, line_type: 'labour' }
  ]);
  const [submittingVariation, setSubmittingVariation] = useState(false);
  const [reviewingVariation, setReviewingVariation] = useState<VariationRequest | null>(null);
  const [variationReviewNote, setVariationReviewNote] = useState('');
  const [submittingVariationReview, setSubmittingVariationReview] = useState<'approved' | 'rejected' | null>(null);
  const variationFormTotal = variationLineItems.reduce(
    (sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.unit_price) || 0)),
    0
  );

  // Modal state
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [activeJobDetailTab, setActiveJobDetailTab] = useState<JobDetailTab>('overview');
  const [reviewModalJob, setReviewModalJob] = useState<Job | null>(null);
  const [tradieReviewModalJob, setTradieReviewModalJob] = useState<Job | null>(null);
  const [applyJob, setApplyJob] = useState<Job | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [completionModalJob, setCompletionModalJob] = useState<Job | null>(null);
  const [proofImageUrls, setProofImageUrls] = useState<string[]>([]);
  const [workspaceImageUrls, setWorkspaceImageUrls] = useState<string[]>([]);
  const [workspaceImageError, setWorkspaceImageError] = useState<string | null>(null);

  useEffect(() => {
    setActiveJobDetailTab('overview');
  }, [selectedJob?.id]);

  // Prevent body scroll when details or other modals are open
  useEffect(() => {
    if (selectedJob || reviewModalJob || tradieReviewModalJob || completionModalJob || applyJob || activeInvoice || reviewingEarlyRelease || reviewingVariation) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedJob, reviewModalJob, tradieReviewModalJob, completionModalJob, applyJob, activeInvoice, reviewingEarlyRelease, reviewingVariation]);

  // Escape key close for details modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedJob) {
        setSelectedJob(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedJob]);

  // Filter States
  const [searchText, setSearchText] = useState('');
  const [selectedState, setSelectedState] = useState('all');
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [selectedSuburb, setSelectedSuburb] = useState('all');
  const [locationOptions, setLocationOptions] = useState<AustralianLocationOption[]>([]);
  const [locationLoading, setLocationLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLocationLoading(true);
    loadAustralianLocations()
      .then(dataset => {
        if (cancelled) return;
        setLocationOptions(dataset.entries);
      })
      .catch(error => {
        console.error('Failed to load Australian locations:', error);
      })
      .finally(() => {
        if (!cancelled) setLocationLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const regionOptions = selectedState !== 'all' ? getRegionsForState(locationOptions, selectedState) : [];
  const suburbOptions = selectedState !== 'all' && selectedRegion !== 'all' ? getSuburbsForRegion(locationOptions, selectedState, selectedRegion) : [];
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [budgetRange, setBudgetRange] = useState('any');
  const [selectedUrgencies, setSelectedUrgencies] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState('recent');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Quote / Payment Lifecycle states
  const [activeTab, setActiveTab] = useState<'all' | 'my_jobs' | 'completed_jobs'>('all');
  const [myJobsStatusFilter, setMyJobsStatusFilter] = useState('all');
  const [savedJobsOnly, setSavedJobsOnly] = useState(false);
  const [jobApplications, setJobApplications] = useState<any[]>([]);
  const [jobPayment, setJobPayment] = useState<any | null>(null);
  const [jobLedger, setJobLedger] = useState<any[]>([]);
  const [jobVariations, setJobVariations] = useState<VariationRequest[]>([]);
  const [jobProofs, setJobProofs] = useState<any[]>([]);
  const [jobIssues, setJobIssues] = useState<any[]>([]);
  const [loadingLifecycle, setLoadingLifecycle] = useState(false);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);

  const formatCentsToAud = (cents: number) => {
    return (cents / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
  };

  const formatAud = (amount: number) => {
    return amount.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
  };

  const formatInvoiceLineType = (lineType: string) => {
    return lineType.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
  };

  const getSelectedEarlyReleaseLineCap = () => {
    if (!erSelectedLineId || !earlyReleaseCapSummary) return null;
    return earlyReleaseCapSummary.line_caps.find(
      line => line.accepted_quote_line_item_id === erSelectedLineId
    ) || null;
  };

  const getVisibleEarlyReleaseLimit = () => {
    const selectedLineCap = getSelectedEarlyReleaseLineCap();
    if (selectedLineCap) {
      return Math.min(earlyReleaseCapSummary?.job_remaining ?? 0, selectedLineCap.remaining);
    }
    return earlyReleaseCapSummary?.job_remaining ?? null;
  };

  const getEarlyReleaseLineCapById = (lineId: string | null) => {
    if (!lineId || !earlyReleaseCapSummary) return null;
    return earlyReleaseCapSummary.line_caps.find(
      line => line.accepted_quote_line_item_id === lineId
    ) || null;
  };

  const getEarlyReleaseStatusLabel = (status: EarlyReleaseRequest['status']) => {
    if (status === 'pending') return 'Pending customer review';
    if (status === 'approved') return 'Approved by customer';
    if (status === 'rejected') return 'Rejected by customer';
    return 'Cancelled';
  };

  const fetchJobLifecycleDetails = useCallback(async (jobId: string, options?: { silent?: boolean }) => {
    if (!userId) {
      setJobPayment(null);
      setJobLedger([]);
      setJobVariations([]);
      setJobProofs([]);
      setJobIssues([]);
      setJobApplications([]);
      setAcceptedQuoteLines([]);
      setEarlyReleaseRequests([]);
      setEarlyReleaseCapSummary(null);
      setTimelineEvents([]);
      setLifecycleError(null);
      return;
    }

    if (!options?.silent) {
      setLoadingLifecycle(true);
    }
    setLifecycleError(null);
    try {
      const { data: pData } = await getPaymentForJob(jobId);
      setJobPayment(pData);

      if (pData) {
        const { data: lData } = await getLedgerForPayment(pData.id);
        setJobLedger(lData);
      } else {
        setJobLedger([]);
      }

      const { data: vData } = await fetchVariationRequestsForJob(jobId);
      setJobVariations(vData);

      const { data: prData } = await getCompletionProofsForJob(jobId);
      setJobProofs(prData);

      const { data: iData } = await getIssuesForJob(jobId);
      setJobIssues(iData);

      const isOwner = selectedJob?.customer_id === userId;
      if (isOwner) {
        const { data: appData } = await getApplicationsForJob(jobId);
        setJobApplications(appData);
        if (appData && appData.length > 0) {
          const appIds = appData.map(a => a.id);
          const { data: lines } = await fetchQuoteLineItemsByApplicationIds(appIds);
          if (lines) {
            const grouped = groupQuoteLineItemsByApplication(lines);
            setQuoteLineItems(prev => {
              const updated = { ...prev };
              appIds.forEach(id => {
                updated[id] = grouped.get(id) || [];
              });
              return updated;
            });
          }
        }
      } else {
        const app = myApplications.get(jobId);
        if (app) {
          const { data: lines } = await fetchQuoteLineItemsByApplicationIds([app.id]);
          if (lines) {
            setQuoteLineItems(prev => ({
              ...prev,
              [app.id]: lines
            }));
          }
        }
      }

      if (selectedJob && selectedJob.status !== 'open' && selectedJob.status !== 'cancelled') {
        setLoadingAcceptedLines(true);
        const { data: accLines } = await fetchAcceptedQuoteLineItemsByJobIds([jobId]);
        setAcceptedQuoteLines(accLines || []);
        setLoadingAcceptedLines(false);

        setLoadingEarlyReleases(true);
        const [{ data: erRequests }, { data: capSummary }] = await Promise.all([
          fetchEarlyReleaseRequestsForJob(jobId),
          fetchEarlyReleaseCapSummaryForJob(jobId)
        ]);
        setEarlyReleaseRequests(erRequests || []);
        setEarlyReleaseCapSummary(capSummary || null);
        setLoadingEarlyReleases(false);
      } else {
        setAcceptedQuoteLines([]);
        setEarlyReleaseRequests([]);
        setEarlyReleaseCapSummary(null);
      }

      if (selectedJob) {
        const isOwner = selectedJob.customer_id === userId;
        const isAcceptedTradie = myApplications.get(jobId)?.status === 'accepted';
        const isAdmin = profile?.is_admin;

        if (isOwner || isAcceptedTradie || isAdmin) {
          setLoadingTimeline(true);
          const { data: timelineData } = await fetchJobEvidenceTimeline(jobId);
          setTimelineEvents(timelineData || []);
          setLoadingTimeline(false);
        } else {
          setTimelineEvents([]);
        }
      } else {
        setTimelineEvents([]);
      }
    } catch (err: any) {
      setLifecycleError(err.message || 'Failed to load details.');
    } finally {
      setLoadingLifecycle(false);
    }
  }, [userId, selectedJob, myApplications, profile]);

  useEffect(() => {
    if (selectedJob) {
      fetchJobLifecycleDetails(selectedJob.id);
      setWorkspaceImageUrls([]);
      setWorkspaceImageError(null);
      if (selectedJob.workspace_image_count > 0 && user) {
        fetchJobWorkspaceImages(selectedJob.id).then(({ data, error }) => {
          if (error) {
            setWorkspaceImageError('Workspace photos could not be loaded.');
            return;
          }
          setWorkspaceImageUrls(data.map(image => image.signed_url).filter(Boolean) as string[]);
        });
      }
    } else {
      setJobApplications([]);
      setJobPayment(null);
      setJobLedger([]);
      setJobVariations([]);
      setJobProofs([]);
      setJobIssues([]);
      setWorkspaceImageUrls([]);
      setWorkspaceImageError(null);
    }
  }, [selectedJob, fetchJobLifecycleDetails, user]);
  
  // Fetch signed URLs for completion proofs
  useEffect(() => {
    if (jobProofs && jobProofs.length > 0 && jobProofs[0].attachments && jobProofs[0].attachments.length > 0) {
      const getUrls = async () => {
        const urls: string[] = [];
        for (const path of jobProofs[0].attachments) {
          try {
            const { data, error } = await supabase.storage
              .from('completion_proofs')
              .createSignedUrl(path, 3600);
            if (!error && data?.signedUrl) {
              urls.push(data.signedUrl);
            }
          } catch (e) {
            console.error('Error generating signed URL:', e);
          }
        }
        setProofImageUrls(urls);
      };
      getUrls();
    } else {
      setProofImageUrls([]);
    }
  }, [jobProofs]);



  // Reset the local status filter when switching tabs. loadJobs reacts to activeTab separately.
  useEffect(() => {
    setMyJobsStatusFilter('all');
  }, [activeTab]);

  // Sync query parameter from homepage
  useEffect(() => {
    const categoryParam = searchParams.get('category');
    if (categoryParam) {
      let mappedParam = categoryParam;
      if (categoryParam.toLowerCase() === 'landscaping') {
        mappedParam = 'gardening';
      }
      const matchedOption = categoryOptions.find(
        (opt) =>
          opt.id.toLowerCase() === mappedParam.toLowerCase() ||
          opt.label.toLowerCase() === mappedParam.toLowerCase()
      );
      if (matchedOption) {
        setSelectedCategories([matchedOption.id]);
      }
      // Remove category from search params so it doesn't reset filters on subsequent changes
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('category');
      setSearchParams(newParams, { replace: true });
    }

    const jobIdParam = searchParams.get('jobId');
    if (jobIdParam) {
      const fetchAndOpenJob = async () => {
        try {
          const { data, error } = await fetchJobById(jobIdParam);
          if (error) throw error;
          if (data?.job) {
            setSelectedJob(data.job);
          }
        } catch (err) {
          console.error('Failed to auto-open job from parameter:', err);
        } finally {
          // Remove jobId from search params so it doesn't loop or block closing
          const newParams = new URLSearchParams(searchParams);
          newParams.delete('jobId');
          setSearchParams(newParams, { replace: true });
        }
      };
      fetchAndOpenJob();
    }
  }, [searchParams, setSearchParams]);

  // ─── Load Jobs ──────────────────────────────────────────────────────────────
  const loadJobs = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    setError(null);

    try {
      if (activeTab === 'all') {
        const { data, error: fetchErr } = await fetchJobs({ status: 'open' });
        if (fetchErr) throw fetchErr;
        setJobs(data);
      } else if (activeTab === 'my_jobs' || activeTab === 'completed_jobs') {
        if (!userId) {
          setJobs([]);
          setLoading(false);
          return;
        }
        
        // 1. Fetch customer owned jobs (with their applications list)
        const { data: customerJobs, error: custErr } = await supabase
          .from('jobs')
          .select('*, applications(id, status, tradie_id), payments(id, status, updated_at, payee_id, payer_id)')
          .eq('customer_id', userId);
        if (custErr) throw custErr;

        // 2. Fetch jobs where user has applied (with their application details)
        const { data: tradieJobs, error: tradieErr } = await supabase
          .from('jobs')
          .select('*, applications!inner(id, status, tradie_id), payments(id, status, updated_at, payee_id, payer_id)')
          .eq('applications.tradie_id', userId);
        if (tradieErr) throw tradieErr;

        // Merge and de-duplicate by job.id
        const merged = [...(customerJobs || []), ...(tradieJobs || [])];
        const uniqueJobs = Array.from(new Map(merged.map(item => [item.id, item])).values());
        const { data: hydratedJobs, error: profilesErr } = await hydrateJobsWithPublicCustomers(uniqueJobs);
        if (profilesErr) throw profilesErr;

        setJobs(hydratedJobs as Job[]);
      }
    } catch (fetchErr: any) {
      console.error('Failed to load jobs:', fetchErr);
      setError('Jobs could not be loaded right now. Please try again shortly.');
    } finally {
      setLoading(false);
    }
  }, [userId, activeTab]);

  // ─── Load saved job IDs for logged-in user ──────────────────────────────────
  const loadSavedState = useCallback(async () => {
    if (!userId) return;
    const ids = await getSavedItemIds('job');
    setSavedJobIds(ids);
  }, [userId]);

  const selectedJobRef = useRef<Job | null>(null);
  useEffect(() => {
    selectedJobRef.current = selectedJob;
  }, [selectedJob]);

  // Realtime subscription to live updates on jobs, applications, payments, completion proofs, disputes, early releases, and variations
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`jobs-realtime-sync:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'jobs'
        },
        () => {
          void loadJobs({ silent: true });
          const activeJob = selectedJobRef.current;
          if (activeJob) void fetchJobLifecycleDetails(activeJob.id, { silent: true });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'applications'
        },
        () => {
          void loadJobs({ silent: true });
          const activeJob = selectedJobRef.current;
          if (activeJob) void fetchJobLifecycleDetails(activeJob.id, { silent: true });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payments'
        },
        () => {
          void loadJobs({ silent: true });
          const activeJob = selectedJobRef.current;
          if (activeJob) void fetchJobLifecycleDetails(activeJob.id, { silent: true });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'job_completion_proofs'
        },
        () => {
          const activeJob = selectedJobRef.current;
          if (activeJob) void fetchJobLifecycleDetails(activeJob.id, { silent: true });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'job_issues'
        },
        () => {
          const activeJob = selectedJobRef.current;
          if (activeJob) void fetchJobLifecycleDetails(activeJob.id, { silent: true });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'early_release_requests'
        },
        () => {
          const activeJob = selectedJobRef.current;
          if (activeJob) void fetchJobLifecycleDetails(activeJob.id, { silent: true });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'job_variation_requests'
        },
        () => {
          const activeJob = selectedJobRef.current;
          if (activeJob) void fetchJobLifecycleDetails(activeJob.id, { silent: true });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, loadJobs, fetchJobLifecycleDetails]);

  // ─── Load user's existing applications ─────────────────────────────────────
  const loadApplications = useCallback(async () => {
    if (!userId) return;
    try {
      const { data, error } = await getMyApplications();
      if (error) {
        console.error('Error loading applications:', error);
        return;
      }
      const appMap = new Map<string, Application>();
      if (data) {
        data.forEach((app: any) => {
          appMap.set(app.job_id, app);
        });
      }
      setMyApplications(appMap);
    } catch (e) {
      console.error('Unexpected error loading applications:', e);
    }
  }, [userId]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    loadSavedState();
    loadApplications();
  }, [loadSavedState, loadApplications]);

  // ─── Save/Unsave ────────────────────────────────────────────────────────────
  const handleToggleSave = async (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return; // Don't prompt — just silently ignore (button is only shown to auth users)

    setSavingId(jobId);
    const { saved } = await toggleSavedItem('job', jobId);
    setSavedJobIds((prev) => {
      const next = new Set(prev);
      if (saved) next.add(jobId);
      else next.delete(jobId);
      return next;
    });
    setSavingId(null);
  };

  // ─── Open Apply Modal ───────────────────────────────────────────────────────
  const handleOpenApply = async (job: Job) => {
    if (user && job.customer_id === user.id) {
      showToast("You can't quote on your own job.", 'error');
      return;
    }
    setSelectedJob(null); // close detail modal
    // Pre-fetch existing application and its line items
    if (user) {
      const { data } = await getMyApplicationForJob(job.id);
      if (data) {
        setMyApplications((prev) => new Map(prev).set(job.id, data));
        const { data: lines } = await fetchQuoteLineItemsByApplicationIds([data.id]);
        if (lines) {
          setQuoteLineItems(prev => ({
            ...prev,
            [data.id]: lines
          }));
        }
      }
    }
    setApplyJob(job);
  };

  // ─── Application Success ────────────────────────────────────────────────────
  const handleApplicationSuccess = (app: Application, lines: QuoteLineItem[]) => {
    setMyApplications((prev) => new Map(prev).set(app.job_id, app));
    if (lines && lines.length > 0) {
      setQuoteLineItems(prev => ({
        ...prev,
        [app.id]: lines
      }));
    }
    setApplyJob(null);
    setShowSuccess(true);
  };

  const getListPayment = (job: Job) => {
    const payments = (job as any).payments;
    if (Array.isArray(payments)) return payments[0] || null;
    return payments || null;
  };

  const isCompletedReleasedJob = (job: Job) => {
    const payment = getListPayment(job);
    return job.status === 'completed' && payment?.status === 'released';
  };

  const getCompletedDate = (job: Job) => {
    const payment = getListPayment(job);
    return payment?.updated_at || job.updated_at || job.created_at;
  };

  const openReviewModalIfEligible = useCallback(async (job: Job) => {
    if (!user || job.customer_id !== user.id) return;
    if (job.status !== 'completed') return;

    try {
      const { data: payment, error: paymentError } = await getPaymentForJob(job.id);
      if (paymentError || !payment || payment.status !== 'released' || !payment.payee_id) return;

      const { data: issues, error: issuesError } = await getIssuesForJob(job.id);
      if (issuesError || (issues || []).some(issue => issue.status === 'open')) return;

      const { data: existingReview, error: reviewError } = await getMyTradieReviewForJob(job.id, payment.payee_id);
      if (reviewError || existingReview) return;

      setTradieReviewModalJob(job);
    } catch (err) {
      console.error('Review auto-open eligibility check failed:', err);
    }
  }, [user]);

  // ─── Filters ────────────────────────────────────────────────────────────────
  const filteredJobs = jobs.filter((job) => {
    const isCompletedReleased = isCompletedReleasedJob(job);
    if (activeTab === 'my_jobs' && isCompletedReleased) return false;
    if (activeTab === 'completed_jobs' && !isCompletedReleased) return false;

    if (searchText) {
      const q = searchText.toLowerCase();
      const categoryMatch = job.categories.some((cat) => {
        const option = categoryOptions.find((opt) => opt.id === cat);
        return (
          cat.toLowerCase().includes(q) ||
          (option && option.label.toLowerCase().includes(q))
        );
      });
      if (
        !job.title.toLowerCase().includes(q) &&
        !job.description.toLowerCase().includes(q) &&
        !getPublicJobLocation(job).toLowerCase().includes(q) &&
        !categoryMatch
      ) {
        return false;
      }
    }
    if (activeTab === 'completed_jobs') return true;

    if (selectedState !== 'all' && job.state.toUpperCase() !== selectedState.toUpperCase()) return false;
    if (selectedRegion !== 'all' && (!job.region || job.region.toLowerCase() !== selectedRegion.toLowerCase())) return false;
    if (selectedSuburb !== 'all' && (!job.suburb || job.suburb.toLowerCase() !== selectedSuburb.toLowerCase())) return false;
    if (selectedCategories.length > 0 && !job.categories.some((cat) => selectedCategories.includes(cat))) return false;
    if (selectedUrgencies.length > 0 && (!job.urgency || !selectedUrgencies.includes(job.urgency))) return false;
    if (selectedTypes.length > 0 && (!job.type || !selectedTypes.includes(job.type))) return false;
    if (budgetRange !== 'any') {
      const maxBudget = job.budget_max ?? job.budget_min ?? 0;
      if (budgetRange === 'under500' && maxBudget >= 500) return false;
      if (budgetRange === '500-2000' && (maxBudget < 500 || maxBudget > 2000)) return false;
      if (budgetRange === '2000-10000' && (maxBudget < 2000 || maxBudget > 10000)) return false;
      if (budgetRange === '10000plus' && maxBudget < 10000) return false;
    }
    
    if (activeTab === 'my_jobs' && myJobsStatusFilter !== 'all') {
      switch (myJobsStatusFilter) {
        case 'open':
          if (job.status !== 'open') return false;
          break;
        case 'awaiting_payment':
          if (job.status !== 'accepted') return false;
          break;
        case 'contract_active':
          if (job.status !== 'payment_held') return false;
          break;
        case 'completion_review':
          if (job.status !== 'completed_pending_review') return false;
          break;
        case 'disputed':
          if (job.status !== 'disputed') return false;
          break;
        case 'completed':
          if (job.status !== 'completed') return false;
          break;
        case 'cancelled':
          if (job.status !== 'cancelled') return false;
          break;
        default:
          break;
      }
    }
    if (savedJobsOnly && !savedJobIds.has(job.id)) return false;
    return true;
  });

  const getSortPriority = (job: any, userId: string) => {
    if (job.status === 'payment_held') return 1;
    if (job.status === 'accepted') return 3;
    if (job.status === 'completed_pending_review') return 4;
    if (job.status === 'disputed') return 5;

    const isOwner = job.customer_id === userId;
    const hasApps = job.applications && job.applications.length > 0;

    if (isOwner && job.status === 'open' && hasApps) return 6;
    if (isOwner && job.status === 'open' && !hasApps) return 7;
    if (!isOwner && job.status === 'open') return 8;
    if (job.status === 'completed') return 9;
    return 10;
  };

  const sortedJobs = [...filteredJobs].sort((a, b) => {
    if (activeTab === 'completed_jobs') {
      return new Date(getCompletedDate(b)).getTime() - new Date(getCompletedDate(a)).getTime();
    }
    if (activeTab === 'my_jobs' && user) {
      const prioA = getSortPriority(a, user.id);
      const prioB = getSortPriority(b, user.id);
      if (prioA !== prioB) {
        return prioA - prioB;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
    if (sortBy === 'highest') return (b.budget_max ?? b.budget_min ?? 0) - (a.budget_max ?? a.budget_min ?? 0);
    if (sortBy === 'urgent') {
      const p = (u: string | null) => (u === 'urgent' ? 3 : u === 'week' ? 2 : 1);
      return p(b.urgency) - p(a.urgency);
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const canMessageJob = (job: Job) => {
    if (!user || !['accepted', 'payment_held', 'completed_pending_review', 'disputed', 'completed'].includes(job.status)) {
      return false;
    }
    if (job.customer_id === user.id) return true;
    return !!job.applications?.some(application =>
      application.tradie_id === user.id && application.status === 'accepted'
    );
  };

  const getContractStatusLabel = (status: string) => {
    if (status === 'accepted') return 'Awaiting Payment';
    if (status === 'payment_held') return 'Contract Active';
    if (status === 'completed_pending_review') return 'Waiting for Review';
    if (status === 'disputed') return 'Disputed';
    if (status === 'completed') return 'Completed';
    return status.replace(/_/g, ' ');
  };

  const getContractStatusCopy = (status: string) => {
    if (status === 'accepted') return 'Your quote is accepted. Fund the protected payment to activate the contract.';
    if (status === 'payment_held') return 'Contract active. Your payment is protected and the tradie can begin work.';
    if (status === 'completed_pending_review') return 'The tradie has submitted proof. Review the work when you are ready.';
    if (status === 'disputed') return 'This job is in dispute and is being reviewed by TradieHubAU.';
    if (status === 'completed') return 'This job is complete and the payment has been released.';
    return 'Job details and workflow information are available below.';
  };

  const getContractStatusClasses = (status: string) => {
    if (status === 'accepted') return 'bg-amber-500/10 text-amber-800 border-amber-500/30';
    if (status === 'payment_held') return 'bg-green-500/10 text-green-800 border-green-500/30';
    if (status === 'completed_pending_review') return 'bg-blue-500/10 text-blue-800 border-blue-500/30';
    if (status === 'disputed') return 'bg-red-500/10 text-red-800 border-red-500/30';
    if (status === 'completed') return 'bg-emerald-500/10 text-emerald-800 border-emerald-500/30';
    return 'bg-secondary text-secondary-foreground border-transparent';
  };

  const usesJobDetailTabs = (job: Job) => {
    return !!user && job.customer_id === user.id && ['accepted', 'payment_held', 'completed_pending_review', 'disputed', 'completed'].includes(job.status);
  };

  const activeCount = jobs.filter((j) => j.status === 'open').length;
  const urgentCount = jobs.filter((j) => j.status === 'open' && j.urgency === 'urgent').length;
  const totalValue = jobs.reduce((sum, j) => sum + (j.budget_max ?? j.budget_min ?? 0), 0);

  const toggleCategory = (id: string) => setSelectedCategories((p) => p.includes(id) ? p.filter((c) => c !== id) : [...p, id]);
  const toggleUrgency = (id: string) => setSelectedUrgencies((p) => p.includes(id) ? p.filter((u) => u !== id) : [...p, id]);
  const toggleType = (id: string) => setSelectedTypes((p) => p.includes(id) ? p.filter((t) => t !== id) : [...p, id]);
  const clearAllFilters = () => {
    setSearchText(''); setSelectedState('all'); setSelectedRegion('all'); setSelectedSuburb('all');
    setSelectedCategories([]);
    setBudgetRange('any'); setSelectedUrgencies([]); setSelectedTypes([]); setSortBy('recent');
    setMyJobsStatusFilter('all');
    setSavedJobsOnly(false);
    setSearchParams({});
  };

  const formatBudget = (job: Job) => {
    if (job.budget_type === 'need_quotes') return 'Need quotes';
    if (job.estimated_budget !== null && job.estimated_budget !== undefined) {
      const prefix = job.budget_type === 'fixed_budget' ? 'Fixed' : 'Estimate';
      return `${prefix}: $${job.estimated_budget.toLocaleString()}`;
    }
    if (job.budget_min === null && job.budget_max === null) return 'Budget TBD';
    if (job.budget_min !== null && job.budget_max !== null) return `$${job.budget_min.toLocaleString()} - $${job.budget_max.toLocaleString()}`;
    if (job.budget_min !== null) return `From $${job.budget_min.toLocaleString()}`;
    return `Up to $${job.budget_max!.toLocaleString()}`;
  };

  const formatDate = (dateStr: string) => {
    const diffHrs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 3_600_000);
    if (diffHrs < 1) return 'Just now';
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const days = Math.floor(diffHrs / 24);
    return days === 1 ? 'Yesterday' : `${days} days ago`;
  };

  // ─── Shared Sidebar Filter Component ────────────────────────────────────────
  const SidebarFilters = ({ mobile = false }: { mobile?: boolean }) => (
    <div className={`space-y-6 ${mobile ? 'max-w-md mx-auto' : ''}`}>
      <div className={`flex items-center justify-between ${mobile ? '' : 'border-b pb-4'}`}>
        <h3 className="font-bold text-foreground flex items-center gap-2">
          <Filter className="h-4 w-4 text-primary" /> Filters
        </h3>
        <button onClick={clearAllFilters} className="text-xs font-bold text-primary hover:text-primary/80 transition-colors">
          Clear All
        </button>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-bold text-foreground uppercase tracking-wider">Search</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input type="text" placeholder="Title, suburb, trade..." value={searchText} onChange={(e) => setSearchText(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border rounded-xl bg-background outline-none text-sm focus:border-primary/50 transition-all font-medium" />
        </div>
      </div>
      {activeTab === 'my_jobs' && (
        <div className="space-y-2">
          <label className="text-xs font-bold text-foreground uppercase tracking-wider">My Jobs Status</label>
          <select
            value={myJobsStatusFilter}
            onChange={(e) => setMyJobsStatusFilter(e.target.value)}
            className="w-full px-3 py-2 border rounded-xl bg-background outline-none text-sm focus:border-primary/50 transition-all font-medium cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="awaiting_payment">Quote Accepted — Awaiting Payment</option>
            <option value="contract_active">Payment Funded — Contract Active</option>
            <option value="completion_review">Under Review</option>
            <option value="disputed">Disputed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      )}
      {user && (
        <div className="pt-2 pb-2 border-y border-border">
          <label className="flex items-center gap-2 cursor-pointer group">
            <input type="checkbox" checked={savedJobsOnly} onChange={(e) => setSavedJobsOnly(e.target.checked)}
              className="rounded border-border text-primary focus:ring-primary/20 h-4.5 w-4.5 cursor-pointer" />
            <span className="text-sm font-bold text-foreground group-hover:text-primary transition-all">
              Saved Jobs
            </span>
          </label>
        </div>
      )}
      <div className="space-y-2">
        <label className="text-xs font-bold text-foreground uppercase tracking-wider">State / Territory</label>
        <select
          value={selectedState}
          onChange={(e) => {
            const nextState = e.target.value;
            setSelectedState(nextState);
            setSelectedRegion('all');
            setSelectedSuburb('all');
          }}
          className="w-full px-3 py-2 border rounded-xl bg-background outline-none text-sm focus:border-primary/50 transition-all font-medium cursor-pointer"
        >
          <option value="all">All Australia</option>
          {['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-bold text-foreground uppercase tracking-wider">Region</label>
        <select
          value={selectedRegion}
          onChange={(e) => {
            setSelectedRegion(e.target.value);
            setSelectedSuburb('all');
          }}
          disabled={selectedState === 'all' || locationLoading}
          className="w-full px-3 py-2 border rounded-xl bg-background outline-none text-sm focus:border-primary/50 transition-all font-medium cursor-pointer disabled:opacity-60"
        >
          <option value="all">{selectedState !== 'all' ? 'All Regions' : 'Select state first'}</option>
          {regionOptions.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-bold text-foreground uppercase tracking-wider">Suburb</label>
        <select
          value={selectedSuburb}
          onChange={(e) => setSelectedSuburb(e.target.value)}
          disabled={selectedRegion === 'all' || locationLoading}
          className="w-full px-3 py-2 border rounded-xl bg-background outline-none text-sm focus:border-primary/50 transition-all font-medium cursor-pointer disabled:opacity-60"
        >
          <option value="all">{selectedRegion !== 'all' ? 'All Suburbs' : 'Select region first'}</option>
          {suburbOptions.map((sub) => (
            <option key={`${sub.suburb}-${sub.postcode}`} value={sub.suburb}>
              {formatSuburbOption(sub)}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-bold text-foreground uppercase tracking-wider">Trade Categories</label>
        <div className={`space-y-2 ${mobile ? 'grid grid-cols-2 gap-2' : 'max-h-48 overflow-y-auto pr-1'}`}>
          {categoryOptions.map((cat) => (
            <label key={cat.id} className="flex items-center gap-2 cursor-pointer group">
              <input type="checkbox" checked={selectedCategories.includes(cat.id)} onChange={() => toggleCategory(cat.id)}
                className="rounded border-border text-primary focus:ring-primary/20 h-4 w-4" />
              <span className="text-sm font-semibold text-muted-foreground group-hover:text-foreground transition-colors">{cat.label}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-bold text-foreground uppercase tracking-wider">Budget Range</label>
        <div className="space-y-2">
          {[{ value: 'any', label: 'Any Budget' }, { value: 'under500', label: 'Under $500' },
            { value: '500-2000', label: '$500 – $2,000' }, { value: '2000-10000', label: '$2,000 – $10,000' },
            { value: '10000plus', label: '$10,000+' }].map((r) => (
            <label key={r.value} className="flex items-center gap-2 cursor-pointer group">
              <input type="radio" name={`budget-${mobile ? 'm' : 'd'}`} value={r.value} checked={budgetRange === r.value} onChange={() => setBudgetRange(r.value)}
                className="text-primary focus:ring-primary/20 h-4 w-4" />
              <span className="text-sm font-semibold text-muted-foreground group-hover:text-foreground transition-colors">{r.label}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-bold text-foreground uppercase tracking-wider">Urgency</label>
        <div className="space-y-2">
          {[{ id: 'urgent', label: 'Urgent' }, { id: 'week', label: 'This Week' }, { id: 'flexible', label: 'Flexible' }].map((item) => (
            <label key={item.id} className="flex items-center gap-2 cursor-pointer group">
              <input type="checkbox" checked={selectedUrgencies.includes(item.id)} onChange={() => toggleUrgency(item.id)}
                className="rounded border-border text-primary focus:ring-primary/20 h-4 w-4" />
              <span className="text-sm font-semibold text-muted-foreground group-hover:text-foreground transition-colors">{item.label}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-bold text-foreground uppercase tracking-wider">Job Type</label>
        <div className="space-y-2">
          {[{ id: 'one-off', label: 'One-off' }, { id: 'ongoing', label: 'Ongoing' }, { id: 'contract', label: 'Contract' }].map((item) => (
            <label key={item.id} className="flex items-center gap-2 cursor-pointer group">
              <input type="checkbox" checked={selectedTypes.includes(item.id)} onChange={() => toggleType(item.id)}
                className="rounded border-border text-primary focus:ring-primary/20 h-4 w-4" />
              <span className="text-sm font-semibold text-muted-foreground group-hover:text-foreground transition-colors">{item.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Modals */}
      {applyJob && (
        <ApplyModal
          job={applyJob}
          existingApplication={myApplications.get(applyJob.id) ?? null}
          onClose={() => setApplyJob(null)}
          onSuccess={handleApplicationSuccess}
        />
      )}
      {showSuccess && <ApplicationSuccessModal onClose={() => setShowSuccess(false)} />}

      {completionModalJob && (
        <SubmitCompletionModal
          job={completionModalJob}
          onClose={() => setCompletionModalJob(null)}
          onSuccess={() => {
            setCompletionModalJob(null);
            showToast("Completion proof submitted! Customer has 72 hours to review.", 'success');
            if (selectedJob && selectedJob.id === completionModalJob.id) {
              setSelectedJob(prev => prev ? { ...prev, status: 'completed_pending_review' } : null);
              fetchJobLifecycleDetails(selectedJob.id, { silent: true });
            }
            loadJobs({ silent: true });
          }}
        />
      )}

      {reviewModalJob && (
        <ReviewCompletionModal
          job={reviewModalJob}
          onClose={() => setReviewModalJob(null)}
          onSuccess={async (newStatus) => {
            const completedJob = { ...reviewModalJob, status: newStatus };
            setReviewModalJob(null);
            if (selectedJob && selectedJob.id === reviewModalJob.id) {
              setSelectedJob(prev => prev ? { ...prev, status: newStatus } : null);
              fetchJobLifecycleDetails(reviewModalJob.id, { silent: true });
            }
            loadJobs({ silent: true });
            if (newStatus === 'completed') {
              await openReviewModalIfEligible(completedJob);
            }
          }}
          showToast={showToast}
          setModalConfirmConfig={setModalConfirmConfig}
        />
      )}

      {tradieReviewModalJob && (
        <LeaveTradieReviewModal
          job={tradieReviewModalJob}
          onClose={() => setTradieReviewModalJob(null)}
          onSuccess={() => {
            setTradieReviewModalJob(null);
            showToast('Review submitted. It now appears on the tradie profile.', 'success');
            if (selectedJob && selectedJob.id === tradieReviewModalJob.id) {
              fetchJobLifecycleDetails(selectedJob.id, { silent: true });
            }
            loadJobs({ silent: true });
          }}
          showToast={showToast}
        />
      )}

      {reviewingEarlyRelease && (() => {
        const linkedLine = acceptedQuoteLines.find(line => line.id === reviewingEarlyRelease.accepted_quote_line_item_id);
        const lineCap = getEarlyReleaseLineCapById(reviewingEarlyRelease.accepted_quote_line_item_id);

        return (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
            <div className="bg-card border border-border w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden">
              <div className="p-5 border-b flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-black text-foreground">Review Early Release</h3>
                  <p className="text-xs text-muted-foreground font-semibold mt-0.5">
                    {getEarlyReleaseStatusLabel(reviewingEarlyRelease.status)}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setReviewingEarlyRelease(null);
                    setEarlyReleaseReviewNote('');
                  }}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground shrink-0"
                  disabled={!!submittingEarlyReleaseReview}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                <div className="p-3 rounded-xl bg-primary/5 border border-primary/15 text-primary text-[11px] font-semibold leading-relaxed flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>Approving this request records your approval for an early release. Funds are not released in this step.</span>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-muted/30 border rounded-xl p-3">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block">Type</span>
                      <span className="text-xs font-black text-foreground capitalize">{reviewingEarlyRelease.request_type}</span>
                    </div>
                    <div className="bg-muted/30 border rounded-xl p-3">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block">Amount</span>
                      <span className="text-xs font-black text-foreground">{formatAud(reviewingEarlyRelease.amount)}</span>
                    </div>
                  </div>

                  <div className="bg-muted/30 border rounded-xl p-3">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block">Title</span>
                    <span className="text-sm font-black text-foreground">{reviewingEarlyRelease.title}</span>
                  </div>

                  {reviewingEarlyRelease.description && (
                    <div className="bg-muted/30 border rounded-xl p-3">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block">Description</span>
                      <p className="text-xs font-semibold text-foreground/80 leading-relaxed whitespace-pre-wrap">
                        {reviewingEarlyRelease.description}
                      </p>
                    </div>
                  )}

                  <div className="bg-muted/30 border rounded-xl p-3">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block">Accepted Quote Line</span>
                    {linkedLine ? (
                      <div className="flex items-center justify-between gap-3 mt-1">
                        <div className="min-w-0">
                          <span className="text-xs font-black text-foreground truncate block">{linkedLine.label}</span>
                          <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                            {linkedLine.line_type} | {linkedLine.quantity} x ${linkedLine.unit_price.toLocaleString()}
                          </span>
                        </div>
                        <span className="text-xs font-black text-foreground shrink-0">{formatAud(linkedLine.line_total)}</span>
                      </div>
                    ) : (
                      <span className="text-xs font-semibold text-muted-foreground">No accepted quote line linked.</span>
                    )}
                  </div>

                  {earlyReleaseCapSummary && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="bg-background border rounded-xl p-2">
                        <span className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground block">Job Cap</span>
                        <span className="text-xs font-black text-foreground">{formatAud(earlyReleaseCapSummary.job_cap)}</span>
                      </div>
                      <div className="bg-background border rounded-xl p-2">
                        <span className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground block">Job Remaining</span>
                        <span className="text-xs font-black text-primary">{formatAud(earlyReleaseCapSummary.job_remaining)}</span>
                      </div>
                      <div className="bg-background border rounded-xl p-2">
                        <span className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground block">Line Remaining</span>
                        <span className="text-xs font-black text-primary">
                          {lineCap ? formatAud(lineCap.remaining) : 'N/A'}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block">Review Note (Optional)</label>
                    <textarea
                      rows={3}
                      value={earlyReleaseReviewNote}
                      onChange={(e) => setEarlyReleaseReviewNote(e.target.value)}
                      placeholder="Add a short note for the tradie..."
                      className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:border-primary/50 resize-none"
                      disabled={!!submittingEarlyReleaseReview}
                    />
                  </div>

                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 text-[11px] font-semibold leading-relaxed">
                    Rejecting this request means it will not be eligible for early release.
                  </div>
                </div>
              </div>

              <div className="p-5 border-t flex flex-col sm:flex-row justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setReviewingEarlyRelease(null);
                    setEarlyReleaseReviewNote('');
                  }}
                  disabled={!!submittingEarlyReleaseReview}
                  className="bg-secondary text-secondary-foreground font-bold px-4 py-2 rounded-xl hover:bg-secondary/80 transition-colors text-xs disabled:opacity-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => handleReviewEarlyReleaseRequest('rejected')}
                  disabled={!!submittingEarlyReleaseReview}
                  className="bg-red-600 text-white font-bold px-4 py-2 rounded-xl hover:bg-red-700 transition-colors text-xs disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {submittingEarlyReleaseReview === 'rejected' ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Rejecting...</> : 'Reject Request'}
                </button>
                <button
                  type="button"
                  onClick={() => handleReviewEarlyReleaseRequest('approved')}
                  disabled={!!submittingEarlyReleaseReview}
                  className="bg-green-600 text-white font-bold px-4 py-2 rounded-xl hover:bg-green-700 transition-colors text-xs disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {submittingEarlyReleaseReview === 'approved' ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Approving...</> : 'Approve Request'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {reviewingVariation && (() => {
        const lineItems = reviewingVariation.line_items || [];
        const total = lineItems.reduce((sum, item) => sum + Number(item.line_total || 0), 0);

        return (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
            <div className="bg-card border border-border w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden">
              <div className="p-5 border-b flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-black text-foreground">Review Variation</h3>
                  <p className="text-xs text-muted-foreground font-semibold mt-0.5">
                    {reviewingVariation.status === 'pending' ? 'Pending customer review' : reviewingVariation.status}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setReviewingVariation(null);
                    setVariationReviewNote('');
                  }}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground shrink-0"
                  disabled={!!submittingVariationReview}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                <div className="p-3 rounded-xl bg-primary/5 border border-primary/15 text-primary text-[11px] font-semibold leading-relaxed flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>Approving this variation records your approval for the extra work/materials. Funds are not released in this step.</span>
                </div>

                <div className="bg-muted/30 border rounded-xl p-3">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block">Title</span>
                  <span className="text-sm font-black text-foreground">{reviewingVariation.title}</span>
                  {reviewingVariation.reason && (
                    <p className="text-xs font-semibold text-foreground/80 leading-relaxed whitespace-pre-wrap mt-2">
                      {reviewingVariation.reason}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Itemised variation</span>
                    <span className="text-sm font-black text-primary">{formatAud(total)}</span>
                  </div>
                  {lineItems.map((line) => (
                    <div key={line.id} className="flex justify-between gap-3 bg-background border rounded-xl p-3 text-xs">
                      <div className="min-w-0">
                        <span className="font-bold text-foreground truncate block">{line.label}</span>
                        <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold">
                          {line.line_type} | {line.quantity} x ${line.unit_price.toLocaleString()}
                        </span>
                        {line.description && (
                          <p className="text-[10px] text-foreground/70 mt-1 leading-relaxed">{line.description}</p>
                        )}
                      </div>
                      <span className="font-black text-foreground shrink-0">{formatAud(Number(line.line_total || 0))}</span>
                    </div>
                  ))}
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block">Review Note (Optional)</label>
                  <textarea
                    rows={3}
                    value={variationReviewNote}
                    onChange={(e) => setVariationReviewNote(e.target.value)}
                    placeholder="Add a short note for the tradie..."
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:border-primary/50 resize-none"
                    disabled={!!submittingVariationReview}
                  />
                </div>

                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 text-[11px] font-semibold leading-relaxed">
                  Rejecting this variation means it will not become chargeable.
                </div>
              </div>

              <div className="p-5 border-t flex flex-col sm:flex-row justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setReviewingVariation(null);
                    setVariationReviewNote('');
                  }}
                  disabled={!!submittingVariationReview}
                  className="bg-secondary text-secondary-foreground font-bold px-4 py-2 rounded-xl hover:bg-secondary/80 transition-colors text-xs disabled:opacity-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => handleReviewVariationRequest('rejected')}
                  disabled={!!submittingVariationReview}
                  className="bg-red-600 text-white font-bold px-4 py-2 rounded-xl hover:bg-red-700 transition-colors text-xs disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {submittingVariationReview === 'rejected' ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Rejecting...</> : 'Reject Variation'}
                </button>
                <button
                  type="button"
                  onClick={() => handleReviewVariationRequest('approved')}
                  disabled={!!submittingVariationReview}
                  className="bg-green-600 text-white font-bold px-4 py-2 rounded-xl hover:bg-green-700 transition-colors text-xs disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {submittingVariationReview === 'approved' ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Approving...</> : 'Approve Variation'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {activeInvoice && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4 print:bg-white">
          <div id="print-target-invoice" className="bg-card border border-border w-full max-w-2xl rounded-3xl shadow-2xl p-8 space-y-6 animate-in fade-in zoom-in-95 duration-150 print:border-none print:shadow-none print:p-0">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b pb-4 print:hidden">
              <div>
                <h3 className="text-lg font-black text-foreground">
                  {activeInvoice.invoice_type === 'customer_receipt' ? 'Customer Receipt' : 'Payout Statement'}
                </h3>
                <p className="text-xs text-muted-foreground font-semibold mt-0.5">
                  Document Number: {activeInvoice.invoice_number}
                </p>
              </div>
              <button
                onClick={() => setActiveInvoice(null)}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Invoice Document Body */}
            <div className="space-y-6 text-sm font-semibold text-muted-foreground">
              {/* Branding and Invoice Info */}
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <h2 className="text-2xl font-black text-primary tracking-tight">TradieHubAU</h2>
                  <p className="text-xs font-bold text-muted-foreground">Quality Aussie Trade Marketplace</p>
                </div>
                <div className="text-right space-y-0.5">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Document Number</p>
                  <p className="text-sm font-black text-foreground">{activeInvoice.invoice_number}</p>
                  <p className="text-[10px] text-muted-foreground">Issued: {new Date(activeInvoice.issued_at).toLocaleDateString()}</p>
                </div>
              </div>

              <hr className="border-border" />

              {/* Parties */}
              <div className="grid grid-cols-2 gap-6 text-xs">
                {activeInvoice.invoice_type === 'customer_receipt' ? (
                  <>
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">From (Service Provider)</span>
                      <p className="text-sm font-black text-foreground">{activeInvoice.payee_business_name || activeInvoice.payee_name}</p>
                      {activeInvoice.payee_business_name && (
                        <p className="text-xs text-muted-foreground font-semibold">Contractor: {activeInvoice.payee_name}</p>
                      )}
                      <p className="text-xs text-muted-foreground font-semibold">
                        {activeInvoice.payee_abn ? `ABN: ${activeInvoice.payee_abn}` : 'ABN not recorded for this statement.'}
                      </p>
                      <p className="text-xs text-muted-foreground font-semibold">
                        Location: {[activeInvoice.job_suburb, activeInvoice.job_state].filter(Boolean).join(', ') || 'Australia'}
                      </p>
                      <p className="text-[9px] text-muted-foreground italic mt-1">Facilitated via TradieHubAU</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">To (Customer)</span>
                      <p className="text-sm font-black text-foreground">{activeInvoice.payer_name}</p>
                      <p className="text-xs text-muted-foreground font-semibold">
                        Location: {[activeInvoice.job_suburb, activeInvoice.job_state].filter(Boolean).join(', ') || 'Australia'}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">From (Platform Operator)</span>
                      <p className="text-sm font-black text-foreground">TradieHubAU Pty Ltd</p>
                      <p className="text-xs text-muted-foreground font-semibold">Location: Australia</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Payable To (Contractor)</span>
                      <p className="text-sm font-black text-foreground">{activeInvoice.payee_business_name || activeInvoice.payee_name}</p>
                      {activeInvoice.payee_business_name && (
                        <p className="text-xs text-muted-foreground font-semibold">Contractor: {activeInvoice.payee_name}</p>
                      )}
                      <p className="text-xs text-muted-foreground font-semibold">
                        {activeInvoice.payee_abn ? `ABN: ${activeInvoice.payee_abn}` : 'ABN not recorded for this statement.'}
                      </p>
                      <p className="text-xs text-muted-foreground font-semibold">
                        Location: {[activeInvoice.job_suburb, activeInvoice.job_state].filter(Boolean).join(', ') || 'Australia'}
                      </p>
                      <p className="text-[10px] text-muted-foreground font-semibold mt-1">
                        Related Customer: {activeInvoice.payer_name}
                      </p>
                    </div>
                  </>
                )}
              </div>

              <hr className="border-border" />

              {/* Job Details / Line Items Table */}
              {(() => {
                const lineItems = (activeInvoice.line_items || []) as JobInvoiceLineItem[];
                const acceptedLines = lineItems.filter(line => line.source_type === 'accepted_quote');
                const variationLines = lineItems.filter(line => line.source_type === 'approved_variation');
                const acceptedSubtotal = Number(activeInvoice.accepted_quote_subtotal || 0);
                const variationSubtotal = Number(activeInvoice.approved_variation_subtotal || 0);

                const renderLineRows = (lines: JobInvoiceLineItem[]) => lines.map(line => (
                  <tr key={line.id} className="border-b border-border">
                    <td className="p-3 font-semibold text-foreground align-top">
                      <p className="font-bold">{line.label}</p>
                      {line.description ? (
                        <p className="text-[10px] text-muted-foreground mt-0.5">{line.description}</p>
                      ) : null}
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {formatInvoiceLineType(line.line_type)}
                      </p>
                    </td>
                    <td className="p-3 text-center text-foreground font-semibold align-top">{Number(line.quantity).toLocaleString('en-AU')}</td>
                    <td className="p-3 text-right text-foreground font-semibold font-mono align-top">{formatAud(Number(line.unit_price))}</td>
                    <td className="p-3 text-right text-foreground font-semibold font-mono align-top">{formatAud(Number(line.line_total))}</td>
                  </tr>
                ));

                return (
                  <div className="space-y-3">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Line Items</span>
                      <p className="text-[10px] text-muted-foreground font-semibold">
                        Final document lines are sourced from accepted quote snapshots and customer-approved variation snapshots only.
                      </p>
                    </div>
                    <div className="border border-border rounded-2xl overflow-hidden bg-muted/5">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-muted/10 border-b border-border font-bold text-muted-foreground">
                            <th className="p-3">Description</th>
                            <th className="p-3 text-center w-16">Qty</th>
                            <th className="p-3 text-right w-28">Unit Price</th>
                            <th className="p-3 text-right w-28">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="bg-muted/20 border-b border-border">
                            <td colSpan={4} className="p-3">
                              <p className="text-[10px] uppercase tracking-wider font-black text-muted-foreground">Accepted Quote</p>
                              <p className="text-xs font-bold text-foreground mt-0.5">{activeInvoice.job_title}</p>
                              {activeInvoice.job_categories?.length ? (
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                  Category: {activeInvoice.job_categories.join(', ')}
                                </p>
                              ) : null}
                            </td>
                          </tr>
                          {acceptedLines.length > 0 ? renderLineRows(acceptedLines) : (
                            <tr className="border-b border-border">
                              <td colSpan={4} className="p-3 text-muted-foreground font-semibold italic">
                                Accepted quote line details are not available for this legacy job.
                              </td>
                            </tr>
                          )}
                          <tr className="border-b border-border bg-muted/5 font-mono text-xs">
                            <td colSpan={3} className="p-3 text-right text-muted-foreground font-sans font-semibold">Accepted quote subtotal:</td>
                            <td className="p-3 text-right text-foreground font-semibold">{formatAud(acceptedSubtotal)}</td>
                          </tr>

                          {variationLines.length > 0 ? (
                            <>
                              <tr className="bg-muted/20 border-b border-border">
                                <td colSpan={4} className="p-3 text-[10px] uppercase tracking-wider font-black text-muted-foreground">
                                  Approved Variations
                                </td>
                              </tr>
                              {renderLineRows(variationLines)}
                              <tr className="border-b border-border bg-muted/5 font-mono text-xs">
                                <td colSpan={3} className="p-3 text-right text-muted-foreground font-sans font-semibold">Approved variations subtotal:</td>
                                <td className="p-3 text-right text-foreground font-semibold">{formatAud(variationSubtotal)}</td>
                              </tr>
                            </>
                          ) : null}

                          {activeInvoice.invoice_type === 'tradie_payout_statement' ? (
                            <>
                              <tr className="border-b border-border bg-muted/5 font-mono text-xs">
                                <td colSpan={3} className="p-3 text-right text-muted-foreground font-sans font-semibold">Gross released amount:</td>
                                <td className="p-3 text-right text-foreground font-semibold">
                                  {formatCentsToAud(activeInvoice.amount_cents)}
                                </td>
                              </tr>
                              <tr className="border-b border-border bg-muted/5 font-mono text-xs text-red-500">
                                <td colSpan={3} className="p-3 text-right font-sans font-semibold">Platform Fee deduction:</td>
                                <td className="p-3 text-right font-bold">
                                  -{formatCentsToAud(activeInvoice.platform_fee_cents)}
                                </td>
                              </tr>
                              <tr className="bg-primary/5 font-black text-primary font-mono text-sm">
                                <td colSpan={3} className="p-3 text-right uppercase font-sans">Net Contractor Payout:</td>
                                <td className="p-3 text-right">
                                  {formatCentsToAud(activeInvoice.payout_amount_cents)} AUD
                                </td>
                              </tr>
                            </>
                          ) : (
                            <tr className="bg-primary/5 font-black text-primary font-mono text-sm">
                              <td colSpan={3} className="p-3 text-right uppercase font-sans">Total Paid:</td>
                              <td className="p-3 text-right">
                                {formatCentsToAud(activeInvoice.amount_cents)} AUD
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {/* Payment Reference Details */}
              <div className="bg-muted/5 border border-border rounded-2xl p-4 text-xs space-y-2 font-semibold">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Payment Reference Details</span>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-muted-foreground">
                  <div>
                    <p className="text-[9px] uppercase tracking-wider">Payment Status</p>
                    <p className="text-foreground font-bold mt-0.5">Released / Completed</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wider">Payment Method</p>
                    <p className="text-foreground font-bold mt-0.5">Beta simulated protected payment</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wider">Terms</p>
                    <p className="text-foreground font-bold mt-0.5">Paid via protected payment</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wider">Released Date</p>
                    <p className="text-foreground font-bold mt-0.5">{new Date(activeInvoice.issued_at).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>

              {/* Footer text */}
              <div className="space-y-1.5 text-center text-[10px] text-muted-foreground pt-4 border-t">
                <p>Status: Released / Completed</p>
                <p className="italic">GST/tax invoice support is pending accountant review. This document is a platform payment receipt/statement, not a tax invoice.</p>
                <p>© 2026 TradieHubAU. Protected Payments system.</p>
              </div>
            </div>

            {/* Print and Close controls */}
            <div className="flex justify-end gap-3 pt-4 border-t print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center justify-center gap-1.5 bg-secondary text-secondary-foreground font-bold px-4 py-2.5 rounded-xl hover:bg-secondary/80 text-xs transition"
              >
                Print Document
              </button>
              <button
                type="button"
                onClick={() => setActiveInvoice(null)}
                className="bg-primary text-primary-foreground font-bold px-4 py-2.5 rounded-xl hover:bg-primary/95 text-xs transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Active Jobs Board</h1>
        <p className="text-muted-foreground mt-1">
          Browse job listings posted by customers. Save jobs, or submit quotes directly.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border gap-6 text-sm font-extrabold pb-1">
        <button
          onClick={() => setActiveTab('all')}
          className={`pb-3 transition-colors border-b-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-t-md ${activeTab === 'all' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Open Jobs
        </button>
        <button
          onClick={() => setActiveTab('my_jobs')}
          className={`pb-3 transition-colors border-b-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-t-md ${activeTab === 'my_jobs' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          My Jobs
        </button>
        <button
          onClick={() => setActiveTab('completed_jobs')}
          className={`pb-3 transition-colors border-b-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-t-md ${activeTab === 'completed_jobs' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Completed Jobs
        </button>
      </div>

      {/* Stats Counter Bar */}
      {activeTab !== 'completed_jobs' && (
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 bg-gradient-to-tr from-primary/95 to-amber-700 text-primary-foreground rounded-2xl flex items-center justify-between shadow-md">
            <div className="space-y-1">
              <h3 className="text-3xl font-extrabold">{activeCount}</h3>
              <p className="text-xs font-semibold text-primary-foreground/85 uppercase tracking-wider">Active Jobs</p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-white/10 flex items-center justify-center">
              <Briefcase className="h-6 w-6 text-accent" />
            </div>
          </div>
          <div className="p-6 bg-card border rounded-2xl flex items-center justify-between shadow-sm">
            <div className="space-y-1">
              <h3 className="text-3xl font-extrabold text-foreground">${totalValue.toLocaleString()}</h3>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Job Value</p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <DollarSign className="h-6 w-6" />
            </div>
          </div>
          <div className="p-6 bg-card border rounded-2xl flex items-center justify-between shadow-sm">
            <div className="space-y-1">
              <h3 className="text-3xl font-extrabold text-foreground">{urgentCount}</h3>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Urgent Requests</p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6" />
            </div>
          </div>
        </section>
      )}

      {/* Filter + Content Layout */}
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Sidebar — Desktop */}
        {activeTab !== 'completed_jobs' && (
          <aside className="hidden lg:block w-1/4 bg-card border p-6 rounded-2xl sticky top-24">
            <SidebarFilters />
          </aside>
        )}

        {/* Content Area */}
        <div className="flex-1 w-full space-y-6">
          {/* Toolbar */}
          <div className="bg-card border p-4 rounded-xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-foreground">{sortedJobs.length}</span>
              <span className="text-sm text-muted-foreground font-semibold">jobs found</span>
            </div>
            {activeTab === 'completed_jobs' && (
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search completed jobs..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border rounded-xl bg-background outline-none text-sm focus:border-primary/50 transition-all font-medium"
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              {activeTab !== 'completed_jobs' && (
                <button onClick={() => setMobileFiltersOpen(true)}
                  className="lg:hidden p-2 border rounded-xl hover:bg-muted text-muted-foreground flex items-center gap-1.5 text-xs font-bold">
                  <SlidersHorizontal className="h-4 w-4" /> Filters
                </button>
              )}
              {activeTab === 'all' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-foreground/75 whitespace-nowrap">Sort by:</span>
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                    className="px-3 py-2 border rounded-xl bg-background outline-none text-xs font-bold text-foreground/80 focus:border-primary/50 cursor-pointer">
                    <option value="recent">Most Recent</option>
                    <option value="highest">Highest Budget</option>
                    <option value="urgent">Urgent First</option>
                  </select>
                </div>
              )}
              <button onClick={() => { void loadJobs(); }} className="p-2 border rounded-xl hover:bg-muted text-muted-foreground" title="Refresh jobs">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Auth nudge for logged-out users */}
          {!user && (
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-between gap-4 text-sm font-semibold">
              <span className="text-muted-foreground">Sign in to save jobs and submit applications.</span>
              <Link to="/login" className="bg-primary text-primary-foreground px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-primary/95 transition-colors shadow-sm whitespace-nowrap">
                Sign In
              </Link>
            </div>
          )}

          {/* Verification nudge for unverified users */}
          {activeTab === 'all' && user && !isVerifiedTradie && (
            <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm font-semibold">
              <span className="text-muted-foreground">You are logged in as a Customer. To quote or apply on jobs, please submit your trade verification details.</span>
              <Link to="/profile" className="bg-amber-500 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-amber-600 transition-colors shadow-sm whitespace-nowrap">
                Apply to be a Tradie
              </Link>
            </div>
          )}

          {/* Loading / Error / Empty / Guest My Jobs */}
          {(activeTab === 'my_jobs' || activeTab === 'completed_jobs') && !user ? (
            <div className="p-12 bg-card border rounded-2xl text-center space-y-4 max-w-md mx-auto w-full">
              <Lock className="h-12 w-12 text-primary mx-auto" />
              <h3 className="text-xl font-bold text-foreground">Sign in to view {activeTab === 'completed_jobs' ? 'Completed Jobs' : 'My Jobs'}</h3>
              <p className="text-sm text-foreground/75 leading-relaxed">
                Track your posted jobs, active quotes, variations, and payouts by signing in to your account.
              </p>
              <Link to="/login" className="inline-block bg-primary text-primary-foreground font-bold px-6 py-2.5 rounded-xl hover:bg-primary/95 transition-all shadow-md text-sm active:scale-95">
                Sign In
              </Link>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center p-12 bg-card border rounded-2xl gap-4">
              <RefreshCw className="h-8 w-8 text-primary animate-spin" />
              <p className="text-sm font-semibold text-muted-foreground">Connecting to Supabase...</p>
            </div>
          ) : error ? (
            <div className="p-8 bg-red-500/10 border border-red-500/20 text-red-500 rounded-2xl text-center space-y-4">
              <AlertTriangle className="h-10 w-10 mx-auto" />
              <h3 className="text-lg font-bold">Failed to load jobs</h3>
              <p className="text-sm font-medium">{error}</p>
              <button onClick={() => { void loadJobs(); }} className="bg-red-500 text-white font-semibold px-4 py-2 rounded-xl text-xs hover:bg-red-600 transition-colors">
                Try Again
              </button>
            </div>
          ) : sortedJobs.length === 0 ? (
            <div className="p-12 bg-card border rounded-2xl text-center space-y-4">
              <Briefcase className="h-12 w-12 text-muted-foreground/30 mx-auto" />
              <h3 className="text-xl font-bold text-foreground">
                {activeTab === 'completed_jobs' ? 'No completed jobs yet' : 'No jobs matching filters'}
              </h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                {activeTab === 'completed_jobs'
                  ? 'Completed jobs will appear here after work is approved and payment is released.'
                  : 'Try modifying your trade category, selecting a different state, or clearing filters.'}
              </p>
              {activeTab !== 'completed_jobs' && (
                <button onClick={clearAllFilters} className="bg-primary text-primary-foreground font-semibold px-5 py-2.5 rounded-xl text-sm shadow-md hover:bg-primary/95">
                  Clear All Filters
                </button>
              )}
            </div>
          ) : (
            /* Job Listings */
            <div className="grid grid-cols-1 gap-4">
              {sortedJobs.map((job) => {
                const isSaved = savedJobIds.has(job.id);
                const isSaving = savingId === job.id;
                const hasApplied = myApplications.has(job.id) && myApplications.get(job.id)?.status !== 'withdrawn';
                const isCompactCard = activeTab !== 'all';
                const completedAt = getCompletedDate(job);

                return (
                  <div
                    key={job.id}
                    className={`${isCompactCard ? 'p-4 gap-4' : 'p-6 gap-6'} bg-card border border-border rounded-2xl hover:shadow-md transition-all flex flex-col md:flex-row md:items-start justify-between`}
                  >
                    <div className={`${isCompactCard ? 'space-y-2.5' : 'space-y-4'} flex-grow min-w-0`}>
                      {/* Category + Urgency badges */}
                      <div className="flex flex-wrap items-center gap-2">
                        {job.categories.map((cat) => (
                          <span key={cat} className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md bg-primary/15 text-primary uppercase tracking-wider">
                            {cat}
                          </span>
                        ))}
                        {job.urgency && (
                          <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                            job.urgency === 'urgent' ? 'bg-red-500/10 text-red-500' :
                            job.urgency === 'week' ? 'bg-amber-500/10 text-amber-500' : 'bg-green-500/10 text-green-500'
                          }`}>
                            {job.urgency}
                          </span>
                        )}
                        {hasApplied && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-green-500/10 text-green-600 uppercase tracking-wider">
                            <CheckCircle className="h-3 w-3" /> Applied
                          </span>
                        )}
                        {job.status === 'accepted' && (
                          <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-900 uppercase tracking-wider border border-amber-500/30">
                            Quote Accepted — Awaiting Payment
                          </span>
                        )}
                        {job.status === 'payment_held' && (
                          <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-md bg-green-500/10 text-green-800 uppercase tracking-wider border border-green-500/30">
                            Payment Funded — Contract Active
                          </span>
                        )}
                        {job.status === 'completed_pending_review' && (
                          <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-800 uppercase tracking-wider border border-blue-500/30">
                            Under Review
                          </span>
                        )}
                        {job.status === 'disputed' && (
                          <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-md bg-red-500/10 text-red-800 uppercase tracking-wider border border-red-500/30">
                            Disputed
                          </span>
                        )}
                        {job.status === 'completed' && (
                          <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-800 uppercase tracking-wider border border-emerald-500/30">
                            Completed & Released
                          </span>
                        )}
                        {job.status === 'cancelled' && (
                          <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-md bg-gray-500/10 text-gray-800 uppercase tracking-wider border border-gray-500/30">
                            Cancelled
                          </span>
                        )}
                      </div>

                      <div className="space-y-1">
                        <h3
                          onClick={() => setSelectedJob(job)}
                          className={`${isCompactCard ? 'text-base' : 'text-xl'} font-extrabold text-foreground hover:text-primary cursor-pointer transition-colors leading-snug truncate`}
                        >
                          {job.title}
                        </h3>
                        {activeTab !== 'completed_jobs' && (
                          <p className={`${isCompactCard ? 'text-xs line-clamp-1' : 'text-sm line-clamp-2'} text-muted-foreground leading-relaxed`}>{job.description}</p>
                        )}
                      </div>

                      <div className={`${isCompactCard ? 'gap-x-4 gap-y-1.5 border-t pt-2.5' : 'gap-x-6 gap-y-2 border-t pt-4'} flex flex-wrap items-center text-xs text-muted-foreground font-semibold`}>
                        <span className="flex items-center"><MapPin className="mr-1.5 h-3.5 w-3.5" />{getPublicJobLocation(job)}</span>
                        <span className="flex items-center"><DollarSign className="mr-1.5 h-3.5 w-3.5" />{formatBudget(job)}</span>
                        {job.workspace_image_count > 0 && (
                          <span className="flex items-center"><ImageIcon className="mr-1.5 h-3.5 w-3.5" />Photos attached</span>
                        )}
                        <span className="flex items-center"><Clock className="mr-1.5 h-3.5 w-3.5" />{formatDate(job.created_at)}</span>
                        {activeTab === 'completed_jobs' && (
                          <span className="flex items-center"><CheckCircle className="mr-1.5 h-3.5 w-3.5" />Completed {new Date(completedAt).toLocaleDateString()}</span>
                        )}
                        {job.customer?.display_name && (
                          <span className="flex items-center"><User className="mr-1.5 h-3.5 w-3.5" />By {job.customer.display_name}</span>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className={`shrink-0 flex w-full md:w-auto flex-col ${isCompactCard ? 'md:flex-row md:self-start md:flex-wrap md:justify-end' : 'md:flex-col md:self-center'} items-stretch md:items-center gap-2`}>
                      {/* Save button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!user) {
                            showToast("Please sign in to save jobs.", 'error');
                            return;
                          }
                          handleToggleSave(job.id, e);
                        }}
                        disabled={isSaving}
                        title={isSaved ? 'Unsave job' : 'Save job'}
                        className={`${isCompactCard ? 'p-2' : 'p-2.5'} rounded-xl border transition-all self-start md:self-auto ${
                          isSaved
                            ? 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/15'
                            : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                        } ${isSaving ? 'opacity-50 cursor-wait' : ''}`}
                      >
                        {isSaving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : isSaved ? (
                          <BookmarkCheck className="h-4 w-4" />
                        ) : (
                          <Bookmark className="h-4 w-4" />
                        )}
                      </button>

                      <button
                        onClick={() => setSelectedJob(job)}
                        className={`${isCompactCard ? 'text-xs px-3 py-2' : 'text-sm px-4 py-2.5'} w-full md:w-auto bg-secondary text-secondary-foreground font-bold rounded-xl hover:bg-secondary/80 transition-all text-center whitespace-normal md:whitespace-nowrap`}
                      >
                        Details
                      </button>

                      {activeTab !== 'all' && canMessageJob(job) && (
                        <Link
                          to={`/messages?job=${job.id}`}
                          className={`${isCompactCard ? 'text-xs px-3 py-2' : 'text-sm px-4 py-2.5'} inline-flex w-full md:w-auto items-center justify-center gap-1.5 rounded-xl border border-primary/25 bg-primary/5 font-bold text-primary transition-colors hover:bg-primary/10 text-center whitespace-normal md:whitespace-nowrap`}
                        >
                          <MessageSquare className="h-4 w-4" /> Message
                        </Link>
                      )}

                      {job.status === 'open' ? (
                        user ? (
                          (() => {
                            const isOwner = job.customer_id === user.id;
                            if (isOwner) {
                              return (
                                <button
                                  disabled
                                  className="w-full md:w-auto text-sm font-bold px-4 py-2.5 rounded-xl bg-gray-100 text-gray-500 border border-gray-200 cursor-default text-center whitespace-normal md:whitespace-nowrap"
                                >
                                  You can't quote on your own job.
                                </button>
                              );
                            }

                            // Customers cannot apply to jobs
                            if (profile?.role === 'customer') {
                              return null;
                            }

                            const app = myApplications.get(job.id);
                            const isApplied = app && app.status !== 'withdrawn';
                            if (isApplied) {
                              return (
                                <button
                                  disabled
                                  className="w-full md:w-auto text-sm font-bold px-4 py-2.5 rounded-xl bg-green-500/10 text-green-600 border border-green-500/20 cursor-default text-center whitespace-normal md:whitespace-nowrap"
                                >
                                  Applied ✓
                                </button>
                              );
                            }

                            return (
                              <button
                                onClick={() => {
                                  const now = new Date();
                                  const isAppRestricted = profile?.application_restricted_until && new Date(profile.application_restricted_until) > now;
                                  const isQuoteRestricted = profile?.quote_restricted_until && new Date(profile.quote_restricted_until) > now;
                                  const isAccountHold = profile?.account_review_hold_until && new Date(profile.account_review_hold_until) > now;

                                  if (isAppRestricted || isQuoteRestricted || isAccountHold) {
                                    showToast("Your account is under admin review and cannot submit new quotes right now.", 'error');
                                    return;
                                  }
                                  if (!isVerifiedTradie) {
                                    showToast("Verification Required: Only verified tradies can quote on jobs. Please visit your Profile to submit your verification details.", 'error');
                                    return;
                                  }
                                  handleOpenApply(job);
                                }}
                                className={`w-full md:w-auto text-sm font-bold px-4 py-2.5 rounded-xl transition-all shadow-md active:scale-95 text-center whitespace-normal md:whitespace-nowrap ${
                                  !isVerifiedTradie
                                    ? 'bg-muted text-muted-foreground border border-border cursor-not-allowed'
                                    : 'bg-primary text-primary-foreground hover:bg-primary/95'
                                }`}
                              >
                                Apply
                              </button>
                            );
                          })()
                        ) : (
                          <Link
                            to="/login"
                            className="w-full md:w-auto bg-primary text-primary-foreground text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-primary/95 transition-all shadow-md text-center whitespace-normal md:whitespace-nowrap"
                          >
                            Apply
                          </Link>
                        )
                      ) : (
                        user ? (
                          (() => {
                            const isOwner = job.customer_id === user.id;
                            const app = myApplications.get(job.id);
                            const isAcceptedTradie = app && app.status === 'accepted';

                            if (isOwner) {
                              if (job.status === 'accepted') {
                                return (
                                  <button
                                    disabled
                                    className="w-full md:w-auto text-sm font-bold px-4 py-2.5 rounded-xl bg-amber-500 text-amber-950 cursor-default text-center whitespace-normal md:whitespace-nowrap"
                                  >
                                    Accepted — Awaiting Payment
                                  </button>
                                );
                              }
                              if (job.status === 'completed_pending_review') {
                                return (
                                  <button
                                    onClick={() => setReviewModalJob(job)}
                                    className="w-full md:w-auto text-sm font-bold px-4 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/95 transition-all shadow-md active:scale-95 text-center whitespace-normal md:whitespace-nowrap"
                                  >
                                    Review Completion
                                  </button>
                                );
                              }
                              if (['payment_held', 'disputed'].includes(job.status)) {
                                return (
                                  <button
                                    disabled
                                    className="w-full md:w-auto text-sm font-bold px-4 py-2.5 rounded-xl bg-green-600 text-white cursor-default text-center whitespace-normal md:whitespace-nowrap"
                                  >
                                    Contract Active
                                  </button>
                                );
                              }
                              if (job.status === 'completed') {
                                return (
                                  <div className="flex flex-col gap-2 w-full md:w-auto">
                                    <button
                                      disabled={invoiceModalLoading}
                                      onClick={() => setTradieReviewModalJob(job)}
                                      className="text-sm font-bold px-4 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/95 transition-all shadow-md active:scale-95 whitespace-normal md:whitespace-nowrap w-full text-center disabled:opacity-50"
                                    >
                                      Leave Review
                                    </button>
                                    <button
                                      type="button"
                                      disabled={invoiceModalLoading}
                                      onClick={() => handleOpenInvoice(job.id, 'customer_receipt', job.status)}
                                      className="text-sm font-bold px-4 py-2.5 rounded-xl bg-secondary text-secondary-foreground border border-border hover:bg-secondary/80 transition-all shadow-sm active:scale-95 whitespace-normal md:whitespace-nowrap w-full text-center disabled:opacity-50"
                                    >
                                      {invoiceModalLoading ? 'Loading...' : 'View Receipt'}
                                    </button>
                                  </div>
                                );
                              }
                            } else {
                              if (isAcceptedTradie) {
                                if (job.status === 'accepted') {
                                  return (
                                    <button
                                      disabled
                                      className="w-full md:w-auto text-sm font-bold px-4 py-2.5 rounded-xl bg-amber-500 text-amber-950 cursor-default text-center whitespace-normal md:whitespace-nowrap"
                                    >
                                      Accepted — Awaiting Payment
                                    </button>
                                  );
                                }
                                if (job.status === 'payment_held') {
                                  return (
                                    <button
                                      onClick={() => setCompletionModalJob(job)}
                                      className="w-full md:w-auto text-sm font-bold px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white transition-all shadow-md active:scale-95 text-center whitespace-normal md:whitespace-nowrap"
                                    >
                                      Submit Completion
                                    </button>
                                  );
                                }
                                if (['completed_pending_review', 'disputed'].includes(job.status)) {
                                  return (
                                    <button
                                      disabled
                                      className="w-full md:w-auto text-sm font-bold px-4 py-2.5 rounded-xl bg-green-600 text-white cursor-default text-center whitespace-normal md:whitespace-nowrap"
                                    >
                                      Contract Active
                                    </button>
                                  );
                                }
                                if (job.status === 'completed') {
                                  return (
                                    <button
                                      type="button"
                                      disabled={invoiceModalLoading}
                                      onClick={() => handleOpenInvoice(job.id, 'tradie_payout_statement', job.status)}
                                      className="w-full md:w-auto text-sm font-bold px-4 py-2.5 rounded-xl bg-secondary text-secondary-foreground border border-border hover:bg-secondary/80 transition-all shadow-sm active:scale-95 text-center whitespace-normal md:whitespace-nowrap disabled:opacity-50"
                                    >
                                      {invoiceModalLoading ? 'Loading...' : 'View Payout Statement'}
                                    </button>
                                  );
                                }
                              }
                            }
                            return (
                              <button
                                disabled
                                className="w-full md:w-auto text-sm font-bold px-4 py-2.5 rounded-xl bg-gray-200 text-gray-600 cursor-default text-center whitespace-normal md:whitespace-nowrap"
                              >
                                Closed
                              </button>
                            );
                          })()
                        ) : (
                          <button
                            disabled
                            className="w-full md:w-auto text-sm font-bold px-4 py-2.5 rounded-xl bg-gray-200 text-gray-400 cursor-default text-center whitespace-normal md:whitespace-nowrap"
                          >
                            Closed
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Mobile Filters Drawer */}
      {mobileFiltersOpen && activeTab !== 'completed_jobs' && (
        <div className="fixed inset-0 z-50 lg:hidden bg-background/95 backdrop-blur-md pt-20 px-6 overflow-y-auto pb-8 space-y-6">
          <div className="flex items-center justify-between border-b pb-4">
            <h3 className="font-extrabold text-xl text-foreground flex items-center gap-2">
              <Filter className="h-5 w-5 text-primary" /> Filters
            </h3>
            <button onClick={() => setMobileFiltersOpen(false)} className="p-2 text-muted-foreground hover:text-foreground rounded-lg">
              <X className="h-6 w-6" />
            </button>
          </div>
          <SidebarFilters mobile />
          <div className="flex gap-4 pt-4">
            <button onClick={clearAllFilters} className="flex-1 bg-secondary text-secondary-foreground font-bold py-3 rounded-xl text-sm">Clear All</button>
            <button onClick={() => setMobileFiltersOpen(false)} className="flex-1 bg-primary text-primary-foreground font-bold py-3 rounded-xl text-sm shadow-md">Apply</button>
          </div>
        </div>
      )}

      {/* Job Detail Modal */}
      {selectedJob && (
        <div 
          onClick={() => setSelectedJob(null)}
          className="fixed inset-x-0 bottom-0 top-16 bg-background/80 backdrop-blur-sm z-30 flex items-center justify-center p-2 sm:p-4"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-card border border-border w-full max-w-3xl rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden max-h-[calc(94vh-4rem)] sm:max-h-[calc(90vh-4rem)]"
          >
            <div className="p-4 sm:p-6 border-b flex items-start justify-between gap-3 sm:gap-4">
              <div className="space-y-2 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {selectedJob.categories.map((cat) => (
                    <span key={cat} className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded bg-primary/10 text-primary uppercase">{cat}</span>
                  ))}
                  {selectedJob.urgency && (
                    <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded bg-secondary text-secondary-foreground uppercase">
                      {selectedJob.urgency}
                    </span>
                  )}
                </div>
                <h3 className="text-xl sm:text-2xl font-extrabold text-foreground leading-tight break-words">{selectedJob.title}</h3>
              </div>
              <button onClick={() => setSelectedJob(null)} className="p-2 rounded-xl border hover:bg-muted text-muted-foreground hover:text-foreground transition-all shrink-0">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto overflow-x-hidden space-y-5 sm:space-y-6 flex-1 text-sm font-medium">
              {usesJobDetailTabs(selectedJob) && (() => {
                const requestsNeedAction = earlyReleaseRequests.some(req => req.status === 'pending') || jobVariations.some(v => v.status === 'pending');
                const evidenceNeedAction = selectedJob.status === 'completed_pending_review';
                const tabs: Array<{ id: JobDetailTab; label: string; alert?: boolean }> = [
                  { id: 'overview', label: 'Overview' },
                  { id: 'contract', label: 'Contract' },
                  { id: 'requests', label: 'Requests', alert: requestsNeedAction },
                  { id: 'evidence', label: 'Evidence', alert: evidenceNeedAction }
                ];

                return (
                  <div className="-mx-1 max-w-full overflow-x-auto overflow-y-hidden border-b border-border">
                    <div className="flex min-w-max gap-5 px-1">
                      {tabs.map(tab => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setActiveJobDetailTab(tab.id)}
                          className={`relative border-b-2 pb-3 text-xs font-extrabold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-t-md ${
                            activeJobDetailTab === tab.id
                              ? 'border-primary text-primary'
                              : 'border-transparent text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {tab.label}
                          {tab.alert && (
                            <span className="absolute -right-2 top-0 h-2 w-2 rounded-full bg-amber-500" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {(!usesJobDetailTabs(selectedJob) || activeJobDetailTab === 'overview') && (
                <>
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-foreground/80 uppercase tracking-wider">Job Description</h4>
                <p className="text-foreground/90 leading-relaxed font-medium whitespace-pre-wrap">{selectedJob.description}</p>
              </div>
              {selectedJob.workspace_image_count > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-foreground/80 uppercase tracking-wider">Workspace Photos</h4>
                  {workspaceImageError ? (
                    <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs font-semibold text-amber-800">{workspaceImageError}</p>
                  ) : workspaceImageUrls.length === 0 ? (
                    <p className="rounded-xl border bg-muted/20 p-3 text-xs font-semibold text-muted-foreground">
                      Photos are attached. They are only visible to the job owner and accepted tradie.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {workspaceImageUrls.map(url => (
                        <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl border bg-background">
                          <img src={url} alt="Workspace attachment" className="aspect-square w-full object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6 bg-muted/20 border p-4 sm:p-5 rounded-2xl">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-foreground/70 uppercase tracking-wider">Location</span>
                  <p className="text-sm font-bold text-foreground flex items-center gap-1.5 mt-0.5"><MapPin className="h-4 w-4 text-foreground/60" />{getPublicJobLocation(selectedJob)}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-bold text-foreground/70 uppercase tracking-wider">Est. Budget</span>
                  <p className="text-sm font-bold text-foreground flex items-center gap-1.5 mt-0.5"><DollarSign className="h-4 w-4 text-foreground/60" />{formatBudget(selectedJob)}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-bold text-foreground/70 uppercase tracking-wider">Job Type</span>
                  <p className="text-sm font-bold text-foreground flex items-center gap-1.5 mt-0.5"><Briefcase className="h-4 w-4 text-foreground/60" />{selectedJob.type || 'Standard'}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-bold text-foreground/70 uppercase tracking-wider">Timeline</span>
                  <p className="text-sm font-bold text-foreground flex items-center gap-1.5 mt-0.5"><Clock className="h-4 w-4 text-foreground/60" />{selectedJob.timeline || 'Flexible'}</p>
                </div>
              </div>
              {selectedJob.customer && (
                <div className="border-t pt-6 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground font-extrabold text-sm border">
                    {selectedJob.customer.display_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h5 className="font-bold text-foreground">{selectedJob.customer.display_name}</h5>
                    <p className="text-xs text-muted-foreground">Job Poster • {selectedJob.customer.suburb || 'Australia'}</p>
                  </div>
                </div>
              )}
                </>
              )}

              {/* Lifecycle Section */}
              {user && (
                <div className="border-t pt-4 sm:pt-6 space-y-4 sm:space-y-6">
                  {loadingLifecycle ? (
                    <div className="flex justify-center p-4">
                      <Loader2 className="h-6 w-6 text-primary animate-spin" />
                    </div>
                  ) : (
                    <>
                      {(!usesJobDetailTabs(selectedJob) || activeJobDetailTab === 'overview') && selectedJob.customer_id === user.id && ['accepted', 'payment_held', 'completed_pending_review', 'disputed', 'completed'].includes(selectedJob.status) && (
                        <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4 sm:p-5 space-y-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider ${getContractStatusClasses(selectedJob.status)}`}>
                                  {getContractStatusLabel(selectedJob.status)}
                                </span>
                                {selectedJob.categories.slice(0, 2).map((cat) => (
                                  <span key={cat} className="inline-flex items-center rounded-md bg-background/80 px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                                    {cat}
                                  </span>
                                ))}
                              </div>
                              <h4 className="text-lg font-extrabold leading-snug text-foreground break-words">{selectedJob.title}</h4>
                              <p className="text-sm font-semibold leading-relaxed text-foreground/75">
                                {getContractStatusCopy(selectedJob.status)}
                              </p>
                            </div>

                            {canMessageJob(selectedJob) && (
                              <Link
                                to={`/messages?job=${selectedJob.id}`}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-extrabold text-primary-foreground shadow-sm transition-colors hover:bg-primary/95 sm:w-auto sm:shrink-0"
                              >
                                <MessageSquare className="h-4 w-4" /> Open Job Messages
                              </Link>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <div className="rounded-xl border bg-background/80 p-3 min-w-0">
                              <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Location</span>
                              <span className="mt-1 block truncate text-xs font-extrabold text-foreground">{getPublicJobLocation(selectedJob)}</span>
                            </div>
                            <div className="rounded-xl border bg-background/80 p-3 min-w-0">
                              <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Budget</span>
                              <span className="mt-1 block truncate text-xs font-extrabold text-foreground">{formatBudget(selectedJob)}</span>
                            </div>
                            <div className="rounded-xl border bg-background/80 p-3 min-w-0">
                              <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Type</span>
                              <span className="mt-1 block truncate text-xs font-extrabold text-foreground">{selectedJob.type || 'Standard'}</span>
                            </div>
                            <div className="rounded-xl border bg-background/80 p-3 min-w-0">
                              <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Timeline</span>
                              <span className="mt-1 block truncate text-xs font-extrabold text-foreground">{selectedJob.timeline || 'Flexible'}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {(!usesJobDetailTabs(selectedJob) || activeJobDetailTab === 'overview') && canMessageJob(selectedJob) && !(selectedJob.customer_id === user.id && ['accepted', 'payment_held', 'completed_pending_review', 'disputed', 'completed'].includes(selectedJob.status)) && (
                        <Link
                          to={`/messages?job=${selectedJob.id}`}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm font-extrabold text-primary transition-colors hover:bg-primary/10"
                        >
                          <MessageSquare className="h-4 w-4" /> Open Job Messages
                        </Link>
                      )}

                      {lifecycleError && (
                        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold flex items-start gap-2.5">
                          <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                          <span>{lifecycleError}</span>
                        </div>
                      )}

                      {/* Contact Details Card */}
                      {(!usesJobDetailTabs(selectedJob) || activeJobDetailTab === 'overview') && (() => {
                        const isCustomerOwner = selectedJob.customer_id === user?.id;
                        const isContractedTradie = jobPayment && jobPayment.payee_id === user?.id;
                        if (!isCustomerOwner && !isContractedTradie) return null;

                        const otherUser = isCustomerOwner ? jobPayment?.payee : (isContractedTradie ? jobPayment?.payer : null);
                        
                        return (
                          <div className="space-y-4">
                            <h4 className="text-sm font-bold text-foreground/80 uppercase tracking-wider">Contact Information</h4>
                            {['payment_held', 'completed_pending_review', 'disputed', 'completed'].includes(selectedJob.status) ? (
                              <div className="p-4 border border-primary/20 bg-primary/5 rounded-2xl space-y-2.5">
                                <h4 className="text-sm font-extrabold text-foreground flex items-center gap-2">
                                  <User className="h-5 w-5 text-primary" /> Contact Details Unlocked
                                </h4>
                                <div className="space-y-2 text-sm text-foreground/85 pl-7 font-medium">
                                  <p className="flex items-center gap-2">
                                    <Mail className="h-4 w-4 text-foreground/60" />
                                    <span className="text-foreground select-all">{otherUser?.email || 'No email provided'}</span>
                                  </p>
                                  <p className="flex items-center gap-2">
                                    <Phone className="h-4 w-4 text-foreground/60" />
                                    <span className="text-foreground select-all">{otherUser?.phone || 'No phone provided'}</span>
                                  </p>
                                </div>
                              </div>
                            ) : (
                              <div className="p-4 border border-amber-500/20 bg-amber-500/5 rounded-2xl space-y-2">
                                <h4 className="text-sm font-extrabold text-amber-800 flex items-center gap-2">
                                  <Lock className="h-5 w-5 text-amber-600" /> Contact Details Locked
                                </h4>
                                <p className="text-sm text-foreground/75 leading-relaxed pl-7 font-medium">
                                  Contact details (email and phone number) will be unlocked here once the customer has funded the secure job payment.
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Completion Proof Details Card */}
                      {(!usesJobDetailTabs(selectedJob) || activeJobDetailTab === 'evidence') && (() => {
                        const isCustomerOwner = selectedJob.customer_id === user?.id;
                        const isContractedTradie = jobPayment && jobPayment.payee_id === user?.id;
                        if ((isCustomerOwner || isContractedTradie) && jobProofs.length > 0) {
                          return (
                            <div className="space-y-4">
                              <h4 className="text-sm font-bold text-foreground/80 uppercase tracking-wider">Completion Proof Submission</h4>
                              <div className="p-4 bg-muted/20 border rounded-2xl space-y-3">
                                <p className="text-xs font-bold text-foreground/70 uppercase tracking-wider">Submitted by Tradie:</p>
                                <p className="text-sm text-foreground/90 leading-relaxed italic font-medium bg-background border p-3 rounded-xl">"{jobProofs[0].description}"</p>
                                
                                <ReviewCountdown deadline={jobProofs[0].auto_release_at} />
                                
                                {proofImageUrls.length > 0 && (
                                  <div className="space-y-2 pt-1">
                                    <p className="text-xs font-bold text-foreground/70 uppercase tracking-wider">Attached Proof Photos:</p>
                                    <div className="flex flex-wrap gap-2">
                                      {proofImageUrls.map((url, idx) => (
                                        <a
                                          key={idx}
                                          href={url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="relative h-20 w-20 border rounded-xl overflow-hidden hover:opacity-85 transition-all shadow-sm flex items-center justify-center bg-background"
                                        >
                                          <img src={url} alt={`Proof ${idx + 1}`} className="h-full w-full object-cover" />
                                        </a>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                <p className="text-xs font-semibold text-foreground/60 border-t pt-2 mt-2">
                                  Auto-release deadline: {new Date(jobProofs[0].auto_release_at).toLocaleString()}
                                </p>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      })()}

                      {/* 1. Protected Payment Status Bar / Steps */}
                      {(!usesJobDetailTabs(selectedJob) || ['contract', 'requests'].includes(activeJobDetailTab)) && selectedJob.status !== 'open' && selectedJob.status !== 'cancelled' && jobPayment && (() => {
                        const isCustomerOwner = selectedJob.customer_id === user?.id;
                        const isContractedTradie = jobPayment && jobPayment.payee_id === user?.id;
                        return (
                          <div className="space-y-3 sm:space-y-4">
                            {(!usesJobDetailTabs(selectedJob) || activeJobDetailTab === 'contract') && (
                              <>
                            <h4 className="text-xs sm:text-sm font-black text-foreground/80 uppercase tracking-wider">Protected Payment Status</h4>

                          <div className="grid grid-cols-2 gap-1.5 text-center text-[11px] font-bold sm:grid-cols-4 sm:gap-2 sm:text-xs">
                            <div className={`rounded-xl border p-2 ${['accepted', 'payment_held', 'completed_pending_review', 'disputed', 'completed'].includes(selectedJob.status) ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-muted border-transparent text-muted-foreground'}`}>
                              1. Accepted
                            </div>
                            <div className={`rounded-xl border p-2 ${['payment_held', 'completed_pending_review', 'disputed', 'completed'].includes(selectedJob.status) ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-muted border-transparent text-muted-foreground'}`}>
                              2. Funded
                            </div>
                            <div className={`rounded-xl border p-2 ${['completed_pending_review', 'disputed', 'completed'].includes(selectedJob.status) ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-muted border-transparent text-muted-foreground'}`}>
                              3. Review
                            </div>
                            <div className={`rounded-xl border p-2 ${['completed'].includes(selectedJob.status) ? 'bg-green-500/10 border-green-500/30 text-green-600' : 'bg-muted border-transparent text-muted-foreground'}`}>
                              4. Released
                            </div>
                          </div>

                          {/* Informative Status Banners */}
                          {user && !isCustomerOwner && (
                            <div className="space-y-4">
                              {/* 1. Contracted Tradie Banners */}
                              {jobPayment.payee_id === user.id && (
                                <>
                                  {selectedJob.status === 'accepted' && (
                                    <div className="p-3 sm:p-4 border border-amber-500/20 bg-amber-500/5 rounded-xl sm:rounded-2xl space-y-1.5 sm:space-y-2">
                                      <h4 className="text-sm font-extrabold text-amber-800 flex items-start gap-2">
                                        <Clock className="h-5 w-5 shrink-0 text-amber-600" /> Protected Payment Pending
                                      </h4>
                                      <p className="text-xs sm:text-sm text-foreground/75 leading-relaxed font-medium">
                                        Your quote has been accepted! Please wait for the customer to fund the contract. You will be authorized to start work once the secure job payment is funded. Do not begin work until payment is funded.
                                      </p>
                                    </div>
                                  )}
                                  {selectedJob.status === 'payment_held' && (
                                    <div className="p-3 sm:p-4 border border-green-500/25 bg-green-500/10 rounded-xl sm:rounded-2xl space-y-1.5 sm:space-y-2">
                                      <h4 className="text-sm font-extrabold text-green-800 flex items-start gap-2">
                                        <CheckCircle className="h-5 w-5 shrink-0 text-green-600" /> Contract Active (Payment Funded)
                                      </h4>
                                      <p className="text-xs sm:text-sm text-foreground/80 leading-relaxed font-medium">
                                        The secure job payment has been funded by the customer and is held until completion. You are authorized to begin work! Submit your completion proof below when the job is done.
                                      </p>
                                    </div>
                                  )}
                                  {selectedJob.status === 'completed_pending_review' && (
                                    <div className="p-3 sm:p-4 border border-blue-500/25 bg-blue-500/10 rounded-xl sm:rounded-2xl space-y-1.5 sm:space-y-2">
                                      <h4 className="text-sm font-extrabold text-blue-800 flex items-start gap-2">
                                        <Clock className="h-5 w-5 shrink-0 text-blue-600" /> Completion Under Review
                                      </h4>
                                      <p className="text-xs sm:text-sm text-foreground/80 leading-relaxed font-medium">
                                        You have submitted completion proof. The customer has been notified and has 72 hours to review the work and release the payment. If no action is taken, funds will auto-release.
                                      </p>
                                    </div>
                                  )}
                                  {selectedJob.status === 'completed' && (
                                    <div className="p-3 sm:p-4 border border-emerald-500/25 bg-emerald-500/10 rounded-xl sm:rounded-2xl space-y-1.5 sm:space-y-2">
                                      <h4 className="text-sm font-extrabold text-emerald-800 flex items-start gap-2">
                                        <CheckCircle className="h-5 w-5 shrink-0 text-emerald-600" /> Payment Released
                                      </h4>
                                      <p className="text-xs sm:text-sm text-foreground/80 leading-relaxed font-medium">
                                        The secure job payment has been successfully released to your account. Thank you for completing this work on TradieHubAU!
                                      </p>
                                    </div>
                                  )}
                                </>
                              )}

                              {/* 2. Customer Banners */}
                              {selectedJob.customer_id === user.id && (
                                <>
                                  {selectedJob.status === 'payment_held' && (
                                    <div className="p-3 sm:p-4 border border-green-500/25 bg-green-500/10 rounded-xl sm:rounded-2xl space-y-1.5 sm:space-y-2">
                                      <h4 className="text-sm font-extrabold text-green-800 flex items-start gap-2">
                                        <CheckCircle className="h-5 w-5 shrink-0 text-green-600" /> Contract Active (Payment Funded)
                                      </h4>
                                      <p className="text-xs sm:text-sm text-foreground/80 leading-relaxed font-medium">
                                        The protected payment is funded and held securely by TradieHubAU. The tradie has been authorized to begin work. Once they complete the work, they will submit proof for your review.
                                      </p>
                                    </div>
                                  )}
                                  {selectedJob.status === 'completed' && (
                                    <div className="p-3 sm:p-4 border border-emerald-500/25 bg-emerald-500/10 rounded-xl sm:rounded-2xl space-y-1.5 sm:space-y-2">
                                      <h4 className="text-sm font-extrabold text-emerald-800 flex items-start gap-2">
                                        <CheckCircle className="h-5 w-5 shrink-0 text-emerald-600" /> Job Completed & Released
                                      </h4>
                                      <p className="text-xs sm:text-sm text-foreground/80 leading-relaxed font-medium">
                                        This job is completed and the secure payment has been successfully released to the tradie. Thank you for hiring on TradieHubAU!
                                      </p>
                                      <button
                                        onClick={() => setTradieReviewModalJob(selectedJob)}
                                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground shadow-sm transition-all hover:bg-primary/95 active:scale-95 sm:w-auto sm:py-2"
                                      >
                                        <Star className="h-4 w-4 fill-current" /> Leave Review
                                      </button>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          )}

                          <div className="p-3 sm:p-4 bg-card border rounded-xl sm:rounded-2xl space-y-2.5 text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                              <span className="text-xs font-bold text-foreground/80 uppercase tracking-wider">Protected Payment</span>
                              <span className={`uppercase text-[10px] px-2.5 py-0.5 rounded font-semibold border ${
                                ['held', 'held_in_escrow'].includes(jobPayment.status) ? 'bg-green-500/10 text-green-800 border-green-500/30' :
                                jobPayment.status === 'released' ? 'bg-emerald-500/10 text-emerald-800 border-emerald-500/30' :
                                jobPayment.status === 'refunded' ? 'bg-red-500/10 text-red-800 border-red-500/30' : 'bg-secondary text-secondary-foreground border-transparent'
                              }`}>
                                {['held', 'held_in_escrow'].includes(jobPayment.status) ? 'payment protected' :
                                 jobPayment.status === 'released' ? 'payment released' :
                                 jobPayment.status === 'pending' ? 'payment pending' :
                                 jobPayment.status === 'refunded' ? 'payment refunded' :
                                 jobPayment.status === 'failed' ? 'payment failed' :
                                 jobPayment.status.replaceAll('_', ' ')}
                              </span>
                            </div>
                            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
                              <span className="text-foreground/70 font-medium">Contract Amount:</span>
                              <span className="text-foreground font-bold break-words">{formatCentsToAud(jobPayment.amount)}</span>
                            </div>

                            {(() => {
                              // TODO: GST handling should be reviewed with an Australian accountant before real payments.
                              // Depending on structure, GST may apply to platform fees and/or taxable job supplies once registered.
                              const isFunded = ['held', 'held_in_escrow', 'released'].includes(jobPayment.status);
                              const isReleased = jobPayment.status === 'released';
                              const payoutCents = jobPayment.amount - jobPayment.platform_fee;
                              return (
                                <>
                                  <div className="flex flex-col gap-0.5 text-xs sm:flex-row sm:items-center sm:justify-between">
                                    <span className="text-foreground/70 font-medium">
                                      {isFunded ? 'Platform Fee:' : 'Expected Platform Fee:'}
                                    </span>
                                    <span className="text-foreground/90 font-semibold break-words">{formatCentsToAud(jobPayment.platform_fee)}</span>
                                  </div>

                                  <div className="flex flex-col gap-0.5 text-xs border-b pb-2 mb-2 sm:flex-row sm:items-center sm:justify-between">
                                    <span className="text-foreground/70 font-medium">
                                      {isReleased ? 'Released Tradie Payout:' : (isFunded ? 'Expected Tradie Payout:' : 'Estimated Tradie Payout:')}
                                    </span>
                                    <span className="text-primary font-bold break-words">{formatCentsToAud(payoutCents)}</span>
                                  </div>
                                </>
                              );
                            })()}

                            <div className="flex flex-col gap-0.5 text-xs sm:flex-row sm:items-center sm:justify-between">
                              <span className="text-foreground/70 font-medium">Contract Status:</span>
                              <span className="text-foreground/95 font-medium break-words sm:text-right">
                                {selectedJob.status === 'accepted' ? 'Quote Accepted — Awaiting Payment' :
                                 selectedJob.status === 'payment_held' ? 'Contract Active (Payment Funded)' :
                                 selectedJob.status === 'completed_pending_review' ? 'Under Review (Completion Submitted)' :
                                 selectedJob.status === 'disputed' ? 'Disputed' :
                                 selectedJob.status === 'completed' ? 'Completed & Released' : selectedJob.status}
                              </span>
                            </div>

                            {!isCustomerOwner && jobLedger.length > 0 && (
                              <div className="border-t pt-3 mt-3 space-y-2">
                                <span className="text-xs font-bold text-foreground/80 uppercase tracking-wider block">Transaction Ledger</span>
                                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                                  {jobLedger.map((l) => {
                                    let label = l.transaction_type;
                                    if (l.transaction_type === 'charge') label = 'Deposit Charge';
                                    if (l.transaction_type === 'fee') label = 'Platform Fee';
                                    if (l.transaction_type === 'payout') label = 'Tradie Payout';
                                    if (l.transaction_type === 'refund') label = 'Customer Refund';
                                    return (
                                      <div key={l.id} className="flex flex-col gap-1 text-xs font-medium bg-background border p-2 rounded-xl sm:flex-row sm:items-center sm:justify-between">
                                        <div className="space-y-0.5 min-w-0">
                                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${
                                            l.transaction_type === 'charge' ? 'bg-blue-500/10 text-blue-800 border-blue-500/20' :
                                            l.transaction_type === 'payout' ? 'bg-green-500/10 text-green-800 border-green-500/20' :
                                            l.transaction_type === 'fee' ? 'bg-orange-500/10 text-orange-800 border-orange-500/20' : 'bg-red-500/10 text-red-800 border-red-500/20'
                                          }`}>{label}</span>
                                          <span className="text-[10px] text-foreground/60 sm:ml-2">{new Date(l.created_at).toLocaleDateString()}</span>
                                        </div>
                                        <span className="font-bold text-foreground break-words sm:shrink-0">{formatCentsToAud(l.amount_cents)}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                              </>
                            )}

                          {(!usesJobDetailTabs(selectedJob) || activeJobDetailTab === 'contract') && isCustomerOwner && jobLedger.length > 0 && (
                            <details className="rounded-xl sm:rounded-2xl border bg-card/70 text-sm">
                              <summary className="cursor-pointer list-none p-3 sm:p-4 text-xs font-black uppercase tracking-wider text-foreground/80">
                                Payment Ledger
                              </summary>
                              <div className="border-t p-3 sm:p-4 pt-3 space-y-1.5 max-h-44 overflow-y-auto">
                                {jobLedger.map((l) => {
                                  let label = l.transaction_type;
                                  if (l.transaction_type === 'charge') label = 'Deposit Charge';
                                  if (l.transaction_type === 'fee') label = 'Platform Fee';
                                  if (l.transaction_type === 'payout') label = 'Tradie Payout';
                                  if (l.transaction_type === 'refund') label = 'Customer Refund';
                                  return (
                                    <div key={l.id} className="flex flex-col gap-1 text-xs font-medium bg-background border p-2 rounded-xl sm:flex-row sm:items-center sm:justify-between">
                                      <div className="space-y-0.5 min-w-0">
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${
                                          l.transaction_type === 'charge' ? 'bg-blue-500/10 text-blue-800 border-blue-500/20' :
                                          l.transaction_type === 'payout' ? 'bg-green-500/10 text-green-800 border-green-500/20' :
                                          l.transaction_type === 'fee' ? 'bg-orange-500/10 text-orange-800 border-orange-500/20' : 'bg-red-500/10 text-red-800 border-red-500/20'
                                        }`}>{label}</span>
                                        <span className="text-[10px] text-foreground/60 sm:ml-2">{new Date(l.created_at).toLocaleDateString()}</span>
                                      </div>
                                      <span className="font-bold text-foreground break-words sm:shrink-0">{formatCentsToAud(l.amount_cents)}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </details>
                          )}

                          {/* Accepted Quote Breakdown */}
                          {(!usesJobDetailTabs(selectedJob) || activeJobDetailTab === 'contract') && (
                          <details open={!isCustomerOwner} className="rounded-xl sm:rounded-2xl border bg-card/70 text-sm">
                            <summary className="cursor-pointer list-none p-3 sm:p-4 text-xs font-black uppercase tracking-wider text-foreground/80">
                              Accepted Quote Breakdown
                            </summary>
                            <div className="border-t p-3 sm:p-4 pt-3 space-y-2.5">
                            {loadingAcceptedLines ? (
                              <div className="flex justify-center py-4">
                                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                              </div>
                            ) : acceptedQuoteLines.length > 0 ? (
                              <div className="space-y-1.5 mt-2">
                                {acceptedQuoteLines.map((item) => (
                                  <div key={item.id} className="flex flex-col gap-1 text-xs font-semibold bg-background border p-2 rounded-xl border-border/50 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0 flex-1 pr-2">
                                      <span className="text-foreground font-bold break-words block">{item.label}</span>
                                      <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold">
                                        {item.line_type} | {item.quantity} x ${item.unit_price.toLocaleString()}
                                      </span>
                                    </div>
                                    <span className="text-foreground font-extrabold break-words sm:shrink-0">
                                      ${item.line_total.toLocaleString()}
                                    </span>
                                  </div>
                                ))}
                                <div className="flex flex-col gap-1 text-xs pt-1.5 font-bold text-foreground border-t sm:flex-row sm:items-center sm:justify-between">
                                  <span>Total Contract Estimate</span>
                                  <span className="text-primary break-words">${(jobPayment.amount / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground italic mt-2">
                                Detailed quote breakdown not available for this older accepted quote.
                              </p>
                            )}
                            </div>
                          </details>
                          )}

                          {/* Early Release Requests Section */}
                          {(!usesJobDetailTabs(selectedJob) || activeJobDetailTab === 'requests') && (isCustomerOwner || isContractedTradie || profile?.is_admin) && (
                            <details open={!isCustomerOwner || earlyReleaseRequests.some(req => isCustomerOwner && req.status === 'pending')} className="rounded-xl sm:rounded-2xl border bg-card/70 text-sm">
                              <summary className="cursor-pointer list-none p-3 sm:p-4 text-xs font-black uppercase tracking-wider text-foreground/80">
                                <span className="inline-flex flex-wrap items-center gap-2">
                                  Early Release Requests
                                  {earlyReleaseRequests.some(req => isCustomerOwner && req.status === 'pending') && (
                                    <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[9px] text-amber-800">Action needed</span>
                                  )}
                                </span>
                              </summary>
                              <div className="border-t p-3 sm:p-4 pt-3 space-y-3">
                                <div className="flex">
                                  {isContractedTradie && !showErForm && (
                                  <button
                                    onClick={() => setShowErForm(true)}
                                    className="flex w-full items-center justify-center gap-1 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs font-bold text-primary hover:bg-primary/10 sm:w-auto sm:border-0 sm:bg-transparent sm:p-0 sm:hover:bg-transparent sm:hover:underline"
                                  >
                                    <Plus className="h-3 w-3" /> Request Release
                                  </button>
                                  )}
                                </div>

                              <p className="text-xs text-muted-foreground leading-relaxed">
                                Early release requests are capped for safety. Pending and approved requests count toward the cap. Cancelled or rejected requests do not.
                              </p>

                              {earlyReleaseCapSummary ? (
                                <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                                  <div className="bg-background border rounded-xl p-2 min-w-0">
                                    <span className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground block">Contract Total</span>
                                    <span className="text-[11px] sm:text-xs font-black text-foreground break-words">{formatAud(earlyReleaseCapSummary.contract_total)}</span>
                                  </div>
                                  <div className="bg-background border rounded-xl p-2 min-w-0">
                                    <span className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground block">Job Cap (30%)</span>
                                    <span className="text-[11px] sm:text-xs font-black text-foreground break-words">{formatAud(earlyReleaseCapSummary.job_cap)}</span>
                                  </div>
                                  <div className="bg-background border rounded-xl p-2 min-w-0">
                                    <span className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground block">Remaining</span>
                                    <span className="text-[11px] sm:text-xs font-black text-primary break-words">{formatAud(earlyReleaseCapSummary.job_remaining)}</span>
                                  </div>
                                </div>
                              ) : (
                                <div className="p-2.5 bg-background border rounded-xl text-[11px] text-muted-foreground font-semibold">
                                  Early release cap details are not available yet.
                                </div>
                              )}

                              {earlyReleaseCapSummary?.unavailable_reason && (
                                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-700 text-[11px] font-semibold leading-relaxed flex items-start gap-2">
                                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                  <span>{earlyReleaseCapSummary.unavailable_reason}</span>
                                </div>
                              )}

                              {/* Form for Tradie */}
                              {isContractedTradie && showErForm && (
                                <form onSubmit={handleCreateEarlyReleaseRequest} className="bg-background border p-3 rounded-xl space-y-3 border-border/60">
                                  <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-foreground">New Release Request</span>
                                    <button
                                      type="button"
                                      onClick={() => setShowErForm(false)}
                                      className="text-xs text-muted-foreground hover:text-foreground font-semibold"
                                    >
                                      Cancel
                                    </button>
                                  </div>

                                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    <div className="space-y-1">
                                      <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block">Type</label>
                                      <select
                                        value={erRequestType}
                                        onChange={(e: any) => setErRequestType(e.target.value)}
                                        className="w-full bg-muted/50 border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary font-semibold font-black"
                                      >
                                        <option value="materials">Materials</option>
                                        <option value="fuel">Fuel</option>
                                        <option value="mobilisation">Mobilisation</option>
                                        <option value="permit">Permit</option>
                                        <option value="equipment">Equipment</option>
                                        <option value="other">Other</option>
                                      </select>
                                    </div>

                                    <div className="space-y-1">
                                      <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block">Amount ($ AUD)</label>
                                      <input
                                        type="number"
                                        placeholder="0.00"
                                        step="0.01"
                                        min="0.01"
                                        required
                                        value={erAmount}
                                        onChange={(e) => setErAmount(e.target.value)}
                                        className="w-full bg-muted/50 border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary font-semibold"
                                      />
                                    </div>
                                  </div>

                                  <div className="space-y-1">
                                    <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block">Title</label>
                                    <input
                                      type="text"
                                      placeholder="e.g., Copper piping for bathroom"
                                      required
                                      value={erTitle}
                                      onChange={(e) => setErTitle(e.target.value)}
                                      className="w-full bg-muted/50 border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary font-semibold"
                                    />
                                  </div>

                                  <div className="space-y-1">
                                    <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block">Description (Optional)</label>
                                    <textarea
                                      placeholder="Additional context about this request..."
                                      rows={2}
                                      value={erDescription}
                                      onChange={(e) => setErDescription(e.target.value)}
                                      className="w-full bg-muted/50 border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary font-semibold resize-none"
                                    />
                                  </div>

                                  {/* Linked Quote Line Selector */}
                                  {acceptedQuoteLines.length > 0 && (
                                    <div className="space-y-1">
                                      <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block">Accepted Quote Line</label>
                                      <select
                                        value={erSelectedLineId}
                                        onChange={(e) => setErSelectedLineId(e.target.value)}
                                        className="w-full bg-muted/50 border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary font-semibold"
                                        required={earlyReleaseCapSummary?.requires_quote_line_link}
                                      >
                                        <option value="">Select accepted quote line</option>
                                        {acceptedQuoteLines.map((line) => (
                                          <option key={line.id} value={line.id}>
                                            {line.label} ({line.line_type} - ${line.line_total.toLocaleString()})
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  )}

                                  {(() => {
                                    const selectedLineCap = getSelectedEarlyReleaseLineCap();
                                    const visibleLimit = getVisibleEarlyReleaseLimit();
                                    const requestedAmount = parseFloat(erAmount);
                                    const overVisibleCap = !isNaN(requestedAmount) && visibleLimit !== null && requestedAmount > visibleLimit;

                                    return (
                                      <div className={`p-2.5 rounded-xl border text-[11px] font-semibold leading-relaxed ${
                                        overVisibleCap
                                          ? 'bg-red-500/10 border-red-500/25 text-red-600'
                                          : 'bg-primary/5 border-primary/15 text-primary'
                                      }`}>
                                        {selectedLineCap ? (
                                          <span>
                                            Remaining for selected line: {formatAud(selectedLineCap.remaining)}. Remaining job cap: {formatAud(earlyReleaseCapSummary?.job_remaining ?? 0)}.
                                          </span>
                                        ) : earlyReleaseCapSummary?.requires_quote_line_link ? (
                                          <span>Select an accepted quote line to see the available line amount.</span>
                                        ) : visibleLimit !== null ? (
                                          <span>Available for this job: {formatAud(visibleLimit)}.</span>
                                        ) : (
                                          <span>Cap availability will be checked before submission.</span>
                                        )}
                                      </div>
                                    );
                                  })()}

                                  <button
                                    type="submit"
                                    disabled={isSubmittingEr || !earlyReleaseCapSummary?.can_request || (earlyReleaseCapSummary?.requires_quote_line_link && !erSelectedLineId) || (() => {
                                      const requestedAmount = parseFloat(erAmount);
                                      const visibleLimit = getVisibleEarlyReleaseLimit();
                                      return !isNaN(requestedAmount) && visibleLimit !== null && requestedAmount > visibleLimit;
                                    })()}
                                    className="w-full bg-primary text-primary-foreground text-xs font-bold py-2 rounded-lg hover:bg-primary/95 transition-all shadow-sm flex justify-center items-center gap-1 disabled:opacity-50"
                                  >
                                    {isSubmittingEr ? (
                                      <>
                                        <Loader2 className="h-3 w-3 animate-spin" /> Submitting...
                                      </>
                                    ) : (
                                      <>Submit Release Request</>
                                    )}
                                  </button>
                                </form>
                              )}

                              {/* Requests List */}
                              <div className="space-y-2 mt-2">
                                {loadingEarlyReleases ? (
                                  <div className="flex justify-center py-4">
                                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                  </div>
                                ) : earlyReleaseRequests.length > 0 ? (
                                  earlyReleaseRequests.map((req) => {
                                    const linkedLine = acceptedQuoteLines.find(line => line.id === req.accepted_quote_line_item_id);
                                    return (
                                      <div key={req.id} className="bg-background border p-3 rounded-xl space-y-2 border-border/50">
                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                          <div className="min-w-0">
                                            <span className="text-xs font-bold text-foreground block break-words">{req.title}</span>
                                            <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold">
                                              Type: {req.request_type}
                                            </span>
                                            {linkedLine && (
                                              <span className="text-[9px] text-primary/80 font-bold block mt-0.5 break-words">
                                                Linked Line: {linkedLine.label}
                                              </span>
                                            )}
                                          </div>
                                          <div className="sm:text-right">
                                            <span className="text-xs font-black text-foreground block break-words">
                                              ${req.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                            <span className={`inline-block uppercase text-[8px] px-1.5 py-0.5 rounded font-black border mt-1 ${
                                              req.status === 'pending' ? 'bg-amber-500/10 text-amber-800 border-amber-500/30' :
                                              req.status === 'approved' ? 'bg-green-500/10 text-green-800 border-green-500/30' :
                                              req.status === 'rejected' ? 'bg-red-500/10 text-red-800 border-red-500/30' : 'bg-secondary text-secondary-foreground border-transparent'
                                            }`}>
                                              {getEarlyReleaseStatusLabel(req.status)}
                                            </span>
                                          </div>
                                        </div>

                                        {req.description && (
                                          <p className="text-[11px] text-foreground/75 italic bg-muted/10 p-1.5 rounded-lg border border-dashed border-border/40 leading-relaxed font-medium">
                                            {req.description}
                                          </p>
                                        )}

                                        {req.review_note && (
                                          <div className="text-[10px] bg-muted/40 p-2 rounded-lg border border-border/50 font-medium">
                                            <span className="font-bold text-foreground/90 block">Review Note:</span>
                                            <span className="text-foreground/70">{req.review_note}</span>
                                          </div>
                                        )}

                                        {req.reviewed_at && (
                                          <p className="text-[9px] text-muted-foreground font-semibold">
                                            Reviewed {new Date(req.reviewed_at).toLocaleDateString()}
                                          </p>
                                        )}

                                        {isCustomerOwner && req.status === 'pending' && (
                                          <div className="grid grid-cols-1 gap-2 pt-1 sm:flex sm:flex-wrap sm:justify-end">
                                            <button
                                              onClick={() => handleOpenEarlyReleaseReview(req)}
                                              className="w-full text-[11px] bg-background border border-primary/30 text-primary hover:bg-primary/5 font-bold px-2.5 py-2 rounded-lg sm:w-auto sm:py-1 sm:text-[10px]"
                                            >
                                              Review
                                            </button>
                                            <button
                                              onClick={() => handleOpenEarlyReleaseReview(req)}
                                              className="w-full text-[11px] bg-green-600 text-white hover:bg-green-700 font-bold px-2.5 py-2 rounded-lg sm:w-auto sm:py-1 sm:text-[10px]"
                                            >
                                              Approve
                                            </button>
                                            <button
                                              onClick={() => handleOpenEarlyReleaseReview(req)}
                                              className="w-full text-[11px] bg-red-600 text-white hover:bg-red-700 font-bold px-2.5 py-2 rounded-lg sm:w-auto sm:py-1 sm:text-[10px]"
                                            >
                                              Reject
                                            </button>
                                          </div>
                                        )}

                                        {/* Cancel Action for Tradie */}
                                        {isContractedTradie && req.status === 'pending' && (
                                          <div className="flex pt-1 sm:justify-end">
                                            <button
                                              onClick={() => handleCancelEarlyReleaseRequest(req.id)}
                                              className="flex w-full items-center justify-center gap-1 rounded-lg border border-red-500/20 px-2.5 py-2 text-[11px] font-bold text-red-600 hover:text-red-700 sm:w-auto sm:border-0 sm:p-0 sm:text-[10px]"
                                            >
                                              <X className="h-3 w-3" /> Cancel Request
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })
                                ) : (
                                  <p className="text-xs text-muted-foreground italic">No early release requests submitted yet.</p>
                                )}
                              </div>
                              </div>
                            </details>
                          )}
                        </div>
                      );
                    })()}

                      {/* Job Evidence Timeline Card */}
                      {((selectedJob.customer_id === user?.id) ||
                        (jobPayment && jobPayment.payee_id === user?.id) ||
                        profile?.is_admin) && (!usesJobDetailTabs(selectedJob) || activeJobDetailTab === 'evidence') && (
                        <details open={selectedJob.customer_id !== user?.id && timelineEvents.length > 0} className="rounded-xl sm:rounded-2xl border bg-card/70 text-sm">
                          <summary className="cursor-pointer list-none p-3 sm:p-4 text-xs font-black uppercase tracking-wider text-foreground/80">
                            Job Evidence Timeline
                          </summary>
                          <div className="border-t p-3 sm:p-4 pt-3 space-y-3">
                          {loadingTimeline ? (
                            <div className="flex justify-center py-4">
                              <Loader2 className="h-5 w-5 animate-spin text-primary" />
                            </div>
                          ) : timelineEvents.length > 0 ? (
                            <div className="relative pl-4 border-l border-border/60 ml-1 sm:ml-2 space-y-3 sm:space-y-4 py-1 mt-2">
                              {timelineEvents.map((event) => (
                                <div key={event.event_id} className="relative group">
                                  {/* Bullet indicator */}
                                  <div className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border border-primary bg-background shadow-sm" />

                                  <div className="space-y-1">
                                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                      <span className="text-xs font-bold text-foreground break-words">{event.event_label}</span>
                                      {event.amount !== null && event.amount !== undefined && (
                                        <span className="text-[10px] font-black text-primary">
                                          ${event.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                      )}
                                      {event.status && (
                                        <span className={`uppercase text-[8px] px-1.5 py-0.5 rounded font-black border ${
                                          event.status === 'pending' || event.status === 'open' ? 'bg-amber-500/10 text-amber-800 border-amber-500/30' :
                                          ['approved', 'released', 'resolved_payout', 'resolved_refund', 'resolved_split'].includes(event.status) ? 'bg-green-500/10 text-green-800 border-green-500/30' :
                                          'bg-red-500/10 text-red-800 border-red-500/30'
                                        }`}>
                                          {event.status}
                                        </span>
                                      )}
                                    </div>

                                    {event.event_description && (
                                      <p className="text-[11px] text-foreground/70 leading-relaxed font-medium">
                                        {event.event_description}
                                      </p>
                                    )}

                                    <span className="text-[9px] text-muted-foreground block font-bold">
                                      {new Date(event.occurred_at).toLocaleString()}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground italic">No evidence events logged for this job yet.</p>
                          )}
                          </div>
                        </details>
                      )}

                      {/* 2. Customer Actions: Quote Selection */}
                      {(!usesJobDetailTabs(selectedJob) || activeJobDetailTab === 'contract') && selectedJob.customer_id === user.id && selectedJob.status !== 'cancelled' && (
                        <details open={selectedJob.status === 'open'} className="rounded-xl sm:rounded-2xl border bg-card/70 text-sm">
                          <summary className="cursor-pointer list-none p-3 sm:p-4 text-xs font-black uppercase tracking-wider text-foreground/80">
                            Submitted Quote History ({jobApplications.length})
                          </summary>
                          <div className="border-t p-3 sm:p-4 pt-3 space-y-3 sm:space-y-4">
                          {jobApplications.length === 0 ? (
                            <p className="text-xs text-muted-foreground font-semibold">No quotes received yet.</p>
                          ) : (
                            <div className="space-y-3">
                              {jobApplications.map((app) => {
                                const isJobFunded = ['payment_held', 'completed_pending_review', 'disputed', 'completed'].includes(selectedJob.status);
                                const showFull = isJobFunded || profile?.is_admin;
                                const displayName = app.tradie?.display_name || 'Verified Tradie';
                                const licenceText = showFull ? (app.tradie?.license_number || 'N/A') : 'Verified';
                                const abnText = showFull ? (app.tradie?.abn || 'N/A') : 'Verified';

                                return (
                                  <div key={app.id} className="border p-3 sm:p-4 rounded-xl sm:rounded-2xl space-y-3 bg-card font-semibold">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                      <div className="min-w-0">
                                        <h5 className="font-extrabold text-sm break-words">{displayName}</h5>
                                        <p className="text-[10px] text-muted-foreground break-words">Licence: {licenceText} | ABN: {abnText}</p>
                                      </div>
                                      <div className="sm:text-right">
                                        <span className="text-sm font-black text-primary break-words">${app.estimate?.toLocaleString()}</span>
                                        <p className="text-[10px] text-muted-foreground">{app.availability || 'Immediate start'}</p>
                                      </div>
                                    </div>
                                    <p className="text-xs text-foreground bg-muted/10 p-3 rounded-xl leading-relaxed whitespace-pre-wrap">{app.message}</p>

                                    {/* Itemised quote lines if present */}
                                    <div className="space-y-1.5 border-t pt-2 mt-2">
                                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block font-black">Quote Details Breakdown</span>
                                      {quoteLineItems[app.id] && quoteLineItems[app.id].length > 0 ? (
                                        <div className="space-y-1.5">
                                          {quoteLineItems[app.id].map((item) => (
                                            <div key={item.id} className="flex flex-col gap-1 text-xs font-semibold bg-muted/20 p-2 rounded-xl border border-border/50 sm:flex-row sm:items-center sm:justify-between">
                                              <div className="min-w-0 flex-1 pr-2">
                                                <span className="text-foreground font-bold break-words block">{item.label}</span>
                                                <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold">
                                                  {item.line_type} | {item.quantity} x ${item.unit_price.toLocaleString()}
                                                </span>
                                              </div>
                                              <span className="text-foreground font-extrabold break-words sm:shrink-0">${item.line_total.toLocaleString()}</span>
                                            </div>
                                          ))}
                                          <div className="flex flex-col gap-1 text-xs border-t pt-2 font-bold text-foreground sm:flex-row sm:items-center sm:justify-between">
                                            <span>Total Estimate</span>
                                            <span className="text-primary break-words">${app.estimate?.toLocaleString()}</span>
                                          </div>
                                        </div>
                                      ) : (
                                        <p className="text-[10px] text-muted-foreground italic">
                                          Detailed quote breakdown not available for this older quote.
                                        </p>
                                      )}
                                    </div>
                                    {selectedJob.status === 'open' ? (
                                      <>
                                        <p className="text-[10px] text-muted-foreground font-semibold leading-relaxed mb-2 text-left">
                                          * Before accepting, review the tradie’s profile, quote details, licence/insurance suitability, and any questions you need answered. TradieHubAU checks support platform trust but do not replace your own due diligence.
                                        </p>
                                        <button
                                          onClick={() => {
                                            setModalConfirmConfig({
                                              title: "Accept Quote",
                                              message: `Accept quote from ${displayName} for $${app.estimate?.toLocaleString()}?\n\nBefore accepting, review the tradie’s profile, quote details, licence/insurance suitability, and ensure you have performed your own due diligence.`,
                                              onConfirm: async () => {
                                                const { error } = await acceptQuote(selectedJob.id, app.id);
                                                if (error) {
                                                  showToast(error.message, 'error');
                                                } else {
                                                  showToast("Quote accepted. Awaiting customer payment.", 'success');
                                                  setSelectedJob(prev => prev ? { ...prev, status: 'accepted' } : null);
                                                  fetchJobLifecycleDetails(selectedJob.id, { silent: true });
                                                  loadJobs({ silent: true });
                                                }
                                              }
                                            });
                                          }}
                                          className="w-full bg-primary hover:bg-primary/95 text-primary-foreground font-black text-xs py-2 rounded-xl transition-all shadow active:scale-95"
                                        >
                                          Accept Quote
                                        </button>
                                      </>
                                    ) : app.status === 'accepted' ? (
                                      selectedJob.status === 'accepted' ? (
                                        <button
                                          disabled
                                          className="w-full bg-amber-500 text-amber-950 font-black text-xs py-2.5 rounded-xl cursor-not-allowed"
                                        >
                                          Accepted — Awaiting Payment
                                        </button>
                                      ) : selectedJob.status === 'completed_pending_review' ? (
                                        <button
                                          disabled
                                          className="w-full bg-blue-500 text-white font-black text-xs py-2.5 rounded-xl cursor-not-allowed"
                                        >
                                          Under Review
                                        </button>
                                      ) : selectedJob.status === 'disputed' ? (
                                        <button
                                          disabled
                                          className="w-full bg-red-500 text-white font-black text-xs py-2.5 rounded-xl cursor-not-allowed"
                                        >
                                          Disputed
                                        </button>
                                      ) : selectedJob.status === 'completed' ? (
                                        <button
                                          disabled
                                          className="w-full bg-emerald-600 text-white font-black text-xs py-2.5 rounded-xl cursor-not-allowed"
                                        >
                                          Completed
                                        </button>
                                      ) : (
                                        <button
                                          disabled
                                          className="w-full bg-green-600 text-white font-black text-xs py-2.5 rounded-xl cursor-not-allowed"
                                        >
                                          Contract Active (Payment Funded)
                                        </button>
                                      )
                                    ) : (
                                      <button
                                        disabled
                                        className="w-full bg-gray-200 text-gray-400 font-black text-xs py-2.5 rounded-xl cursor-not-allowed"
                                      >
                                        Other Quote Accepted
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          </div>
                        </details>
                      )}

                      {/* 3. Customer Actions: Protected Payment Funding Simulation */}
                      {(!usesJobDetailTabs(selectedJob) || activeJobDetailTab === 'overview' || activeJobDetailTab === 'contract') && ((selectedJob.customer_id === user?.id) || profile?.is_admin) && selectedJob.status === 'accepted' && jobPayment && (
                        <div className="p-4 sm:p-5 border border-amber-500/20 bg-amber-500/5 rounded-xl sm:rounded-2xl space-y-3 font-semibold">
                          <h4 className="text-sm font-extrabold text-foreground flex items-start gap-2">
                            <DollarSign className="h-5 w-5 shrink-0 text-amber-500" /> Protected Payment Required — Fund Contract
                          </h4>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            Please fund this contract to proceed. This secure job payment will be held until completion and only released after the work is completed and approved by you.
                          </p>
                          <button
                            onClick={() => {
                              setModalConfirmConfig({
                                title: "Fund Contract Payment",
                                message: "Are you sure you want to simulate funding this secure job payment?",
                                onConfirm: async () => {
                                  const { error } = await simulatePaymentFunding(selectedJob.id);
                                  if (error) {
                                    showToast(error.message, 'error');
                                  } else {
                                    showToast("Protected payment funded! Payment is held until completion.", 'success');
                                    setSelectedJob(prev => prev ? { ...prev, status: 'payment_held' } : null);
                                    fetchJobLifecycleDetails(selectedJob.id, { silent: true });
                                    loadJobs({ silent: true });
                                  }
                                }
                              });
                            }}
                            className="w-full bg-amber-500 hover:bg-amber-600 text-white font-black text-xs py-3 rounded-xl transition-all shadow-md active:scale-95"
                          >
                            Simulate Payment Funding
                          </button>
                          <p className="text-[10px] text-amber-600/80 text-center mt-1">Beta only — no real payment will be taken.</p>
                        </div>
                      )}

                      {/* 4. Tradie Actions: Variation Requests and Completion Proof Submissions */}
                      {jobPayment && jobPayment.payee_id === user.id && (
                        <div className="space-y-4 sm:space-y-6">
                          {/* Guard messaging for unavailable actions */}
                          {selectedJob.status === 'accepted' && (
                            <div className="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-xl text-xs font-bold flex items-start gap-2.5">
                              <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                              <span>Completion proof can be submitted once the protected payment is funded.</span>
                            </div>
                          )}

                          {selectedJob.status === 'completed_pending_review' && (
                            <div className="p-4 bg-blue-500/10 border border-blue-500/20 text-blue-600 rounded-xl text-xs font-bold space-y-1">
                              <div className="flex items-start gap-2.5">
                                <Clock className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                                <span>The customer is reviewing the submitted completion proof.</span>
                              </div>
                              <p className="text-[11px] text-muted-foreground pl-7 font-medium leading-relaxed">
                                The customer has 72 hours to raise an issue before payment release.
                              </p>
                            </div>
                          )}

                          {selectedJob.status === 'disputed' && (
                            <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-xs font-bold flex items-start gap-2.5">
                              <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                              <span>This job is currently disputed and awaiting admin review.</span>
                            </div>
                          )}

                          {selectedJob.status === 'completed' && (
                            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 rounded-xl text-xs font-bold flex items-start gap-2.5">
                              <CheckCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                              <span>This job is marked as completed and the secure payment has been released to your account.</span>
                            </div>
                          )}

                          {/* Itemised variations form for contracted tradie */}
                          {['accepted', 'payment_held'].includes(selectedJob.status) && (
                            <div className="p-4 sm:p-5 bg-card border rounded-xl sm:rounded-2xl space-y-4 font-semibold">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                  <h4 className="text-xs font-black text-foreground uppercase tracking-wider">Variation Requests</h4>
                                  <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                                    Use variations for extra work or materials that were not included in the accepted quote. The customer must approve a variation before it can become chargeable.
                                  </p>
                                </div>
                                {!showVariationForm && (
                                  <button
                                    onClick={() => setShowVariationForm(true)}
                                    className="flex w-full items-center justify-center gap-1 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs font-bold text-primary hover:bg-primary/10 sm:w-auto sm:shrink-0 sm:border-0 sm:bg-transparent sm:p-0 sm:hover:bg-transparent sm:hover:underline"
                                  >
                                    <Plus className="h-3 w-3" /> New Variation
                                  </button>
                                )}
                              </div>

                              {showVariationForm && (
                                <form onSubmit={handleCreateVariationRequest} className="space-y-3 bg-muted/20 border rounded-xl p-3">
                                  <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-foreground">New Itemised Variation</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setShowVariationForm(false);
                                        resetVariationForm();
                                      }}
                                      className="text-xs text-muted-foreground hover:text-foreground font-semibold"
                                    >
                                      Cancel
                                    </button>
                                  </div>

                                  <div className="space-y-1">
                                    <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block">Title</label>
                                    <input
                                      type="text"
                                      value={variationTitle}
                                      onChange={(e) => setVariationTitle(e.target.value)}
                                      placeholder="e.g. Additional bathroom waterproofing"
                                      className="w-full bg-background border border-border rounded-xl px-3 py-2 outline-none text-xs focus:border-primary/50 font-semibold"
                                      required
                                    />
                                  </div>

                                  <div className="space-y-1">
                                    <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block">Reason / Notes</label>
                                    <textarea
                                      value={variationReason}
                                      onChange={(e) => setVariationReason(e.target.value)}
                                      rows={2}
                                      placeholder="Explain why this extra work or material is needed..."
                                      className="w-full bg-background border border-border rounded-xl px-3 py-2 outline-none text-xs focus:border-primary/50 font-semibold resize-none"
                                    />
                                  </div>

                                  <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                      <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block">Line Items</label>
                                      <button
                                        type="button"
                                        onClick={handleAddVariationLine}
                                        className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
                                      >
                                        <Plus className="h-3 w-3" /> Add Line
                                      </button>
                                    </div>

                                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                      {variationLineItems.map((item, idx) => (
                                        <div key={idx} className="border rounded-xl p-3 bg-background space-y-2">
                                          <div className="grid grid-cols-1 md:grid-cols-[1fr_120px] gap-2">
                                            <input
                                              type="text"
                                              value={item.label}
                                              onChange={(e) => handleVariationLineChange(idx, 'label', e.target.value)}
                                              placeholder="Line item label"
                                              className="w-full bg-muted/40 border border-border rounded-lg px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-primary/50"
                                              required
                                            />
                                            <select
                                              value={item.line_type}
                                              onChange={(e) => handleVariationLineChange(idx, 'line_type', e.target.value as VariationLineType)}
                                              className="w-full bg-muted/40 border border-border rounded-lg px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-primary/50"
                                            >
                                              <option value="labour">Labour</option>
                                              <option value="materials">Materials</option>
                                              <option value="callout">Callout</option>
                                              <option value="disposal">Disposal</option>
                                              <option value="equipment">Equipment</option>
                                              <option value="permit">Permit</option>
                                              <option value="other">Other</option>
                                            </select>
                                          </div>

                                          <textarea
                                            value={item.description}
                                            onChange={(e) => handleVariationLineChange(idx, 'description', e.target.value)}
                                            placeholder="Optional line description"
                                            rows={2}
                                            className="w-full bg-muted/40 border border-border rounded-lg px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-primary/50 resize-none"
                                          />

                                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[80px_1fr_90px_32px] sm:items-center">
                                            <input
                                              type="number"
                                              min="0.0001"
                                              step="any"
                                              value={item.quantity}
                                              onChange={(e) => handleVariationLineChange(idx, 'quantity', parseFloat(e.target.value) || 0)}
                                              className="w-full bg-muted/40 border border-border rounded-lg px-2 py-1.5 text-xs font-semibold text-center outline-none focus:border-primary/50"
                                              required
                                            />
                                            <div className="relative">
                                              <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                              <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={item.unit_price || ''}
                                                onChange={(e) => handleVariationLineChange(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                                                className="w-full bg-muted/40 border border-border rounded-lg pl-6 pr-2 py-1.5 text-xs font-semibold outline-none focus:border-primary/50"
                                                required
                                              />
                                            </div>
                                            <span className="text-xs font-black text-foreground sm:text-right">
                                              {formatAud((Number(item.quantity) || 0) * (Number(item.unit_price) || 0))}
                                            </span>
                                            {variationLineItems.length > 1 ? (
                                              <button
                                                type="button"
                                                onClick={() => handleRemoveVariationLine(idx)}
                                                className="p-1 rounded-lg text-red-600 hover:bg-red-500/10"
                                              >
                                                <Trash2 className="h-4 w-4" />
                                              </button>
                                            ) : (
                                              <span />
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between border-t pt-3 text-xs">
                                    <span className="font-bold text-muted-foreground uppercase tracking-wider">Variation Total</span>
                                    <span className="text-lg font-black text-primary">{formatAud(variationFormTotal)}</span>
                                  </div>

                                  <button
                                    type="submit"
                                    disabled={submittingVariation}
                                    className="w-full bg-primary text-primary-foreground text-xs font-bold py-2 rounded-lg hover:bg-primary/95 transition-all shadow-sm flex justify-center items-center gap-1 disabled:opacity-50"
                                  >
                                    {submittingVariation ? (
                                      <><Loader2 className="h-3 w-3 animate-spin" /> Submitting...</>
                                    ) : (
                                      <>Submit Variation Request</>
                                    )}
                                  </button>
                                </form>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* 5. Customer Review of Completion Proof & Dispute raising - Lightweight summary only */}
                      {(!usesJobDetailTabs(selectedJob) || activeJobDetailTab === 'evidence') && selectedJob.customer_id === user.id && selectedJob.status === 'completed_pending_review' && (
                        <div className="space-y-3 sm:space-y-4">
                          <h4 className="text-xs font-black text-foreground uppercase tracking-wider flex items-center gap-1.5">
                            <CheckCircle className="h-4 w-4 text-green-500" /> Completion Review
                          </h4>
                          
                          <div className="p-3 sm:p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl sm:rounded-2xl space-y-2 text-xs font-semibold">
                            <div className="flex items-start gap-2 text-blue-600 font-bold">
                              <Clock className="h-4.5 w-4.5 shrink-0 text-blue-500" />
                              <span>Completion proof submitted — under customer review.</span>
                            </div>
                            <p className="text-muted-foreground leading-relaxed text-[11px] font-medium">
                              Use the <strong className="text-foreground">Review Completion</strong> button on the job card in your active list to approve the work or raise an issue.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* 6. Disputes / Pending resolution view */}
                      {(!usesJobDetailTabs(selectedJob) || activeJobDetailTab === 'evidence') && selectedJob.status === 'disputed' && (
                        <div className="p-3 sm:p-4 border border-red-500/20 bg-red-500/5 rounded-xl sm:rounded-2xl space-y-2 font-semibold">
                          <h4 className="text-xs font-black text-red-500 uppercase tracking-wider flex items-center gap-1.5"><AlertCircle className="h-4.5 w-4.5" /> Job is Disputed</h4>
                          {jobIssues.length > 0 && (
                            <>
                              <p className="text-xs text-foreground">Issue details:</p>
                              <p className="text-xs text-muted-foreground italic leading-relaxed font-medium">"{jobIssues[0].description}"</p>
                              <p className="text-[10px] text-muted-foreground mt-2">Dispute status: {jobIssues[0].status}</p>
                            </>
                          )}
                          <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">The TradieHubAU administrative team has been notified and is currently reviewing evidence from both parties to resolve the dispute.</p>
                        </div>
                      )}

                      {/* 7. Display itemised variation requests to customer & tradie */}
                      {(!usesJobDetailTabs(selectedJob) || activeJobDetailTab === 'requests') && jobVariations.length > 0 && (
                        <details open={jobVariations.some(v => selectedJob.customer_id === user.id && v.status === 'pending') || jobPayment?.payee_id === user.id} className="rounded-xl sm:rounded-2xl border bg-card/70 text-sm">
                          <summary className="cursor-pointer list-none p-3 sm:p-4 text-xs font-black uppercase tracking-wider text-foreground/80">
                            <span className="inline-flex flex-wrap items-center gap-2">
                              Variation Requests
                              {jobVariations.some(v => selectedJob.customer_id === user.id && v.status === 'pending') && (
                                <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[9px] text-amber-800">Action needed</span>
                              )}
                            </span>
                          </summary>
                          <div className="border-t p-3 sm:p-4 pt-3 space-y-3 sm:space-y-4">
                          <div className="space-y-1">
                            {selectedJob.customer_id === user.id && (
                              <p className="text-[11px] text-muted-foreground font-semibold leading-relaxed">
                                Funding controls will be added later. Approving a variation here does not release funds.
                              </p>
                            )}
                          </div>
                          <div className="space-y-3">
                            {jobVariations.map((v) => {
                              const lineItems = v.line_items || [];
                              const variationTotal = lineItems.reduce((sum, item) => sum + Number(item.line_total || 0), 0);
                              return (
                              <div key={v.id} className="border p-3 sm:p-4 rounded-xl sm:rounded-2xl space-y-3 bg-muted/10 font-semibold">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="min-w-0">
                                    <h5 className="text-sm font-black text-foreground break-words">{v.title}</h5>
                                    {v.reason && (
                                      <p className="text-xs text-foreground/80 leading-relaxed font-medium mt-1 whitespace-pre-wrap">{v.reason}</p>
                                    )}
                                    <span className={`inline-block text-[9px] font-extrabold px-1.5 py-0.5 rounded mt-1.5 uppercase ${
                                      v.status === 'approved' ? 'bg-green-500/10 text-green-600' :
                                      v.status === 'rejected' ? 'bg-red-500/10 text-red-500' :
                                      v.status === 'cancelled' ? 'bg-secondary text-secondary-foreground' : 'bg-blue-500/10 text-blue-500'
                                    }`}>
                                      {v.status === 'pending' ? 'Pending customer review' :
                                       v.status === 'approved' ? 'Approved by customer' :
                                       v.status === 'rejected' ? 'Rejected by customer' : 'Cancelled'}
                                    </span>
                                  </div>
                                  <div className="sm:text-right">
                                    <span className="text-sm font-extrabold text-foreground break-words">{formatAud(variationTotal)}</span>
                                    <p className="text-[9px] text-muted-foreground font-bold">{new Date(v.requested_at).toLocaleDateString()}</p>
                                  </div>
                                </div>
                                {lineItems.length > 0 && (
                                  <div className="space-y-1.5 border-t pt-2">
                                    {lineItems.map((line) => (
                                      <div key={line.id} className="flex flex-col gap-1 bg-background border rounded-xl p-2 text-xs sm:flex-row sm:justify-between">
                                        <div className="min-w-0">
                                          <span className="font-bold text-foreground break-words block">{line.label}</span>
                                          <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold">
                                            {line.line_type} | {line.quantity} x ${line.unit_price.toLocaleString()}
                                          </span>
                                          {line.description && (
                                            <p className="text-[10px] text-foreground/70 mt-1 leading-relaxed">{line.description}</p>
                                          )}
                                        </div>
                                        <span className="font-black text-foreground break-words sm:shrink-0">{formatAud(Number(line.line_total || 0))}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {v.status === 'approved' && (v.approved_line_items || []).length > 0 && (
                                  <div className="space-y-1.5 border-t pt-2">
                                    <span className="text-[10px] font-bold text-green-700 uppercase tracking-wider block">
                                      Approved Variation Breakdown
                                    </span>
                                    {(v.approved_line_items || []).map((line) => (
                                      <div key={line.id} className="flex flex-col gap-1 bg-green-500/5 border border-green-500/20 rounded-xl p-2 text-xs sm:flex-row sm:justify-between">
                                        <div className="min-w-0">
                                          <span className="font-bold text-foreground break-words block">{line.label}</span>
                                          <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold">
                                            {line.line_type} | {line.quantity} x ${line.unit_price.toLocaleString()}
                                          </span>
                                          {line.description && (
                                            <p className="text-[10px] text-foreground/70 mt-1 leading-relaxed">{line.description}</p>
                                          )}
                                        </div>
                                        <span className="font-black text-foreground break-words sm:shrink-0">{formatAud(Number(line.line_total || 0))}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {v.review_note && (
                                  <div className="text-[10px] bg-background p-2 rounded-lg border border-border/50 font-medium">
                                    <span className="font-bold text-foreground/90 block">Review Note:</span>
                                    <span className="text-foreground/70">{v.review_note}</span>
                                  </div>
                                )}

                                {v.reviewed_at && (
                                  <p className="text-[9px] text-muted-foreground font-semibold">
                                    Reviewed {new Date(v.reviewed_at).toLocaleDateString()}
                                  </p>
                                )}

                                {selectedJob.customer_id === user.id && v.status === 'pending' && (
                                  <div className="grid grid-cols-1 gap-2 pt-1 sm:flex sm:flex-wrap sm:justify-end">
                                    <button
                                      onClick={() => handleOpenVariationReview(v)}
                                      className="w-full text-[11px] bg-background border border-primary/30 text-primary hover:bg-primary/5 font-bold px-2.5 py-2 rounded-lg sm:w-auto sm:py-1 sm:text-[10px]"
                                    >
                                      Review
                                    </button>
                                    <button
                                      onClick={() => handleOpenVariationReview(v)}
                                      className="w-full text-[11px] bg-green-600 text-white hover:bg-green-700 font-bold px-2.5 py-2 rounded-lg sm:w-auto sm:py-1 sm:text-[10px]"
                                    >
                                      Approve
                                    </button>
                                    <button
                                      onClick={() => handleOpenVariationReview(v)}
                                      className="w-full text-[11px] bg-red-600 text-white hover:bg-red-700 font-bold px-2.5 py-2 rounded-lg sm:w-auto sm:py-1 sm:text-[10px]"
                                    >
                                      Reject
                                    </button>
                                  </div>
                                )}

                                {jobPayment?.payee_id === user.id && v.status === 'pending' && (
                                  <div className="flex pt-1 sm:justify-end">
                                    <button
                                      onClick={() => handleCancelVariationRequest(v.id)}
                                      className="flex w-full items-center justify-center gap-1 rounded-lg border border-red-500/20 px-2.5 py-2 text-[11px] font-bold text-red-600 hover:text-red-700 sm:w-auto sm:border-0 sm:p-0 sm:text-[10px]"
                                    >
                                      <X className="h-3 w-3" /> Cancel Variation
                                    </button>
                                  </div>
                                )}
                              </div>
                              );
                            })}
                          </div>
                          </div>
                        </details>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 sm:p-6 border-t bg-muted/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              {/* Save in modal too */}
              {user && (
                <button
                  onClick={(e) => handleToggleSave(selectedJob.id, e)}
                  disabled={savingId === selectedJob.id}
                  className={`flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2.5 border rounded-xl text-sm font-bold transition-all ${
                    savedJobIds.has(selectedJob.id)
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {savedJobIds.has(selectedJob.id) ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                  {savedJobIds.has(selectedJob.id) ? 'Saved' : 'Save Job'}
                </button>
              )}
              <div className="flex w-full flex-col sm:w-auto sm:flex-row sm:items-center gap-3 sm:ml-auto">
                <button onClick={() => setSelectedJob(null)} className="w-full sm:w-auto bg-secondary text-secondary-foreground font-bold px-5 py-2.5 rounded-xl hover:bg-secondary/80 transition-colors text-sm">
                  Close
                </button>
                {selectedJob.status === 'open' && (
                  user ? (
                    selectedJob.customer_id === user.id ? (
                      <button
                        disabled
                        className="w-full sm:w-auto font-bold px-6 py-2.5 rounded-xl text-sm bg-gray-100 text-gray-500 border border-gray-200 cursor-default whitespace-normal sm:whitespace-nowrap"
                      >
                        You can't quote on your own job.
                      </button>
                    ) : profile?.role !== 'customer' ? (
                      <button
                        onClick={() => {
                          const now = new Date();
                          const isAppRestricted = profile?.application_restricted_until && new Date(profile.application_restricted_until) > now;
                          const isQuoteRestricted = profile?.quote_restricted_until && new Date(profile.quote_restricted_until) > now;
                          const isAccountHold = profile?.account_review_hold_until && new Date(profile.account_review_hold_until) > now;

                          if (isAppRestricted || isQuoteRestricted || isAccountHold) {
                            showToast("Your account is under admin review and cannot submit new quotes right now.", 'error');
                            return;
                          }
                          if (!isVerifiedTradie) {
                            showToast("Verification Required: Only verified tradies can quote on jobs. Please visit your Profile to submit your verification details.", 'error');
                            return;
                          }
                          handleOpenApply(selectedJob);
                        }}
                        disabled={myApplications.has(selectedJob.id) && myApplications.get(selectedJob.id)?.status !== 'withdrawn'}
                        className={`w-full sm:w-auto font-bold px-6 py-2.5 rounded-xl transition-all shadow-md text-sm active:scale-95 whitespace-normal sm:whitespace-nowrap ${
                          myApplications.has(selectedJob.id) && myApplications.get(selectedJob.id)?.status !== 'withdrawn'
                            ? 'bg-green-500/10 text-green-600 border border-green-500/20 cursor-default'
                            : !isVerifiedTradie
                            ? 'bg-muted text-muted-foreground border border-border cursor-not-allowed'
                            : 'bg-primary text-primary-foreground hover:bg-primary/95'
                        }`}
                      >
                        {myApplications.has(selectedJob.id) && myApplications.get(selectedJob.id)?.status !== 'withdrawn'
                          ? 'Already Applied ✓'
                          : 'Apply for Job'}
                      </button>
                    ) : null
                  ) : (
                    <Link to="/login" state={{ from: { pathname: '/jobs' } }}
                      className="w-full sm:w-auto bg-primary text-primary-foreground font-bold px-6 py-2.5 rounded-xl hover:bg-primary/95 transition-all shadow-md text-sm text-center whitespace-normal sm:whitespace-nowrap">
                      Sign In to Apply
                    </Link>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {modalConfirmConfig && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-card border border-border w-full max-w-md rounded-2xl shadow-xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-foreground">{modalConfirmConfig.title}</h3>
            <p className="text-sm text-muted-foreground font-semibold leading-relaxed">{modalConfirmConfig.message}</p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setModalConfirmConfig(null)}
                className="px-4 py-2 border rounded-xl text-xs font-bold hover:bg-muted text-muted-foreground transition-all"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const onConfirm = modalConfirmConfig.onConfirm;
                  setModalConfirmConfig(null);
                  await onConfirm();
                }}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:bg-primary/95 transition-all shadow-md active:scale-95"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-[80] animate-in slide-in-from-bottom-5 duration-300">
          <div className={`p-4 rounded-xl border shadow-lg flex items-center gap-2.5 max-w-md font-bold text-xs ${
            toastMessage.type === 'success'
              ? 'bg-green-500/10 border-green-500/20 text-green-600'
              : 'bg-red-500/10 border-red-500/20 text-red-500'
          }`}>
            {toastMessage.type === 'success' ? (
              <CheckCircle className="h-4.5 w-4.5 shrink-0" />
            ) : (
              <AlertCircle className="h-4.5 w-4.5 shrink-0" />
            )}
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Live Review Countdown Timer ─────────────────────────────────────────────

interface LeaveTradieReviewModalProps {
  job: Job;
  onClose: () => void;
  onSuccess: () => void;
  showToast: (text: string, type?: 'success' | 'error') => void;
}

function LeaveTradieReviewModal({ job, onClose, onSuccess, showToast }: LeaveTradieReviewModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [rating, setRating] = useState(5);
  const [text, setText] = useState('');
  const [tradieId, setTradieId] = useState<string | null>(null);
  const [existingReview, setExistingReview] = useState<MyReview | null>(null);
  const [eligibilityMessage, setEligibilityMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadReviewState() {
      setLoading(true);
      setEligibilityMessage(null);
      setExistingReview(null);
      setTradieId(null);

      try {
        if (!user) {
          setEligibilityMessage('Sign in to leave a review.');
          return;
        }

        if (job.customer_id !== user.id) {
          setEligibilityMessage('Only the customer who posted this job can review the tradie.');
          return;
        }

        if (job.status !== 'completed') {
          setEligibilityMessage('Reviews become available after the job is completed and payment is released.');
          return;
        }

        const { data: payment, error: paymentError } = await getPaymentForJob(job.id);
        if (paymentError) throw paymentError;
        if (!payment || payment.status !== 'released' || !payment.payee_id) {
          setEligibilityMessage('Reviews become available after the protected payment has been released.');
          return;
        }

        const { data: issues, error: issuesError } = await getIssuesForJob(job.id);
        if (issuesError) throw issuesError;
        if ((issues || []).some(issue => issue.status === 'open')) {
          setEligibilityMessage('Reviews are blocked while a dispute or issue is still open.');
          return;
        }

        const { data: review, error: reviewError } = await getMyTradieReviewForJob(job.id, payment.payee_id);
        if (reviewError) throw reviewError;

        if (!cancelled) {
          setTradieId(payment.payee_id);
          setExistingReview(review);
        }
      } catch (err: any) {
        if (!cancelled) {
          setEligibilityMessage(err.message || 'Review eligibility could not be checked.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadReviewState();

    return () => {
      cancelled = true;
    };
  }, [job, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tradieId || existingReview || eligibilityMessage) return;
    if (rating < 1 || rating > 5) {
      showToast('Choose a rating from 1 to 5.', 'error');
      return;
    }
    if (text.trim().length > 1000) {
      showToast('Review text must be 1000 characters or fewer.', 'error');
      return;
    }

    setSubmitting(true);
    const { error } = await submitTradieReview({
      jobId: job.id,
      tradieId,
      rating,
      text,
    });
    setSubmitting(false);

    if (error) {
      if ((error as any).code === '23505') {
        setEligibilityMessage('You have already reviewed this tradie for this job.');
        return;
      }
      showToast(error.message || 'Review could not be submitted.', 'error');
      return;
    }

    onSuccess();
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-card border border-border w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-6 border-b flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-extrabold text-foreground">Review Tradie</h3>
            <p className="text-sm text-muted-foreground font-semibold mt-0.5 line-clamp-1">{job.title}</p>
          </div>
          <button onClick={onClose} disabled={submitting} className="p-1.5 rounded-lg border hover:bg-muted text-muted-foreground shrink-0 disabled:opacity-50">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {loading ? (
            <div className="flex items-center gap-3 rounded-2xl border bg-muted/30 p-4 text-sm font-semibold text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              Checking review eligibility...
            </div>
          ) : existingReview ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-2xl border border-green-500/20 bg-green-500/10 p-4 text-green-700">
                <CheckCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-extrabold">Already reviewed</h4>
                  <p className="mt-1 text-sm font-semibold">You have already reviewed this tradie for this completed job.</p>
                </div>
              </div>
              <div className="rounded-2xl border bg-background p-4 space-y-2">
                <div className="flex items-center gap-1 text-amber-600 font-bold text-sm">
                  <Star className="h-4 w-4 fill-amber-500" /> {existingReview.rating} / 5
                </div>
                {existingReview.text && <p className="text-sm text-muted-foreground font-medium leading-6 whitespace-pre-line">{existingReview.text}</p>}
                <p className="text-xs text-muted-foreground font-semibold">{new Date(existingReview.submitted_at).toLocaleDateString()}</p>
              </div>
            </div>
          ) : eligibilityMessage ? (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-amber-900">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-extrabold">Review not available</h4>
                <p className="mt-1 text-sm font-semibold leading-6">{eligibilityMessage}</p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="rounded-2xl border bg-muted/30 p-4 text-xs font-semibold leading-5 text-muted-foreground">
                Reviews are only accepted from the original customer after a TradieHubAU job is completed, payment is released, and no dispute is open.
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Rating</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(value => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRating(value)}
                      className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border text-sm font-black transition-all ${
                        rating >= value
                          ? 'border-amber-500/40 bg-amber-500/10 text-amber-600'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted'
                      }`}
                      aria-label={`${value} star rating`}
                    >
                      <Star className={`h-5 w-5 ${rating >= value ? 'fill-amber-500' : ''}`} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Review text optional</label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={1000}
                  rows={4}
                  placeholder="Share a brief review of the completed work..."
                  className="w-full rounded-xl border bg-background px-4 py-3 text-sm font-medium leading-6 outline-none transition-all focus:border-primary/50"
                />
                <p className="text-xs font-semibold text-muted-foreground">{text.length}/1000 characters</p>
              </div>

              <div className="flex justify-end gap-3 border-t pt-5">
                <button type="button" onClick={onClose} disabled={submitting} className="px-4 py-2.5 border rounded-xl text-xs font-bold hover:bg-muted text-muted-foreground transition-all disabled:opacity-50">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:bg-primary/95 transition-all shadow-md active:scale-95 disabled:opacity-50">
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Submit Review
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewCountdown({ deadline }: { deadline: string }) {
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const difference = +new Date(deadline) - +new Date();
      if (difference <= 0) {
        setTimeLeft('Review window expired');
        setIsExpired(true);
        return;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((difference / 1000 / 60) % 60);
      const seconds = Math.floor((difference / 1000) % 60);

      const dStr = days > 0 ? `${days}d ` : '';
      const hStr = `${hours}h `;
      const mStr = `${String(minutes).padStart(2, '0')}m `;
      const sStr = `${String(seconds).padStart(2, '0')}s`;

      setTimeLeft(`Review window ends in: ${dStr}${hStr}${mStr}${sStr}`);
      setIsExpired(false);
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000); // update every second

    return () => clearInterval(interval);
  }, [deadline]);

  return (
    <div className={`p-3.5 rounded-xl border text-xs font-bold flex items-center gap-2 ${
      isExpired 
        ? 'bg-red-500/10 border-red-500/20 text-red-500' 
        : 'bg-blue-50/50 border-blue-200 text-blue-950'
    }`}>
      <Clock className={`h-4.5 w-4.5 shrink-0 ${isExpired ? 'text-red-500' : 'text-blue-500'}`} />
      <div className="space-y-0.5">
        <span className={isExpired ? 'text-red-600' : 'text-slate-900 font-bold'}>{timeLeft}</span>
        {!isExpired && <p className="text-[10px] text-blue-800/80 font-medium">Approve or dispute before the timer ends.</p>}
      </div>
    </div>
  );
}

// ─── Submit Completion Proof Modal ──────────────────────────────────────────

interface SubmitCompletionModalProps {
  job: Job;
  onClose: () => void;
  onSuccess: () => void;
}

function SubmitCompletionModal({ job, onClose, onSuccess }: SubmitCompletionModalProps) {
  const { user } = useAuth();
  const [description, setDescription] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle selected images
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const files = Array.from(e.target.files || []);
    const validFiles: File[] = [];
    const newPreviews: string[] = [];

    for (const file of files) {
      // 1. Require common image formats
      if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) {
        setError('Only image files (jpeg, jpg, png, webp) are allowed.');
        return;
      }
      // 2. Limit size to 5MB
      if (file.size > 5 * 1024 * 1024) {
        setError('File size must be under 5MB.');
        return;
      }
      validFiles.push(file);
      newPreviews.push(URL.createObjectURL(file));
    }

    setSelectedFiles(prev => [...prev, ...validFiles]);
    setPreviews(prev => [...prev, ...newPreviews]);
  };

  // Remove selected image
  const removeFile = (index: number) => {
    URL.revokeObjectURL(previews[index]);
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      previews.forEach(url => URL.revokeObjectURL(url));
    };
  }, [previews]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!user) {
      setError('You must be logged in.');
      return;
    }

    // Client-side validation: require both notes and at least one image
    if (!description.trim()) {
      setError('Completion notes are required.');
      return;
    }
    if (selectedFiles.length === 0) {
      setError('At least one proof photo is required.');
      return;
    }

    setSubmitting(true);

    try {
      const uploadedPaths: string[] = [];
      for (const file of selectedFiles) {
        const fileExt = file.name.split('.').pop();
        const randomStr = Math.random().toString(36).substring(2, 10);
        const filePath = `jobs/${job.id}/${user.id}/${Date.now()}_${randomStr}.${fileExt}`;

        const { error: uploadErr } = await supabase.storage
          .from('completion_proofs')
          .upload(filePath, file);

        if (uploadErr) {
          throw new Error(`Failed to upload ${file.name}: ${uploadErr.message}`);
        }
        uploadedPaths.push(filePath);
      }

      // Call submitCompletionProof RPC
      const { error: rpcErr } = await submitCompletionProof(job.id, description.trim(), uploadedPaths);
      if (rpcErr) {
        throw rpcErr;
      }

      onSuccess();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to submit completion proof.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-card border border-border w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-6 border-b flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-extrabold text-foreground">Submit Completion Proof</h3>
            <p className="text-sm text-muted-foreground font-semibold mt-0.5 line-clamp-1">{job.title}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg border hover:bg-muted text-muted-foreground shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Description */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-foreground uppercase tracking-wider">
              Completion Notes / Details <span className="text-red-400">*</span>
            </label>
            <textarea
              rows={4}
              placeholder="Describe the completed work, materials used, or any final details for the customer..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-background border border-border rounded-xl px-4 py-3 outline-none focus:border-primary/50 text-sm font-medium leading-relaxed transition-all resize-none"
              required
            />
          </div>

          {/* File Upload */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-foreground uppercase tracking-wider block">
              Proof Photos <span className="text-red-400">*</span>
            </label>
            <div className="flex items-center gap-4">
              <label className="flex items-center justify-center gap-2 bg-secondary text-secondary-foreground font-bold px-4 py-3 rounded-xl hover:bg-secondary/80 transition-all border text-xs cursor-pointer select-none">
                <Upload className="h-4 w-4" /> Choose Photos
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
              <span className="text-xs text-muted-foreground font-semibold">
                JPEG, PNG, WEBP (Max 5MB each)
              </span>
            </div>

            {/* Selected File Previews */}
            {previews.length > 0 && (
              <div className="grid grid-cols-4 gap-2 pt-2">
                {previews.map((url, index) => (
                  <div key={index} className="relative h-20 w-20 border rounded-xl overflow-hidden group">
                    <img src={url} alt="Preview" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 bg-primary/5 border border-primary/10 text-primary rounded-xl text-xs font-semibold leading-relaxed flex items-start gap-2.5">
            <Clock className="h-4.5 w-4.5 shrink-0 mt-0.5 text-primary" />
            <span>Submitting completion proof starts the customer's 7-day review timer. The protected payment will release automatically if no dispute is raised.</span>
          </div>
        </form>

        <div className="p-6 border-t flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="bg-secondary text-secondary-foreground font-bold px-5 py-2.5 rounded-xl hover:bg-secondary/80 transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-primary text-primary-foreground font-black px-6 py-2.5 rounded-xl hover:bg-primary/95 transition-all shadow-md text-sm active:scale-95 disabled:opacity-50 flex items-center gap-2"
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Submitting...</>
            ) : (
              'Submit Completion & Start Review Clock'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Review Completion Proof Modal ──────────────────────────────────────────

interface ReviewCompletionModalProps {
  job: Job;
  onClose: () => void;
  onSuccess: (newStatus: 'completed' | 'disputed') => void;
  showToast: (text: string, type?: 'success' | 'error') => void;
  setModalConfirmConfig: any;
}

function ReviewCompletionModal({
  job,
  onClose,
  onSuccess,
  showToast,
  setModalConfirmConfig
}: ReviewCompletionModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobPayment, setJobPayment] = useState<any>(null);
  const [jobProofs, setJobProofs] = useState<any[]>([]);
  const [proofImageUrls, setProofImageUrls] = useState<string[]>([]);
  const [showDisputeBlock, setShowDisputeBlock] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeFiles, setDisputeFiles] = useState<File[]>([]);
  const [disputePreviews, setDisputePreviews] = useState<string[]>([]);
  const [disputeUploading, setDisputeUploading] = useState(false);
  const [disputeError, setDisputeError] = useState<string | null>(null);

  // Local helper to format AUD cents
  const formatCentsToAud = (cents: number) => {
    return (cents / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
  };

  // Handle selected image files for disputes
  const handleDisputeFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDisputeError(null);
    const files = Array.from(e.target.files || []);
    const validFiles: File[] = [];
    const newPreviews: string[] = [];

    for (const file of files) {
      if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) {
        setDisputeError('Only image files (jpeg, jpg, png, webp) are allowed.');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setDisputeError('File size must be under 5MB.');
        return;
      }
      validFiles.push(file);
      newPreviews.push(URL.createObjectURL(file));
    }

    setDisputeFiles(prev => [...prev, ...validFiles]);
    setDisputePreviews(prev => [...prev, ...newPreviews]);
  };

  // Remove selected image file
  const removeDisputeFile = (index: number) => {
    URL.revokeObjectURL(disputePreviews[index]);
    setDisputeFiles(prev => prev.filter((_, i) => i !== index));
    setDisputePreviews(prev => prev.filter((_, i) => i !== index));
  };

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      disputePreviews.forEach(url => URL.revokeObjectURL(url));
    };
  }, [disputePreviews]);

  // Escape key listener to close modal (disabled when uploading)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !disputeUploading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, disputeUploading]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const { data: pData, error: pErr } = await getPaymentForJob(job.id);
        if (pErr) throw pErr;
        setJobPayment(pData);

        const { data: prData, error: prErr } = await getCompletionProofsForJob(job.id);
        if (prErr) throw prErr;
        setJobProofs(prData || []);

        if (prData && prData.length > 0 && prData[0].attachments && prData[0].attachments.length > 0) {
          const urls: string[] = [];
          for (const path of prData[0].attachments) {
            try {
              const { data, error: sErr } = await supabase.storage
                .from('completion_proofs')
                .createSignedUrl(path, 3600);
              if (!sErr && data?.signedUrl) {
                urls.push(data.signedUrl);
              }
            } catch (e) {
              console.error('Error generating signed URL:', e);
            }
          }
          setProofImageUrls(urls);
        }
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'Failed to load completion details.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [job.id]);

  if (loading) {
    return (
      <div 
        onClick={() => { if (!disputeUploading) onClose(); }} 
        className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
      >
        <div 
          onClick={(e) => e.stopPropagation()} 
          className="bg-card border border-border w-full max-w-lg rounded-3xl shadow-2xl p-8 text-center space-y-4"
        >
          <Loader2 className="h-8 w-8 text-primary animate-spin mx-auto" />
          <p className="text-sm font-semibold text-muted-foreground">Loading completion proof details...</p>
        </div>
      </div>
    );
  }

  if (error || !jobPayment || jobProofs.length === 0) {
    return (
      <div 
        onClick={() => { if (!disputeUploading) onClose(); }} 
        className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
      >
        <div 
          onClick={(e) => e.stopPropagation()} 
          className="bg-card border border-border w-full max-w-lg rounded-3xl shadow-2xl p-6 space-y-4"
        >
          <div className="flex items-start gap-3 text-red-500">
            <AlertTriangle className="h-6 w-6 shrink-0" />
            <div>
              <h3 className="text-lg font-bold text-foreground">Failed to load details</h3>
              <p className="text-sm font-medium mt-1">{error || 'Completion proof data not found.'}</p>
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button 
              onClick={onClose} 
              className="bg-secondary text-secondary-foreground font-bold px-5 py-2.5 rounded-xl hover:bg-secondary/80 transition-colors text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const proof = jobProofs[0];

  return (
    <div 
      onClick={() => { if (!disputeUploading) onClose(); }} 
      className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
    >
      <div 
        onClick={(e) => e.stopPropagation()} 
        className="bg-card border border-slate-200 w-full max-w-lg rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh]"
      >
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-200 flex items-start justify-between gap-4 shrink-0 bg-slate-50">
          <div>
            <h3 className="text-xl font-extrabold text-slate-900">Review Completion Proof</h3>
            <p className="text-sm text-slate-500 font-semibold mt-0.5 line-clamp-1">{job.title}</p>
          </div>
          <button 
            onClick={onClose} 
            disabled={disputeUploading}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-500 shrink-0 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Content Scrollable Area */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 min-h-0">
          
          {/* Live countdown timer */}
          <ReviewCountdown deadline={proof.auto_release_at} />

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Submitted by Tradie:</p>
            <p className="text-sm text-slate-800 leading-relaxed italic font-medium bg-white border border-slate-200 p-3 rounded-xl">
              "{proof.description}"
            </p>

            {proofImageUrls.length > 0 && (
              <div className="space-y-2 pt-1">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Attached Proof Photos:</p>
                {/* TODO: Implement proof image gallery/lightbox viewer for multiple completion/dispute images */}
                <div className="flex flex-wrap gap-2">
                  {proofImageUrls.map((url, idx) => (
                    <a
                      key={idx}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative h-20 w-20 border border-slate-200 rounded-xl overflow-hidden hover:opacity-85 transition-all shadow-sm flex items-center justify-center bg-white"
                    >
                      <img src={url} alt={`Proof ${idx + 1}`} className="h-full w-full object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            )}
            <p className="text-xs font-semibold text-slate-500 border-t border-slate-200 pt-2 mt-2">
              Auto-release deadline: {new Date(proof.auto_release_at).toLocaleString()}
            </p>
          </div>

          {/* Calmer Instruction Notice Card */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold leading-relaxed flex items-start gap-2.5">
            <Clock className="h-4.5 w-4.5 shrink-0 mt-0.5 text-slate-500" />
            <span className="text-slate-700">
              Please review the completed work carefully. You can approve and release the secure job payment of <span className="font-bold text-slate-900">{formatCentsToAud(jobPayment.amount)}</span> to the tradie, or raise an issue to dispute the completion if expectations were not met.
            </span>
          </div>

          {/* Action buttons */}
          <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl text-[10px] text-muted-foreground font-semibold leading-relaxed mb-4 text-left">
            <span className="font-black text-amber-800 uppercase block mb-1">Payment Release Disclaimer:</span>
            Only approve completed work when you are satisfied with the outcome and evidence. Raise a dispute before approval if something is wrong. TradieHubAU reviews support platform trust but do not replace your own due diligence. This is not legal, building, tax, or insurance advice.
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              disabled={disputeUploading}
              onClick={() => {
                setModalConfirmConfig({
                  title: "Approve Completion & Release Funds",
                  message: `Are you sure you want to approve the work and release the secure job payment of ${formatCentsToAud(jobPayment.amount)} to the tradie? Only approve completed work when you are satisfied with the outcome and evidence. Payouts cannot be reversed.`,
                  onConfirm: async () => {
                    const { error: appErr } = await approveJobCompletion(job.id);
                    if (appErr) {
                      showToast(appErr.message, 'error');
                    } else {
                      showToast("Job approved! Protected payment released successfully.", 'success');
                      onSuccess('completed');
                    }
                  }
                });
              }}
              className="bg-green-600 hover:bg-green-700 text-white font-black text-xs py-3 rounded-xl transition-all shadow-md active:scale-95 text-center flex items-center justify-center cursor-pointer disabled:opacity-50"
            >
              Approve Work & Release Payment
            </button>
            
            <button
              disabled={disputeUploading}
              onClick={() => setShowDisputeBlock(!showDisputeBlock)}
              className="bg-red-50 hover:bg-red-100/80 text-red-600 border border-red-200 font-black text-xs py-3 rounded-xl transition-all shadow active:scale-95 text-center flex items-center justify-center cursor-pointer disabled:opacity-50"
            >
              Dispute Work Completion
            </button>
          </div>

          {/* Dispute block */}
          {showDisputeBlock && (
            <div className="p-4 bg-red-50/50 border border-red-200 rounded-2xl space-y-3 font-semibold animate-in slide-in-from-top-2 duration-200">
              <label className="text-xs font-bold text-red-600 uppercase tracking-wider block">Describe the issue / dispute details</label>
              <textarea
                placeholder="Describe what parts of the agreement were not met and provide details of the issue..."
                rows={3}
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                className="w-full bg-white border border-red-200 rounded-xl px-3 py-2 outline-none text-xs focus:border-red-500 font-medium text-slate-800"
                disabled={disputeUploading}
              />

              {/* Dispute Image Evidence Upload */}
              <div className="space-y-2 pt-1 border-t border-red-100">
                <label className="text-[11px] font-bold text-red-600 uppercase tracking-wider block">
                  Evidence Photos (Optional)
                </label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 font-bold px-3 py-2 rounded-xl hover:border-slate-300 transition-all border text-xs cursor-pointer select-none">
                    <Upload className="h-3.5 w-3.5" /> Choose Photos
                    <input
                      type="file"
                      multiple
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      onChange={handleDisputeFileChange}
                      className="hidden"
                      disabled={disputeUploading}
                    />
                  </label>
                  <span className="text-[10px] text-slate-500 font-semibold">
                    JPEG, PNG, WEBP (Max 5MB each)
                  </span>
                </div>
                {disputeError && (
                  <p className="text-[11px] font-bold text-red-500">{disputeError}</p>
                )}
                {disputePreviews.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 pt-1">
                    {disputePreviews.map((url, index) => (
                      <div key={index} className="relative h-16 w-16 border border-slate-200 rounded-xl overflow-hidden group bg-white shadow-sm">
                        <img src={url} alt="Dispute Preview" className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeDisputeFile(index)}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 shadow-md hover:bg-red-600 transition-colors"
                          disabled={disputeUploading}
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                disabled={disputeUploading}
                onClick={() => {
                  if (!disputeReason.trim()) {
                    showToast("Please enter a description of the issue.", 'error');
                    return;
                  }
                  setModalConfirmConfig({
                    title: "Initiate Dispute Request",
                    message: "Are you sure you want to raise a dispute for this job? The secure payment will remain locked while our administration team reviews the case.",
                    onConfirm: async () => {
                      if (!user) {
                        showToast("You must be logged in to raise a dispute.", 'error');
                        return;
                      }
                      setDisputeUploading(true);
                      setDisputeError(null);
                      try {
                        const uploadedPaths: string[] = [];
                        for (const file of disputeFiles) {
                          const fileExt = file.name.split('.').pop();
                          const randomStr = Math.random().toString(36).substring(2, 10);
                          const filePath = `disputes/${job.id}/${user.id}/${Date.now()}_${randomStr}.${fileExt}`;

                          const { error: uploadErr } = await supabase.storage
                            .from('completion_proofs')
                            .upload(filePath, file);

                          if (uploadErr) {
                            throw new Error(`Failed to upload ${file.name}: ${uploadErr.message}`);
                          }
                          uploadedPaths.push(filePath);
                        }

                        const { error: dispErr } = await raiseJobIssue(job.id, disputeReason.trim(), uploadedPaths);
                        if (dispErr) {
                          throw dispErr;
                        }
                        showToast("Dispute raised! The admin team will review and contact you.", 'success');
                        onSuccess('disputed');
                      } catch (err: any) {
                        console.error(err);
                        showToast(err.message || "Failed to initiate dispute.", 'error');
                        setDisputeError(err.message || "Failed to initiate dispute.");
                      } finally {
                        setDisputeUploading(false);
                      }
                    }
                  });
                }}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-black text-xs py-2.5 rounded-xl transition-all shadow active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {disputeUploading ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Submitting Dispute...</>
                ) : (
                  'Initiate Official Dispute'
                )}
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-6 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            disabled={disputeUploading}
            className="bg-secondary text-secondary-foreground font-bold px-5 py-2.5 rounded-xl hover:bg-secondary/80 transition-colors text-sm cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
