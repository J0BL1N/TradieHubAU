import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchJobs } from '../lib/jobs';
import type { Job } from '../lib/jobs';
import { submitApplication, getMyApplicationForJob, getApplicationsForJob, getMyApplications } from '../lib/applications';
import type { Application } from '../lib/applications';
import { toggleSavedItem, getSavedItemIds } from '../lib/saved';
import { useAuth } from '../components/AuthProvider';
import {
  Search, MapPin, DollarSign, Briefcase, AlertTriangle,
  SlidersHorizontal, X, Clock, User, Filter, RefreshCw,
  Bookmark, BookmarkCheck, Send, CheckCircle, AlertCircle,
  FileText, Loader2
} from 'lucide-react';
import { 
  acceptQuote, submitCompletionProof, raiseJobIssue, approveJobCompletion, 
  submitVariationRequest, approveVariation, rejectVariation, getPaymentForJob, 
  getVariationsForJob, getCompletionProofsForJob, getIssuesForJob, simulatePaymentFunding,
  getLedgerForPayment, simulateVariationFunding
} from '../lib/payments';
import { supabase } from '../lib/supabase';

// ─── Application Modal ────────────────────────────────────────────────────────

interface ApplyModalProps {
  job: Job;
  existingApplication: Application | null;
  onClose: () => void;
  onSuccess: (app: Application) => void;
}

