import { z } from "zod";

import { bnFromNumber, type BigNum } from "./big-number.js";
import { areMinigameEventsUnlocked, areMouseRaidsUnlocked } from "./control-unlocks.js";
import type { GameState, RngPort } from "./types.js";

export const MINIGAME_UNLOCK_LIFETIME_COOKIES = 100_000;
export const MOUSE_RAID_UNLOCK_LIFETIME_COOKIES = 1_000_000;
export const GOLDEN_TOKEN_COST = 1;
export const MINIGAME_SCHEDULE_MIN_MS = 6 * 60 * 1000;
export const MINIGAME_SCHEDULE_MAX_MS = 12 * 60 * 1000;
export const MINIGAME_INCOMING_REVEAL_MS = 30 * 1000;

export type MinigameId = "klondike" | "memory_match" | "cookie_2048" | "minesweeper" | "breakout";
export type MinigameStatus = "active" | "minimized" | "completed" | "abandoned";
export type MinigameData =
  | { readonly kind: "klondike"; readonly stock: readonly string[]; readonly waste: readonly string[]; readonly foundations: Readonly<Record<string, readonly string[]>>; readonly tableau: readonly (readonly string[])[]; readonly faceUp: readonly (readonly boolean[])[]; readonly drawCount: 3 }
  | { readonly kind: "memory_match"; readonly cards: readonly string[]; readonly revealed: readonly number[]; readonly matched: readonly number[]; readonly attempts: number }
  | { readonly kind: "cookie_2048"; readonly board: readonly (readonly number[])[]; readonly score: number; readonly bestTile: number; readonly moves: number; readonly won: boolean }
  | { readonly kind: "minesweeper"; readonly width: number; readonly height: number; readonly mineCount: number; readonly mines: readonly number[]; readonly revealed: readonly number[]; readonly flagged: readonly number[]; readonly started: boolean }
  | { readonly kind: "breakout"; readonly paddleX: number; readonly ball: { readonly x: number; readonly y: number; readonly vx: number; readonly vy: number }; readonly bricks: readonly boolean[]; readonly score: number; readonly lives: number; readonly paused: boolean };
export type KlondikeState = Extract<MinigameData, { kind: "klondike" }>;
export type MemoryMatchState = Extract<MinigameData, { kind: "memory_match" }>;
export type Cookie2048State = Extract<MinigameData, { kind: "cookie_2048" }>;
export type MinesweeperState = Extract<MinigameData, { kind: "minesweeper" }>;
export type BreakoutState = Extract<MinigameData, { kind: "breakout" }>;

export interface MinigameInstance { readonly id: MinigameId; readonly status: MinigameStatus; readonly startedAtEpochMs: number; readonly lastUpdatedAtEpochMs: number; readonly data: MinigameData }
export interface MinigameState { readonly active?: MinigameInstance; readonly completed: readonly MinigameId[]; readonly abandoned: readonly MinigameId[] }
export interface MinigameSchedule { readonly scheduledAtEpochMs: number; readonly startsAtEpochMs: number; readonly visibleAtEpochMs: number; readonly endsAtEpochMs: number; readonly delayMs: number }
export interface MinigameScheduleState { readonly next: MinigameSchedule; readonly rngSeed: number; readonly occurrence: number }
export interface GoldenTokenLedger { readonly balance: number; readonly awardedKeys: readonly string[] }
export interface LuckyChanceState { readonly tokens: number; readonly claimedRewardIds: readonly string[]; readonly drawCount: number; readonly lastResult?: LuckyChanceResult }
export interface LuckyChanceResult { readonly kind: "win" | "duplicate" | "insufficient_tokens" | "empty_pool"; readonly tokenCost: 1; readonly rewardId?: string; readonly roll?: number; readonly seed: number; readonly resolvedAtEpochMs?: number }

export const EMPTY_GOLDEN_TOKEN_LEDGER: GoldenTokenLedger = { balance: 0, awardedKeys: [] };
export const EMPTY_LUCKY_CHANCE_STATE: LuckyChanceState = { tokens: 0, claimedRewardIds: [], drawCount: 0 };
export const EMPTY_MINIGAME_STATE: MinigameState = { completed: [], abandoned: [] };
export const MINIGAME_IDS: readonly MinigameId[] = ["klondike", "memory_match", "cookie_2048", "minesweeper", "breakout"];

