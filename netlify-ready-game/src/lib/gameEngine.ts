/**
 * CHAOS ARENA — Pure Server-Authoritative Game Logic & State Machine (outside netlify/functions)
 * Supports configurable round counts (including 3-round blitz and 6-round full tournament)
 * and persists all room state atomically via Netlify Blobs strong consistency + conditional writes.
 */

import crypto from 'crypto';
import {
  CHAOS_MODIFIERS,
  ChaosModifierId,
  GAME_METADATA,
  MEMORY_SYMBOLS,
  MINI_GAMES,
  MiniGameId,
  MODIFIER_METADATA,
  PLACEMENT_POINTS,
  PlayerRecord,
  RoomDocument,
  RoundRecord,
  RoundSubmission,
  WORD_BANK,
} from './gameTypes';
import { getStrongRoomStore, updateRoomAtomically } from './blobStore';

export function generateId(prefix = 'id'): string {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

export function generateCodeString(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  return code;
}

export function sanitizeNickname(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[<>'"&]/g, '').trim().slice(0, 18);
}

export function deterministicScramble(word: string, seed = 1): string {
  const chars = word.split('');
  let s = seed;
  for (let i = chars.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) % 4294967296;
    const j = s % (i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }
  const joined = chars.join('');
  if (joined === word && word.length > 1) {
    return word.slice(1) + word[0];
  }
  return joined;
}

export function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

export async function createRoomInBlobs(params: {
  sessionToken?: string;
  nickname: string;
  avatarId?: string;
  totalRounds?: number;
}): Promise<{ room: Record<string, any>; session: { playerId: string; sessionToken: string; nickname: string; avatarId: string } }> {
  const nickname = sanitizeNickname(params.nickname);
  if (nickname.length < 2) {
    throw new Error('INVALID_NICKNAME: Nickname must be between 2 and 18 characters.');
  }
  const store = await getStrongRoomStore();
  const playerId = generateId('plr');
  const sessionToken = params.sessionToken || generateId('sess');
  const avatarId = params.avatarId || 'cyber-fox';
  const totalRounds = params.totalRounds === 3 ? 3 : 6;

  for (let attempt = 0; attempt < 25; attempt++) {
    const code = generateCodeString();
    const key = `room:${code}`;
    const now = Date.now();

    const hostPlayer: PlayerRecord = {
      playerId,
      sessionToken,
      nickname,
      avatarId,
      isHost: true,
      ready: true,
      connected: true,
      totalScore: 0,
      placementCounts: [0, 0, 0, 0, 0, 0, 0, 0],
      joinedAt: now,
    };

    const doc: RoomDocument = {
      roomId: generateId('room'),
      code,
      hostId: playerId,
      state: 'WAITING_LOBBY',
      createdAt: now,
      updatedAt: now,
      version: 1,
      matchId: null,
      totalRounds,
      currentRoundNumber: 0,
      countdownSec: 0,
      gameOrder: [],
      modifierSchedule: {},
      players: {
        [playerId]: hostPlayer,
      },
      currentRound: null,
      roundHistory: [],
      winnerIds: [],
      isSharedVictory: false,
    };

    const writeRes = await store.setRoomConditional(key, doc, { onlyIfNew: true });
    if (writeRes.modified) {
      return {
        room: toPublicRoomState(doc),
        session: { playerId, sessionToken, nickname, avatarId },
      };
    }
  }

  throw new Error('ROOM_CREATION_FAILED: Unable to allocate unique room code.');
}

export async function joinRoomInBlobs(params: {
  code: string;
  sessionToken?: string;
  nickname: string;
  avatarId?: string;
}): Promise<{ room: Record<string, any>; session: { playerId: string; sessionToken: string; nickname: string; avatarId: string }; reconnected: boolean }> {
  const cleanName = sanitizeNickname(params.nickname);
  if (cleanName.length < 2) {
    throw new Error('INVALID_NICKNAME: Nickname must be between 2 and 18 characters.');
  }
  const sessionToken = params.sessionToken || generateId('sess');
  const avatarId = params.avatarId || 'neon-bot';
  let assignedPlayerId = '';
  let wasReconnected = false;

  const updatedDoc = await updateRoomAtomically(params.code, (room) => {
    const existingEntry = Object.values(room.players).find((p) => p.sessionToken === sessionToken);
    if (existingEntry) {
      existingEntry.connected = true;
      existingEntry.nickname = cleanName;
      existingEntry.avatarId = avatarId;
      assignedPlayerId = existingEntry.playerId;
      wasReconnected = true;
      return room;
    }

    if (room.state !== 'WAITING_LOBBY') {
      throw new Error('TOURNAMENT_ALREADY_STARTED: Cannot join after the tournament begins.');
    }

    const playerList = Object.values(room.players);
    if (playerList.length >= 8) {
      throw new Error('ROOM_FULL: Room already has the maximum of 8 players.');
    }

    for (const p of playerList) {
      if (p.nickname.toLowerCase() === cleanName.toLowerCase()) {
        throw new Error('DUPLICATE_NICKNAME: Another player in this room already has that nickname.');
      }
    }

    const newPlayerId = generateId('plr');
    assignedPlayerId = newPlayerId;
    wasReconnected = false;

    room.players[newPlayerId] = {
      playerId: newPlayerId,
      sessionToken,
      nickname: cleanName,
      avatarId,
      isHost: false,
      ready: true,
      connected: true,
      totalScore: 0,
      placementCounts: [0, 0, 0, 0, 0, 0, 0, 0],
      joinedAt: Date.now(),
    };

    return room;
  });

  return {
    room: toPublicRoomState(updatedDoc),
    session: {
      playerId: assignedPlayerId,
      sessionToken,
      nickname: cleanName,
      avatarId,
    },
    reconnected: wasReconnected,
  };
}

export async function getRoomStateFromBlobs(code: string): Promise<Record<string, any>> {
  const store = await getStrongRoomStore();
  const key = `room:${(code || '').trim().toUpperCase()}`;
  const { data } = await store.getWithMetadata(key);
  if (!data) {
    throw new Error('INVALID_ROOM_CODE: Room not found.');
  }

  // Serverless functions have no background timers, so an expired round is finalized lazily
  // by whichever client polls first after the deadline (players who never submitted score last).
  if (isRoundExpired(data)) {
    const updated = await updateRoomAtomically(code, (room) => {
      if (isRoundExpired(room)) {
        finalizeRoundMutation(room);
      }
      return room;
    });
    return toPublicRoomState(updated);
  }

  return toPublicRoomState(data);
}

const ROUND_EXPIRY_GRACE_MS = 750;

function isRoundExpired(room: RoomDocument): boolean {
  return (
    room.state === 'ROUND_ACTIVE' &&
    Boolean(room.currentRound) &&
    Date.now() > (room.currentRound!.endsAt || 0) + ROUND_EXPIRY_GRACE_MS
  );
}

export async function setReadyInBlobs(params: {
  code: string;
  playerId: string;
  ready: boolean;
}): Promise<Record<string, any>> {
  const updated = await updateRoomAtomically(params.code, (room) => {
    const p = room.players[params.playerId];
    if (!p) throw new Error('PLAYER_NOT_IN_ROOM');
    p.ready = Boolean(params.ready);
    return room;
  });
  return toPublicRoomState(updated);
}

export async function startTournamentInBlobs(params: {
  code: string;
  playerId: string;
  totalRounds?: number;
  customGameOrder?: MiniGameId[];
  customModifiers?: Record<number, ChaosModifierId>;
}): Promise<Record<string, any>> {
  const updated = await updateRoomAtomically(params.code, (room) => {
    if (room.hostId !== params.playerId) {
      throw new Error('UNAUTHORIZED_HOST_ACTION: Only the room host can start the tournament.');
    }
    const players = Object.values(room.players);
    if (players.length < 2 || players.length > 8) {
      throw new Error('INVALID_PLAYER_COUNT: Between 2 and 8 players are required.');
    }
    for (const p of players) {
      if (p.connected && !p.isHost && !p.ready) {
        throw new Error('PLAYERS_NOT_READY: All connected players must mark Ready.');
      }
    }

    const roundCount = params.totalRounds === 3 ? 3 : params.totalRounds === 6 ? 6 : room.totalRounds || 6;
    room.totalRounds = roundCount;
    room.matchId = generateId('match');
    room.state = 'TOURNAMENT_START';
    room.currentRoundNumber = 0;
    room.roundHistory = [];
    room.winnerIds = [];
    room.isSharedVictory = false;

    for (const p of players) {
      p.totalScore = 0;
      p.placementCounts = [0, 0, 0, 0, 0, 0, 0, 0];
    }

    if (Array.isArray(params.customGameOrder) && params.customGameOrder.length === roundCount) {
      room.gameOrder = [...params.customGameOrder];
    } else {
      room.gameOrder = shuffleArray(MINI_GAMES).slice(0, roundCount);
    }

    if (params.customModifiers) {
      room.modifierSchedule = { ...params.customModifiers };
    } else {
      room.modifierSchedule = {};
      for (let r = 1; r <= roundCount; r++) room.modifierSchedule[r] = 'NONE';
      const candidateRounds = roundCount === 3 ? [2, 3] : shuffleArray([2, 3, 4, 5, 6]).slice(0, 2);
      const chosenMods = shuffleArray(CHAOS_MODIFIERS);
      candidateRounds.forEach((rNum, idx) => {
        const gameAtRound = room.gameOrder[rNum - 1];
        let mod = chosenMods[idx % chosenMods.length];
        if (mod === 'REVERSE_CONTROLS' && !['DONT_GET_HIT', 'MEMORY_MAYHEM'].includes(gameAtRound)) {
          mod = 'DOUBLE_TROUBLE';
        }
        room.modifierSchedule[rNum] = mod;
      });
    }

    prepareNextRoundMutation(room);
    return room;
  });

  return toPublicRoomState(updated);
}

export function prepareNextRoundMutation(room: RoomDocument): void {
  if (room.currentRoundNumber >= room.totalRounds) {
    completeTournamentMutation(room);
    return;
  }

  room.currentRoundNumber += 1;
  const rNum = room.currentRoundNumber;
  const gameType = room.gameOrder[rNum - 1];
  const modifier = room.modifierSchedule[rNum] || 'NONE';
  const meta = GAME_METADATA[gameType];
  const durationMs = modifier === 'SPEED_MODE' ? Math.round(meta.baseDurationMs * 0.65) : meta.baseDurationMs;
  const now = Date.now();

  room.state = 'ROUND_ACTIVE';
  room.countdownSec = 0;
  room.currentRound = {
    roundId: generateId(`rnd_${rNum}`),
    roundNumber: rNum,
    totalRounds: room.totalRounds,
    gameType,
    modifier,
    durationMs,
    preparedAt: now,
    startedAt: now,
    endsAt: now + durationMs,
    secretData: buildRoundSecretData(gameType, modifier, rNum),
    submissions: {},
    actionLog: [],
    results: null,
  };
}

export function buildRoundSecretData(
  gameType: MiniGameId,
  modifier: ChaosModifierId,
  roundNumber: number
): Record<string, any> {
  switch (gameType) {
    case 'REACTION_RUSH':
      return { signalDelayMs: 1800 + ((roundNumber * 571) % 1800) };
    case 'MEMORY_MAYHEM': {
      const sequence: number[] = [];
      for (let i = 0; i < 6; i++) {
        sequence.push((roundNumber * 5 + i * 3 + crypto.randomInt(0, 6)) % 6);
      }
      return {
        sequence,
        revealDurationMs: modifier === 'SPEED_MODE' ? 3000 : 4200,
      };
    }
    case 'WORD_EXPLOSION': {
      const selected = shuffleArray(WORD_BANK).slice(0, 4);
      return {
        words: selected.map((w, idx) => ({
          index: idx,
          scrambled: deterministicScramble(w.word, roundNumber * 11 + idx + 1),
          hint: w.hint,
          answer: w.word,
        })),
      };
    }
    case 'DONT_GET_HIT': {
      const waves = [];
      for (let w = 0; w < 10; w++) {
        waves.push({
          waveIndex: w,
          spawnTimeMs: w * 1300 + 900,
          safeLane: (w * 3 + roundNumber + crypto.randomInt(0, 4)) % 4,
          damage: 34,
        });
      }
      return { waves, totalLanes: 4 };
    }
    case 'LUCKY_GUESS':
      return { secretNumber: crypto.randomInt(1, 1001), min: 1, max: 1000 };
    case 'BRAIN_PANIC':
      return {
        questions: [
          { id: 0, prompt: '14 × 3 - 7 = ?', options: ['33', '35', '37', '42'], answer: '35' },
          { id: 1, prompt: 'Next in sequence: 3, 6, 12, 24, ?', options: ['36', '42', '48', '54'], answer: '48' },
          { id: 2, prompt: '(72 ÷ 8) + 19 = ?', options: ['26', '27', '28', '29'], answer: '28' },
          { id: 3, prompt: 'Largest value: 5², 3³, or 2⁴?', options: ['5² (25)', '3³ (27)', '2⁴ (16)', 'Equal'], answer: '3³ (27)' },
          { id: 4, prompt: '95 - 38 + 15 = ?', options: ['62', '70', '72', '74'], answer: '72' },
        ],
      };
  }
}

export async function submitRoundActionInBlobs(params: {
  code: string;
  playerId: string;
  roundId?: string;
  actionId?: string;
  payload: Record<string, any>;
}): Promise<Record<string, any>> {
  const updated = await updateRoomAtomically(params.code, (room) => {
    if (room.state !== 'ROUND_ACTIVE' || !room.currentRound) {
      throw new Error('ROUND_NOT_ACTIVE: Cannot submit action when round is not active.');
    }
    const round = room.currentRound;
    if (params.roundId && params.roundId !== round.roundId) {
      throw new Error('STALE_ROUND_ID: Action targets a different round.');
    }
    if (!room.players[params.playerId]) {
      throw new Error('PLAYER_NOT_IN_ROOM');
    }

    const payload = params.payload || {};
    if (payload.points !== undefined || payload.forcePlacement !== undefined) {
      throw new Error('SECURITY_VIOLATION: Client cannot submit raw points or placements.');
    }

    if (params.actionId) {
      const key = `${params.playerId}:${params.actionId}`;
      if (round.actionLog.includes(key)) {
        throw new Error('DUPLICATE_ACTION_REPLAY');
      }
      round.actionLog.push(key);
    }

    const now = Date.now();
    const elapsedMs = Math.max(1, now - (round.startedAt || now));
    const existing = round.submissions[params.playerId];
    if (existing && existing.completed) {
      throw new Error('DUPLICATE_SUBMISSION: Player already locked in for this round.');
    }

    switch (round.gameType) {
      case 'REACTION_RUSH': {
        const signalDelay = round.secretData.signalDelayMs;
        const tapElapsed =
          typeof payload.tapElapsedMs === 'number' && payload.tapElapsedMs >= 0
            ? payload.tapElapsedMs
            : elapsedMs;

        if (tapElapsed < signalDelay) {
          round.submissions[params.playerId] = {
            playerId: params.playerId,
            earlyTap: true,
            earlyPenaltyPoints: 10,
            reactionMs: null,
            completed: Boolean(payload.finalAttempt !== false),
            submittedAt: now,
          };
        } else {
          round.submissions[params.playerId] = {
            playerId: params.playerId,
            earlyTap: existing ? Boolean(existing.earlyTap) : false,
            earlyPenaltyPoints: existing && existing.earlyTap ? 10 : 0,
            reactionMs: Math.max(1, Math.round(tapElapsed - signalDelay)),
            completed: true,
            submittedAt: now,
          };
        }
        break;
      }

      case 'MEMORY_MAYHEM': {
        const seq = Array.isArray(payload.sequence) ? payload.sequence : [];
        const target: number[] = round.secretData.sequence;
        let correctCount = 0;
        for (let i = 0; i < target.length; i++) {
          if (seq[i] === target[i]) correctCount++;
        }
        round.submissions[params.playerId] = {
          playerId: params.playerId,
          correctCount,
          totalSymbols: target.length,
          completionMs: typeof payload.completionMs === 'number' ? payload.completionMs : elapsedMs,
          completed: true,
          submittedAt: now,
        };
        break;
      }

      case 'WORD_EXPLOSION': {
        const answers = Array.isArray(payload.answers) ? payload.answers : [];
        const words: Array<{ answer: string }> = round.secretData.words;
        let correctCount = 0;
        words.forEach((w, idx) => {
          if ((answers[idx] || '').toString().trim().toUpperCase() === w.answer) {
            correctCount++;
          }
        });
        round.submissions[params.playerId] = {
          playerId: params.playerId,
          correctCount,
          totalWords: words.length,
          completionMs: typeof payload.completionMs === 'number' ? payload.completionMs : elapsedMs,
          completed: true,
          submittedAt: now,
        };
        break;
      }

      case 'DONT_GET_HIT': {
        const laneByWave = Array.isArray(payload.laneByWave) ? payload.laneByWave : [];
        const waves: Array<{ spawnTimeMs: number; safeLane: number; damage: number }> = round.secretData.waves;
        let health = 100;
        let survivedMs = round.durationMs;
        let hitsTaken = 0;
        for (let w = 0; w < waves.length; w++) {
          const wave = waves[w];
          const lane = typeof laneByWave[w] === 'number' ? laneByWave[w] : -1;
          if (lane !== wave.safeLane) {
            hitsTaken++;
            health = Math.max(0, health - wave.damage);
            if (health <= 0) {
              survivedMs = wave.spawnTimeMs;
              break;
            }
          }
        }
        round.submissions[params.playerId] = {
          playerId: params.playerId,
          survivedMs,
          remainingHealth: health,
          hitsTaken,
          completed: true,
          submittedAt: now,
        };
        break;
      }

      case 'LUCKY_GUESS': {
        const pred = Math.round(Number(payload.prediction));
        if (!Number.isFinite(pred) || pred < 1 || pred > 1000) {
          throw new Error('INVALID_PREDICTION: Enter a number between 1 and 1000.');
        }
        const distance = Math.abs(pred - round.secretData.secretNumber);
        round.submissions[params.playerId] = {
          playerId: params.playerId,
          prediction: pred,
          distance,
          submissionMs: typeof payload.submissionMs === 'number' ? payload.submissionMs : elapsedMs,
          completed: true,
          submittedAt: now,
        };
        break;
      }

      case 'BRAIN_PANIC': {
        const answers = Array.isArray(payload.answers) ? payload.answers : [];
        const questions: Array<{ answer: string }> = round.secretData.questions;
        let correctCount = 0;
        questions.forEach((q, idx) => {
          if ((answers[idx] || '').toString().trim() === q.answer) {
            correctCount++;
          }
        });
        round.submissions[params.playerId] = {
          playerId: params.playerId,
          correctCount,
          totalQuestions: questions.length,
          completionMs: typeof payload.completionMs === 'number' ? payload.completionMs : elapsedMs,
          completed: true,
          submittedAt: now,
        };
        break;
      }
    }

    // Auto-finalize if all connected players have completed their round submission
    const connectedPlayers = Object.values(room.players).filter((p) => p.connected);
    const allCompleted =
      connectedPlayers.length > 0 &&
      connectedPlayers.every((p) => {
        const sub = round.submissions[p.playerId];
        return Boolean(sub && sub.completed);
      });

    if (allCompleted) {
      finalizeRoundMutation(room);
    }

    return room;
  });

  return toPublicRoomState(updated);
}

export async function finalizeRoundInBlobs(params: {
  code: string;
  playerId: string;
}): Promise<Record<string, any>> {
  const updated = await updateRoomAtomically(params.code, (room) => {
    if (room.hostId !== params.playerId) {
      throw new Error('UNAUTHORIZED_HOST_ACTION');
    }
    if (room.state === 'ROUND_ACTIVE') {
      finalizeRoundMutation(room);
    }
    return room;
  });
  return toPublicRoomState(updated);
}

export async function advanceNextRoundInBlobs(params: {
  code: string;
  playerId: string;
}): Promise<Record<string, any>> {
  const updated = await updateRoomAtomically(params.code, (room) => {
    if (room.hostId !== params.playerId) {
      throw new Error('UNAUTHORIZED_HOST_ACTION: Only the host can advance rounds.');
    }
    prepareNextRoundMutation(room);
    return room;
  });
  return toPublicRoomState(updated);
}

export function finalizeRoundMutation(room: RoomDocument): void {
  const round = room.currentRound;
  if (!round) return;
  room.state = 'ROUND_RESULTS';

  const playersList = Object.values(room.players);
  const preSorted = [...playersList].sort((a, b) => b.totalScore - a.totalScore);
  const comebackEligible = new Set<string>();
  if (round.modifier === 'COMEBACK_MODE' && round.roundNumber > 1) {
    const half = Math.floor(preSorted.length / 2);
    for (let i = half; i < preSorted.length; i++) {
      comebackEligible.add(preSorted[i].playerId);
    }
  }

  const validEntries: Array<{
    playerId: string;
    nickname: string;
    avatarId: string;
    earlyPenaltyPoints: number;
    primaryMetric: number;
    tieBreakerMetric: number;
    mysteryEligible: boolean;
    metricSummary: string;
  }> = [];

  const zeroEntries: Array<{
    playerId: string;
    nickname: string;
    avatarId: string;
    earlyPenaltyPoints: number;
    metricSummary: string;
  }> = [];

  for (const p of playersList) {
    const sub = round.submissions[p.playerId];
    if (!sub) {
      zeroEntries.push({
        playerId: p.playerId,
        nickname: p.nickname,
        avatarId: p.avatarId,
        earlyPenaltyPoints: 0,
        metricSummary: 'Inactive (0 pts)',
      });
      continue;
    }

    const ev = evaluateSubmissionMetrics(round.gameType, sub);
    if (!ev.valid) {
      zeroEntries.push({
        playerId: p.playerId,
        nickname: p.nickname,
        avatarId: p.avatarId,
        earlyPenaltyPoints: sub.earlyPenaltyPoints || 0,
        metricSummary: ev.summary,
      });
    } else {
      validEntries.push({
        playerId: p.playerId,
        nickname: p.nickname,
        avatarId: p.avatarId,
        earlyPenaltyPoints: sub.earlyPenaltyPoints || 0,
        primaryMetric: ev.primaryMetric,
        tieBreakerMetric: ev.tieBreakerMetric,
        mysteryEligible: ev.mysteryEligible,
        metricSummary: ev.summary,
      });
    }
  }

  validEntries.sort((a, b) => {
    if (b.primaryMetric !== a.primaryMetric) return b.primaryMetric - a.primaryMetric;
    return a.tieBreakerMetric - b.tieBreakerMetric;
  });

  const standings = [];
  let i = 0;
  while (i < validEntries.length) {
    let j = i;
    while (
      j + 1 < validEntries.length &&
      validEntries[j + 1].primaryMetric === validEntries[i].primaryMetric &&
      validEntries[j + 1].tieBreakerMetric === validEntries[i].tieBreakerMetric
    ) {
      j++;
    }
    const placement = i + 1;
    let sumPts = 0;
    for (let k = i; k <= j; k++) {
      sumPts += PLACEMENT_POINTS[k] || 0;
    }
    const avgBase = sumPts / (j - i + 1);

    for (let k = i; k <= j; k++) {
      const entry = validEntries[k];
      let pts = avgBase;
      if (round.modifier === 'DOUBLE_TROUBLE') pts *= 2;
      let bonus = 0;
      const bonusReasons: string[] = [];

      if (round.modifier === 'MYSTERY_BONUS' && (placement === 1 || entry.mysteryEligible)) {
        bonus += 25;
        bonusReasons.push('Mystery Bonus +25');
      }
      if (
        round.modifier === 'COMEBACK_MODE' &&
        comebackEligible.has(entry.playerId) &&
        placement <= Math.ceil(playersList.length / 2)
      ) {
        bonus += 30;
        bonusReasons.push('Comeback Bonus +30');
      }

      const penalty = entry.earlyPenaltyPoints || 0;
      if (penalty > 0) bonusReasons.push(`Early Tap -${penalty}`);

      const finalPoints = Math.max(0, Number((pts + bonus - penalty).toFixed(2)));
      standings.push({
        playerId: entry.playerId,
        nickname: entry.nickname,
        avatarId: entry.avatarId,
        placement,
        basePoints: Number(avgBase.toFixed(2)),
        bonusPoints: bonus,
        penaltyPoints: penalty,
        pointsAwarded: finalPoints,
        metricSummary: entry.metricSummary,
        bonusReasons,
      });
    }
    i = j + 1;
  }

  const unrankedPlacement = validEntries.length + 1;
  for (const z of zeroEntries) {
    standings.push({
      playerId: z.playerId,
      nickname: z.nickname,
      avatarId: z.avatarId,
      placement: unrankedPlacement,
      basePoints: 0,
      bonusPoints: 0,
      penaltyPoints: z.earlyPenaltyPoints || 0,
      pointsAwarded: 0,
      metricSummary: z.metricSummary,
      bonusReasons: z.earlyPenaltyPoints ? [`Early Tap -${z.earlyPenaltyPoints}`] : [],
    });
  }

  for (const st of standings) {
    const p = room.players[st.playerId];
    if (!p) continue;
    p.totalScore = Number((p.totalScore + st.pointsAwarded).toFixed(2));
    if (st.pointsAwarded > 0 && st.placement >= 1 && st.placement <= 8) {
      p.placementCounts[st.placement - 1] += 1;
    }
  }

  round.results = {
    roundId: round.roundId,
    roundNumber: round.roundNumber,
    totalRounds: room.totalRounds,
    gameType: round.gameType,
    modifier: round.modifier,
    revealedSecret: getRevealedSecretSummary(round),
    standings,
  };

  room.roundHistory.push(round.results);
}

function evaluateSubmissionMetrics(
  gameType: MiniGameId,
  sub: RoundSubmission
): {
  valid: boolean;
  primaryMetric: number;
  tieBreakerMetric: number;
  mysteryEligible: boolean;
  summary: string;
} {
  switch (gameType) {
    case 'REACTION_RUSH':
      if (typeof sub.reactionMs !== 'number' || sub.reactionMs <= 0) {
        return {
          valid: false,
          primaryMetric: 0,
          tieBreakerMetric: 999999,
          mysteryEligible: false,
          summary: 'Early Tap Fault (No valid reaction)',
        };
      }
      return {
        valid: true,
        primaryMetric: 100000 - sub.reactionMs,
        tieBreakerMetric: sub.reactionMs,
        mysteryEligible: sub.reactionMs <= 250,
        summary: `${sub.reactionMs} ms${sub.earlyTap ? ' (-10 Early Penalty)' : ''}`,
      };
    case 'MEMORY_MAYHEM':
      if (!sub.correctCount || sub.correctCount <= 0) {
        return {
          valid: false,
          primaryMetric: 0,
          tieBreakerMetric: 999999,
          mysteryEligible: false,
          summary: `0/${sub.totalSymbols || 6} symbols`,
        };
      }
      return {
        valid: true,
        primaryMetric: sub.correctCount,
        tieBreakerMetric: sub.completionMs || 0,
        mysteryEligible: sub.correctCount === sub.totalSymbols,
        summary: `${sub.correctCount}/${sub.totalSymbols} symbols (${((sub.completionMs || 0) / 1000).toFixed(1)}s)`,
      };
    case 'WORD_EXPLOSION':
      if (!sub.correctCount || sub.correctCount <= 0) {
        return {
          valid: false,
          primaryMetric: 0,
          tieBreakerMetric: 999999,
          mysteryEligible: false,
          summary: `0/${sub.totalWords || 4} words`,
        };
      }
      return {
        valid: true,
        primaryMetric: sub.correctCount,
        tieBreakerMetric: sub.completionMs || 0,
        mysteryEligible: sub.correctCount === sub.totalWords,
        summary: `${sub.correctCount}/${sub.totalWords} words (${((sub.completionMs || 0) / 1000).toFixed(1)}s)`,
      };
    case 'DONT_GET_HIT':
      if (!sub.survivedMs || sub.survivedMs <= 0) {
        return {
          valid: false,
          primaryMetric: 0,
          tieBreakerMetric: 999999,
          mysteryEligible: false,
          summary: 'Eliminated (0s)',
        };
      }
      return {
        valid: true,
        primaryMetric: sub.survivedMs * 1000 + (sub.remainingHealth || 0),
        tieBreakerMetric: sub.hitsTaken || 0,
        mysteryEligible: sub.remainingHealth === 100,
        summary: `Survived ${(sub.survivedMs / 1000).toFixed(1)}s • ${sub.remainingHealth}% HP`,
      };
    case 'LUCKY_GUESS': {
      const dist = typeof sub.distance === 'number' ? sub.distance : 9999;
      const exact = dist === 0 ? 1 : 0;
      return {
        valid: true,
        primaryMetric: exact * 1000000 - dist,
        tieBreakerMetric: sub.submissionMs || 0,
        mysteryEligible: dist <= 20,
        summary: `Guessed ${sub.prediction} (Off by ${dist}${exact ? ' - EXACT!' : ''})`,
      };
    }
    case 'BRAIN_PANIC':
      if (!sub.correctCount || sub.correctCount <= 0) {
        return {
          valid: false,
          primaryMetric: 0,
          tieBreakerMetric: 999999,
          mysteryEligible: false,
          summary: `0/${sub.totalQuestions || 5} correct`,
        };
      }
      return {
        valid: true,
        primaryMetric: sub.correctCount,
        tieBreakerMetric: sub.completionMs || 0,
        mysteryEligible: sub.correctCount === sub.totalQuestions,
        summary: `${sub.correctCount}/${sub.totalQuestions} solved (${((sub.completionMs || 0) / 1000).toFixed(1)}s)`,
      };
  }
}

function getRevealedSecretSummary(round: RoundRecord): string {
  switch (round.gameType) {
    case 'REACTION_RUSH':
      return `Signal fired at ${(round.secretData.signalDelayMs / 1000).toFixed(2)}s`;
    case 'MEMORY_MAYHEM':
      return `Sequence: ${(round.secretData.sequence as number[]).map((id) => MEMORY_SYMBOLS[id].icon).join(' → ')}`;
    case 'WORD_EXPLOSION':
      return `Words: ${(round.secretData.words as Array<{ answer: string }>).map((w) => w.answer).join(', ')}`;
    case 'DONT_GET_HIT':
      return `${round.secretData.waves.length} Obstacle Waves Validated`;
    case 'LUCKY_GUESS':
      return `Secret Number was ${round.secretData.secretNumber}`;
    case 'BRAIN_PANIC':
      return `Answers: ${(round.secretData.questions as Array<{ answer: string }>).map((q) => q.answer).join(' • ')}`;
  }
}

export function completeTournamentMutation(room: RoomDocument): void {
  room.state = 'TOURNAMENT_COMPLETE';
  const lb = computeLeaderboard(room);
  if (lb.length > 0) {
    const top = lb[0];
    const tiedWinners = lb.filter((e) => compareLeaderboardEntries(top, e) === 0);
    room.winnerIds = tiedWinners.map((w) => w.playerId);
    room.isSharedVictory = tiedWinners.length > 1;
  }
}

export function compareLeaderboardEntries(
  a: { totalScore: number; placementCounts: number[] },
  b: { totalScore: number; placementCounts: number[] }
): number {
  if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
  for (let i = 0; i < 8; i++) {
    const cA = a.placementCounts[i] || 0;
    const cB = b.placementCounts[i] || 0;
    if (cB !== cA) return cB - cA;
  }
  return 0;
}

export function computeLeaderboard(room: RoomDocument) {
  const list = Object.values(room.players).map((p) => ({
    playerId: p.playerId,
    nickname: p.nickname,
    avatarId: p.avatarId,
    isHost: p.isHost,
    connected: p.connected,
    totalScore: Number(p.totalScore.toFixed(2)),
    firstPlaceCount: p.placementCounts[0] || 0,
    secondPlaceCount: p.placementCounts[1] || 0,
    thirdPlaceCount: p.placementCounts[2] || 0,
    placementCounts: [...p.placementCounts],
    rank: 1,
  }));

  list.sort((a, b) => compareLeaderboardEntries(a, b));
  let rank = 1;
  for (let i = 0; i < list.length; i++) {
    if (i > 0 && compareLeaderboardEntries(list[i - 1], list[i]) !== 0) {
      rank = i + 1;
    }
    list[i].rank = rank;
  }
  return list;
}

export function toPublicRoomState(room: RoomDocument): Record<string, any> {
  const round = room.currentRound;
  let pubRound = null;

  if (round) {
    let publicChallenge: Record<string, any> = {};
    if (round.gameType === 'REACTION_RUSH') {
      publicChallenge = { signalDelayMs: round.secretData.signalDelayMs };
    } else if (round.gameType === 'MEMORY_MAYHEM') {
      publicChallenge = {
        sequence: round.secretData.sequence,
        revealDurationMs: round.secretData.revealDurationMs,
        symbols: MEMORY_SYMBOLS,
      };
    } else if (round.gameType === 'WORD_EXPLOSION') {
      publicChallenge = {
        words: (round.secretData.words as Array<any>).map((w) => ({
          index: w.index,
          scrambled: w.scrambled,
          hint: w.hint,
        })),
      };
    } else if (round.gameType === 'DONT_GET_HIT') {
      publicChallenge = {
        waves: round.secretData.waves,
        totalLanes: round.secretData.totalLanes,
      };
    } else if (round.gameType === 'LUCKY_GUESS') {
      publicChallenge = { min: 1, max: 1000 };
    } else if (round.gameType === 'BRAIN_PANIC') {
      publicChallenge = {
        questions: (round.secretData.questions as Array<any>).map((q) => ({
          id: q.id,
          prompt: q.prompt,
          options: q.options,
        })),
      };
    }

    pubRound = {
      roundId: round.roundId,
      roundNumber: round.roundNumber,
      totalRounds: room.totalRounds,
      gameType: round.gameType,
      gameMeta: GAME_METADATA[round.gameType],
      modifier: round.modifier,
      modifierMeta: MODIFIER_METADATA[round.modifier] || MODIFIER_METADATA.NONE,
      durationMs: round.durationMs,
      startedAt: round.startedAt,
      endsAt: round.endsAt,
      publicChallenge,
      submittedPlayerIds: Object.values(round.submissions)
        .filter((s) => s.completed)
        .map((s) => s.playerId),
      submissionsMap: round.submissions,
      results: room.state === 'ROUND_RESULTS' ? round.results : null,
    };
  }

  return {
    roomId: room.roomId,
    code: room.code,
    hostId: room.hostId,
    state: room.state,
    version: room.version,
    matchId: room.matchId,
    totalRounds: room.totalRounds,
    currentRoundNumber: room.currentRoundNumber,
    countdownSec: room.countdownSec || 0,
    gameOrder: room.gameOrder,
    modifierSchedule: room.modifierSchedule,
    players: Object.values(room.players).map((p) => ({
      playerId: p.playerId,
      nickname: p.nickname,
      avatarId: p.avatarId,
      isHost: p.isHost,
      ready: p.ready,
      connected: p.connected,
      totalScore: Number(p.totalScore.toFixed(2)),
      placementCounts: [...p.placementCounts],
    })),
    leaderboard: computeLeaderboard(room),
    currentRound: pubRound,
    roundHistory: room.roundHistory,
    winnerIds: room.winnerIds,
    isSharedVictory: room.isSharedVictory,
    serverTimestamp: Date.now(),
  };
}
