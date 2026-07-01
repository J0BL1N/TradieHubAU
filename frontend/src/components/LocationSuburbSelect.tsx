import { useEffect, useRef, useState } from 'react';
import { fetchSuburbsFromDb } from '../lib/auLocations';

export interface SuburbSuggestion {
  id: string;
  suburb: string;
  state: string;
  postcode: string;
  region_id?: string;
  region_name?: string;
  display_name: string;
  latitude?: number;
  longitude?: number;
  is_verified: boolean;
  source?: string;
}

interface Props {
  value: string;
  stateFilter?: string;
  regionFilter?: string;
  onChange: (suburb: string) => void;
  onSelect: (suburb: SuburbSuggestion) => void;
  fallbackOptions?: { suburb: string; state: string; postcode: string; region?: string }[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
}

export default function LocationSuburbSelect({
  value,
  stateFilter = '',
  regionFilter = '',
  onChange,
  onSelect,
  fallbackOptions = [],
  placeholder = 'Type suburb name...',
  className = '',
  disabled = false,
  required = false,
  id,
}: Props) {
  const [suggestions, setSuggestions] = useState<SuburbSuggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Handle click outside to close dropdown
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (value.trim().length < 2 || !showDropdown) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(() => {
      setLoading(true);
      fetchSuburbsFromDb({
        state: stateFilter || undefined,
        regionName: regionFilter || undefined,
        query: value,
        limit: 10,
      })
        .then(({ data, error }) => {
          if (!error && data && data.length > 0) {
            setSuggestions(data);
          } else if (fallbackOptions && fallbackOptions.length > 0) {
            const queryLower = value.toLowerCase();
            const filtered = fallbackOptions
              .filter(opt => {
                const matchState = !stateFilter || opt.state === stateFilter;
                const matchRegion = !regionFilter || opt.region === regionFilter;
                const matchQuery = opt.suburb.toLowerCase().startsWith(queryLower) || opt.postcode.startsWith(queryLower);
                return matchState && matchRegion && matchQuery;
              })
              .slice(0, 10)
              .map(opt => ({
                id: `${opt.suburb}-${opt.state}-${opt.postcode}`,
                suburb: opt.suburb,
                state: opt.state,
                postcode: opt.postcode,
                region_name: opt.region,
                display_name: `${opt.suburb} ${opt.state} ${opt.postcode}`,
                is_verified: false,
              }));
            setSuggestions(filtered);
          } else {
            setSuggestions([]);
          }
        })
        .catch(() => {
          if (fallbackOptions && fallbackOptions.length > 0) {
            const queryLower = value.toLowerCase();
            const filtered = fallbackOptions
              .filter(opt => {
                const matchState = !stateFilter || opt.state === stateFilter;
                const matchRegion = !regionFilter || opt.region === regionFilter;
                const matchQuery = opt.suburb.toLowerCase().startsWith(queryLower) || opt.postcode.startsWith(queryLower);
                return matchState && matchRegion && matchQuery;
              })
              .slice(0, 10)
              .map(opt => ({
                id: `${opt.suburb}-${opt.state}-${opt.postcode}`,
                suburb: opt.suburb,
                state: opt.state,
                postcode: opt.postcode,
                region_name: opt.region,
                display_name: `${opt.suburb} ${opt.state} ${opt.postcode}`,
                is_verified: false,
              }));
            setSuggestions(filtered);
          } else {
            setSuggestions([]);
          }
        })
        .finally(() => {
          setLoading(false);
        });
    }, 200);

    return () => clearTimeout(timer);
  }, [value, stateFilter, regionFilter, showDropdown, fallbackOptions]);

  const handleInputChange = (val: string) => {
    onChange(val);
    setShowDropdown(true);
  };

  const handleSuggestionClick = (item: SuburbSuggestion) => {
    onSelect(item);
    setShowDropdown(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => setShowDropdown(true)}
        placeholder={placeholder}
        className={className}
        disabled={disabled}
        required={required}
        autoComplete="off"
      />
      
      {showDropdown && (suggestions.length > 0 || loading) && (
        <ul className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-card p-1.5 shadow-lg max-h-60 overflow-y-auto text-sm font-semibold">
          {loading && (
            <li className="px-3.5 py-2 text-xs font-bold text-muted-foreground animate-pulse">
              Searching locations...
            </li>
          )}
          {!loading && suggestions.map((item) => (
            <li key={`${item.suburb}-${item.state}-${item.postcode}`}>
              <button
                type="button"
                onClick={() => handleSuggestionClick(item)}
                className="w-full text-left rounded-lg px-3.5 py-2 text-foreground hover:bg-muted transition-colors flex items-center justify-between"
              >
                <span>{item.suburb}, {item.state} {item.postcode}</span>
                {item.region_name && (
                  <span className="text-[10px] font-bold text-muted-foreground bg-muted/65 px-2 py-0.5 rounded-full border border-border">
                    {item.region_name}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