export function createSeededRng(seed: number, streamIndex = 0): RngPort {
  let state = (seed >>> 0) + (streamIndex >>> 0);
  return { next: () => { state = (state + 0x9e3779b9) >>> 0; let value = state; value = Math.imul(value ^ (value >>> 16), 0x21f0a2ad); value = Math.imul(value ^ (value >>> 15), 0x735a2d97); return ((value ^ (value >>> 15)) >>> 0) / 0x1_0000_0000; }, getStreamIndex: () => state >>> 0 };
}

function shuffle<T>(items: readonly T[], rng: RngPort): T[] { const result = [...items]; for (let i = result.length - 1; i > 0; i -= 1) { const j = Math.floor(rng.next() * (i + 1)); [result[i], result[j]] = [result[j]!, result[i]!]; } return result; }
function newData(id: MinigameId, rng: RngPort): MinigameData {
  if (id === "klondike") { const deck = shuffle(["C", "D", "H", "S"].flatMap((s) => Array.from({ length: 13 }, (_, r) => `${r + 1}${s}`)), rng); const tableau: string[][] = []; const faceUp: boolean[][] = []; let cursor = 0; for (let column = 0; column < 7; column += 1) { const pile = deck.slice(cursor, cursor + column + 1); cursor += column + 1; tableau.push(pile); faceUp.push(pile.map((_, index) => index === pile.length - 1)); } return { kind: "klondike", stock: deck.slice(cursor), waste: [], foundations: { C: [], D: [], H: [], S: [] }, tableau, faceUp, drawCount: 3 }; }
  if (id === "memory_match") return { kind: "memory_match", cards: shuffle(Array.from({ length: 8 }, (_, index) => [`cookie-${index}`, `cookie-${index}`]).flat(), rng), revealed: [], matched: [], attempts: 0 };
  if (id === "cookie_2048") { const board = Array.from({ length: 4 }, () => Array(4).fill(0)); board[0]![0] = 2; board[3]![3] = 2; return { kind: "cookie_2048", board, score: 0, bestTile: 2, moves: 0, won: false }; }
  if (id === "minesweeper") return { kind: "minesweeper", width: 8, height: 8, mineCount: 10, mines: shuffle(Array.from({ length: 64 }, (_, index) => index), rng).slice(0, 10), revealed: [], flagged: [], started: false };
  return { kind: "breakout", paddleX: 0.5, ball: { x: 0.5, y: 0.8, vx: 0.012, vy: -0.014 }, bricks: Array.from({ length: 40 }, () => true), score: 0, lives: 3, paused: false };
}

function minigameUnlocked(state: GameState): boolean { return areMinigameEventsUnlocked(state); }
export function hasMinigameUnlock(state: GameState): boolean { return minigameUnlocked(state); }
export function hasMouseRaidUnlock(state: GameState): boolean { return areMouseRaidsUnlocked(state); }
function delay(rng: RngPort): number { return MINIGAME_SCHEDULE_MIN_MS + Math.floor(rng.next() * (MINIGAME_SCHEDULE_MAX_MS - MINIGAME_SCHEDULE_MIN_MS + 1)); }
export function scheduleMinigame(nowEpochMs: number, rng: RngPort): MinigameSchedule { const delayMs = delay(rng); return { scheduledAtEpochMs: nowEpochMs, startsAtEpochMs: nowEpochMs + delayMs, visibleAtEpochMs: nowEpochMs + delayMs - MINIGAME_INCOMING_REVEAL_MS, endsAtEpochMs: nowEpochMs + delayMs, delayMs }; }
export function getMinigameVisibility(schedule: MinigameSchedule, nowEpochMs: number): { readonly isVisible: boolean; readonly isFinalThirtySeconds: boolean };
export function getMinigameVisibility(schedule: MinigameScheduleState | null, nowEpochMs: number): "hidden" | "incoming" | "due";
export function getMinigameVisibility(schedule: MinigameSchedule | MinigameScheduleState | null, nowEpochMs: number): { readonly isVisible: boolean; readonly isFinalThirtySeconds: boolean } | "hidden" | "incoming" | "due" {
  if (schedule && "next" in schedule) {
    if (nowEpochMs < schedule.next.visibleAtEpochMs) return "hidden";
    if (nowEpochMs < schedule.next.startsAtEpochMs) return "incoming";
    return "due";
  }
  if (!schedule) return "hidden";
  const isVisible = nowEpochMs >= schedule.visibleAtEpochMs && nowEpochMs < schedule.endsAtEpochMs;
  return { isVisible, isFinalThirtySeconds: isVisible };
}

