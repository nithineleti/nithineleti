/**
 * CHAOS ARENA — Shared Types & Game Constants (outside netlify/functions)
 */

export type RoomStateType =
  | 'WAITING_LOBBY'
  | 'TOURNAMENT_START'
  | 'ROUND_PREPARATION'
  | 'ROUND_ACTIVE'
  | 'ROUND_RESULTS'
  | 'NEXT_ROUND'
  | 'TOURNAMENT_COMPLETE';

export type MiniGameId =
  | 'REACTION_RUSH'
  | 'MEMORY_MAYHEM'
  | 'WORD_EXPLOSION'
  | 'DONT_GET_HIT'
  | 'LUCKY_GUESS'
  | 'BRAIN_PANIC';

export type ChaosModifierId =
  | 'NONE'
  | 'DOUBLE_TROUBLE'
  | 'SPEED_MODE'
  | 'REVERSE_CONTROLS'
  | 'MYSTERY_BONUS'
  | 'COMEBACK_MODE';

export interface PlayerRecord {
  playerId: string;
  sessionToken: string;
  nickname: string;
  avatarId: string;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  totalScore: number;
  placementCounts: number[]; // indices 0..7 for 1st..8th
  joinedAt: number;
}

export interface RoundSubmission {
  playerId: string;
  earlyTap?: boolean;
  earlyPenaltyPoints?: number;
  reactionMs?: number | null;
  correctCount?: number;
  totalSymbols?: number;
  totalWords?: number;
  totalQuestions?: number;
  completionMs?: number;
  survivedMs?: number;
  remainingHealth?: number;
  hitsTaken?: number;
  prediction?: number;
  distance?: number;
  submissionMs?: number;
  completed: boolean;
  submittedAt: number;
}

export interface RoundStanding {
  playerId: string;
  nickname: string;
  avatarId: string;
  placement: number;
  basePoints: number;
  bonusPoints: number;
  penaltyPoints: number;
  pointsAwarded: number;
  metricSummary: string;
  bonusReasons: string[];
}

export interface RoundResultSummary {
  roundId: string;
  roundNumber: number;
  totalRounds: number;
  gameType: MiniGameId;
  modifier: ChaosModifierId;
  revealedSecret: string;
  standings: RoundStanding[];
}

export interface RoundRecord {
  roundId: string;
  roundNumber: number;
  totalRounds: number;
  gameType: MiniGameId;
  modifier: ChaosModifierId;
  durationMs: number;
  preparedAt: number;
  startedAt: number | null;
  endsAt: number | null;
  secretData: Record<string, any>;
  submissions: Record<string, RoundSubmission>;
  actionLog: string[];
  results: RoundResultSummary | null;
}

export interface RoomDocument {
  roomId: string;
  code: string;
  hostId: string;
  state: RoomStateType;
  createdAt: number;
  updatedAt: number;
  version: number;
  matchId: string | null;
  totalRounds: number;
  currentRoundNumber: number;
  countdownSec: number;
  gameOrder: MiniGameId[];
  modifierSchedule: Record<number, ChaosModifierId>;
  players: Record<string, PlayerRecord>;
  currentRound: RoundRecord | null;
  roundHistory: RoundResultSummary[];
  winnerIds: string[];
  isSharedVictory: boolean;
}

export const PLACEMENT_POINTS: number[] = [100, 75, 55, 40, 30, 20, 10, 5];

export const MINI_GAMES: MiniGameId[] = [
  'REACTION_RUSH',
  'MEMORY_MAYHEM',
  'WORD_EXPLOSION',
  'DONT_GET_HIT',
  'LUCKY_GUESS',
  'BRAIN_PANIC',
];

export const CHAOS_MODIFIERS: ChaosModifierId[] = [
  'DOUBLE_TROUBLE',
  'SPEED_MODE',
  'REVERSE_CONTROLS',
  'MYSTERY_BONUS',
  'COMEBACK_MODE',
];

export const GAME_METADATA: Record<
  MiniGameId,
  {
    id: MiniGameId;
    title: string;
    skill: string;
    icon: string;
    description: string;
    controls: string;
    baseDurationMs: number;
  }
