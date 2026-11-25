// Core data model. UI-independent; shared by engine, db and sync.

export type Side = 'white' | 'black';

/** One move in an opening tree. The root node has san = '' and the start FEN. */
export interface TreeNode {
  id: string; // stable path id, e.g. "e4.e5.Nf3"
  san: string;
  uci: string;
  fen: string; // position AFTER this move
  comment?: string;
  children: TreeNode[];
}

export interface Opening {
  id: string; // builtin: filename slug; imported: uuid
  name: string;
  eco: string;
  origin?: string; // who invented, named or popularised it ([Origin] PGN header)
  side: Side; // colour the learner plays
  tags: string[];
  difficulty: 1 | 2 | 3;
  source: 'builtin' | 'imported';
  root: TreeNode;
  pgn?: string; // original text, kept for imported openings
  updatedAt: number; // epoch ms
  deleted?: boolean; // tombstone (imported only)
}

/** Root-to-leaf path through an opening tree. */
export interface Line {
  id: string; // stable hash of the SAN sequence
  openingId: string;
  name: string;
  nodes: TreeNode[]; // excludes root
}

export interface AcceptedMove {
  uci: string;
  san: string;
}

/** FSRS-7 memory/scheduling state as produced by ts-fsrs DefaultScheduler (dates as epoch ms when stored). */
export interface SrsState {
  stability: number;
  stabilityFast: number;
  difficulty: number;
  state: number; // ts-fsrs State: 0 New, 1 Learning, 2 Review, 3 Relearning
  scheduleStatus: string;
  dueAt: number;
  lastReviewAt: number | null;
  reps: number;
  lapses: number;
  scheduledDays: number;
  learningStep: number;
}

/**
 * Review unit: one position where it is the learner's turn.
 * Derived from content (accepted moves) + persisted SRS state.
 */
export interface Card {
  id: string; // `${openingId}|${posKey}`
  openingId: string;
  posKey: string; // FEN without move counters
  fen: string;
  accepted: AcceptedMove[];
  lineIds: string[];
  comment?: string; // comment shown after answering (from the accepted child)
  srs?: SrsState; // undefined = new, never reviewed
}

/** What gets persisted and synced per card (content-derived parts are rebuilt). */
export interface CardProgress {
  id: string;
  openingId: string;
  posKey: string;
  srs: SrsState;
  updatedAt: number;
}

export type QuizMode = 'next-move' | 'full-line';

export interface ReviewLogEntry {
  id: string; // uuid
  cardId: string;
  rating: 1 | 2 | 3 | 4; // Again, Hard, Good, Easy
  mode: QuizMode;
  at: number;
  before: SrsState | null; // state before review (allows audit/rollback)
}

export interface StudySet {
  id: string;
  name: string;
  openingIds: string[];
  /** Optional narrowing: openingId -> selected lineIds. Missing key = all lines. */
  lineFilter?: Record<string, string[]>;
  updatedAt: number;
  deleted?: boolean;
}

export interface Settings {
  theme: 'system' | 'light' | 'dark';
  stopAtFirstMistake: boolean;
  newCardsPerDay: number;
  countPracticeReviews: boolean;
  updatedAt: number;
}

export const SYNC_SCHEMA_VERSION = 1;

export interface SyncFile {
  schema: typeof SYNC_SCHEMA_VERSION;
  deviceId: string;
  exportedAt: number;
  cards: CardProgress[];
  reviewLogs: ReviewLogEntry[];
  sets: StudySet[];
  settings: Settings | null;
  importedOpenings: Opening[];
}