export type MinigameAction =
  | { readonly type: "start"; readonly id: MinigameId; readonly data: MinigameData; readonly nowEpochMs: number }
  | { readonly type: "minimize"; readonly nowEpochMs: number }
  | { readonly type: "resume"; readonly nowEpochMs: number }
  | { readonly type: "restart"; readonly data: MinigameData; readonly nowEpochMs: number }
  | { readonly type: "abandon"; readonly nowEpochMs: number }
  | { readonly type: "complete"; readonly nowEpochMs: number }
  | { readonly type: "update"; readonly data: MinigameData; readonly nowEpochMs: number };

export function reduceMinigameState(state: MinigameState, action: MinigameAction): MinigameState {
  if (action.type === "start") return state.active?.status === "active" || state.active?.status === "minimized" ? state : { ...state, active: { id: action.id, status: "active", startedAtEpochMs: action.nowEpochMs, lastUpdatedAtEpochMs: action.nowEpochMs, data: action.data } };
  if (!state.active) return state;
  if (action.type === "minimize") return state.active.status === "active" ? { ...state, active: { ...state.active, status: "minimized", lastUpdatedAtEpochMs: action.nowEpochMs } } : state;
  if (action.type === "resume") return state.active.status === "minimized" ? { ...state, active: { ...state.active, status: "active", lastUpdatedAtEpochMs: action.nowEpochMs } } : state;
  if (action.type === "restart") return { ...state, active: { ...state.active, status: "active", startedAtEpochMs: action.nowEpochMs, lastUpdatedAtEpochMs: action.nowEpochMs, data: action.data } };
  if (action.type === "update") return action.data.kind === state.active.data.kind && isValidMinigameData(action.data) ? { ...state, active: { ...state.active, lastUpdatedAtEpochMs: action.nowEpochMs, data: action.data } } : state;
  if (action.type === "complete") return { ...state, active: { ...state.active, status: "completed", lastUpdatedAtEpochMs: action.nowEpochMs }, completed: [...new Set([...state.completed, state.active.id])] };
  return { ...state, active: { ...state.active, status: "abandoned", lastUpdatedAtEpochMs: action.nowEpochMs }, abandoned: [...new Set([...state.abandoned, state.active.id])] };
}

function cardRank(card: string): number { return Number(card.slice(1)); }
function cardSuit(card: string): string { return card.slice(0, 1); }
function cardColor(card: string): "red" | "black" { return cardSuit(card) === "H" || cardSuit(card) === "D" ? "red" : "black"; }

export function isValidMinigameData(data: MinigameData): boolean {
  if (data.kind === "klondike") return data.stock.every((card) => /^[CDHS](?:[1-9]|1[0-3])$/.test(card)) && data.waste.every((card) => /^[CDHS](?:[1-9]|1[0-3])$/.test(card)) && data.tableau.length === 7 && data.faceUp.length === 7;
  if (data.kind === "memory_match") return data.cards.length === 16 && data.revealed.length <= 2 && data.revealed.every((index) => index >= 0 && index < data.cards.length) && data.matched.every((index) => index >= 0 && index < data.cards.length);
  if (data.kind === "cookie_2048") return data.board.length === 4 && data.board.every((row) => row.length === 4 && row.every((value) => Number.isInteger(value) && value >= 0));
  if (data.kind === "minesweeper") return data.width > 0 && data.height > 0 && data.mines.length === data.mineCount && data.mines.every((index) => index >= 0 && index < data.width * data.height);
  return data.bricks.length === 40 && data.lives >= 0 && data.ball.x >= 0 && data.ball.x <= 1 && data.ball.y >= 0 && data.ball.y <= 1;
}

export type MinigameMove =
  | { readonly kind: "klondike_draw" | "klondike_recycle" | "klondike_waste_to_foundation"; }
  | { readonly kind: "klondike_tableau_to_foundation"; readonly column: number; }
  | { readonly kind: "klondike_tableau_move"; readonly from: number; readonly to: number; readonly count: number; }
  | { readonly kind: "memory_reveal"; readonly index: number; }
  | { readonly kind: "cookie_2048_move"; readonly direction: "up" | "down" | "left" | "right"; }
  | { readonly kind: "minesweeper_reveal" | "minesweeper_flag" | "minesweeper_chord"; readonly index: number; }
  | { readonly kind: "breakout_step" | "breakout_pause"; }
  | { readonly kind: "breakout_paddle"; readonly delta: number; };

