import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { fetchTradies } from '../lib/users';
import type { UserProfile } from '../lib/users';
import { fetchPublicTradieReviewSummaries } from '../lib/reviews';
import type { ReviewSummary } from '../lib/reviews';
import { Star, ShieldCheck, MapPin, Award, Search, SlidersHorizontal, X, Filter, RefreshCw, Loader2 } from 'lucide-react';


export default function BrowseTradies() {
  const [tradies, setTradies] = useState<UserProfile[]>([]);
  const [reviewSummaries, setReviewSummaries] = useState<Map<string, ReviewSummary>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchText, setSearchText] = useState('');
  const [selectedState, setSelectedState] = useState('all');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

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

  const loadTradies = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchErr } = await fetchTradies({
      state: selectedState,
      trades: selectedCategories,
      verified: verifiedOnly,
      search: searchText
    });

    if (fetchErr) {
      setError(fetchErr.message || 'Failed to fetch tradies list.');
    } else {
      setTradies(data);
      const { data: summaries, error: summariesError } = await fetchPublicTradieReviewSummaries(data.map(tradie => tradie.id));
      if (summariesError) {
        console.error('Failed to fetch tradie review summaries:', summariesError);
        setReviewSummaries(new Map());
      } else {
        setReviewSummaries(new Map(summaries.map(summary => [summary.tradie_id, summary])));
      }
    }
    setLoading(false);
  }, [selectedState, selectedCategories, verifiedOnly, searchText]);

  useEffect(() => {
    // Debounce state filters or just pull automatically
    loadTradies();
  }, [selectedState, selectedCategories, verifiedOnly]);

  const toggleCategory = (id: string) => {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const clearAllFilters = () => {
    setSearchText('');
    setSelectedState('all');
    setSelectedCategories([]);
    setVerifiedOnly(false);
  };

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
        <label className="text-xs font-bold text-foreground uppercase tracking-wider">Search Name</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search display name..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadTradies()}
            className="w-full pl-9 pr-3 py-2 border rounded-xl bg-background outline-none text-sm focus:border-primary/50 transition-all font-medium"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold text-foreground uppercase tracking-wider">State</label>
        <select
          value={selectedState}
          onChange={(e) => setSelectedState(e.target.value)}
          className="w-full px-3 py-2 border rounded-xl bg-background outline-none text-sm focus:border-primary/50 transition-all font-medium"
        >
          <option value="all">All Australia</option>
          {['NSW','VIC','QLD','WA','SA','TAS','ACT','NT'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold text-foreground uppercase tracking-wider">Trade Categories</label>
        <div className={`space-y-2 ${mobile ? 'grid grid-cols-2 gap-2' : 'max-h-48 overflow-y-auto pr-1'}`}>
          {categoryOptions.map((cat) => (
            <label key={cat.id} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={selectedCategories.includes(cat.id)}
                onChange={() => toggleCategory(cat.id)}
                className="rounded border-border text-primary focus:ring-primary/20 h-4 w-4"
              />
              <span className="text-sm font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
                {cat.label}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold text-foreground uppercase tracking-wider block">Security & Trust</label>
        <label className="flex items-center gap-2 cursor-pointer group">
          <input
            type="checkbox"
            checked={verifiedOnly}
            onChange={(e) => setVerifiedOnly(e.target.checked)}
            className="rounded border-border text-primary focus:ring-primary/20 h-4 w-4"
          />
          <span className="text-sm font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
            Verified Tradies Only
          </span>
        </label>
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Verified Local Tradies</h1>
        <p className="text-muted-foreground mt-1">Connect directly with qualified professionals in your area.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Sidebar - Desktop */}
        <aside className="hidden lg:block w-1/4 bg-card border p-6 rounded-2xl sticky top-24">
          <SidebarFilters />
        </aside>

        {/* Content Panel */}
        <div className="flex-1 w-full space-y-6">
          {/* Toolbar */}
          <div className="bg-card border p-4 rounded-xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-foreground">{tradies.length}</span>
              <span className="text-sm text-muted-foreground font-semibold">tradies found</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMobileFiltersOpen(true)}
                className="lg:hidden p-2 border rounded-xl hover:bg-muted text-muted-foreground flex items-center gap-1.5 text-xs font-bold"
              >
                <SlidersHorizontal className="h-4 w-4" /> Filters
              </button>
              <button
                onClick={loadTradies}
                className="p-2 border rounded-xl hover:bg-muted text-muted-foreground"
                title="Refresh listings"
                aria-label="Refresh listings"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Feed */}
          {loading ? (
            <div className="flex flex-col items-center justify-center p-12 bg-card border rounded-2xl gap-4">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
              <p className="text-sm font-semibold text-muted-foreground">Loading directory listings...</p>
            </div>
          ) : error ? (
            <div className="p-8 bg-red-500/10 border border-red-500/20 text-red-500 rounded-2xl text-center space-y-4">
              <h3 className="text-lg font-bold">Failed to load directory</h3>
              <p className="text-sm font-medium">{error}</p>
              <button onClick={loadTradies} className="bg-red-500 text-white font-semibold px-4 py-2 rounded-xl text-xs hover:bg-red-600 transition-colors">
                Try Again
              </button>
            </div>
          ) : tradies.length === 0 ? (
            <div className="p-12 bg-card border rounded-2xl text-center space-y-4">
              <Star className="h-12 w-12 text-muted-foreground/30 mx-auto" />
              <h3 className="text-xl font-bold text-foreground">No tradies found</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                No verified tradie profiles match your current filter settings. Try relaxing your constraints.
              </p>
              <button onClick={clearAllFilters} className="bg-primary text-primary-foreground font-semibold px-5 py-2.5 rounded-xl text-sm shadow-md hover:bg-primary/95">
                Clear Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {tradies.map((tradie) => {
                const displayName = tradie.display_name || 'Verified Tradie';
                const tradesLine = tradie.trades && tradie.trades.length > 0
                  ? tradie.trades.map(tid => categoryOptions.find(c => c.id === tid)?.label || tid).join(', ')
                  : 'General Contractor';
                const locationParts = [tradie.suburb, tradie.state].filter(Boolean);
                const locationStr = locationParts.length > 0 ? locationParts.join(', ') : 'Australia';
                const reviewSummary = reviewSummaries.get(tradie.id);

                return (
                  <div key={tradie.id} className="bg-card border rounded-2xl p-6 hover:shadow-md transition-all flex flex-col justify-between space-y-6">
                    <div className="space-y-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-12 w-12 rounded-full bg-primary/10 border border-primary/20 text-primary flex items-center justify-center font-extrabold text-lg shrink-0 select-none">
                            {tradie.avatar_url ? (
                              <img src={tradie.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
                            ) : (
                              displayName.charAt(0).toUpperCase()
                            )}
                          </div>
                          <div>
                            <h3 className="text-lg font-bold flex items-center gap-1.5 text-foreground leading-snug">
                              {displayName}
                              {tradie.tradie_verified && (
                                <ShieldCheck className="h-5 w-5 text-primary fill-primary/10 shrink-0" />
                              )}
                            </h3>
                            <p className="text-xs font-bold text-primary uppercase tracking-wide mt-0.5 line-clamp-1">{tradesLine}</p>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center text-xs text-muted-foreground font-semibold">
                        <MapPin className="mr-1.5 h-4 w-4 shrink-0 text-muted-foreground/60" />
                        {locationStr}
                      </div>

                      {reviewSummary && reviewSummary.review_count > 0 && (
                        <div className="flex items-center text-xs font-bold text-amber-600">
                          <Star className="mr-1.5 h-4 w-4 shrink-0 fill-amber-500 text-amber-500" />
                          {Number(reviewSummary.average_rating).toFixed(1)} ({reviewSummary.review_count} reviews)
                        </div>
                      )}

                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {tradie.trades?.slice(0, 3).map((tid) => {
                          const label = categoryOptions.find(c => c.id === tid)?.label || tid;
                          return (
                            <span key={tid} className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-md font-bold uppercase tracking-wider">
                              {label}
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    <div className="border-t pt-4 flex items-center justify-between gap-4">
                      <span className="text-xs text-muted-foreground font-bold flex items-center">
                        <Award className="mr-1 h-4 w-4 text-muted-foreground/60" /> Verified Credentials
                      </span>
                      <Link
                        to={`/tradies/${tradie.id}`}
                        className="bg-primary text-primary-foreground text-xs font-black px-4.5 py-2.5 rounded-xl hover:bg-primary/95 transition-all shadow-sm"
                      >
                        View Profile
                      </Link>
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
            <button
              onClick={() => setMobileFiltersOpen(false)}
              className="p-2 text-muted-foreground hover:text-foreground rounded-lg"
              aria-label="Close filters"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          <SidebarFilters mobile />
          <div className="flex gap-4 pt-4">
            <button onClick={clearAllFilters} className="flex-1 bg-secondary text-secondary-foreground font-bold py-3 rounded-xl text-sm">
              Clear All
            </button>
            <button onClick={() => setMobileFiltersOpen(false)} className="flex-1 bg-primary text-primary-foreground font-bold py-3 rounded-xl text-sm shadow-md">
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
