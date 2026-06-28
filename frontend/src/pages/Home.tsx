import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search,
  MapPin,
  ShieldCheck,
  Award,
  ArrowRight,
  CheckCircle,
  MessageSquare,
  Droplet,
  Zap,
  Home as HomeIcon,
  Sun,
  Paintbrush,
  Grid,
  Smartphone,
  Play,
  ChevronDown,
  Headphones,
  Lock
} from 'lucide-react';

export default function Home() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLocation, setSearchLocation] = useState('');
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  const categories = [
    { name: 'Plumbing', icon: Droplet, note: 'Available soon', color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400' },
    { name: 'Electrical', icon: Zap, note: 'Available soon', color: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400' },
    { name: 'Carpentry', icon: HomeIcon, note: 'Available soon', color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400' },
    { name: 'Landscaping', icon: Sun, note: 'Available soon', color: 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400' },
    { name: 'Painting', icon: Paintbrush, note: 'Available soon', color: 'text-primary bg-primary/10 dark:bg-primary/20 dark:text-primary' },
    { name: 'View All', icon: Grid, note: 'Browse categories', color: 'text-gray-600 bg-gray-100 dark:bg-gray-800 dark:text-gray-300' }
  ];

  const faqs = [
    {
      q: "How does payment work?",
      a: "TradieHubAU is building a protected payment flow where eligible jobs can be funded and released through the platform. During beta, follow the in-app job status and payment instructions shown for your specific job."
    },
    {
      q: "Are all tradies verified?",
      a: "Tradies must pass the relevant identity, ABN, and trade checks before they are approved to quote. Licence or insurance details are reviewed where they apply to the trade or job type."
    },
    {
      q: "How much does it cost?",
      a: "Posting jobs and browsing profiles is free during beta. Any future service fees or payment charges will be shown clearly before you commit to a job."
    },
    {
      q: "What if I'm not happy with the work?",
      a: "Keep the job scope, quotes, messages, completion proof, and concerns inside TradieHubAU. The beta workflow is designed to preserve a clear record if a job needs review."
    }
  ];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate('/browse-tradies');
  };

  const toggleFaq = (index: number) => {
    setActiveFaq((prev) => (prev === index ? null : index));
  };

  return (
    <div className="space-y-16">
      {/* Hero Section */}
      <section className="text-center max-w-4xl mx-auto space-y-8 pt-8 pb-4 sm:pt-12">
        <div className="flex justify-center">
          <img
            src="/assets/tradiehubau-logo.png"
            alt="TradieHubAU"
            className="h-auto w-[min(92vw,420px)] sm:w-[min(92vw,620px)] lg:w-[min(92vw,760px)]"
          />
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-tight text-foreground">
          Find local tradies <br className="sm:hidden" />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-amber-600">
            you can actually trust
          </span>
        </h1>

        <div className="flex justify-center">
          <span className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-xs font-semibold">
            <span className="w-2.5 h-2.5 bg-primary rounded-full animate-pulse"></span>
            Australia's Trusted Tradie Network
          </span>
        </div>

        <p className="text-lg text-muted-foreground max-w-2xl mx-auto font-medium leading-relaxed">
          Connect with verified professionals for any job. Post for free, get quotes, and hire with confidence.
        </p>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="bg-card border border-border rounded-2xl shadow-lg p-3 max-w-3xl mx-auto">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="What do you need done?"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 border border-border bg-background text-foreground rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all font-medium"
              />
            </div>
            <div className="flex-1 relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Suburb or Postcode"
                value={searchLocation}
                onChange={(e) => setSearchLocation(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 border border-border bg-background text-foreground rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all font-medium"
              />
            </div>
            <button
              type="submit"
              className="bg-primary text-primary-foreground px-8 py-2.5 rounded-xl font-bold hover:bg-primary/95 transition-all shadow-md active:scale-95 text-sm whitespace-nowrap"
            >
              Search Tradies
            </button>
          </div>
        </form>
      </section>

      {/* Stats Bar */}
      <section className="bg-card border-y border-border py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center max-w-6xl mx-auto px-4">
          <div className="space-y-1">
            <div className="text-2xl font-extrabold text-foreground tracking-tight">South East Melbourne</div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Launch Region</div>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-extrabold text-foreground tracking-tight">ID + Trade Checks</div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Verification</div>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-extrabold text-foreground tracking-tight">Protected Payments</div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Job Security</div>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-extrabold text-foreground tracking-tight">Beta Support</div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Manual Aussie Team</div>
          </div>
        </div>
      </section>

      {/* Popular Categories */}
      <section className="space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground">Popular Categories</h2>
          <p className="text-muted-foreground font-medium">Find the right expert for your job</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {categories.map((cat) => (
            <Link
              key={cat.name}
              to={cat.name === 'View All' ? '/jobs' : `/jobs?category=${cat.name}`}
              className="bg-card border border-border rounded-2xl p-6 hover:border-primary/50 hover:shadow-md transition-all text-center group flex flex-col items-center"
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform ${cat.color}`}>
                <cat.icon className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">{cat.name}</h3>
              <p className="text-xs text-muted-foreground mt-1.5 font-medium">{cat.note}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Trust & Guarantee Section */}
      <section className="bg-primary/95 text-primary-foreground rounded-3xl p-8 md:p-12 shadow-xl">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <span className="inline-block bg-white/10 border border-white/20 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
              VERIFIED & PROTECTED
            </span>
            <h2 className="text-3xl md:text-4xl font-extrabold leading-tight">Every tradie is verified by us</h2>
            <p className="text-primary-foreground/85 text-sm md:text-base leading-relaxed font-medium">
              Tradies are reviewed before they can quote. The beta is built around clear identity checks, business checks, and job records that stay inside the platform.
            </p>
            <ul className="space-y-4 pt-2">
              <li className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-sm">Government ID Check</h4>
                  <p className="text-primary-foreground/75 text-xs font-semibold mt-0.5">Driver's license or passport verified manually</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-sm">ABN Validation</h4>
                  <p className="text-primary-foreground/75 text-xs font-semibold mt-0.5">Registered and active Australian business check</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-sm">Licence and Insurance Review</h4>
                  <p className="text-primary-foreground/75 text-xs font-semibold mt-0.5">Checked where required for the trade, job type, or beta approval rules</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-sm">Admin Approval Before Quoting</h4>
                  <p className="text-primary-foreground/75 text-xs font-semibold mt-0.5">Tradies must be approved before they can submit quotes through the platform</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-sm">Protected Payment Flow</h4>
                  <p className="text-primary-foreground/75 text-xs font-semibold mt-0.5">Job scope, quotes, messages, payment state, and completion proof stay connected</p>
                </div>
              </li>
            </ul>
          </div>

          <div className="bg-background text-foreground rounded-2xl p-6 md:p-8 shadow-2xl relative overflow-hidden min-h-[280px]">
            <div className="space-y-5">
              <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center border border-primary/10">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-extrabold text-foreground">Built for a cleaner job record</h3>
                <p className="mt-2 text-sm font-medium leading-6 text-muted-foreground">
                  Customers and tradies can keep the original job scope, quotes, messages, workspace photos, completion proof, and review steps in one place.
                </p>
              </div>
              <div className="grid gap-3 text-left text-sm">
                {['Structured job details before quoting', 'Verified tradie approval workflow', 'Completion proof and dispute record support'].map(item => (
                  <div key={item} className="flex items-start gap-2 rounded-xl border bg-muted/20 p-3">
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="font-semibold text-foreground/85">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="space-y-12">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground">How It Works</h2>
          <p className="text-muted-foreground font-medium">Get your job done in three simple steps</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="text-center p-6 bg-card border rounded-2xl space-y-4">
            <div className="w-14 h-14 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto shadow-sm">
              <Search className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-lg text-foreground">1. Find Your Tradie</h3>
            <p className="text-sm text-muted-foreground font-medium leading-relaxed">
              Search by trade, location, and public profile details. Approved tradies have completed the required beta checks.
            </p>
          </div>
          <div className="text-center p-6 bg-card border rounded-2xl space-y-4">
            <div className="w-14 h-14 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto shadow-sm">
              <MessageSquare className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-lg text-foreground">2. Get Quotes</h3>
            <p className="text-sm text-muted-foreground font-medium leading-relaxed">
              Chat securely on the platform, discuss project scope, and receive transparent local quotes.
            </p>
          </div>
          <div className="text-center p-6 bg-card border rounded-2xl space-y-4">
            <div className="w-14 h-14 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto shadow-sm">
              <CheckCircle className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-lg text-foreground">3. Job Done Right</h3>
            <p className="text-sm text-muted-foreground font-medium leading-relaxed">
              Keep completion proof and job records together so both sides have a clear history.
            </p>
          </div>
        </div>
      </section>

      {/* Featured Tradies */}
      <section className="space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Verified Tradies Coming Soon</h2>
            <p className="text-sm text-muted-foreground font-medium mt-0.5">Approved tradie profiles will appear here as the beta grows.</p>
          </div>
          <Link to="/browse-tradies" className="text-primary hover:text-primary/95 text-sm font-bold flex items-center gap-1">
            View All <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="rounded-3xl border bg-card p-8 text-center shadow-sm">
          <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
          <h3 className="mt-4 text-lg font-extrabold text-foreground">No featured tradies yet</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm font-medium leading-6 text-muted-foreground">
            Real approved profiles will be shown here once tradies complete verification and join the beta.
          </p>
          <Link to="/browse-tradies" className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold text-foreground hover:bg-muted/40">
            Browse tradies <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Recent Jobs */}
      <section className="space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Local Jobs</h2>
            <p className="text-sm text-muted-foreground font-medium mt-0.5">Real posted jobs will appear here as the beta grows.</p>
          </div>
          <Link to="/jobs" className="text-primary hover:text-primary/95 text-sm font-bold flex items-center gap-1">
            View All Jobs <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="rounded-3xl border bg-card p-8 text-center shadow-sm">
          <MapPin className="mx-auto h-10 w-10 text-primary" />
          <h3 className="mt-4 text-lg font-extrabold text-foreground">No public job preview yet</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm font-medium leading-6 text-muted-foreground">
            Real posted jobs will appear on the jobs board and homepage once local customers start posting during beta.
          </p>
          <Link to="/jobs" className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold text-foreground hover:bg-muted/40">
            Browse jobs <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Trust Badges Bar */}
      <section className="bg-card border-y border-border py-10">
        <div className="max-w-6xl mx-auto px-4 grid grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="font-bold text-sm text-foreground">ID Verified</div>
              <div className="text-xs text-muted-foreground font-medium mt-0.5">Reviewed before approval</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center shrink-0">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <div className="font-bold text-sm text-foreground">Secure Payments</div>
              <div className="text-xs text-muted-foreground font-medium mt-0.5">Protected job flow</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center shrink-0">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <div className="font-bold text-sm text-foreground">Licensed Pros</div>
              <div className="text-xs text-muted-foreground font-medium mt-0.5">Active ABN validation</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center shrink-0">
              <Headphones className="w-6 h-6" />
            </div>
            <div>
              <div className="font-bold text-sm text-foreground">Beta Support</div>
              <div className="text-xs text-muted-foreground font-medium mt-0.5">Manual Aussie team help</div>
            </div>
          </div>
        </div>
      </section>

      {/* App Download / Final CTA */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-tr from-primary/95 to-amber-700 text-primary-foreground py-16 px-8 text-center shadow-xl">
        <div className="space-y-6 max-w-2xl mx-auto relative z-10">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">Get the App (Coming Soon)</h2>
          <p className="text-base text-primary-foreground/85 font-medium max-w-lg mx-auto">
            Manage your jobs, quotes, verification uploads, and protected payments from one place.
            For now, TradieHubAU works as a mobile-friendly web app while we prepare the dedicated app experience.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            <div className="bg-white/10 border border-white/20 px-5 py-2.5 rounded-xl flex items-center gap-3 cursor-not-allowed opacity-60">
              <Smartphone className="w-6 h-6 text-white" />
              <div className="text-left leading-tight">
                <div className="text-[10px] text-white/80 font-bold">Download on the</div>
                <div className="text-sm font-extrabold text-white">App Store</div>
              </div>
            </div>
            <div className="bg-white/10 border border-white/20 px-5 py-2.5 rounded-xl flex items-center gap-3 cursor-not-allowed opacity-60">
              <Play className="w-6 h-6 text-white fill-current" />
              <div className="text-left leading-tight">
                <div className="text-[10px] text-white/80 font-bold">GET IT ON</div>
                <div className="text-sm font-extrabold text-white">Google Play</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground">Frequently Asked Questions</h2>
          <p className="text-muted-foreground font-medium">Everything you need to know about the platform</p>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, index) => {
            const isOpen = activeFaq === index;
            return (
              <div key={index} className="bg-card border border-border rounded-xl overflow-hidden transition-all duration-300">
                <button
                  onClick={() => toggleFaq(index)}
                  className="w-full px-6 py-4 text-left flex items-center justify-between gap-4 outline-none hover:bg-muted/10"
                >
                  <span className="font-bold text-sm sm:text-base text-foreground">{faq.q}</span>
                  <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform duration-300 shrink-0 ${isOpen ? 'rotate-180 text-primary' : ''}`} />
                </button>
                <div
                  className={`transition-all duration-300 ease-in-out ${
                    isOpen ? 'max-h-40 border-t bg-muted/5' : 'max-h-0'
                  } overflow-hidden`}
                >
                  <p className="p-6 text-sm text-muted-foreground font-medium leading-relaxed">
                    {faq.a}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