function slide2048(line: readonly number[]): { readonly line: number[]; readonly gained: number } {
  const compact = line.filter(Boolean);
  const merged: number[] = [];
  let gained = 0;
  for (let index = 0; index < compact.length; index += 1) {
    if (compact[index] === compact[index + 1]) { const value = compact[index] * 2; merged.push(value); gained += value; index += 1; }
    else merged.push(compact[index]);
  }
  return { line: [...merged, ...Array.from({ length: line.length - merged.length }, () => 0)], gained };
}

function move2048(data: Cookie2048State, direction: "up" | "down" | "left" | "right", rng: RngPort): Cookie2048State {
  const original = data.board.map((row) => [...row]);
  const working = direction === "up" || direction === "down" ? original[0].map((_, column) => original.map((row) => row[column])) : original;
  const rows = working.map((row) => {
    const input = direction === "right" || direction === "down" ? [...row].reverse() : row;
    const output = slide2048(input);
    return { row: direction === "right" || direction === "down" ? [...output.line].reverse() : output.line, gained: output.gained };
  });
  const board = direction === "up" || direction === "down" ? original.map((_, row) => rows.map((entry) => entry.row[row])) : rows.map((entry) => entry.row);
  if (JSON.stringify(board) === JSON.stringify(original)) return data;
  const empty = board.flatMap((row, r) => row.map((value, c) => value === 0 ? [r, c] as const : null)).filter((cell): cell is readonly [number, number] => cell !== null);
  if (empty.length > 0) { const cell = empty[Math.floor(rng.next() * empty.length)]; board[cell[0]][cell[1]] = 2; }
  const score = data.score + rows.reduce((sum, entry) => sum + entry.gained, 0);
  const bestTile = Math.max(data.bestTile, ...board.flat());
  return { ...data, board, score, bestTile, moves: data.moves + 1, won: data.won || bestTile >= 2048 };
}

function neighbouringCells(data: MinesweeperState, index: number): number[] {
  const row = Math.floor(index / data.width); const column = index % data.width; const result: number[] = [];
  for (let dr = -1; dr <= 1; dr += 1) for (let dc = -1; dc <= 1; dc += 1) if (dr !== 0 || dc !== 0) { const r = row + dr; const c = column + dc; if (r >= 0 && r < data.height && c >= 0 && c < data.width) result.push(r * data.width + c); }
  return result;
}

function revealMinesweeper(data: MinesweeperState, index: number): MinesweeperState {
  if (index < 0 || index >= data.width * data.height || data.flagged.includes(index) || data.revealed.includes(index)) return data;
  let mines = [...data.mines];
  if (!data.started && mines.includes(index)) { const replacement = Array.from({ length: data.width * data.height }, (_, candidate) => candidate).find((candidate) => candidate !== index && !mines.includes(candidate)); if (replacement !== undefined) mines = mines.map((mine) => mine === index ? replacement : mine); }
  if (mines.includes(index)) return { ...data, mines, started: true, revealed: [...data.revealed, index] };
  const next = new Set<number>([...data.revealed, index]); const queue = [index];
  while (queue.length) { const current = queue.shift()!; const adjacentMines = neighbouringCells(data, current).filter((cell) => mines.includes(cell)).length; if (adjacentMines === 0) for (const neighbour of neighbouringCells(data, current)) if (!mines.includes(neighbour) && !data.flagged.includes(neighbour) && !next.has(neighbour)) { next.add(neighbour); queue.push(neighbour); } }
  return { ...data, mines, started: true, revealed: [...next] };
}

