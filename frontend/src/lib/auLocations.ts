export type AustralianState = 'ACT' | 'NSW' | 'NT' | 'QLD' | 'SA' | 'TAS' | 'VIC' | 'WA';

export interface AustralianLocationOption {
  state: AustralianState;
  region: string;
  suburb: string;
  postcode: string;
}

interface AustralianLocationDataset {
  source: string;
  generatedAt: string;
  regionField: string;
  entries: AustralianLocationOption[];
}

export const australianStates: AustralianState[] = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'];

let locationDatasetPromise: Promise<AustralianLocationDataset> | null = null;

export async function loadAustralianLocations() {
  if (!locationDatasetPromise) {
    locationDatasetPromise = fetch('/data/au-postcode-localities.json')
      .then(response => {
        if (!response.ok) throw new Error('Australian location dataset could not be loaded.');
        return response.json() as Promise<AustralianLocationDataset>;
      });
  }
  return locationDatasetPromise;
}

export function getRegionsForState(entries: AustralianLocationOption[], state: string) {
  return [...new Set(entries.filter(option => option.state === state).map(option => option.region))]
    .sort((a, b) => a.localeCompare(b));
}

export function getSuburbsForRegion(entries: AustralianLocationOption[], state: string, region: string) {
  return entries
    .filter(option => option.state === state && option.region === region)
    .sort((a, b) => a.suburb.localeCompare(b.suburb) || a.postcode.localeCompare(b.postcode));
}

export function findAustralianLocationOption(
  entries: AustralianLocationOption[],
  state: string,
  region: string,
  suburb: string,
  postcode: string
) {
  return entries.find(option =>
    option.state === state &&
    option.region === region &&
    option.suburb === suburb &&
    option.postcode === postcode
  );
}

export function formatSuburbOption(option: AustralianLocationOption) {
  return `${option.suburb} ${option.postcode}`;
}

export function formatJobLocation(suburb?: string | null, state?: string | null) {
  return [suburb?.trim(), state?.trim()].filter(Boolean).join(', ');
}

import { supabase } from './supabase';

export async function fetchRegionsFromDb(state?: string) {
  try {
    const { data, error } = await supabase.rpc('get_location_regions', {
      p_state: state || null,
    });
    if (error) throw error;
    return { data: data || [], error: null };
  } catch (err: any) {
    console.error('Error fetching regions from DB:', err.message);
    return { data: [], error: err };
  }
}

export async function fetchSuburbsFromDb(params: {
  state?: string;
  regionId?: string;
  regionName?: string;
  query?: string;
  limit?: number;
}) {
  try {
    const { data, error } = await supabase.rpc('search_location_suburbs', {
      p_state: params.state || null,
      p_region_id: params.regionId || null,
      p_region_name: params.regionName || null,
      p_query: params.query || null,
      p_limit: params.limit || 50,
    });
    if (error) throw error;
    return { data: data || [], error: null };
  } catch (err: any) {
    console.error('Error fetching suburbs from DB:', err.message);
    return { data: [], error: err };
  }
}
