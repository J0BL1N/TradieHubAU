import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  BadgeCheck,
  CircleDollarSign,
  Handshake,
  Headphones,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import InfoHubTabs from '../components/InfoHubTabs';

type InfoSection = {
  title: string;
  body: ReactNode;
};

type InfoPageProps = {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  intro: string;
  sections: InfoSection[];
};

const helpTopics = [
  { to: '/protected-payments', label: 'Protected payments' },
  { to: '/trust-and-safety', label: 'Trust and safety' },
  { to: '/dispute-process', label: 'Dispute process' },
  { to: '/tradie-verification', label: 'Tradie verification' },
  { to: '/customer-verification', label: 'Customer verification' },
];

function BetaNotice() {
  return (
    <div className="rounded-2xl border border-primary/25 bg-primary/5 p-5 text-sm leading-6 text-foreground">
      <p className="font-extrabold">Controlled beta preparation</p>
      <p className="mt-1 text-muted-foreground">
        TradieHubAU is a local MVP being prepared for a controlled beta in South East Melbourne and outer
        south-east Melbourne. Real payment provider processing is not live.
      </p>
    </div>
  );
}

function InfoPage({ icon, eyebrow, title, intro, sections }: InfoPageProps) {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <InfoHubTabs />

      <header className="space-y-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          {icon}
        </div>
        <div>
          <p className="text-sm font-extrabold uppercase tracking-wider text-primary">{eyebrow}</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground sm:text-4xl">{title}</h1>
          <p className="mt-4 max-w-3xl text-base font-medium leading-7 text-muted-foreground">{intro}</p>
        </div>
      </header>

      <BetaNotice />

      <div className="grid gap-5 md:grid-cols-2">
        {sections.map((section) => (
          <section key={section.title} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-extrabold text-foreground">{section.title}</h2>
            <div className="mt-3 text-sm font-medium leading-6 text-muted-foreground">{section.body}</div>
          </section>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-muted/40 p-6">
        <h2 className="font-extrabold text-foreground">More beta help</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {helpTopics.map((topic) => (
            <Link
              key={topic.to}
              to={topic.to}
              className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-bold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              {topic.label}
            </Link>
          ))}
          <Link
            to="/support"
            className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-bold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            Contact support
          </Link>
        </div>
      </div>
    </div>
  );
}

export function ContactSupport() {
  return (
    <InfoPage
      icon={<Headphones className="h-6 w-6" />}
      eyebrow="Beta help"
      title="Contact Support"
      intro="Support is handled manually during controlled beta preparation so issues can be reviewed carefully."
      sections={[
        {
          title: 'How to get help',
          body: (
            <p>
              Use the beta coordinator contact details provided during onboarding. There is no automated support
              ticket or notification service yet, so include the job reference and a plain-English summary without
              sending passwords or sensitive identity documents.
            </p>
          ),
        },
        {
          title: 'What support can review',
          body: (
            <p>
              Support can help triage account access, job, messaging, verification, simulated protected payment,
              completion, and dispute-flow issues in the local MVP.
            </p>
          ),
        },
        {
          title: 'Safety concerns',
          body: (
            <p>
              Stop using the platform flow if you feel unsafe. Contact emergency services for immediate danger;
              beta support is not an emergency response service.
            </p>
          ),
        },
        {
          title: 'Privacy when asking for help',
          body: (
            <p>
              Share only what is needed to identify the issue. Never send account passwords, full payment details,
              or verification documents through an unapproved support channel.
            </p>
          ),
        },
      ]}
    />
  );
}

export function ProtectedPaymentExplainer() {
  return (
    <InfoPage
      icon={<CircleDollarSign className="h-6 w-6" />}
      eyebrow="Payment foundation"
      title="How Protected Payment Works in the Local MVP"
      intro="The current flow demonstrates secure job payment states without moving real money."
      sections={[
        {
          title: 'Current simulated flow',
          body: (
            <p>
              After a quote is accepted, the customer can simulate payment funded. The job then records payment as
              held until completion. Approval or an admin dispute outcome records the simulated payment release or
              refund.
            </p>
          ),
        },
        {
          title: 'No real provider yet',
          body: (
            <p>
              TradieHubAU does not currently charge cards, hold customer money, or pay tradies. Real provider
              integration is deferred to the v0.2.x Real Payments Foundation.
            </p>
          ),
        },
        {
          title: 'Before funding',
          body: (
            <p>
              Customers should confirm the quote, scope, timing, and tradie details. The current beta-prep screens
              are for workflow testing and are not proof that money has been transferred.
            </p>
          ),
        },
        {
          title: 'If something goes wrong',
          body: (
            <p>
              Use the completion review and dispute flow where available. A disputed job cannot be approved through
              the normal completion path and requires admin review.
            </p>
          ),
        },
      ]}
    />
  );
}

export function TrustAndSafetyExplainer() {
  return (
    <InfoPage
      icon={<ShieldCheck className="h-6 w-6" />}
      eyebrow="Safer local jobs"
      title="Trust and Safety"
      intro="TradieHubAU combines account boundaries, verification workflows, job records, and controlled contact sharing to support safer local job coordination."
      sections={[
        {
          title: 'Check before engaging',
          body: (
            <p>
              Review the profile, quote, work scope, credentials shown in the app, and your own requirements before
              proceeding. Platform verification does not replace licences, insurance, references, or professional
              advice you may need to check yourself.
            </p>
          ),
        },
        {
          title: 'Keep a clear record',
          body: (
            <p>
              Keep job scope, quotes, variations, messages, completion proof, and concerns in the relevant job flow.
              Do not share passwords or unnecessary identity information in messages.
            </p>
          ),
        },
        {
          title: 'Contact sharing',
          body: (
            <p>
              Private contact details are intended to unlock only for the relevant job participants after the local
              MVP records payment funded. Public profiles use a limited public-data boundary.
            </p>
          ),
        },
        {
          title: 'Platform limits',
          body: (
            <p>
              This controlled beta-prep foundation does not guarantee workmanship, identity, licensing, payment, or
              dispute outcomes. Report concerns promptly and use emergency services for immediate danger.
            </p>
          ),
        },
      ]}
    />
  );
}

export function DisputeProcessExplainer() {
  return (
    <InfoPage
      icon={<Handshake className="h-6 w-6" />}
      eyebrow="Completion review"
      title="Dispute Process"
      intro="The local MVP includes a structured review path for a customer who has concerns after completion proof is submitted."
      sections={[
        {
          title: '1. Completion proof',
          body: <p>The contracted tradie submits a description and any supported evidence when work is complete.</p>,
        },
        {
          title: '2. Customer review',
          body: (
            <p>
              The customer can approve completion or raise a dispute while the job is awaiting review. A dispute
              should describe the concern clearly and include relevant evidence where supported.
            </p>
          ),
        },
        {
          title: '3. Admin review',
          body: (
            <p>
              An authorised admin reviews the job, participants, simulated held amount, completion proof, messages,
              and submitted dispute material. Disputed jobs cannot use normal customer approval.
            </p>
          ),
        },
        {
          title: '4. Recorded outcome',
          body: (
            <p>
              The admin records the simulated payout/refund split and case outcome. This is workflow testing only;
              no real payment provider settlement occurs in v0.0.18.
            </p>
          ),
        },
      ]}
    />
  );
}

export function TradieVerificationExplainer() {
  return (
    <InfoPage
      icon={<BadgeCheck className="h-6 w-6" />}
      eyebrow="Tradie checks"
      title="Tradie Verification"
      intro="Tradie verification supports controlled beta access to quoting and job workflows; it is not a guarantee of future conduct or workmanship."
      sections={[
        {
          title: 'Identity first',
          body: (
            <p>
              A tradie profile must complete the applicable identity review before trade approval. Documents are
              submitted through the private verification path for authorised admin review.
            </p>
          ),
        },
        {
          title: 'Trade credentials',
          body: (
            <p>
              The current workflow expects an ABN, licence details where relevant, and approved supporting trade and
              insurance documents before a profile is approved to quote.
            </p>
          ),
        },
        {
          title: 'What the badge means',
          body: (
            <p>
              A verified status means the submitted information passed the current beta review workflow. Customers
              should still confirm credentials, insurance, scope suitability, and any legal requirements for the job.
            </p>
          ),
        },
        {
          title: 'Changes and suspension',
          body: (
            <p>
              Sensitive profile and credential fields may be locked while review is pending or approved. Admins can
              suspend verification when information needs to be reviewed again.
            </p>
          ),
        },
      ]}
    />
  );
}

export function CustomerVerificationExplainer() {
  return (
    <InfoPage
      icon={<UserCheck className="h-6 w-6" />}
      eyebrow="Customer checks"
      title="Customer Verification"
      intro="Customer verification is a beta-prep trust measure intended to support clearer participant accountability."
      sections={[
        {
          title: 'Account and identity',
          body: (
            <p>
              Customers use an authenticated account and may submit an accepted identity document through the
              private verification workflow for admin review.
            </p>
          ),
        },
        {
          title: 'Public information',
          body: (
            <p>
              Public browsing is limited to approved public-profile fields. Email, phone, postcode, admin flags,
              provider identifiers, and private verification details are not intended for public exposure.
            </p>
          ),
        },
        {
          title: 'Job participation',
          body: (
            <p>
              Customers remain responsible for accurate job details, lawful work requests, quote review, timely
              completion review, and respectful communication with tradies.
            </p>
          ),
        },
        {
          title: 'Verification limits',
          body: (
            <p>
              Verification supports the platform workflow but cannot guarantee behaviour, payment capacity, or a
              dispute outcome. Tradies should assess each job and customer interaction on its own merits.
            </p>
          ),
        },
      ]}
    />
  );
}