function moveKlondike(data: KlondikeState, move: MinigameMove & { kind: "klondike_tableau_move" | "klondike_tableau_to_foundation" }): KlondikeState {
  if (move.kind === "klondike_tableau_to_foundation") { const pile = data.tableau[move.column] ?? []; const card = pile[pile.length - 1]; if (!card || !data.faceUp[move.column]?.[pile.length - 1]) return data; const suit = cardSuit(card); const foundation = data.foundations[suit] ?? []; if (cardRank(card) !== foundation.length + 1) return data; return { ...data, tableau: data.tableau.map((column, index) => index === move.column ? column.slice(0, -1) : column), foundations: { ...data.foundations, [suit]: [...foundation, card] }, faceUp: data.faceUp.map((faces, index) => index === move.column ? faces.slice(0, -1).concat(faces.length > 1 ? [true] : []) : faces) }; }
  const from = data.tableau[move.from] ?? []; const to = data.tableau[move.to] ?? []; const count = Math.max(1, Math.min(move.count, from.length)); const start = from.length - count; const cards = from.slice(start); const faces = data.faceUp[move.from] ?? []; if (!cards.length || !faces[start]) return data; const target = to[to.length - 1]; if (target && (cardColor(cards[0]) === cardColor(target) || cardRank(cards[0]) !== cardRank(target) - 1)) return data; return { ...data, tableau: data.tableau.map((column, index) => index === move.from ? from.slice(0, start) : index === move.to ? [...to, ...cards] : column), faceUp: data.faceUp.map((flags, index) => index === move.from ? flags.slice(0, start).concat(flags.length > 1 && start > 0 ? [true] : []) : index === move.to ? [...(data.faceUp[move.to] ?? []), ...cards.map(() => true)] : flags) };
}

export function applyMinigameMove(data: MinigameData, move: MinigameMove, rng: RngPort): MinigameData {
  if (data.kind === "klondike") {
    if (move.kind === "klondike_draw") { const amount = Math.min(3, data.stock.length); return amount ? { ...data, stock: data.stock.slice(amount), waste: [...data.waste, ...data.stock.slice(0, amount)] } : data; }
    if (move.kind === "klondike_recycle") return data.stock.length ? data : { ...data, stock: [...data.waste].reverse(), waste: [] };
    if (move.kind === "klondike_waste_to_foundation") { const card = data.waste[data.waste.length - 1]; if (!card) return data; const suit = cardSuit(card); const foundation = data.foundations[suit] ?? []; if (cardRank(card) !== foundation.length + 1) return data; return { ...data, waste: data.waste.slice(0, -1), foundations: { ...data.foundations, [suit]: [...foundation, card] } }; }
    if (move.kind === "klondike_tableau_move" || move.kind === "klondike_tableau_to_foundation") return moveKlondike(data, move);
  }
  if (data.kind === "memory_match" && move.kind === "memory_reveal") { if (move.index < 0 || move.index >= data.cards.length || data.matched.includes(move.index) || data.revealed.includes(move.index)) return data; const revealed = data.revealed.length >= 2 ? [] : data.revealed; const next = [...revealed, move.index]; if (next.length < 2) return { ...data, revealed: next }; const matched = data.cards[next[0]] === data.cards[next[1]] ? [...data.matched, ...next] : data.matched; return { ...data, revealed: matched.length > data.matched.length ? [] : next, matched, attempts: data.attempts + 1 }; }
  if (data.kind === "cookie_2048" && move.kind === "cookie_2048_move") return move2048(data, move.direction, rng);
  if (data.kind === "minesweeper") { if (move.kind === "minesweeper_reveal") return revealMinesweeper(data, move.index); if (move.kind === "minesweeper_flag" && move.index >= 0 && move.index < data.width * data.height && !data.revealed.includes(move.index)) return { ...data, flagged: data.flagged.includes(move.index) ? data.flagged.filter((cell) => cell !== move.index) : [...data.flagged, move.index] }; if (move.kind === "minesweeper_chord" && data.revealed.includes(move.index)) { const neighbours = neighbouringCells(data, move.index); const flags = neighbours.filter((cell) => data.flagged.includes(cell)).length; const adjacent = neighbours.filter((cell) => data.mines.includes(cell)).length; return flags === adjacent ? neighbours.reduce((current, cell) => revealMinesweeper(current, cell), data) : data; } }
  if (data.kind === "breakout") { if (move.kind === "breakout_pause") return { ...data, paused: !data.paused }; if (move.kind === "breakout_paddle") return { ...data, paddleX: Math.max(0.1, Math.min(0.9, data.paddleX + move.delta)) }; if (move.kind === "breakout_step" && !data.paused && data.lives > 0 && data.bricks.some(Boolean)) { let { x, y, vx, vy } = data.ball; x += vx; y += vy; if (x <= 0 || x >= 1) { vx = -vx; x = Math.max(0, Math.min(1, x)); } if (y <= 0) vy = Math.abs(vy); if (y > 0.86 && Math.abs(x - data.paddleX) < 0.18) vy = -Math.abs(vy); const bricks = [...data.bricks]; let score = data.score; if (y > 0.1 && y < 0.55) { const index = Math.max(0, Math.min(bricks.length - 1, Math.floor((y - 0.1) / 0.09) * 8 + Math.floor(x * 8))); if (bricks[index]) { bricks[index] = false; score += 10; vy = -vy; } } if (y > 1) return { ...data, ball: { x: 0.5, y: 0.8, vx: 0.012, vy: -0.014 }, lives: data.lives - 1, score }; return { ...data, ball: { x, y, vx, vy }, bricks, score }; } }
  return data;
}

