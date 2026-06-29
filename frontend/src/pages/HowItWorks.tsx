import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BadgeCheck,
  Briefcase,
  CheckCircle,
  CircleDollarSign,
  ClipboardCheck,
  FileText,
  Handshake,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import InfoHubTabs from '../components/InfoHubTabs';
import InfoPageHeader from '../components/InfoPageHeader';

const customerSteps = [
  'Post a clear job scope with suburb-level location, timing, budget type, and workspace photos where useful.',
  'Review quotes, tradie profiles, verification status, and any questions before choosing who to work with.',
  'Keep scope changes, messages, completion review, and concerns inside TradieHubAU so the job record stays clear.',
];

const tradieSteps = [
  'Complete the required identity, ABN, and trade verification checks before quoting during beta.',
  'Quote against the posted scope and ask clarification questions before the customer accepts a quote.',
  'Submit completion proof when the work is finished so the customer can review the completed job record.',
];

function InfoCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </div>
      <h2 className="mt-4 text-xl font-extrabold text-foreground">{title}</h2>
      <div className="mt-3 text-sm font-medium leading-6 text-muted-foreground">{children}</div>
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-3">
      {items.map(item => (
        <li key={item} className="flex gap-2">
          <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function HowItWorks() {
  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <InfoPageHeader
        title="How TradieHubAU Works"
        badge="Verified & Protected Workflow"
        icon={<ShieldCheck className="h-4 w-4" />}
        subtitle="A safer way to hire, quote, complete, and pay for trade work, with clear beta-stage checks and job records."
      />

      <InfoHubTabs />

      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-5 text-sm font-semibold leading-6 text-amber-900">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            TradieHubAU is in controlled beta preparation. The app contains protected-payment workflow states, but
            real payment provider processing is not live unless the job screen explicitly says otherwise.
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <InfoCard icon={<UserCheck className="h-5 w-5" />} title="1. For Customers">
          <BulletList items={customerSteps} />
        </InfoCard>

        <InfoCard icon={<Briefcase className="h-5 w-5" />} title="2. For Tradies">
          <BulletList items={tradieSteps} />
        </InfoCard>

        <InfoCard icon={<CircleDollarSign className="h-5 w-5" />} title="3. Protected Payments">
          <p>
            The beta workflow is designed around a protected payment path: quote accepted, payment marked funded in
            the job record, work completed, customer review, then release or dispute outcome. Current local MVP
            screens may simulate these states while real payment integration remains a later step.
          </p>
        </InfoCard>

        <InfoCard icon={<BadgeCheck className="h-5 w-5" />} title="4. Verification">
          <p>
            Tradies must complete relevant identity, ABN, licence, and insurance checks before approval to quote.
            Verification supports safer participation, but customers should still review the job, scope, credentials,
            and suitability for their own requirements.
          </p>
        </InfoCard>

        <InfoCard icon={<ClipboardCheck className="h-5 w-5" />} title="5. Completion Proof, Review & Disputes">
          <p>
            When work is complete, the tradie can submit completion proof. The customer then reviews the work and can
            approve completion or raise a dispute with a clear reason and evidence. Disputed jobs are held for admin
            review rather than silently changing the original scope.
          </p>
        </InfoCard>

        <InfoCard icon={<FileText className="h-5 w-5" />} title="6. Simple Platform Fees">
          <p>
            Posting jobs and browsing profiles is free during beta. Any future service fee, payment processing cost,
            or release amount should be shown clearly before a customer commits to a paid workflow.
          </p>
        </InfoCard>
      </div>

      <section className="rounded-3xl border bg-card p-8 text-center shadow-sm">
        <Handshake className="mx-auto h-10 w-10 text-primary" />
        <h2 className="mt-4 text-2xl font-black text-foreground">Ready to get started?</h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm font-medium leading-6 text-muted-foreground">
          Post a clear job for local tradies, or browse approved profiles as the beta grows.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            to="/post-job"
            className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-black text-primary-foreground shadow-md hover:bg-primary/95"
          >
            Post a Job
          </Link>
          <Link
            to="/browse-tradies"
            className="inline-flex items-center justify-center rounded-xl border px-5 py-3 text-sm font-bold text-foreground hover:bg-muted/40"
          >
            Browse Tradies
          </Link>
        </div>
      </section>
    </div>
  );
}
