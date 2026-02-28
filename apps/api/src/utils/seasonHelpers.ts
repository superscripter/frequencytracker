export type Season = 'winter' | 'spring' | 'summer' | 'fall';

export function getCurrentSeason(date: Date): Season {
  const month = date.getMonth() + 1; // 1-12
  if (month === 12 || month <= 2) return 'winter';
  if (month <= 5) return 'spring';
  if (month <= 8) return 'summer';
  return 'fall';
}

export function getSeasonalFrequency(
  type: { freqWinter: number; freqSpring: number; freqSummer: number; freqFall: number },
  season: Season
): number {
  switch (season) {
    case 'winter': return type.freqWinter;
    case 'spring': return type.freqSpring;
    case 'summer': return type.freqSummer;
    case 'fall':   return type.freqFall;
  }
}
