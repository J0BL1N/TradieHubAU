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
