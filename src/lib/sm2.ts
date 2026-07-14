/**
 * SM-2 Spaced Repetition Algorithm
 *
 * Quality ratings:
 *   0 = Again (complete blackout)
 *   2 = Hard (remembered with serious difficulty)
 *   3 = Good (remembered with some effort)
 *   5 = Easy (perfect recall)
 */

export interface SM2State {
  interval: number;      // days until next review
  repetitions: number;   // consecutive correct reviews
  easeFactor: number;    // minimum 1.3
  nextReview: string;    // ISO date string
  lastReview: string | null;  // ISO date string or null
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  source: string;
  createdAt: string;
  sm2: SM2State;
}

/**
 * Apply the SM-2 algorithm to a card after a review.
 * Returns a new SM2State (does not mutate input).
 */
export function processSM2(sm2: SM2State, quality: number): SM2State {
  const s: SM2State = {
    interval: sm2.interval,
    repetitions: sm2.repetitions,
    easeFactor: sm2.easeFactor,
    nextReview: sm2.nextReview,
    lastReview: sm2.lastReview,
  };

  s.lastReview = new Date().toISOString();

  if (quality >= 3) {
    // Correct response
    s.repetitions++;
    if (s.repetitions === 1) {
      s.interval = 1;
    } else if (s.repetitions === 2) {
      s.interval = 6;
    } else {
      s.interval = Math.round(s.interval * s.easeFactor);
    }
  } else {
    // Incorrect response — reset
    s.repetitions = 0;
    s.interval = 0;
  }

  // Update ease factor
  s.easeFactor = Math.max(
    1.3,
    s.easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
  );

  // Calculate next review date
  if (s.interval > 0) {
    const next = new Date();
    next.setDate(next.getDate() + s.interval);
    s.nextReview = next.toISOString();
  } else {
    s.nextReview = new Date().toISOString(); // review again today
  }

  return s;
}

/**
 * Get cards that are due for review (nextReview <= now).
 */
export function getDueCards(cards: Flashcard[]): Flashcard[] {
  const now = new Date();
  return cards.filter(c => new Date(c.sm2.nextReview) <= now);
}

/**
 * Get review status counts.
 */
export function getDueStatus(cards: Flashcard[]) {
  const dueCards = getDueCards(cards);
  return {
    dueCount: dueCards.length,
    newCount: cards.filter(c => c.sm2.repetitions === 0).length,
    totalCount: cards.length,
    masteredCount: cards.filter(c => c.sm2.interval >= 21).length,
  };
}

/**
 * Create a new flashcard with initial SM-2 state.
 */
export function createFlashcard(
  front: string,
  back: string,
  source: string = "手动创建"
): Flashcard {
  return {
    id: "fc-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
    front,
    back,
    source,
    createdAt: new Date().toISOString(),
    sm2: {
      interval: 0,
      repetitions: 0,
      easeFactor: 2.5,
      nextReview: new Date().toISOString(),
      lastReview: null,
    },
  };
}