function ApplyModal({ job, existingApplication, onClose, onSuccess }: ApplyModalProps) {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [estimate, setEstimate] = useState('');
  const [availability, setAvailability] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If already applied, show existing application summary
  if (existingApplication && existingApplication.status !== 'withdrawn') {
    return (
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
        <div className="bg-card border border-border w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
          <div className="p-6 border-b flex items-start justify-between gap-4">
            <h3 className="text-xl font-extrabold text-foreground">Application Submitted</h3>
            <button onClick={onClose} className="p-1.5 rounded-lg border hover:bg-muted text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-600">
              <CheckCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <div className="text-sm font-semibold">
                You have already submitted an application for this job.
              </div>
            </div>
            <div className="space-y-2 text-sm font-medium text-muted-foreground bg-muted/30 p-4 rounded-xl border">
              <div className="flex justify-between">
                <span className="text-xs font-bold uppercase tracking-wider">Status</span>
                <span className={`font-bold capitalize ${
                  existingApplication.status === 'accepted' ? 'text-green-500' :
                  existingApplication.status === 'declined' ? 'text-red-500' : 'text-amber-500'
                }`}>{existingApplication.status}</span>
              </div>
              {existingApplication.estimate !== null && (
                <div className="flex justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider">Your Quote</span>
                  <span className="font-bold text-foreground">${existingApplication.estimate?.toLocaleString()}</span>
                </div>
              )}
              <div className="border-t pt-2 mt-2">
                <p className="text-xs font-bold uppercase tracking-wider mb-1">Your Message</p>
                <p className="text-foreground leading-relaxed">{existingApplication.message}</p>
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!user) {
      setError('You must be signed in to apply.');
      return;
    }

    if (message.trim().length < 20) {
      setError('Your message must be at least 20 characters.');
      return;
    }

    if (!estimate) {
      setError('Please enter a valid estimate amount for your quote.');
      return;
    }

    const estimateVal = parseFloat(estimate);
    if (isNaN(estimateVal) || estimateVal <= 0) {
      setError('Please enter a valid positive estimate.');
      return;
    }

    setSubmitting(true);
    const { data, error: submitErr } = await submitApplication({
      job_id: job.id,
      customer_id: job.customer_id,
      message: message.trim(),
      estimate: estimateVal,
      availability: availability.trim() || null,
    });

    setSubmitting(false);

    if (submitErr) {
      // Handle duplicate constraint violation gracefully (PostgrestError code 23505)
      if ((submitErr as any).code === '23505') {
        setError('You have already applied for this job.');
      } else {
        setError(submitErr.message || 'Failed to submit application. Please try again.');
      }
      return;
    }

    if (data) onSuccess(data as Application);
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-card border border-border w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-6 border-b flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-extrabold text-foreground">Apply for Job</h3>
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

          {/* Message */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-foreground uppercase tracking-wider">
              Cover Message <span className="text-red-400">*</span>
            </label>
            <textarea
              rows={4}
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

          <div className="grid grid-cols-2 gap-4">
            {/* Estimate */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground uppercase tracking-wider">
                Your Quote ($) <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="e.g. 450"
                  value={estimate}
                  onChange={(e) => setEstimate(e.target.value)}
                  className="w-full pl-9 pr-3 py-3 bg-background border border-border rounded-xl outline-none focus:border-primary/50 text-sm font-semibold transition-all"
                  required
                />
              </div>
            </div>

            {/* Availability */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground uppercase tracking-wider">
                Availability
              </label>
              <input
                type="text"
                placeholder="e.g. This weekend"
                value={availability}
                onChange={(e) => setAvailability(e.target.value)}
                className="w-full px-4 py-3 bg-background border border-border rounded-xl outline-none focus:border-primary/50 text-sm font-semibold transition-all"
              />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 text-primary text-xs font-semibold leading-relaxed flex items-start gap-2">
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

  // Applications: map of job_id → Application (for jobs the user has applied to)
  const [myApplications, setMyApplications] = useState<Map<string, Application>>(new Map());

  // Modal state
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [applyJob, setApplyJob] = useState<Job | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  // Filter States
  const [searchText, setSearchText] = useState('');
  const [selectedState, setSelectedState] = useState('all');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [budgetRange, setBudgetRange] = useState('any');
  const [selectedUrgencies, setSelectedUrgencies] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState('recent');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Quote / Payment Lifecycle states
  const [activeTab, setActiveTab] = useState<'all' | 'my_jobs'>('all');
  const [myJobsStatusFilter, setMyJobsStatusFilter] = useState('all');
  const [savedJobsOnly, setSavedJobsOnly] = useState(false);
  const [jobApplications, setJobApplications] = useState<any[]>([]);
  const [jobPayment, setJobPayment] = useState<any | null>(null);
  const [jobLedger, setJobLedger] = useState<any[]>([]);
  const [jobVariations, setJobVariations] = useState<any[]>([]);
  const [jobProofs, setJobProofs] = useState<any[]>([]);
  const [jobIssues, setJobIssues] = useState<any[]>([]);
  const [loadingLifecycle, setLoadingLifecycle] = useState(false);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);

  const formatCentsToAud = (cents: number) => {
    return (cents / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
  };

  const fetchJobLifecycleDetails = useCallback(async (jobId: string) => {
    setLoadingLifecycle(true);
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

      const { data: vData } = await getVariationsForJob(jobId);
      setJobVariations(vData);

      const { data: prData } = await getCompletionProofsForJob(jobId);
      setJobProofs(prData);

      const { data: iData } = await getIssuesForJob(jobId);
      setJobIssues(iData);

      const isOwner = selectedJob?.customer_id === user?.id;
      if (isOwner) {
        const { data: appData } = await getApplicationsForJob(jobId);
        setJobApplications(appData);
      }
    } catch (err: any) {
      setLifecycleError(err.message || 'Failed to load details.');
    } finally {
      setLoadingLifecycle(false);
    }
  }, [user, selectedJob]);

  useEffect(() => {
    if (selectedJob) {
      fetchJobLifecycleDetails(selectedJob.id);
    } else {
      setJobApplications([]);
      setJobPayment(null);
      setJobLedger([]);
      setJobVariations([]);
      setJobProofs([]);
      setJobIssues([]);
    }
  }, [selectedJob, fetchJobLifecycleDetails]);

  // Force refetch tab items when activeTab changes
  useEffect(() => {
    setMyJobsStatusFilter('all');
    loadJobs();
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
  }, [searchParams, setSearchParams]);

  // ─── Load Jobs ──────────────────────────────────────────────────────────────
  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (activeTab === 'all') {
        const { data, error: fetchErr } = await fetchJobs({ status: 'open' });
        if (fetchErr) throw fetchErr;
        setJobs(data);
      } else if (activeTab === 'my_jobs') {
        if (!user) throw new Error('Not authenticated');
        
        // 1. Fetch customer owned jobs (with their applications list)
        const { data: customerJobs, error: custErr } = await supabase
          .from('jobs')
          .select('*, customer:users!customer_id(id, display_name, avatar_url, suburb, state), applications(id, status, tradie_id)')
          .eq('customer_id', user.id);
        if (custErr) throw custErr;

        // 2. Fetch jobs where user has applied (with their application details)
        const { data: tradieJobs, error: tradieErr } = await supabase
          .from('jobs')
          .select('*, customer:users!customer_id(id, display_name, avatar_url, suburb, state), applications!inner(id, status, tradie_id)')
          .eq('applications.tradie_id', user.id);
        if (tradieErr) throw tradieErr;

        // Merge and de-duplicate by job.id
        const merged = [...(customerJobs || []), ...(tradieJobs || [])];
        const uniqueJobs = Array.from(new Map(merged.map(item => [item.id, item])).values());
        
        setJobs(uniqueJobs as Job[]);
      }
    } catch (fetchErr: any) {
      setError(fetchErr.message || 'Failed to load jobs.');
    } finally {
      setLoading(false);
    }
  }, [user, activeTab]);

  // ─── Load saved job IDs for logged-in user ──────────────────────────────────
  const loadSavedState = useCallback(async () => {
    if (!user) return;
    const ids = await getSavedItemIds('job');
    setSavedJobIds(ids);
  }, [user]);

  // ─── Load user's existing applications ─────────────────────────────────────
  const loadApplications = useCallback(async () => {
    if (!user) return;
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
  }, [user]);

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
    setSelectedJob(null); // close detail modal
    // Pre-fetch existing application
    if (user) {
      const { data } = await getMyApplicationForJob(job.id);
      if (data) {
        setMyApplications((prev) => new Map(prev).set(job.id, data));
      }
    }
    setApplyJob(job);
  };

  // ─── Application Success ────────────────────────────────────────────────────
  const handleApplicationSuccess = (app: Application) => {
    setMyApplications((prev) => new Map(prev).set(app.job_id, app));
    setApplyJob(null);
    setShowSuccess(true);
  };

  // ─── Filters ────────────────────────────────────────────────────────────────
  const filteredJobs = jobs.filter((job) => {
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
        !job.location.toLowerCase().includes(q) &&
        !categoryMatch
      ) {
        return false;
      }
    }
    if (selectedState !== 'all' && job.state.toUpperCase() !== selectedState.toUpperCase()) return false;
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
      const isOwner = job.customer_id === user?.id;
      const hasApps = job.applications && job.applications.length > 0;
      const hasApplied = myApplications.has(job.id) && myApplications.get(job.id)?.status !== 'withdrawn';

      switch (myJobsStatusFilter) {
        case 'open_posted':
          if (!(isOwner && job.status === 'open' && !hasApps)) return false;
          break;
        case 'quotes_received':
          if (!(isOwner && job.status === 'open' && hasApps)) return false;
          break;
        case 'quote_submitted':
          if (!(!isOwner && job.status === 'open' && hasApplied)) return false;
          break;
        case 'awaiting_payment':
          if (job.status !== 'accepted') return false;
          break;
        case 'payment_funded':
          if (job.status !== 'payment_held') return false;
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

  const activeCount = jobs.filter((j) => j.status === 'open').length;
  const urgentCount = jobs.filter((j) => j.status === 'open' && j.urgency === 'urgent').length;
  const totalValue = jobs.reduce((sum, j) => sum + (j.budget_max ?? j.budget_min ?? 0), 0);

  const toggleCategory = (id: string) => setSelectedCategories((p) => p.includes(id) ? p.filter((c) => c !== id) : [...p, id]);
  const toggleUrgency = (id: string) => setSelectedUrgencies((p) => p.includes(id) ? p.filter((u) => u !== id) : [...p, id]);
  const toggleType = (id: string) => setSelectedTypes((p) => p.includes(id) ? p.filter((t) => t !== id) : [...p, id]);
  const clearAllFilters = () => {
    setSearchText(''); setSelectedState('all'); setSelectedCategories([]);
    setBudgetRange('any'); setSelectedUrgencies([]); setSelectedTypes([]); setSortBy('recent');
    setMyJobsStatusFilter('all');
    setSavedJobsOnly(false);
    setSearchParams({});
  };

  const formatBudget = (min: number | null, max: number | null) => {
    if (min === null && max === null) return 'Budget TBD';
    if (min !== null && max !== null) return `$${min.toLocaleString()} – $${max.toLocaleString()}`;
    if (min !== null) return `From $${min.toLocaleString()}`;
    return `Up to $${max!.toLocaleString()}`;
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
            <option value="all">All My Jobs</option>
            <option value="open_posted">Open / Posted</option>
            <option value="quotes_received">Quotes Received</option>
            <option value="quote_submitted">Quote Submitted</option>
            <option value="awaiting_payment">Quote Accepted — Awaiting Payment</option>
            <option value="payment_funded">Payment Funded</option>
            <option value="contract_active">Contract Active</option>
            <option value="completion_review">Completion Review</option>
            <option value="disputed">Disputed</option>
            <option value="completed">Completed</option>
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
        <label className="text-xs font-bold text-foreground uppercase tracking-wider">State</label>
        <select value={selectedState} onChange={(e) => setSelectedState(e.target.value)}
          className="w-full px-3 py-2 border rounded-xl bg-background outline-none text-sm focus:border-primary/50 transition-all font-medium">
          <option value="all">All Australia</option>
          {['NSW','VIC','QLD','WA','SA','TAS','ACT','NT'].map((s) => <option key={s} value={s}>{s}</option>)}
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

      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Active Jobs Board</h1>
        <p className="text-muted-foreground mt-1">
          Browse job listings posted by customers. Save jobs, or submit quotes directly.
        </p>
      </div>

      {/* Tabs */}
      {user && (
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
        </div>
      )}

      {/* Stats Counter Bar */}
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

      {/* Filter + Content Layout */}
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Sidebar — Desktop */}
        <aside className="hidden lg:block w-1/4 bg-card border p-6 rounded-2xl sticky top-24">
          <SidebarFilters />
        </aside>

        {/* Content Area */}
        <div className="flex-1 w-full space-y-6">
          {/* Toolbar */}
          <div className="bg-card border p-4 rounded-xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-foreground">{sortedJobs.length}</span>
              <span className="text-sm text-muted-foreground font-semibold">jobs found</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setMobileFiltersOpen(true)}
                className="lg:hidden p-2 border rounded-xl hover:bg-muted text-muted-foreground flex items-center gap-1.5 text-xs font-bold">
                <SlidersHorizontal className="h-4 w-4" /> Filters
              </button>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-2 border rounded-xl bg-background outline-none text-xs font-bold text-muted-foreground focus:border-primary/50 cursor-pointer">
                <option value="recent">Most Recent</option>
                <option value="highest">Highest Budget</option>
                <option value="urgent">Urgent First</option>
              </select>
              <button onClick={loadJobs} className="p-2 border rounded-xl hover:bg-muted text-muted-foreground" title="Refresh jobs">
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
          {user && !isVerifiedTradie && (
            <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm font-semibold">
              <span className="text-muted-foreground">You are logged in as a Customer. To quote or apply on jobs, please submit your trade verification details.</span>
              <Link to="/profile" className="bg-amber-500 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-amber-600 transition-colors shadow-sm whitespace-nowrap">
                Apply to be a Tradie
              </Link>
            </div>
          )}

          {/* Loading / Error / Empty */}
          {loading ? (
            <div className="flex flex-col items-center justify-center p-12 bg-card border rounded-2xl gap-4">
              <RefreshCw className="h-8 w-8 text-primary animate-spin" />
              <p className="text-sm font-semibold text-muted-foreground">Connecting to Supabase...</p>
            </div>
          ) : error ? (
            <div className="p-8 bg-red-500/10 border border-red-500/20 text-red-500 rounded-2xl text-center space-y-4">
              <AlertTriangle className="h-10 w-10 mx-auto" />
              <h3 className="text-lg font-bold">Failed to load jobs</h3>
              <p className="text-sm font-medium">{error}</p>
              <button onClick={loadJobs} className="bg-red-500 text-white font-semibold px-4 py-2 rounded-xl text-xs hover:bg-red-600 transition-colors">
                Try Again
              </button>
            </div>
          ) : sortedJobs.length === 0 ? (
            <div className="p-12 bg-card border rounded-2xl text-center space-y-4">
              <Briefcase className="h-12 w-12 text-muted-foreground/30 mx-auto" />
              <h3 className="text-xl font-bold text-foreground">No jobs matching filters</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Try modifying your trade category, selecting a different state, or clearing filters.
              </p>
              <button onClick={clearAllFilters} className="bg-primary text-primary-foreground font-semibold px-5 py-2.5 rounded-xl text-sm shadow-md hover:bg-primary/95">
                Clear All Filters
              </button>
            </div>
          ) : (
            /* Job Listings */
            <div className="grid grid-cols-1 gap-4">
              {sortedJobs.map((job) => {
                const isSaved = savedJobIds.has(job.id);
                const isSaving = savingId === job.id;
                const hasApplied = myApplications.has(job.id) && myApplications.get(job.id)?.status !== 'withdrawn';

                return (
                  <div
                    key={job.id}
                    className="p-6 bg-card border border-border rounded-2xl hover:shadow-md transition-all flex flex-col md:flex-row md:items-start justify-between gap-6"
                  >
                    <div className="space-y-4 flex-grow min-w-0">
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
                          <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-500 uppercase tracking-wider border border-amber-500/25">
                            Quote Accepted — Awaiting Payment
                          </span>
                        )}
                        {job.status === 'payment_held' && (
                          <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md bg-green-500/10 text-green-600 uppercase tracking-wider border border-green-500/25">
                            Contract Active
                          </span>
                        )}
                        {job.status === 'completed_pending_review' && (
                          <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-500 uppercase tracking-wider border border-blue-500/25">
                            Completed — Pending Review
                          </span>
                        )}
                        {job.status === 'disputed' && (
                          <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-500/10 text-red-500 uppercase tracking-wider border border-red-500/25">
                            Disputed
                          </span>
                        )}
                        {job.status === 'completed' && (
                          <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 uppercase tracking-wider border border-emerald-500/25">
                            Completed & Released
                          </span>
                        )}
                        {job.status === 'cancelled' && (
                          <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md bg-gray-500/10 text-gray-500 uppercase tracking-wider border border-gray-500/25">
                            Cancelled
                          </span>
                        )}
                      </div>

                      <div className="space-y-1">
                        <h3
                          onClick={() => setSelectedJob(job)}
                          className="text-xl font-extrabold text-foreground hover:text-primary cursor-pointer transition-colors leading-snug truncate"
                        >
                          {job.title}
                        </h3>
                        <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">{job.description}</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground font-semibold border-t pt-4">
                        <span className="flex items-center"><MapPin className="mr-1.5 h-3.5 w-3.5" />{job.location}</span>
                        <span className="flex items-center"><DollarSign className="mr-1.5 h-3.5 w-3.5" />{formatBudget(job.budget_min, job.budget_max)}</span>
                        <span className="flex items-center"><Clock className="mr-1.5 h-3.5 w-3.5" />{formatDate(job.created_at)}</span>
                        {job.customer?.display_name && (
                          <span className="flex items-center"><User className="mr-1.5 h-3.5 w-3.5" />By {job.customer.display_name}</span>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="shrink-0 flex flex-row md:flex-col items-center gap-2 md:self-center">
                      {/* Save button — only shown to logged-in users */}
                      {user && (
                        <button
                          onClick={(e) => handleToggleSave(job.id, e)}
                          disabled={isSaving}
                          title={isSaved ? 'Unsave job' : 'Save job'}
                          className={`p-2.5 rounded-xl border transition-all ${
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
                      )}

                      <button
                        onClick={() => setSelectedJob(job)}
                        className="bg-secondary text-secondary-foreground text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-secondary/80 transition-all whitespace-nowrap"
                      >
                        Details
                      </button>

                      {user ? (
                        (() => {
                          const app = myApplications.get(job.id);
                          const isApplied = app && app.status !== 'withdrawn';
                          const isAcceptedTradie = app && app.status === 'accepted';
                          const isOwner = job.customer_id === user.id;

                          if (isOwner) {
                            if (job.status === 'open') {
                              const appsCount = job.applications?.length || 0;
                              if (appsCount > 0) {
                                return (
                                  <button
                                    disabled
                                    className="text-sm font-bold px-4 py-2.5 rounded-xl bg-blue-500/10 text-blue-600 border border-blue-500/20 cursor-default whitespace-nowrap"
                                  >
                                    Quotes Received ({appsCount})
                                  </button>
                                );
                              }
                              return (
                                <button
                                  disabled
                                  className="text-sm font-bold px-4 py-2.5 rounded-xl bg-gray-100 text-gray-500 border border-gray-200 cursor-default whitespace-nowrap"
                                >
                                  Posted
                                </button>
                              );
                            }
                            if (job.status === 'accepted') {
                              return (
                                <button
                                  disabled
                                  className="text-sm font-bold px-4 py-2.5 rounded-xl bg-amber-500 text-amber-950 cursor-default whitespace-nowrap"
                                >
                                  Accepted — Awaiting Payment
                                </button>
                              );
                            }
                            if (['payment_held', 'completed_pending_review', 'disputed'].includes(job.status)) {
                              return (
                                <button
                                  disabled
                                  className="text-sm font-bold px-4 py-2.5 rounded-xl bg-green-600 text-white cursor-default whitespace-nowrap"
                                >
                                  Contract Active
                                </button>
                              );
                            }
                            if (job.status === 'completed') {
                              return (
                                <button
                                  disabled
                                  className="text-sm font-bold px-4 py-2.5 rounded-xl bg-emerald-600 text-white cursor-default whitespace-nowrap"
                                >
                                  Completed ✓
                                </button>
                              );
                            }
                          } else {
                            if (job.status === 'open') {
                              if (isApplied) {
                                return (
                                  <button
                                    disabled
                                    className="text-sm font-bold px-4 py-2.5 rounded-xl bg-green-500/10 text-green-600 border border-green-500/20 cursor-default whitespace-nowrap"
                                  >
                                    Applied ✓
                                  </button>
                                );
                              }
                              return (
                                <button
                                  onClick={() => {
                                    if (!isVerifiedTradie) {
                                      showToast("Verification Required: Only verified tradies can quote on jobs. Please visit your Profile to submit your verification details.", 'error');
                                      return;
                                    }
                                    handleOpenApply(job);
                                  }}
                                  className={`text-sm font-bold px-4 py-2.5 rounded-xl transition-all shadow-md active:scale-95 whitespace-nowrap ${
                                    !isVerifiedTradie
                                      ? 'bg-muted text-muted-foreground border border-border cursor-not-allowed'
                                      : 'bg-primary text-primary-foreground hover:bg-primary/95'
                                  }`}
                                >
                                  Apply
                                </button>
                              );
                            }

                            if (job.status === 'accepted') {
                              if (isAcceptedTradie) {
                                return (
                                  <button
                                    disabled
                                    className="text-sm font-bold px-4 py-2.5 rounded-xl bg-amber-500 text-amber-950 cursor-default whitespace-nowrap"
                                  >
                                    Accepted — Awaiting Payment
                                  </button>
                                );
                              }
                            } else if (['payment_held', 'completed_pending_review', 'disputed'].includes(job.status)) {
                              if (isAcceptedTradie) {
                                return (
                                  <button
                                    disabled
                                    className="text-sm font-bold px-4 py-2.5 rounded-xl bg-green-600 text-white cursor-default whitespace-nowrap"
                                  >
                                    Contract Active
                                  </button>
                                );
                              }
                            } else if (job.status === 'completed') {
                              if (isAcceptedTradie) {
                                return (
                                  <button
                                    disabled
                                    className="text-sm font-bold px-4 py-2.5 rounded-xl bg-emerald-600 text-white cursor-default whitespace-nowrap"
                                  >
                                    Completed ✓
                                  </button>
                                );
                              }
                            }
                          }

                          return (
                            <button
                              disabled
                              className="text-sm font-bold px-4 py-2.5 rounded-xl bg-gray-200 text-gray-400 cursor-default whitespace-nowrap"
                            >
                              Closed
                            </button>
                          );
                        })()
                      ) : (
                        <Link
                          to="/login"
                          className="bg-primary text-primary-foreground text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-primary/95 transition-all shadow-md whitespace-nowrap"
                        >
                          Apply
                        </Link>
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
      {mobileFiltersOpen && (
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
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border w-full max-w-2xl rounded-3xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
            <div className="p-6 border-b flex items-start justify-between gap-4">
              <div className="space-y-2">
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
                <h3 className="text-2xl font-extrabold text-foreground leading-tight">{selectedJob.title}</h3>
              </div>
              <button onClick={() => setSelectedJob(null)} className="p-2 rounded-xl border hover:bg-muted text-muted-foreground hover:text-foreground transition-all shrink-0">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm font-medium">
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Job Description</h4>
                <p className="text-foreground leading-relaxed whitespace-pre-wrap">{selectedJob.description}</p>
              </div>
              <div className="grid grid-cols-2 gap-6 bg-muted/20 border p-5 rounded-2xl">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Location</span>
                  <p className="text-foreground font-bold flex items-center gap-1.5 mt-0.5"><MapPin className="h-4 w-4 text-muted-foreground" />{selectedJob.location}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Est. Budget</span>
                  <p className="text-foreground font-bold flex items-center gap-1.5 mt-0.5"><DollarSign className="h-4 w-4 text-muted-foreground" />{formatBudget(selectedJob.budget_min, selectedJob.budget_max)}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Job Type</span>
                  <p className="text-foreground font-bold flex items-center gap-1.5 mt-0.5"><Briefcase className="h-4 w-4 text-muted-foreground" />{selectedJob.type || 'Standard'}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Timeline</span>
                  <p className="text-foreground font-bold flex items-center gap-1.5 mt-0.5"><Clock className="h-4 w-4 text-muted-foreground" />{selectedJob.timeline || 'Flexible'}</p>
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

              {/* Lifecycle Section */}
              {user && (
                <div className="border-t pt-6 space-y-6">
                  {loadingLifecycle ? (
                    <div className="flex justify-center p-4">
                      <Loader2 className="h-6 w-6 text-primary animate-spin" />
                    </div>
                  ) : (
                    <>
                      {lifecycleError && (
                        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold flex items-start gap-2.5">
                          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                          <span>{lifecycleError}</span>
                        </div>
                      )}
                      {/* 1. Payment Status Bar / Steps */}
                      {selectedJob.status !== 'open' && selectedJob.status !== 'cancelled' && jobPayment && (
                        <div className="space-y-4">
                          <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Protected Payment Status</h4>
                          
                          {/* Step Progress Visual */}
                          <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-bold">
                            <div className={`p-2 rounded-xl border ${selectedJob.status === 'accepted' ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-muted border-transparent text-muted-foreground'}`}>
                              1. Accepted
                            </div>
                            <div className={`p-2 rounded-xl border ${selectedJob.status === 'payment_held' ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-muted border-transparent text-muted-foreground'}`}>
                              2. Payment Funded
                            </div>
                            <div className={`p-2 rounded-xl border ${selectedJob.status === 'completed_pending_review' || selectedJob.status === 'disputed' ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-muted border-transparent text-muted-foreground'}`}>
                              3. Review
                            </div>
                            <div className={`p-2 rounded-xl border ${selectedJob.status === 'completed' ? 'bg-green-500/10 border-green-500/30 text-green-600' : 'bg-muted border-transparent text-muted-foreground'}`}>
                              4. Completed
                            </div>
                          </div>

                          <div className="p-4 bg-muted/30 border rounded-2xl space-y-2 font-semibold">
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-muted-foreground">Contract Amount:</span>
                              <span className="text-foreground">{formatCentsToAud(jobPayment.amount)}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-muted-foreground">Payment Status:</span>
                              <span className={`uppercase text-[10px] px-2 py-0.5 rounded font-extrabold ${
                                jobPayment.status === 'held' ? 'bg-amber-500/10 text-amber-500' :
                                jobPayment.status === 'released' ? 'bg-green-500/10 text-green-600' :
                                jobPayment.status === 'refunded' ? 'bg-red-500/10 text-red-500' : 'bg-secondary text-secondary-foreground'
                              }`}>
                                {jobPayment.status === 'held' ? 'payment funded' : jobPayment.status}
                              </span>
                            </div>
                            <div className="flex justify-between items-center text-xs border-t pt-2 mt-2">
                              <span className="text-muted-foreground">Contract Status:</span>
                              <span className="text-foreground">
                                {selectedJob.status === 'accepted' ? 'Quote Accepted — Awaiting Payment' :
                                 selectedJob.status === 'payment_held' ? 'Contract Active' :
                                 selectedJob.status === 'completed_pending_review' ? 'Completed — Pending Review' :
                                 selectedJob.status === 'disputed' ? 'Disputed' :
                                 selectedJob.status === 'completed' ? 'Completed & Released' : selectedJob.status}
                              </span>
                            </div>

                            {jobLedger.length > 0 && (
                              <div className="border-t pt-3 mt-3 space-y-2">
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Transaction Ledger</span>
                                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                                  {jobLedger.map((l) => (
                                    <div key={l.id} className="flex justify-between items-center text-xs font-semibold bg-background border p-2 rounded-xl">
                                      <div className="space-y-0.5">
                                        <span className={`capitalize text-[9px] px-1.5 py-0.5 rounded font-extrabold ${
                                          l.transaction_type === 'charge' ? 'bg-blue-500/10 text-blue-500' :
                                          l.transaction_type === 'payout' ? 'bg-green-500/10 text-green-600' :
                                          l.transaction_type === 'fee' ? 'bg-orange-500/10 text-orange-600' : 'bg-red-500/10 text-red-500'
                                        }`}>{l.transaction_type}</span>
                                        <span className="text-[10px] text-muted-foreground ml-2">{new Date(l.created_at).toLocaleDateString()}</span>
                                      </div>
                                      <span className="font-bold text-foreground">{formatCentsToAud(l.amount_cents)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* 2. Customer Actions: Quote Selection */}
                      {selectedJob.customer_id === user.id && selectedJob.status !== 'cancelled' && (
                        <div className="space-y-4">
                          <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Submitted Quotes ({jobApplications.length})</h4>
                          {jobApplications.length === 0 ? (
                            <p className="text-xs text-muted-foreground font-semibold">No quotes received yet.</p>
                          ) : (
                            <div className="space-y-3">
                              {jobApplications.map((app) => (
                                <div key={app.id} className="border p-4 rounded-2xl space-y-3 bg-card font-semibold">
                                  <div className="flex justify-between items-start">
                                    <div>
                                      <h5 className="font-extrabold text-sm">{app.tradie?.display_name || 'Verified Tradie'}</h5>
                                      <p className="text-[10px] text-muted-foreground">Licence: {app.tradie?.license_number || 'N/A'} | ABN: {app.tradie?.abn || 'N/A'}</p>
                                    </div>
                                    <div className="text-right">
                                      <span className="text-sm font-black text-primary">${app.estimate?.toLocaleString()}</span>
                                      <p className="text-[10px] text-muted-foreground">{app.availability || 'Immediate start'}</p>
                                    </div>
                                  </div>
                                  <p className="text-xs text-foreground bg-muted/10 p-3 rounded-xl leading-relaxed whitespace-pre-wrap">{app.message}</p>
                                  {selectedJob.status === 'open' ? (
                                    <button
                                      onClick={() => {
                                        setModalConfirmConfig({
                                          title: "Accept Quote",
                                          message: `Accept quote from ${app.tradie?.display_name || 'this tradie'} for $${app.estimate?.toLocaleString()}?`,
                                          onConfirm: async () => {
                                            const { error } = await acceptQuote(selectedJob.id, app.id);
                                            if (error) {
                                              showToast(error.message, 'error');
                                            } else {
                                              showToast("Quote accepted. Awaiting customer payment.", 'success');
                                              setSelectedJob(prev => prev ? { ...prev, status: 'accepted' } : null);
                                              fetchJobLifecycleDetails(selectedJob.id);
                                              loadJobs();
                                            }
                                          }
                                        });
                                      }}
                                      className="w-full bg-primary hover:bg-primary/95 text-primary-foreground font-black text-xs py-2 rounded-xl transition-all shadow active:scale-95"
                                    >
                                      Accept Quote
                                    </button>
                                  ) : app.status === 'accepted' ? (
                                    selectedJob.status === 'accepted' ? (
                                      <button
                                        disabled
                                        className="w-full bg-amber-500 text-amber-950 font-black text-xs py-2.5 rounded-xl cursor-not-allowed"
                                      >
                                        Accepted — Awaiting Payment
                                      </button>
                                    ) : (
                                      <button
                                        disabled
                                        className="w-full bg-green-600 text-white font-black text-xs py-2.5 rounded-xl cursor-not-allowed"
                                      >
                                        Contract Active
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
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* 3. Customer Actions: Payment Funding Simulation */}
                      {selectedJob.customer_id === user.id && selectedJob.status === 'accepted' && jobPayment && (
                        <div className="p-5 border border-amber-500/20 bg-amber-500/5 rounded-2xl space-y-3 font-semibold">
                          <h4 className="text-sm font-extrabold text-foreground flex items-center gap-2">
                            <DollarSign className="h-5 w-5 text-amber-500" /> Secure Payment Required — Fund Contract
                          </h4>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            Please fund this contract to proceed. Funds will be held securely in the TradieHubAU platform and only released after the job is completed or verified by you.
                          </p>
                          <button
                            onClick={() => {
                              setModalConfirmConfig({
                                title: "Fund Contract Payment",
                                message: "Are you sure you want to simulate funding this contract?",
                                onConfirm: async () => {
                                  const { error } = await simulatePaymentFunding(selectedJob.id);
                                  if (error) {
                                    showToast(error.message, 'error');
                                  } else {
                                    showToast("Mock Payment Processed! Funds are now securely held by TradieHubAU.", 'success');
                                    setSelectedJob(prev => prev ? { ...prev, status: 'payment_held' } : null);
                                    fetchJobLifecycleDetails(selectedJob.id);
                                    loadJobs();
                                  }
                                }
                              });
                            }}
                            className="w-full bg-amber-500 hover:bg-amber-600 text-white font-black text-xs py-3 rounded-xl transition-all shadow-md active:scale-95"
                          >
                            Simulate Secure Payment Funding
                          </button>
                        </div>
                      )}

                      {/* 4. Tradie Actions: Variation Requests and Completion Proof Submissions */}
                      {jobPayment && jobPayment.payee_id === user.id && (
                        <div className="space-y-6">
                          {/* Variations form for contracted tradie */}
                          {selectedJob.status === 'payment_held' && (
                            <div className="p-5 bg-card border rounded-2xl space-y-4 font-semibold">
                              <h4 className="text-xs font-black text-foreground uppercase tracking-wider">Submit Price Variation Request</h4>
                              <p className="text-xs text-muted-foreground leading-relaxed">If extra materials or unforeseen work requires modifying the price, request it here. The customer must approve it.</p>
                              <div className="space-y-3">
                                <input
                                  type="text"
                                  placeholder="Reason (e.g. Extra 5m copper pipe)"
                                  id="varDesc"
                                  className="w-full bg-background border border-border rounded-xl px-3 py-2 outline-none text-xs focus:border-primary/50"
                                />
                                <input
                                  type="number"
                                  placeholder="Amount ($ e.g. 150)"
                                  id="varAmount"
                                  className="w-full bg-background border border-border rounded-xl px-3 py-2 outline-none text-xs focus:border-primary/50"
                                />
                                <button
                                  onClick={() => {
                                    const desc = (document.getElementById('varDesc') as HTMLInputElement).value;
                                    const amount = (document.getElementById('varAmount') as HTMLInputElement).value;
                                    if (!desc || !amount) {
                                      showToast("Please enter a description and dollar amount.", 'error');
                                      return;
                                    }
                                    const amountCents = Math.round(parseFloat(amount) * 100);
                                    setModalConfirmConfig({
                                      title: "Submit Variation Request",
                                      message: `Are you sure you want to request a variation of $${amount} for: "${desc}"?`,
                                      onConfirm: async () => {
                                        const { error } = await submitVariationRequest(selectedJob.id, desc, amountCents);
                                        if (error) {
                                          showToast(error.message, 'error');
                                        } else {
                                          showToast("Variation request submitted!", 'success');
                                          fetchJobLifecycleDetails(selectedJob.id);
                                        }
                                      }
                                    });
                                  }}
                                  className="w-full bg-secondary hover:bg-secondary/80 text-secondary-foreground font-black text-xs py-2 rounded-xl transition-all shadow active:scale-95"
                                >
                                  Submit Variation Request
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Completion Proof Form for contracted tradie */}
                          {selectedJob.status === 'payment_held' && (
                            <div className="p-5 bg-card border rounded-2xl space-y-4 font-semibold">
                              <h4 className="text-xs font-black text-foreground uppercase tracking-wider flex items-center gap-1.5"><CheckCircle className="h-4 w-4 text-green-500" /> Submit Completion Proof</h4>
                              <p className="text-xs text-muted-foreground leading-relaxed">Upload details when you have finished the work. This triggers the customer's 7-day review timer.</p>
                              <div className="space-y-3">
                                <textarea
                                  placeholder="Describe the completed work..."
                                  rows={3}
                                  id="proofDesc"
                                  className="w-full bg-background border border-border rounded-xl px-3 py-2 outline-none text-xs focus:border-primary/50"
                                ></textarea>
                                <button
                                  onClick={() => {
                                    const desc = (document.getElementById('proofDesc') as HTMLTextAreaElement).value;
                                    if (!desc) {
                                      showToast("Please write a brief description of the completed work.", 'error');
                                      return;
                                    }
                                    const mockAttachments = ['users/' + user.id + '/completion_photo_1.png'];
                                    setModalConfirmConfig({
                                      title: "Submit Completion Proof",
                                      message: "Are you sure you want to submit completion proof and start the review clock?",
                                      onConfirm: async () => {
                                        const { error } = await submitCompletionProof(selectedJob.id, desc, mockAttachments);
                                        if (error) {
                                          showToast(error.message, 'error');
                                        } else {
                                          showToast("Completion proof submitted! Customer has 7 days to review.", 'success');
                                          setSelectedJob(prev => prev ? { ...prev, status: 'completed_pending_review' } : null);
                                          fetchJobLifecycleDetails(selectedJob.id);
                                          loadJobs();
                                        }
                                      }
                                    });
                                  }}
                                  className="w-full bg-primary hover:bg-primary/95 text-primary-foreground font-black text-xs py-2.5 rounded-xl transition-all shadow active:scale-95"
                                >
                                  Submit Completion & Start Review Clock
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 5. Customer Review of Completion Proof & Dispute raising */}
                      {selectedJob.customer_id === user.id && selectedJob.status === 'completed_pending_review' && (
                        <div className="space-y-4">
                          <h4 className="text-xs font-black text-foreground uppercase tracking-wider flex items-center gap-1.5"><CheckCircle className="h-4 w-4 text-green-500" /> Review Completion Proof</h4>
                          {jobProofs.length > 0 && (
                            <div className="p-4 bg-muted/20 border rounded-2xl space-y-3 font-semibold">
                              <p className="text-xs text-foreground">Submitted by Tradie:</p>
                              <p className="text-xs text-foreground/80 leading-relaxed italic font-medium">"{jobProofs[0].description}"</p>
                              <p className="text-[10px] text-muted-foreground">Auto-release countdown finishes: {new Date(jobProofs[0].auto_release_at).toLocaleString()}</p>
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-4">
                            <button
                              onClick={() => {
                                setModalConfirmConfig({
                                  title: "Approve Completion & Release Funds",
                                  message: "Are you sure you want to approve the work and release the payment? This action is permanent.",
                                  onConfirm: async () => {
                                    const { error } = await approveJobCompletion(selectedJob.id);
                                    if (error) {
                                      showToast(error.message, 'error');
                                    } else {
                                      showToast("Job approved! Payment released successfully.", 'success');
                                      setSelectedJob(prev => prev ? { ...prev, status: 'completed' } : null);
                                      fetchJobLifecycleDetails(selectedJob.id);
                                      loadJobs();
                                    }
                                  }
                                });
                              }}
                              className="bg-primary hover:bg-primary/95 text-primary-foreground font-black text-xs py-3 rounded-xl transition-all shadow-md active:scale-95"
                            >
                              Approve Completion
                            </button>
                            
                            <button
                              onClick={() => {
                                const issueArea = document.getElementById('issueBlock');
                                if (issueArea) {
                                  issueArea.classList.toggle('hidden');
                                }
                              }}
                              className="bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/15 font-black text-xs py-3 rounded-xl transition-all shadow active:scale-95"
                            >
                              Raise an Issue / Dispute
                            </button>
                          </div>

                          <div id="issueBlock" className="hidden p-4 bg-red-500/5 border border-red-500/10 rounded-2xl space-y-3 font-semibold">
                            <label className="text-xs font-bold text-red-500 uppercase tracking-wider">Describe the issue / dispute details</label>
                            <textarea
                              placeholder="Describe what parts of the agreement were not met..."
                              rows={3}
                              id="issueText"
                              className="w-full bg-background border border-red-500/20 rounded-xl px-3 py-2 outline-none text-xs focus:border-red-500"
                            ></textarea>
                            <button
                              onClick={() => {
                                const reason = (document.getElementById('issueText') as HTMLTextAreaElement).value;
                                if (!reason) {
                                  showToast("Please enter a description of the issue.", 'error');
                                  return;
                                }
                                setModalConfirmConfig({
                                  title: "Raise Dispute",
                                  message: "Are you sure you want to raise a dispute for this job? An administrator will review it.",
                                  onConfirm: async () => {
                                    const { error } = await raiseJobIssue(selectedJob.id, reason);
                                    if (error) {
                                      showToast(error.message, 'error');
                                    } else {
                                      showToast("Dispute raised! The admin team will review and contact you.", 'success');
                                      setSelectedJob(prev => prev ? { ...prev, status: 'disputed' } : null);
                                      fetchJobLifecycleDetails(selectedJob.id);
                                      loadJobs();
                                    }
                                  }
                                });
                              }}
                              className="w-full bg-red-500 hover:bg-red-600 text-white font-black text-xs py-2 rounded-xl transition-all shadow active:scale-95"
                            >
                              Submit Dispute Request
                            </button>
                          </div>
                        </div>
                      )}

                      {/* 6. Disputes / Pending resolution view */}
                      {selectedJob.status === 'disputed' && (
                        <div className="p-4 border border-red-500/20 bg-red-500/5 rounded-2xl space-y-2 font-semibold">
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

                      {/* 7. Display variations list to customer & tradie */}
                      {jobVariations.length > 0 && (
                        <div className="space-y-4">
                          <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Price Variation Requests</h4>
                          <div className="space-y-3">
                            {jobVariations.map((v) => (
                              <div key={v.id} className="border p-4 rounded-2xl space-y-3 bg-muted/10 font-semibold">
                                <div className="flex justify-between items-start">
                                  <div>
                                    <p className="text-xs text-foreground/80 leading-relaxed font-medium">"{v.description}"</p>
                                    <span className={`inline-block text-[9px] font-extrabold px-1.5 py-0.5 rounded mt-1.5 uppercase ${
                                      v.status === 'approved' ? 'bg-green-500/10 text-green-600' :
                                      v.status === 'approved_awaiting_payment' ? 'bg-amber-500/10 text-amber-500' :
                                      v.status === 'rejected' ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500'
                                    }`}>
                                      {
                                        v.status === 'approved' ? 'Extra payment funded' :
                                        v.status === 'approved_awaiting_payment' ? 'Variation approved, awaiting payment' :
                                        v.status === 'rejected' ? 'Rejected' : 'Pending Approval'
                                      }
                                    </span>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-sm font-extrabold text-foreground">{formatCentsToAud(v.amount_cents)}</span>
                                  </div>
                                </div>
                                {v.status === 'pending' && selectedJob.customer_id === user.id && (
                                  <div className="grid grid-cols-2 gap-3 pt-1">
                                    <button
                                      onClick={() => {
                                        setModalConfirmConfig({
                                          title: "Approve Variation",
                                          message: "Approve this variation of " + formatCentsToAud(v.amount_cents) + "? The variation will then require funding payment.",
                                          onConfirm: async () => {
                                            const { error } = await approveVariation(v.id);
                                            if (error) {
                                              showToast(error.message, 'error');
                                            } else {
                                              showToast("Variation approved! It is now awaiting funding payment.", 'success');
                                              fetchJobLifecycleDetails(selectedJob.id);
                                            }
                                          }
                                        });
                                      }}
                                      className="bg-primary hover:bg-primary/95 text-primary-foreground font-black text-[10px] py-1.5 rounded-lg transition shadow"
                                    >
                                      Approve
                                    </button>
                                    <button
                                      onClick={async () => {
                                        const reason = window.prompt("Reason for rejection:");
                                        if (reason !== null) {
                                          const { error } = await rejectVariation(v.id, reason);
                                          if (error) {
                                            showToast(error.message, 'error');
                                          } else {
                                            showToast("Variation rejected.", 'success');
                                            fetchJobLifecycleDetails(selectedJob.id);
                                          }
                                        }
                                      }}
                                      className="bg-secondary hover:bg-secondary/80 text-secondary-foreground font-black text-[10px] py-1.5 rounded-lg transition"
                                    >
                                      Reject
                                    </button>
                                  </div>
                                )}
                                {v.status === 'approved_awaiting_payment' && selectedJob.customer_id === user.id && (
                                  <button
                                    onClick={() => {
                                      setModalConfirmConfig({
                                        title: "Fund Variation",
                                        message: "Simulate funding this approved variation of " + formatCentsToAud(v.amount_cents) + "?",
                                        onConfirm: async () => {
                                          const { error } = await simulateVariationFunding(v.id);
                                          if (error) {
                                            showToast(error.message, 'error');
                                          } else {
                                            showToast("Variation payment funded successfully!", 'success');
                                            fetchJobLifecycleDetails(selectedJob.id);
                                          }
                                        }
                                      });
                                    }}
                                    className="w-full bg-amber-500 hover:bg-amber-600 text-white font-black text-[10px] py-1.5 rounded-lg transition shadow mt-1"
                                  >
                                    Simulate Variation Payment
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="p-6 border-t bg-muted/20 flex items-center justify-between gap-3">
              {/* Save in modal too */}
              {user && (
                <button
                  onClick={(e) => handleToggleSave(selectedJob.id, e)}
                  disabled={savingId === selectedJob.id}
                  className={`flex items-center gap-2 px-4 py-2.5 border rounded-xl text-sm font-bold transition-all ${
                    savedJobIds.has(selectedJob.id)
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {savedJobIds.has(selectedJob.id) ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                  {savedJobIds.has(selectedJob.id) ? 'Saved' : 'Save Job'}
                </button>
              )}
              <div className="flex items-center gap-3 ml-auto">
                <button onClick={() => setSelectedJob(null)} className="bg-secondary text-secondary-foreground font-bold px-5 py-2.5 rounded-xl hover:bg-secondary/80 transition-colors text-sm">
                  Close
                </button>
                {user ? (
                  <button
                    onClick={() => {
                      if (!isVerifiedTradie) {
                        showToast("Verification Required: Only verified tradies can quote on jobs. Please visit your Profile to submit your verification details.", 'error');
                        return;
                      }
                      handleOpenApply(selectedJob);
                    }}
                    disabled={myApplications.has(selectedJob.id) && myApplications.get(selectedJob.id)?.status !== 'withdrawn'}
                    className={`font-bold px-6 py-2.5 rounded-xl transition-all shadow-md text-sm active:scale-95 ${
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
                ) : (
                  <Link to="/login" state={{ from: { pathname: '/jobs' } }}
                    className="bg-primary text-primary-foreground font-bold px-6 py-2.5 rounded-xl hover:bg-primary/95 transition-all shadow-md text-sm">
                    Sign In to Apply
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {modalConfirmConfig && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
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
        <div className="fixed bottom-5 right-5 z-50 animate-in slide-in-from-bottom-5 duration-300">
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
