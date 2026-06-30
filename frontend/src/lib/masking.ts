const SUFFIXES = [
  'electrical',
  'plumbing',
  'carpentry',
  'painting',
  'tiling',
  'building',
  'gardening',
  'cleaning',
  'handyman',
  'services',
  'repairs',
  'gardens',
  'solutions',
  'contractors',
  'renovations',
  'maintenance',
  'pro',
  'professionals'
];

export function maskName(name: string | null | undefined): string {
  if (!name || !name.trim()) return 'Verified Tradie';

  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return 'Verified Tradie';

  const maskedParts = parts.map((part) => {
    const lowerPart = part.toLowerCase().replace(/[^a-z]/g, '');
    
    // Check if this part is a generic trade suffix
    if (SUFFIXES.includes(lowerPart)) {
      return part; // keep generic suffixes visible
    }

    // Mask this word
    if (part.length <= 1) {
      return part;
    }
    if (part.length === 2) {
      return part[0] + '*';
    }
    // Return first letter + asterisks
    return part[0] + '*'.repeat(part.length - 1);
  });

  return maskedParts.join(' ');
}
