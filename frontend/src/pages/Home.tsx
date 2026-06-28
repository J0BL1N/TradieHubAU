import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search,
  MapPin,
  Calendar,
  Star,
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
  // TODO: Seed realistic demo jobs owned by a registered customer test account for development testing.
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLocation, setSearchLocation] = useState('');
  const [currentReview, setCurrentReview] = useState(0);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  const reviews = [
    {
      name: "Mike Robertson",
      initials: "MR",
      location: "Sydney, NSW",
      stars: 5,
      text: "After being ripped off twice by cowboys from Facebook, finding TradieHubAU was a game-changer. The ID verification gave me confidence before they even showed up."
    },
    {
      name: "Sarah Chen",
      initials: "SC",
      location: "Melbourne, VIC",
      stars: 5,
      text: "Finally found a reliable electrician through TradieHubAU. The secure job payment system meant I didn't have to pay until the job was completely done. Highly recommend!"
    },
    {
      name: "David Wilson",
      initials: "DW",
      location: "Brisbane, QLD",
      stars: 5,
      text: "Used to be so stressful finding tradies. TradieHubAU's verification process is brilliant - no more dodgy contractors. Got my bathroom renovation done perfectly."
    }
  ];

  const categories = [
    { name: 'Plumbing', icon: Droplet, count: '1,200+ pros', color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400', search: 'Plumber' },
    { name: 'Electrical', icon: Zap, count: '850+ pros', color: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400', search: 'Electrician' },
    { name: 'Carpentry', icon: HomeIcon, count: '600+ pros', color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400', search: 'Carpenter' },
    { name: 'Landscaping', icon: Sun, count: '400+ pros', color: 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400', search: 'Landscaper' },
    { name: 'Painting', icon: Paintbrush, count: '550+ pros', color: 'text-primary bg-primary/10 dark:bg-primary/20 dark:text-primary', search: 'Painter' },
    { name: 'View All', icon: Grid, count: '20+ categories', color: 'text-gray-600 bg-gray-100 dark:bg-gray-800 dark:text-gray-300', search: '' }
  ];

  const featuredTradies = [
    { name: "John Smith", trade: "Electrician", rating: "5.0", reviews: 127, initials: "JS", location: "Sydney" },
    { name: "Emma Brown", trade: "Plumber", rating: "4.9", reviews: 98, initials: "EB", location: "Melbourne" },
    { name: "Tom Wilson", trade: "Carpenter", rating: "5.0", reviews: 156, initials: "TW", location: "Brisbane" }
  ];

  const recentJobs = [
    {
      id: 1,
      title: "Kitchen Renovation",
      time: "Posted 2 hours ago",
      budget: "$8,000-$12,000",
      description: "Complete kitchen renovation including new cabinets, benchtops, and appliances. Looking for qualified carpenter and electrician.",
      location: "Bondi, NSW",
      date: "Starts Feb 5"
    },
    {
      id: 2,
      title: "Bathroom Plumbing Fix",
      time: "Posted 5 hours ago",
      budget: "$500-$800",
      description: "Leaking shower and toilet need repair. Licensed plumber required urgently.",
      location: "Parramatta, NSW",
      date: "ASAP"
    }
  ];

  const faqs = [
    {
      q: "How does payment work?",
      a: "We use a secure job payment system. Your payment is funded securely and held until the job is completed to your satisfaction. This protects both you and the tradie."
    },
    {
      q: "Are all tradies verified?",
      a: "Yes! Every tradie on our platform has their government ID, license, and ABN manually verified by our team. No exceptions."
    },
    {
      q: "How much does it cost?",
      a: "Posting jobs and browsing tradies is completely free. We only charge a small service fee (5%) when a job is completed successfully."
    },
    {
      q: "What if I'm not happy with the work?",
      a: "Our dispute resolution team is here to help. Payment is only released when you approve the work, so you're always protected."
    }
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentReview((prev) => (prev + 1) % reviews.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

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
      <section className="text-center max-w-4xl mx-auto space-y-8 pt-6 pb-4 sm:pt-10">
        <div className="flex flex-col items-center">
          <img
            src="/assets/tradiehubau-logo.png"
            alt="TradieHubAU"
            className="mb-4 h-auto w-[min(90vw,360px)] sm:w-[min(80vw,460px)] lg:w-[520px]"
          />
          <span className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-xs font-semibold">
            <span className="w-2.5 h-2.5 bg-primary rounded-full animate-pulse"></span>
            Australia's Trusted Tradie Network
          </span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-tight text-foreground">
          Find local tradies <br className="sm:hidden" />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-amber-600">
            you can actually trust
          </span>
        </h1>

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
              <p className="text-xs text-muted-foreground mt-1.5 font-medium">{cat.count}</p>
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
              We manually check every single ID, license, and ABN. No bots, no automation - just good old-fashioned due diligence.
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
                  <h4 className="font-bold text-sm">Protected Payments</h4>
                  <p className="text-primary-foreground/75 text-xs font-semibold mt-0.5">Payment is funded securely and only released after completion</p>
                </div>
              </li>
            </ul>
          </div>

          {/* Testimonial Carousel */}
          <div className="bg-background text-foreground rounded-2xl p-6 md:p-8 shadow-2xl relative overflow-hidden flex flex-col justify-between min-h-[240px]">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-extrabold text-sm border border-primary/10">
                  {reviews[currentReview].initials}
                </div>
                <div>
                  <h4 className="font-bold text-sm text-foreground">{reviews[currentReview].name}</h4>
                  <div className="flex text-amber-500 gap-0.5 mt-0.5">
                    {Array.from({ length: reviews[currentReview].stars }).map((_, i) => (
                      <Star key={i} className="w-3.5 h-3.5 fill-amber-500 stroke-amber-500" />
                    ))}
                  </div>
                </div>
              </div>
              <p className="text-muted-foreground text-sm font-medium italic leading-relaxed">
                "{reviews[currentReview].text}"
              </p>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-4 mt-6">
              <span className="text-xs text-muted-foreground font-semibold">{reviews[currentReview].location}</span>
              <div className="flex gap-1.5">
                {reviews.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentReview(index)}
                    className={`w-2 h-2 rounded-full transition-all ${
                      currentReview === index ? 'bg-primary w-4' : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                    }`}
                  ></button>
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
              Search by trade, location, and reviews. Every professional has their ID and ABN pre-verified.
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
              Payment is funded securely and only released after completion.
            </p>
          </div>
        </div>
      </section>

      {/* Featured Tradies */}
      <section className="space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Verified Tradies Coming Soon</h2>
            <p className="text-sm text-muted-foreground font-medium mt-0.5">Example preview profiles for development</p>
          </div>
          <Link to="/browse-tradies" className="text-primary hover:text-primary/95 text-sm font-bold flex items-center gap-1">
            View All <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {featuredTradies.map((t) => (
            <div key={t.name} className="bg-card border border-border rounded-2xl p-6 hover:shadow-md transition-all flex flex-col justify-between space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground font-extrabold text-sm">
                  {t.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-sm text-foreground truncate">{t.name}</h3>
                  <p className="text-xs text-muted-foreground font-medium">{t.trade}</p>
                </div>
                <div className="flex items-center gap-1 text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-lg text-xs font-bold">
                  <Star className="w-3.5 h-3.5 fill-amber-500 stroke-amber-500" />
                  <span>{t.rating}</span>
                </div>
              </div>
              <div className="flex items-center justify-between border-t pt-4">
                <span className="text-xs text-muted-foreground font-semibold">{t.reviews} reviews • {t.location}</span>
                <Link to="/browse-tradies" className="text-primary hover:underline text-xs font-bold flex items-center gap-0.5">
                  View Profile <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recent Jobs */}
      <section className="space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Example Local Jobs</h2>
            <p className="text-sm text-muted-foreground font-medium mt-0.5">Development test listings</p>
          </div>
          <Link to="/jobs" className="text-primary hover:text-primary/95 text-sm font-bold flex items-center gap-1">
            View All Jobs <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {recentJobs.map((job) => (
            <div key={job.id} className="bg-card border border-border rounded-2xl p-6 hover:shadow-md transition-all flex flex-col justify-between space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-bold text-lg text-foreground hover:text-primary cursor-pointer transition-colors">{job.title}</h3>
                  <p className="text-xs text-muted-foreground font-semibold mt-1">{job.time}</p>
                </div>
                <span className="px-3 py-1 bg-green-500/10 text-green-600 text-xs font-extrabold rounded-lg shrink-0">
                  {job.budget}
                </span>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed font-medium">
                {job.description}
              </p>
              <div className="flex items-center gap-4 text-xs text-muted-foreground font-semibold border-t pt-4">
                <span className="flex items-center"><MapPin className="mr-1.5 h-3.5 w-3.5" /> {job.location}</span>
                <span className="flex items-center"><Calendar className="mr-1.5 h-3.5 w-3.5" /> {job.date}</span>
              </div>
            </div>
          ))}
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
              <div className="text-xs text-muted-foreground font-medium mt-0.5">100% Checked manually</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center shrink-0">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <div className="font-bold text-sm text-foreground">Secure Payments</div>
              <div className="text-xs text-muted-foreground font-medium mt-0.5">Payment held until completion</div>
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