export function createGoldenTokenAward(source: string, sourceId: string, amount: number) { return { source, sourceId, amount: Math.max(0, Math.floor(amount)) }; }
export function applyGoldenTokenAward(ledger: GoldenTokenLedger, award: { readonly source: string; readonly sourceId: string; readonly amount: number }): GoldenTokenLedger { const key = `${award.source}:${award.sourceId}`; return ledger.awardedKeys.includes(key) ? ledger : { balance: ledger.balance + award.amount, awardedKeys: [...ledger.awardedKeys, key] }; }
export function resolveLuckyChance(state: LuckyChanceState, seed: number, rewardIds: readonly string[], nowEpochMs = 0) { if (state.tokens < 1) return { state, result: { kind: "insufficient_tokens" as const, tokenCost: 1 as const, seed, resolvedAtEpochMs: nowEpochMs } }; if (rewardIds.length === 0) return { state, result: { kind: "empty_pool" as const, tokenCost: 1 as const, seed, resolvedAtEpochMs: nowEpochMs } }; const rng = createSeededRng(seed, state.drawCount); const roll = rng.next(); const available = rewardIds.filter((id) => !state.claimedRewardIds.includes(id)); const pool = available.length > 0 ? available : rewardIds; const rewardId = pool[Math.floor(roll * pool.length)]!; const next = { ...state, tokens: state.tokens - 1, drawCount: state.drawCount + 1 }; return available.length === 0 ? { state: next, result: { kind: "duplicate" as const, tokenCost: 1 as const, rewardId, roll, seed, resolvedAtEpochMs: nowEpochMs } } : { state: { ...next, claimedRewardIds: [...next.claimedRewardIds, rewardId] }, result: { kind: "win" as const, tokenCost: 1 as const, rewardId, roll, seed, resolvedAtEpochMs: nowEpochMs } }; }

export function tickMinigames(state: MinigameState, gameState: GameState, nowEpochMs: number, rng: RngPort, blocked: boolean): MinigameState {
  if (!minigameUnlocked(gameState) || state.active?.status === "active" || state.active?.status === "minimized" || blocked) return state;
  const id = MINIGAME_IDS[Math.floor(rng.next() * MINIGAME_IDS.length)]!;
  return reduceMinigameState(state, { type: "start", id, data: newData(id, rng), nowEpochMs });
}

const MinigameStateSchema = z.object({ active: z.unknown().optional(), completed: z.array(z.string()), abandoned: z.array(z.string()) });
export function encodeMinigames(state: MinigameState): MinigameState { return JSON.parse(JSON.stringify(state)) as MinigameState; }
export function decodeMinigames(raw: unknown): MinigameState { const parsed = MinigameStateSchema.safeParse(raw); return parsed.success ? parsed.data as MinigameState : EMPTY_MINIGAME_STATE; }
export function encodeMinigamePayload(state: GameState): unknown { return { minigames: encodeMinigames(state.minigames), minigameSchedule: state.minigameSchedule, goldenTokens: state.goldenTokens, luckyChance: state.luckyChance, luckyRewards: state.luckyRewards }; }
export function decodeMinigamePayload(raw: unknown) { if (!raw || typeof raw !== "object") return { minigames: EMPTY_MINIGAME_STATE, minigameSchedule: null, goldenTokens: EMPTY_GOLDEN_TOKEN_LEDGER, luckyChance: EMPTY_LUCKY_CHANCE_STATE, luckyRewards: [] as readonly string[] }; const value = raw as Record<string, unknown>; return { minigames: decodeMinigames(value.minigames), minigameSchedule: value.minigameSchedule as MinigameScheduleState | null, goldenTokens: value.goldenTokens as GoldenTokenLedger ?? EMPTY_GOLDEN_TOKEN_LEDGER, luckyChance: value.luckyChance as LuckyChanceState ?? EMPTY_LUCKY_CHANCE_STATE, luckyRewards: Array.isArray(value.luckyRewards) ? value.luckyRewards.filter((item): item is string => typeof item === "string") : [] } as const; }

export type { BigNum };
