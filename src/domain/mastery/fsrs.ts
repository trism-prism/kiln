// Thin wrapper over ts-fsrs (FSRS-6 model, its classic synchronous API). Card state is plain data
// with ms timestamps, so it round-trips through IndexedDB and JSON.
import { createEmptyCard, fsrs, Rating, type Card, type FSRS, type Grade } from 'ts-fsrs'

export type RatingName = 'again' | 'hard' | 'good' | 'easy'
export const RATING_NAMES: RatingName[] = ['again', 'hard', 'good', 'easy']
/** Stored in review logs: 1 Again, 2 Hard, 3 Good, 4 Easy. */
export const RATING_VALUE: Record<RatingName, 1 | 2 | 3 | 4> = { again: 1, hard: 2, good: 3, easy: 4 }

const GRADE: Record<RatingName, Grade> = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy }

/** FSRS card state. `state`: 0 New, 1 Learning, 2 Review, 3 Relearning. */
export interface CardState {
  /** ms epoch. */
  due: number
  stability: number
  difficulty: number
  scheduledDays: number
  learningSteps: number
  reps: number
  lapses: number
  state: number
  /** ms epoch. */
  lastReview?: number
}

/** What a review leaves behind: the card state before the review plus the rating. */
export interface ReviewLogData {
  rating: 1 | 2 | 3 | 4
  state: number
  due: number
  stability: number
  difficulty: number
  scheduledDays: number
  learningSteps: number
  reviewedAt: number
}

export interface SchedulerOptions {
  /** Randomise long intervals slightly so cards do not pile up on one day. Off by default (deterministic); the app turns it on. */
  fuzz?: boolean
}

// Default FSRS parameters (90% target retention). Short-term steps are off: Kiln schedules in
// whole days, so "Again" comes back the next day instead of in a minute.
const schedulers = new Map<boolean, FSRS>()
const scheduler = (fuzz: boolean) => {
  let s = schedulers.get(fuzz)
  if (!s) schedulers.set(fuzz, (s = fsrs({ enable_fuzz: fuzz, enable_short_term: false })))
  return s
}

const toLib = (c: CardState): Card => ({
  due: new Date(c.due),
  stability: c.stability,
  difficulty: c.difficulty,
  scheduled_days: c.scheduledDays,
  learning_steps: c.learningSteps,
  reps: c.reps,
  lapses: c.lapses,
  state: c.state as Card['state'],
  last_review: c.lastReview === undefined ? undefined : new Date(c.lastReview),
})

const fromLib = (c: Card): CardState => ({
  due: c.due.getTime(),
  stability: c.stability,
  difficulty: c.difficulty,
  scheduledDays: c.scheduled_days,
  learningSteps: c.learning_steps,
  reps: c.reps,
  lapses: c.lapses,
  state: c.state as Card['state'],
  ...(c.last_review ? { lastReview: c.last_review.getTime() } : {}),
})

/** A card that has never been reviewed, due at `now`. */
export const newCard = (now: number): CardState => fromLib(createEmptyCard(now))

/** Applies a rating at `now`. The input card is not changed. */
export function rate(card: CardState, rating: RatingName, now: number, opts: SchedulerOptions = {}): { card: CardState; log: ReviewLogData } {
  const r = scheduler(opts.fuzz ?? false).next(toLib(card), now, GRADE[rating])
  return {
    card: fromLib(r.card),
    log: {
      rating: RATING_VALUE[rating],
      state: r.log.state,
      due: r.log.due.getTime(),
      stability: r.log.stability,
      difficulty: r.log.difficulty,
      scheduledDays: r.log.scheduled_days,
      learningSteps: r.log.learning_steps,
      reviewedAt: now,
    },
  }
}

/** Chance (0-1) of recalling the card at `now`. 0 for a card that was never reviewed. */
export function retrievability(card: CardState, now: number): number {
  return scheduler(false).retrievability(toLib(card), now)
}
