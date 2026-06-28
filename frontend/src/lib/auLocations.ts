export interface AustralianLocationOption {
  suburb: string;
  state: 'NSW' | 'VIC' | 'QLD' | 'WA' | 'SA' | 'TAS' | 'ACT' | 'NT';
  postcode: string;
}

// Maintainable seed list for the post-job autocomplete.
// Replace or generate this module from a full suburb/postcode dataset when one is added.
export const australianLocationOptions: AustralianLocationOption[] = [
  { suburb: 'Sydney', state: 'NSW', postcode: '2000' },
  { suburb: 'Parramatta', state: 'NSW', postcode: '2150' },
  { suburb: 'Bondi', state: 'NSW', postcode: '2026' },
  { suburb: 'Newcastle', state: 'NSW', postcode: '2300' },
  { suburb: 'Wollongong', state: 'NSW', postcode: '2500' },
  { suburb: 'Melbourne', state: 'VIC', postcode: '3000' },
  { suburb: 'Richmond', state: 'VIC', postcode: '3121' },
  { suburb: 'Geelong', state: 'VIC', postcode: '3220' },
  { suburb: 'Ballarat', state: 'VIC', postcode: '3350' },
  { suburb: 'Brisbane', state: 'QLD', postcode: '4000' },
  { suburb: 'Fortitude Valley', state: 'QLD', postcode: '4006' },
  { suburb: 'Gold Coast', state: 'QLD', postcode: '4217' },
  { suburb: 'Cairns', state: 'QLD', postcode: '4870' },
  { suburb: 'Perth', state: 'WA', postcode: '6000' },
  { suburb: 'Fremantle', state: 'WA', postcode: '6160' },
  { suburb: 'Mandurah', state: 'WA', postcode: '6210' },
  { suburb: 'Adelaide', state: 'SA', postcode: '5000' },
  { suburb: 'Glenelg', state: 'SA', postcode: '5045' },
  { suburb: 'Mount Gambier', state: 'SA', postcode: '5290' },
  { suburb: 'Hobart', state: 'TAS', postcode: '7000' },
  { suburb: 'Launceston', state: 'TAS', postcode: '7250' },
  { suburb: 'Canberra', state: 'ACT', postcode: '2600' },
  { suburb: 'Belconnen', state: 'ACT', postcode: '2617' },
  { suburb: 'Darwin', state: 'NT', postcode: '0800' },
  { suburb: 'Alice Springs', state: 'NT', postcode: '0870' },
];

export function formatJobLocation(suburb?: string | null, state?: string | null) {
  return [suburb?.trim(), state?.trim()].filter(Boolean).join(', ');
}

export function findAustralianLocationOption(input: string) {
  const normalised = input.trim().toLowerCase();
  return australianLocationOptions.find(option =>
    `${option.suburb}, ${option.state} ${option.postcode}`.toLowerCase() === normalised ||
    `${option.suburb} ${option.state} ${option.postcode}`.toLowerCase() === normalised ||
    option.suburb.toLowerCase() === normalised
  );
}
