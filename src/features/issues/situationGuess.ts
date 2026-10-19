/**
 * situationGuess — ranks CATS situations by keyword overlap with free-text input.
 *
 * Used by OpenCaseDrawer step 1 to suggest matching situations from the
 * CATS template library.
 */

import { CATS, type Situation } from '@/store/useIssuesStore';

export interface SituationMatch {
  catId: string;
  sitId: string;
  catLabel: string;
  sitTitle: string;
  score: number;
}

/** Tokenise a string into lowercase alpha-numeric words (>= 2 chars). */
function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3);
}

interface CorpusEntry {
  /** Primary tokens: title, desc, tags (weighted 3x) */
  primary: string[];
  /** Secondary tokens: step titles (weighted 1x) */
  secondary: string[];
}

/** Build the corpus of searchable words for a situation. */
function corpusFor(sit: Situation): CorpusEntry {
  const primaryParts = [sit.title, sit.desc, ...sit.tags];
  const secondaryParts: string[] = [];
  for (const step of sit.pre) secondaryParts.push(step.s);
  for (const step of sit.self) secondaryParts.push(step.s);
  for (const step of sit.legal) secondaryParts.push(step.s);
  return {
    primary: tokenise(primaryParts.join(' ')),
    secondary: tokenise(secondaryParts.join(' ')),
  };
}

function countMatches(token: string, words: string[]): number {
  let count = 0;
  for (const w of words) {
    if (w.includes(token) || token.includes(w)) count++;
  }
  return count;
}

/**
 * Rank all CATS situations by keyword overlap with the input text.
 * Returns every situation sorted by descending score (ties broken by
 * category + situation order in CATS).
 *
 * Score per input token:
 *   - 3 points per match in title/desc/tags (primary)
 *   - 1 point per match in step titles (secondary, only if no primary match)
 *
 * Multiple occurrences of a word within primary or secondary each
 * contribute, so a situation that mentions "elevator" in both its desc
 * and its tags scores higher than one that mentions it once.
 */
export function situationGuess(text: string): SituationMatch[] {
  if (!text || !text.trim()) return allSituations();

  const inputTokens = [...new Set(tokenise(text))];
  if (inputTokens.length === 0) return allSituations();

  const results: SituationMatch[] = [];

  for (const cat of CATS) {
    for (const sit of cat.sits) {
      const corpus = corpusFor(sit);
      let score = 0;
      for (const token of inputTokens) {
        const primaryHits = countMatches(token, corpus.primary);
        if (primaryHits > 0) {
          score += primaryHits * 3;
        } else {
          const secondaryHits = countMatches(token, corpus.secondary);
          score += secondaryHits;
        }
      }
      results.push({
        catId: cat.id,
        sitId: sit.id,
        catLabel: cat.label,
        sitTitle: sit.title,
        score,
      });
    }
  }

  // Sort: highest score first, then preserve CATS order for ties
  results.sort((a, b) => b.score - a.score);
  return results;
}

/** Return all situations in CATS order with score 0 (no input). */
function allSituations(): SituationMatch[] {
  const results: SituationMatch[] = [];
  for (const cat of CATS) {
    for (const sit of cat.sits) {
      results.push({
        catId: cat.id,
        sitId: sit.id,
        catLabel: cat.label,
        sitTitle: sit.title,
        score: 0,
      });
    }
  }
  return results;
}