> = {
  REACTION_RUSH: {
    id: 'REACTION_RUSH',
    title: 'Reaction Rush',
    skill: 'Reflexes',
    icon: '⚡',
    description:
      'Wait for the visual signal to turn ELECTRIC GREEN and tap as quickly as possible. Tapping early deducts 10 points!',
    controls: 'Tap the signal button or press Spacebar when the arena turns GREEN.',
    baseDurationMs: 9000,
  },
  MEMORY_MAYHEM: {
    id: 'MEMORY_MAYHEM',
    title: 'Memory Mayhem',
    skill: 'Memory',
    icon: '🧠',
    description:
      'Observe the flashing sequence of 6 symbols while revealed, then reproduce the exact sequence before the timer expires.',
    controls: 'Tap the symbol buttons in the exact order shown.',
    baseDurationMs: 18000,
  },
  WORD_EXPLOSION: {
    id: 'WORD_EXPLOSION',
    title: 'Word Explosion',
    skill: 'Thinking Speed',
    icon: '💥',
    description:
      'Unscramble the arcade words before the timer runs out. Accuracy ranks first; completion time breaks ties.',
    controls: 'Type the unscrambled words and click Lock In Answers.',
    baseDurationMs: 25000,
  },
  DONT_GET_HIT: {
    id: 'DONT_GET_HIT',
    title: "Don't Get Hit",
    skill: 'Coordination',
    icon: '☄️',
    description:
      'Dodge incoming obstacle waves across 4 lanes. Server validates movement and collision outcomes!',
    controls: 'Tap Left/Right lane controls or press Arrow Keys to steer into the SAFE lane.',
    baseDurationMs: 15000,
  },
  LUCKY_GUESS: {
    id: 'LUCKY_GUESS',
    title: 'Lucky Guess',
    skill: 'Prediction & Luck',
    icon: '🎲',
    description:
      'Predict the hidden secret number between 1 and 1000. Closest prediction ranks first; exact match gets priority!',
    controls: 'Enter your prediction (1–1000) and lock it in.',
    baseDurationMs: 15000,
  },
  BRAIN_PANIC: {
    id: 'BRAIN_PANIC',
    title: 'Brain Panic',
    skill: 'Rapid Logic',
    icon: '🔢',
    description:
      'Solve 5 rapid-fire mathematical and logical challenges against the clock. Accuracy ranks first; speed breaks ties.',
    controls: 'Tap the correct answer button for each question.',
    baseDurationMs: 22000,
  },
};

export const MODIFIER_METADATA: Record<
  ChaosModifierId,
  {
    id: ChaosModifierId;
    name: string;
    badge: string;
    description: string;
  }
> = {
  NONE: {
    id: 'NONE',
    name: 'Standard Rules',
    badge: 'STANDARD',
    description: 'No chaos modifier active this round. Pure skill!',
  },
  DOUBLE_TROUBLE: {
    id: 'DOUBLE_TROUBLE',
    name: 'Double Trouble',
    badge: '2X POINTS',
    description: 'All placement points earned in this round are DOUBLED!',
  },
  SPEED_MODE: {
    id: 'SPEED_MODE',
    name: 'Speed Mode',
    badge: 'FAST CLOCK',
    description: 'Round timer is reduced by 35%! Think and react faster!',
  },
  REVERSE_CONTROLS: {
    id: 'REVERSE_CONTROLS',
    name: 'Reverse Controls',
    badge: 'INVERTED',
    description: 'Movement directions and control pads are inverted this round!',
  },
  MYSTERY_BONUS: {
    id: 'MYSTERY_BONUS',
    name: 'Mystery Bonus',
    badge: '+25 BONUS',
    description: 'Awards +25 bonus points for unlocking this round’s achievement or 1st place!',
  },
  COMEBACK_MODE: {
    id: 'COMEBACK_MODE',
    name: 'Comeback Mode',
    badge: 'UNDERDOG +30',
    description: 'Bottom-half ranked players earn +30 bonus points if they finish in the top half!',
  },
};

export const MEMORY_SYMBOLS = [
  { id: 0, label: 'BOLT', color: '#00F0FF', icon: '⚡' },
  { id: 1, label: 'FLAME', color: '#FF6B00', icon: '🔥' },
  { id: 2, label: 'STAR', color: '#A855F7', icon: '⭐' },
  { id: 3, label: 'CROWN', color: '#FACC15', icon: '👑' },
  { id: 4, label: 'SKULL', color: '#EC4899', icon: '💀' },
  { id: 5, label: 'GEM', color: '#10B981', icon: '💎' },
];

export const WORD_BANK = [
  { word: 'ARCADE', hint: 'Coin-operated game hall' },
  { word: 'VICTORY', hint: 'First place triumph' },
  { word: 'CHAOTIC', hint: 'Wild and unpredictable' },
  { word: 'CHAMPION', hint: 'Tournament winner' },
  { word: 'REFLEX', hint: 'Instant reaction speed' },
  { word: 'PUZZLE', hint: 'Brain teaser challenge' },
  { word: 'TROPHY', hint: 'Golden prize cup' },
  { word: 'ROCKET', hint: 'High-speed space vehicle' },
  { word: 'JACKPOT', hint: 'Massive lucky prize' },
  { word: 'THUNDER', hint: 'Booming storm sound' },
];
