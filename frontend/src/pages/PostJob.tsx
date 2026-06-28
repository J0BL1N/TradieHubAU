import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { supabase } from '../lib/supabase';
import { PlusCircle, Info, Lock, CheckCircle, AlertCircle, DollarSign, Calendar, MapPin, Briefcase } from 'lucide-react';

export default function PostJob() {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  // Form State
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [urgency, setUrgency] = useState('flexible');
  const [jobType, setJobType] = useState('one-off');
  const [suburb, setSuburb] = useState('');
  const [state, setState] = useState('');
  const [timeline, setTimeline] = useState('');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [description, setDescription] = useState('');

  // Status State
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-card border rounded-2xl max-w-md mx-auto my-12 gap-4">
        <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
        <p className="text-sm font-semibold text-muted-foreground">Verifying access...</p>
      </div>
    );
  }

  // 1. Gated View (Logged out)
  if (!user) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 bg-card border border-border rounded-3xl shadow-xl text-center space-y-6">
        <div className="h-16 w-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto border border-primary/20">
          <Lock className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black text-foreground">Sign In to Post a Job</h2>
          <p className="text-sm text-muted-foreground leading-relaxed font-semibold">
            Post your job request for free to receive quotes from local qualified tradies. Sign in or register to get started.
          </p>
        </div>
        <div className="pt-2">
          <Link
            to="/login"
            state={{ from: location }}
            className="w-full inline-flex items-center justify-center bg-primary text-primary-foreground text-sm font-bold py-3.5 rounded-xl hover:bg-primary/95 shadow-md active:scale-95 transition-all"
          >
            Sign In / Register
          </Link>
        </div>
        <div className="pt-2">
          <Link to="/" className="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors">
            Return to Homepage
          </Link>
        </div>
      </div>
    );
  }

  // 2. Gated View (Missing profile check)
  if (!profile) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 bg-card border border-border rounded-3xl shadow-xl text-center space-y-6">
        <div className="h-16 w-16 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto border border-amber-500/20">
          <AlertCircle className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black text-foreground">Profile Setup Required</h2>
          <p className="text-sm text-muted-foreground leading-relaxed font-semibold">
            Your user profile row is missing from the database. Please navigate to the profile page to initialize your public account before posting jobs.
          </p>
        </div>
        <div className="pt-2">
          <Link
            to="/profile"
            className="w-full inline-flex items-center justify-center bg-amber-500 text-white text-sm font-bold py-3.5 rounded-xl hover:bg-amber-600 shadow-md active:scale-95 transition-all"
          >
            Go to Profile Page
          </Link>
        </div>
      </div>
    );
  }

  // Reset form helper
  const handleReset = () => {
    setTitle('');
    setCategory('');
    setUrgency('flexible');
    setJobType('one-off');
    setSuburb('');
    setState('');
    setTimeline('');
    setBudgetMin('');
    setBudgetMax('');
    setDescription('');
    setError(null);
    setSuccess(false);
    setConfirmOpen(false);
  };

  // 3. Success Screen View
  if (success) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 bg-card border border-border rounded-3xl shadow-xl text-center space-y-6">
        <div className="h-16 w-16 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center mx-auto border border-green-500/20">
          <CheckCircle className="h-10 w-10" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black text-foreground">Job Posted Successfully!</h2>
          <p className="text-sm text-muted-foreground leading-relaxed font-semibold">
            Your request has been published to the active jobs board. Local qualified tradespeople can now view it and submit quotes.
          </p>
        </div>
        <div className="pt-4 flex flex-col gap-3">
          <Link
            to="/jobs"
            className="w-full inline-flex items-center justify-center bg-primary text-primary-foreground text-sm font-bold py-3.5 rounded-xl hover:bg-primary/95 shadow-md active:scale-95 transition-all"
          >
            Go to Jobs Board
          </Link>
          <button
            onClick={handleReset}
            className="w-full inline-flex items-center justify-center border hover:bg-muted text-foreground text-sm font-bold py-3.5 rounded-xl active:scale-95 transition-all"
          >
            Post Another Request
          </button>
        </div>
      </div>
    );
  }

  const tradeCategories = [
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

  const selectedTradeLabel = tradeCategories.find(trade => trade.id === category)?.label || category;
  const trimmedTimeline = timeline.trim() || 'Flexible';
  const locationSummary = [suburb.trim(), state].filter(Boolean).join(', ');
  const minB = budgetMin ? parseInt(budgetMin) : null;
  const maxB = budgetMax ? parseInt(budgetMax) : null;
  const budgetSummary = minB !== null && maxB !== null
    ? `$${minB.toLocaleString()} - $${maxB.toLocaleString()}`
    : minB !== null
      ? `From $${minB.toLocaleString()}`
      : maxB !== null
        ? `Up to $${maxB.toLocaleString()}`
        : 'Not specified';

  const validateForm = () => {
    setError(null);

    // Form validation checks
    if (title.trim().length < 5) {
      setError('Job Title must be at least 5 characters long.');
      return false;
    }

    if (!category) {
      setError('Please select a trade category.');
      return false;
    }

    if (!suburb.trim()) {
      setError('Please enter a suburb.');
      return false;
    }

    if (!state) {
      setError('Please select a state.');
      return false;
    }

    if (description.trim().length < 20) {
      setError('Job Description must be at least 20 characters long.');
      return false;
    }

    if (minB !== null && (isNaN(minB) || minB < 0)) {
      setError('Minimum budget must be a positive number.');
      return false;
    }

    if (maxB !== null && (isNaN(maxB) || maxB < 0)) {
      setError('Maximum budget must be a positive number.');
      return false;
    }

    if (minB !== null && maxB !== null && maxB < minB) {
      setError('Maximum budget cannot be less than the minimum budget.');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setConfirmOpen(true);
  };

  const handleConfirmPost = async () => {
    if (!validateForm()) {
      setConfirmOpen(false);
      return;
    }

    setSubmitting(true);

    try {
      const { error: insertError } = await supabase
        .from('jobs')
        .insert({
          customer_id: user.id,
          title: title.trim(),
          description: description.trim(),
          categories: [category],
          location: locationSummary,
          state: state,
          budget_min: minB,
          budget_max: maxB,
          timeline: trimmedTimeline,
          urgency,
          type: jobType,
          status: 'open'
        });

      if (insertError) throw insertError;

      setConfirmOpen(false);
      setSuccess(true);
    } catch (err: any) {
      console.error('Job submission error:', err.message);
      setError(err.message || 'Failed to submit job request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Post a New Job</h1>
        <p className="text-muted-foreground mt-1">
          Fill out the details below to receive quotes from verified tradespeople.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8 bg-card border border-border p-8 rounded-3xl shadow-md">
        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Section 1: Job Basics */}
        <section className="space-y-4">
          <h3 className="text-lg font-extrabold text-foreground flex items-center gap-2 border-b pb-2">
            <Briefcase className="h-5 w-5 text-primary" /> 1. Job Details
          </h3>

          <div className="space-y-2">
            <label className="text-xs font-bold text-foreground uppercase tracking-wider">Job Title</label>
            <input
              type="text"
              placeholder="e.g. Need licensed electrician to install ceiling fans"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-background border border-border rounded-xl px-4 py-3 outline-none focus:border-primary/50 text-sm font-semibold transition-all"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground uppercase tracking-wider">Category / Trade</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-4 py-3 outline-none focus:border-primary/50 text-sm font-semibold cursor-pointer"
                required
              >
                <option value="">Select category...</option>
                {tradeCategories.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground uppercase tracking-wider">Urgency</label>
              <select
                value={urgency}
                onChange={(e) => setUrgency(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-4 py-3 outline-none focus:border-primary/50 text-sm font-semibold cursor-pointer"
              >
                <option value="flexible">Flexible (No rush)</option>
                <option value="week">Within a week</option>
                <option value="urgent">Urgent / Immediate</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground uppercase tracking-wider">Job Type</label>
              <select
                value={jobType}
                onChange={(e) => setJobType(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-4 py-3 outline-none focus:border-primary/50 text-sm font-semibold cursor-pointer"
              >
                <option value="one-off">One-off</option>
                <option value="contract">Contract</option>
                <option value="ongoing">Ongoing</option>
              </select>
            </div>
          </div>
        </section>

        {/* Section 2: Location & Timeline */}
        <section className="space-y-4">
          <h3 className="text-lg font-extrabold text-foreground flex items-center gap-2 border-b pb-2">
            <MapPin className="h-5 w-5 text-primary" /> 2. Location & Schedule
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-2">
              <label className="text-xs font-bold text-foreground uppercase tracking-wider">Suburb / Location</label>
              <input
                type="text"
                placeholder="e.g. Richmond"
                value={suburb}
                onChange={(e) => setSuburb(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-4 py-3 outline-none focus:border-primary/50 text-sm font-semibold transition-all"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground uppercase tracking-wider">State</label>
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-4 py-3 outline-none focus:border-primary/50 text-sm font-semibold cursor-pointer"
                required
              >
                <option value="">State...</option>
                <option value="NSW">NSW</option>
                <option value="VIC">VIC</option>
                <option value="QLD">QLD</option>
                <option value="WA">WA</option>
                <option value="SA">SA</option>
                <option value="TAS">TAS</option>
                <option value="ACT">ACT</option>
                <option value="NT">NT</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-foreground uppercase tracking-wider">Timeline / Start Date</label>
            <div className="relative">
              <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="e.g. Next month, or specific date (e.g. 25 June)"
                value={timeline}
                onChange={(e) => setTimeline(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-background border border-border rounded-xl outline-none focus:border-primary/50 text-sm font-semibold transition-all"
              />
            </div>
          </div>
        </section>

        {/* Section 3: Budget Range */}
        <section className="space-y-4">
          <h3 className="text-lg font-extrabold text-foreground flex items-center gap-2 border-b pb-2">
            <DollarSign className="h-5 w-5 text-primary" /> 3. Budget Estimate
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground uppercase tracking-wider">Minimum Budget ($)</label>
              <div className="relative">
                <DollarSign className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="number"
                  placeholder="e.g. 200"
                  min="0"
                  value={budgetMin}
                  onChange={(e) => setBudgetMin(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-background border border-border rounded-xl outline-none focus:border-primary/50 text-sm font-semibold transition-all"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground uppercase tracking-wider">Maximum Budget ($)</label>
              <div className="relative">
                <DollarSign className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="number"
                  placeholder="e.g. 500"
                  min="0"
                  value={budgetMax}
                  onChange={(e) => setBudgetMax(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-background border border-border rounded-xl outline-none focus:border-primary/50 text-sm font-semibold transition-all"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Section 4: Detailed Description */}
        <section className="space-y-4">
          <h3 className="text-lg font-extrabold text-foreground flex items-center gap-2 border-b pb-2">
            <Info className="h-5 w-5 text-primary" /> 4. Description
          </h3>

          <div className="space-y-2">
            <label className="text-xs font-bold text-foreground uppercase tracking-wider">Job Description</label>
            <textarea
              placeholder="Describe what needs to be done. The more detail you provide, the better quotes you will receive from tradespeople."
              rows={6}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-background border border-border rounded-xl px-4 py-3 outline-none focus:border-primary/50 text-sm font-semibold leading-relaxed transition-all"
              required
            ></textarea>
          </div>
        </section>

        <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 text-primary flex gap-3 text-sm font-semibold leading-relaxed">
          <Info className="h-5 w-5 shrink-0 text-primary" />
          <p>
            Your posting is protected. Communication happens securely inside the app, and you only share contact details with the tradie you accept.
          </p>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full inline-flex items-center justify-center bg-primary text-primary-foreground font-black py-4 rounded-xl shadow-lg hover:bg-primary/95 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 transition-all cursor-pointer text-sm tracking-wide"
        >
          <PlusCircle className="mr-2 h-5 w-5 stroke-[2.5]" />
          Review Job Details
        </button>
      </form>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4">
          <div className="w-full max-w-2xl rounded-3xl border bg-card p-6 shadow-2xl space-y-5">
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-foreground">Review job before posting</h2>
              <p className="text-sm text-muted-foreground font-semibold leading-6">
                Please review your job details carefully. Once a tradie submits a quote, these details cannot be edited. They may form part of the job agreement and dispute record.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl border bg-background p-4 sm:col-span-2">
                <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Title</p>
                <p className="mt-1 font-bold text-foreground">{title.trim()}</p>
              </div>
              <div className="rounded-2xl border bg-background p-4">
                <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Category / Trade</p>
                <p className="mt-1 font-bold text-foreground">{selectedTradeLabel}</p>
              </div>
              <div className="rounded-2xl border bg-background p-4">
                <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Location</p>
                <p className="mt-1 font-bold text-foreground">{locationSummary}</p>
              </div>
              <div className="rounded-2xl border bg-background p-4">
                <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Timeline / Start Date</p>
                <p className="mt-1 font-bold text-foreground">{trimmedTimeline}</p>
              </div>
              <div className="rounded-2xl border bg-background p-4">
                <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Budget</p>
                <p className="mt-1 font-bold text-foreground">{budgetSummary}</p>
              </div>
              <div className="rounded-2xl border bg-background p-4 sm:col-span-2">
                <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Description</p>
                <p className="mt-1 whitespace-pre-wrap text-sm font-semibold leading-6 text-foreground">{description.trim()}</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row-reverse gap-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleConfirmPost()}
                className="inline-flex flex-1 items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-black text-primary-foreground shadow-md hover:bg-primary/95 disabled:opacity-50"
              >
                {submitting ? (
                  <div className="h-5 w-5 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin"></div>
                ) : (
                  'Confirm and post job'
                )}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => setConfirmOpen(false)}
                className="inline-flex flex-1 items-center justify-center rounded-xl border px-5 py-3 text-sm font-bold text-foreground hover:bg-muted/40 disabled:opacity-50"
              >
                Go back and edit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
