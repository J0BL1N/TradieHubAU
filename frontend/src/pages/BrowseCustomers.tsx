import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { fetchCustomers } from '../lib/users';
import type { UserProfile } from '../lib/users';
import { MapPin, Search, SlidersHorizontal, X, Filter, RefreshCw, Loader2, User } from 'lucide-react';

export default function BrowseCustomers() {
  const [customers, setCustomers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchText, setSearchText] = useState('');
  const [selectedState, setSelectedState] = useState('all');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchErr } = await fetchCustomers({
      state: selectedState,
      search: searchText
    });

    if (fetchErr) {
      setError(fetchErr.message || 'Failed to fetch customer directory.');
    } else {
      setCustomers(data);
    }
    setLoading(false);
  }, [selectedState, searchText]);

  useEffect(() => {
    loadCustomers();
  }, [selectedState]);

  const clearAllFilters = () => {
    setSearchText('');
    setSelectedState('all');
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
            onKeyDown={(e) => e.key === 'Enter' && loadCustomers()}
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
    </div>
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Customer Directory</h1>
        <p className="text-muted-foreground mt-1">Browse active job-posters and verified client profiles.</p>
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
              <span className="font-extrabold text-foreground">{customers.length}</span>
              <span className="text-sm text-muted-foreground font-semibold">customers found</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMobileFiltersOpen(true)}
                className="lg:hidden p-2 border rounded-xl hover:bg-muted text-muted-foreground flex items-center gap-1.5 text-xs font-bold"
              >
                <SlidersHorizontal className="h-4 w-4" /> Filters
              </button>
              <button
                onClick={loadCustomers}
                className="p-2 border rounded-xl hover:bg-muted text-muted-foreground"
                title="Refresh listings"
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
              <button onClick={loadCustomers} className="bg-red-500 text-white font-semibold px-4 py-2 rounded-xl text-xs hover:bg-red-600 transition-colors">
                Try Again
              </button>
            </div>
          ) : customers.length === 0 ? (
            <div className="p-12 bg-card border rounded-2xl text-center space-y-4">
              <User className="h-12 w-12 text-muted-foreground/30 mx-auto" />
              <h3 className="text-xl font-bold text-foreground">No customers found</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                No customer profiles match your current search constraints.
              </p>
              <button onClick={clearAllFilters} className="bg-primary text-primary-foreground font-semibold px-5 py-2.5 rounded-xl text-sm shadow-md hover:bg-primary/95">
                Clear Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {customers.map((customer) => {
                const displayName = customer.display_name || 'User';
                const locationParts = [customer.suburb, customer.state].filter(Boolean);
                const locationStr = locationParts.length > 0 ? locationParts.join(', ') : 'Australia';

                return (
                  <div key={customer.id} className="bg-card border rounded-2xl p-6 hover:shadow-md transition-all flex flex-col justify-between space-y-6">
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-extrabold text-lg shrink-0 select-none">
                          {customer.avatar_url ? (
                            <img src={customer.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
                          ) : (
                            displayName.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-foreground leading-snug">{displayName}</h3>
                          <span className="text-[10px] bg-secondary text-secondary-foreground px-2 py-0.5 rounded font-extrabold uppercase tracking-wide">
                            {customer.role === 'dual' ? 'Dual Account' : 'Homeowner'}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2 text-xs text-muted-foreground font-semibold">
                        <div className="flex items-center">
                          <MapPin className="mr-1.5 h-4 w-4 text-muted-foreground/60 shrink-0" />
                          {locationStr}
                        </div>
                      </div>
                    </div>

                    <div className="border-t pt-4 flex items-center justify-end gap-3">
                      <Link
                        to={`/profile/${customer.id}`}
                        className="bg-secondary text-secondary-foreground text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-secondary/80 transition-all"
                      >
                        View Profile
                      </Link>
                      <Link
                        to={`/messages?user=${customer.id}`}
                        className="bg-primary text-primary-foreground text-xs font-black px-4.5 py-2.5 rounded-xl hover:bg-primary/95 transition-all shadow-sm"
                      >
                        Contact Client
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
            <button onClick={() => setMobileFiltersOpen(false)} className="p-2 text-muted-foreground hover:text-foreground rounded-lg">
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
