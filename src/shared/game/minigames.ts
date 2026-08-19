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
export interface LuckyChanceResult { readonly kind: "win" | "duplicate" | "insufficient_tokens" | "empty_pool"; readonly tokenCost: 1; readonly rewardId?: string; readonly roll?: number; readonly seed: number }

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
  if (action.type === "update") return { ...state, active: { ...state.active, lastUpdatedAtEpochMs: action.nowEpochMs, data: action.data } };
  if (action.type === "complete") return { ...state, active: { ...state.active, status: "completed", lastUpdatedAtEpochMs: action.nowEpochMs }, completed: [...new Set([...state.completed, state.active.id])] };
  return { ...state, active: { ...state.active, status: "abandoned", lastUpdatedAtEpochMs: action.nowEpochMs }, abandoned: [...new Set([...state.abandoned, state.active.id])] };
}

export function createGoldenTokenAward(source: string, sourceId: string, amount: number) { return { source, sourceId, amount: Math.max(0, Math.floor(amount)) }; }
export function applyGoldenTokenAward(ledger: GoldenTokenLedger, award: { readonly source: string; readonly sourceId: string; readonly amount: number }): GoldenTokenLedger { const key = `${award.source}:${award.sourceId}`; return ledger.awardedKeys.includes(key) ? ledger : { balance: ledger.balance + award.amount, awardedKeys: [...ledger.awardedKeys, key] }; }
export function resolveLuckyChance(state: LuckyChanceState, seed: number, rewardIds: readonly string[]) { if (state.tokens < 1) return { state, result: { kind: "insufficient_tokens" as const, tokenCost: 1 as const, seed } }; if (rewardIds.length === 0) return { state, result: { kind: "empty_pool" as const, tokenCost: 1 as const, seed } }; const rng = createSeededRng(seed, state.drawCount); const roll = rng.next(); const available = rewardIds.filter((id) => !state.claimedRewardIds.includes(id)); const pool = available.length > 0 ? available : rewardIds; const rewardId = pool[Math.floor(roll * pool.length)]!; const next = { ...state, tokens: state.tokens - 1, drawCount: state.drawCount + 1 }; return available.length === 0 ? { state: next, result: { kind: "duplicate" as const, tokenCost: 1 as const, rewardId, roll, seed } } : { state: { ...next, claimedRewardIds: [...next.claimedRewardIds, rewardId] }, result: { kind: "win" as const, tokenCost: 1 as const, rewardId, roll, seed } }; }

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
