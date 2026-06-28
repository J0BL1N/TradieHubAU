import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Briefcase,
  Calendar,
  Clock,
  DollarSign,
  Image as ImageIcon,
  Loader2,
  Lock,
  MapPin,
  MessageSquare,
  User,
} from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import { fetchJobById } from '../lib/jobs';
import type { JobDetailData } from '../lib/jobs';
import type { Job } from '../lib/jobs';

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    open: 'Open',
    accepted: 'Accepted - awaiting payment',
    payment_held: 'Payment funded - contract active',
    completed_pending_review: 'Completion under review',
    disputed: 'Disputed - admin review',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };
  return labels[status] || status.replaceAll('_', ' ');
}

function paymentStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: 'Payment pending',
    held: 'Payment funded',
    held_in_escrow: 'Payment funded',
    released: 'Payment released',
    refunded: 'Payment refunded',
    failed: 'Payment failed',
  };
  return labels[status] || status.replaceAll('_', ' ');
}

function formatAUD(value: number) {
  return value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

function formatCentsToAUD(cents: number) {
  return formatAUD(cents / 100);
}

function formatBudget(job: Job) {
  if (job.budget_type === 'need_quotes') return 'Need quotes';
  if (job.estimated_budget !== null && job.estimated_budget !== undefined) {
    const prefix = job.budget_type === 'fixed_budget' ? 'Fixed' : 'Estimate';
    return `${prefix}: ${formatAUD(job.estimated_budget)}`;
  }
  if (job.budget_min && job.budget_max) return `${formatAUD(job.budget_min)} - ${formatAUD(job.budget_max)}`;
  if (job.budget_min) return `From ${formatAUD(job.budget_min)}`;
  if (job.budget_max) return `Up to ${formatAUD(job.budget_max)}`;
  return 'Not provided';
}

function DetailTile({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-sm font-extrabold text-foreground">{value}</p>
    </div>
  );
}

export default function JobDetail() {
  const { jobId } = useParams();
  const { user, loading: authLoading } = useAuth();
  const [details, setDetails] = useState<JobDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadJob = async () => {
      if (!jobId) {
        setDetails(null);
        setError('Job details could not be loaded.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await fetchJobById(jobId);
      if (cancelled) return;

      if (fetchError) {
        setDetails(null);
        setError(fetchError instanceof Error ? fetchError.message : 'Job details could not be loaded.');
      } else {
        setDetails(data);
      }
      setLoading(false);
    };

    void loadJob();

    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const canMessage = useMemo(() => {
    if (!user || !details?.payment) return false;
    const isParticipant = details.job.customer_id === user.id || details.payment.payee_id === user.id;
    return isParticipant && ['accepted', 'payment_held', 'completed_pending_review', 'disputed', 'completed'].includes(details.job.status);
  }, [details, user]);

  if (loading || authLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Link to="/jobs" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to jobs
        </Link>
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-red-600">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <h1 className="font-extrabold">Job details could not be loaded.</h1>
              <p className="mt-1 text-sm font-semibold">The job may not exist, or your account may not have access to this job.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!details) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Link to="/jobs" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to jobs
        </Link>
        <div className="rounded-2xl border bg-card p-8 text-center">
          <Lock className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <h1 className="mt-3 text-xl font-extrabold">Job not found or unavailable</h1>
          <p className="mt-2 text-sm font-medium leading-6 text-muted-foreground">
            Public jobs can be viewed by anyone. Private contract details are only available to the job owner and accepted tradie.
          </p>
        </div>
      </div>
    );
  }

  const { job, payment, tradie, workspace_images } = details;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link to="/jobs" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to jobs
        </Link>
        {canMessage && (
          <Link
            to={`/messages?job=${job.id}`}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
          >
            <MessageSquare className="h-4 w-4" />
            Message Job
          </Link>
        )}
      </div>

      <article className="overflow-hidden rounded-2xl border bg-card">
        <div className="border-b bg-muted/20 p-5 sm:p-6">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{statusLabel(job.status)}</span>
            {payment && (
              <span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-secondary-foreground">
                {paymentStatusLabel(payment.status)}
              </span>
            )}
          </div>
          <h1 className="mt-3 text-2xl font-extrabold leading-tight text-foreground sm:text-3xl">{job.title}</h1>
          <p className="mt-2 text-sm font-semibold text-muted-foreground">Job ref {job.id.slice(0, 8)}</p>
        </div>

        <div className="space-y-6 p-5 sm:p-6">
          <section>
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-muted-foreground">Description</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-7 text-foreground/85">{job.description}</p>
          </section>

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <DetailTile icon={<DollarSign className="h-4 w-4" />} label="Budget" value={formatBudget(job)} />
            {payment && <DetailTile icon={<DollarSign className="h-4 w-4" />} label="Accepted amount" value={formatCentsToAUD(payment.amount)} />}
            <DetailTile icon={<MapPin className="h-4 w-4" />} label="Location" value={`${job.location}${job.state ? `, ${job.state}` : ''}`} />
            <DetailTile icon={<Calendar className="h-4 w-4" />} label="Created" value={new Date(job.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })} />
            <DetailTile icon={<Briefcase className="h-4 w-4" />} label="Job type" value={job.type || 'Standard'} />
            <DetailTile icon={<Clock className="h-4 w-4" />} label="Timeline" value={job.timeline || job.urgency || 'Flexible'} />
          </section>

          {job.workspace_image_count > 0 && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-muted-foreground">
                <ImageIcon className="h-4 w-4" />
                Workspace Photos
              </h2>
              {workspace_images.length === 0 ? (
                <p className="rounded-xl border bg-muted/30 p-4 text-sm font-semibold text-muted-foreground">
                  Photos are attached. They are only visible to the job owner and accepted tradie.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
                  {workspace_images.map(image => (
                    <a key={image.id} href={image.signed_url} target="_blank" rel="noopener noreferrer" className="overflow-hidden rounded-xl border bg-background">
                      <img src={image.signed_url} alt="Workspace attachment" className="aspect-square w-full object-cover" />
                    </a>
                  ))}
                </div>
              )}
            </section>
          )}

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border bg-background p-4">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <User className="h-4 w-4" />
                Customer
              </p>
              <p className="mt-1 text-sm font-extrabold text-foreground">{job.customer?.display_name || 'Not provided'}</p>
              {(job.customer?.suburb || job.customer?.state) && (
                <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
                  {[job.customer.suburb, job.customer.state].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
            {payment && (
              <div className="rounded-xl border bg-background p-4">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  <User className="h-4 w-4" />
                  Tradie
                </p>
                <p className="mt-1 text-sm font-extrabold text-foreground">{tradie?.display_name || 'Not provided'}</p>
                {(tradie?.suburb || tradie?.state) && (
                  <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
                    {[tradie.suburb, tradie.state].filter(Boolean).join(', ')}
                  </p>
                )}
              </div>
            )}
          </section>

          {['completed_pending_review', 'disputed', 'completed'].includes(job.status) && (
            <section className="rounded-xl border bg-muted/40 p-4 text-sm font-semibold text-foreground">
              {job.status === 'completed_pending_review' && 'Completion proof has been submitted and is under customer review.'}
              {job.status === 'disputed' && 'This job is currently disputed and awaiting admin review.'}
              {job.status === 'completed' && 'This job is completed and payment has been released or resolved.'}
            </section>
          )}

          <section className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs font-semibold leading-5 text-amber-900">
            Contact details stay locked in TradieHubAU until protected payment rules allow access. This page only shows public profile fields and job context.
          </section>
        </div>
      </article>
    </div>
  );
}
