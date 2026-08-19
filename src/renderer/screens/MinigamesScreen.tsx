import { useMemo } from 'react';

import { bnCompare, bnFromNumber } from '../../shared/game/big-number.js';
import {
  getMinigameVisibility,
  MINIGAME_UNLOCK_LIFETIME_COOKIES,
  type BreakoutState,
  type Cookie2048State,
  type KlondikeState,
  type MemoryMatchState,
  type MinesweeperState,
  type MinigameData,
  type MinigameId,
} from '../../shared/game/minigames.js';
import { areMinigameEventsUnlocked } from '../../shared/game/control-unlocks.js';
import { bilingualText, MINIGAME_COPY } from '../game/copy.js';
import { useGameDispatch, useStructureSnapshot } from '../game/GameProvider.js';

const IDS: readonly MinigameId[] = ['klondike', 'memory_match', 'cookie_2048', 'minesweeper', 'breakout'];

function labelFor(id: MinigameId): string {
  const copy = id === 'klondike' ? MINIGAME_COPY.klondike : id === 'memory_match' ? MINIGAME_COPY.memory : id === 'cookie_2048' ? MINIGAME_COPY.cookie2048 : id === 'minesweeper' ? MINIGAME_COPY.minesweeper : MINIGAME_COPY.breakout;
  return bilingualText(copy);
}

function rank(card: string): number {
  return Number(card.slice(1));
}

function suit(card: string): string {
  return card.slice(0, 1);
}

function moveWaste(game: KlondikeState): KlondikeState {
  const card = game.waste[game.waste.length - 1];
  if (!card) return game;
  const foundation = game.foundations[suit(card)] ?? [];
  const expected = foundation.length + 1;
  if (rank(card) !== expected) return game;
  return {
    ...game,
    waste: game.waste.slice(0, -1),
    foundations: { ...game.foundations, [suit(card)]: [...foundation, card] },
  };
}

function drawThree(game: KlondikeState): KlondikeState {
  if (game.stock.length === 0) {
    return { ...game, stock: [...game.waste].reverse(), waste: [] };
  }
  const amount = Math.min(game.drawCount, game.stock.length);
  return { ...game, stock: game.stock.slice(amount), waste: [...game.waste, ...game.stock.slice(0, amount)] };
}

function memoryPick(game: MemoryMatchState, index: number): MemoryMatchState {
  if (game.matched.includes(index)) return game;
  const revealed = game.revealed.length >= 2 ? [] : game.revealed;
  if (revealed.includes(index)) return game;
  const next = [...revealed, index];
  if (next.length < 2) return { ...game, revealed: next };
  const [left, right] = next;
  const matched = game.cards[left] === game.cards[right] ? [...game.matched, left, right] : game.matched;
  return { ...game, revealed: matched.length > game.matched.length ? [] : next, matched, attempts: game.attempts + 1 };
}

function compress(line: readonly number[]): number[] {
  const values = line.filter((value) => value !== 0);
  const result: number[] = [];
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === values[index + 1]) {
      result.push(values[index] * 2);
      index += 1;
    } else {
      result.push(values[index]);
    }
  }
  return [...result, ...Array.from({ length: line.length - result.length }, () => 0)];
}

function move2048(game: Cookie2048State, direction: 'left' | 'right' | 'up' | 'down'): Cookie2048State {
  const original = game.board.map((row) => [...row]);
  let board = original.map((row) => [...row]);
  if (direction === 'up' || direction === 'down') board = board[0].map((_, column) => board.map((row) => row[column]));
  board = board.map((row) => direction === 'right' || direction === 'down' ? [...row].reverse() : row).map(compress);
  if (direction === 'right' || direction === 'down') board = board.map((row) => [...row].reverse());
  if (direction === 'up' || direction === 'down') board = board[0].map((_, column) => board.map((row) => row[column]));
  const changed = JSON.stringify(original) !== JSON.stringify(board);
  if (!changed) return game;
  const empty = board.flatMap((row, rowIndex) => row.map((value, column) => value === 0 ? [rowIndex, column] : null)).filter((value): value is number[] => value !== null);
  const cell = empty[0];
  if (cell) board[cell[0]][cell[1]] = 2;
  const bestTile = Math.max(game.bestTile, ...board.flat());
  return { ...game, board, bestTile, score: game.score + 2, moves: game.moves + 1, won: bestTile >= 2048 };
}

function revealMine(game: MinesweeperState, index: number): MinesweeperState {
  if (game.flagged.includes(index) || game.revealed.includes(index)) return game;
  return { ...game, revealed: [...game.revealed, index], started: true };
}

function flagMine(game: MinesweeperState, index: number): MinesweeperState {
  if (game.revealed.includes(index)) return game;
  const flagged = game.flagged.includes(index) ? game.flagged.filter((cell) => cell !== index) : [...game.flagged, index];
  return { ...game, flagged };
}

function advanceBreakout(game: BreakoutState): BreakoutState {
  if (game.paused || game.lives <= 0 || game.bricks.every((brick) => !brick)) return game;
  let x = game.ball.x + game.ball.vx;
  let y = game.ball.y + game.ball.vy;
  let vx = game.ball.vx;
  let vy = game.ball.vy;
  if (x <= 0 || x >= 1) { vx = -vx; x = Math.max(0, Math.min(1, x)); }
  if (y <= 0) { vy = Math.abs(vy); y = 0; }
  if (y > 0.86 && Math.abs(x - game.paddleX) < 0.18) vy = -Math.abs(vy);
  let bricks = [...game.bricks];
  let score = game.score;
  if (y > 0.1 && y < 0.55) {
    const column = Math.max(0, Math.min(7, Math.floor(x * 8)));
    const row = Math.max(0, Math.min(4, Math.floor((y - 0.1) / 0.09)));
    const brick = row * 8 + column;
    if (bricks[brick]) { bricks[brick] = false; score += 10; vy = -vy; }
  }
  if (y > 1) return { ...game, ball: { ...game.ball, x: 0.5, y: 0.8, vx: 0.012, vy: -0.014 }, lives: game.lives - 1 };
  return { ...game, ball: { x, y, vx, vy }, bricks, score };
}

function update(dispatch: ReturnType<typeof useGameDispatch>, data: MinigameData): void {
  dispatch({ type: 'minigameUpdate', data });
}

function ActiveGame({ data, dispatch }: { data: MinigameData; dispatch: ReturnType<typeof useGameDispatch> }) {
  if (data.kind === 'klondike') {
    return <section className="minigame-board minigame-board--cards"><p>{data.stock.length} stock · {data.waste[data.waste.length - 1] ?? '—'} waste</p><div className="minigame-actions"><button type="button" onClick={() => update(dispatch, drawThree(data))}>{bilingualText(MINIGAME_COPY.drawCards)}</button><button type="button" onClick={() => update(dispatch, moveWaste(data))}>{bilingualText(MINIGAME_COPY.move)}</button></div><div className="minigame-tableau">{data.tableau.map((column, index) => <div key={index} className="minigame-column" aria-label={`Column ${index + 1}`}>{column.map((card, cardIndex) => <span key={`${card}-${cardIndex}`} className="minigame-card">{data.faceUp[index]?.[cardIndex] ? card : '🂠'}</span>)}</div>)}</div></section>;
  }
  if (data.kind === 'memory_match') {
    return <section className="minigame-board minigame-board--memory">{data.cards.map((card, index) => <button key={index} type="button" className="minigame-memory-card" aria-label={`${index + 1}`} onClick={() => update(dispatch, memoryPick(data, index))}>{data.matched.includes(index) || data.revealed.includes(index) ? card : '？'}</button>)}</section>;
  }
  if (data.kind === 'cookie_2048') {
    return <section className="minigame-board minigame-board--2048"><p>Score {data.score} · Best tile {data.bestTile}</p><div className="minigame-2048-grid">{data.board.flatMap((row, rowIndex) => row.map((value, column) => <span key={`${rowIndex}-${column}`} className="minigame-2048-cell">{value || '·'}</span>))}</div><div className="minigame-actions">{(['up', 'left', 'down', 'right'] as const).map((direction) => <button key={direction} type="button" onClick={() => update(dispatch, move2048(data, direction))}>{direction}</button>)}</div></section>;
  }
  if (data.kind === 'minesweeper') {
    return <section className="minigame-board minigame-board--mines">{Array.from({ length: data.width * data.height }, (_, index) => <button key={index} type="button" className="minigame-mine-cell" aria-label={`${bilingualText(MINIGAME_COPY.reveal)} ${index + 1}`} onClick={() => update(dispatch, revealMine(data, index))} onContextMenu={(event) => { event.preventDefault(); update(dispatch, flagMine(data, index)); }}>{data.flagged.includes(index) ? '⚑' : data.revealed.includes(index) ? (data.mines.includes(index) ? '✹' : '·') : '◼'}</button>)}</section>;
  }
  return <section className="minigame-board minigame-board--breakout"><div className="breakout-field"><div className="breakout-bricks">{data.bricks.map((brick, index) => <span key={index} className={brick ? 'is-live' : 'is-cleared'} />)}</div><span className="breakout-ball" style={{ left: `${data.ball.x * 100}%`, top: `${data.ball.y * 100}%` }} /><span className="breakout-paddle" style={{ left: `${data.paddleX * 100}%` }} /></div><p>Score {data.score} · Lives {data.lives}</p><div className="minigame-actions"><button type="button" onClick={() => update(dispatch, advanceBreakout(data))}>{bilingualText(MINIGAME_COPY.advance)}</button><button type="button" onClick={() => update(dispatch, { ...data, paddleX: Math.max(0.1, data.paddleX - 0.1) })}>←</button><button type="button" onClick={() => update(dispatch, { ...data, paddleX: Math.min(0.9, data.paddleX + 0.1) })}>→</button></div></section>;
}

export function MinigamesScreen() {
  const structure = useStructureSnapshot();
  const dispatch = useGameDispatch();
  const unlocked = areMinigameEventsUnlocked(structure);
  const schedule = structure.minigameSchedule;
  const visibility = useMemo(() => schedule ? getMinigameVisibility(schedule.next, Date.now()) : null, [schedule]);
  const active = structure.minigames.active;

  if (!unlocked || bnCompare(structure.stats.totalCookiesBaked, bnFromNumber(MINIGAME_UNLOCK_LIFETIME_COOKIES)) < 0) {
    return <div className="screen minigames-screen"><h1>{bilingualText(MINIGAME_COPY.title)}</h1><p className="screen-summary">{bilingualText(MINIGAME_COPY.locked)}</p></div>;
  }

  return <div className="screen minigames-screen">
    <h1>{bilingualText(MINIGAME_COPY.title)}</h1>
    <p className="screen-summary">{bilingualText(MINIGAME_COPY.noOffline)}</p>
    {visibility?.isFinalThirtySeconds && !active ? <div className="minigame-incoming" role="status"><strong>{bilingualText(MINIGAME_COPY.incoming)}</strong><span>{bilingualText(MINIGAME_COPY.finalWindow)}</span></div> : null}
    <section className="minigame-panel-card">
      <div className="minigame-panel-card__header"><h2>{bilingualText(MINIGAME_COPY.active)}</h2><span className="token-badge">{bilingualText(MINIGAME_COPY.goldenTokens)}: {structure.goldenTokens.balance}</span></div>
      {!active || active.status === 'completed' || active.status === 'abandoned' ? <div className="minigame-picker">{IDS.map((id) => <button key={id} type="button" onClick={() => dispatch({ type: 'minigameStart', id })}>{labelFor(id)} · {bilingualText(MINIGAME_COPY.start)}</button>)}</div> : <>
        <p className="minigame-status">{labelFor(active.id)} · {active.status}</p>
        <ActiveGame data={active.data} dispatch={dispatch} />
        <div className="minigame-actions"><button type="button" onClick={() => dispatch({ type: active.status === 'minimized' ? 'minigameResume' : 'minigameMinimize' })}>{bilingualText(active.status === 'minimized' ? MINIGAME_COPY.resume : MINIGAME_COPY.minimize)}</button><button type="button" onClick={() => dispatch({ type: 'minigameRestart' })}>{bilingualText(MINIGAME_COPY.restart)}</button><button type="button" onClick={() => dispatch({ type: 'minigameAbandon' })}>{bilingualText(MINIGAME_COPY.abandon)}</button><button type="button" onClick={() => dispatch({ type: 'minigameComplete', grade: 3 })}>{bilingualText(MINIGAME_COPY.complete)}</button></div>
      </>}
    </section>
    <section className="minigame-panel-card lucky-chance-card"><h2>{bilingualText(MINIGAME_COPY.luckyChance)}</h2><p>{bilingualText(MINIGAME_COPY.luckyOdds)}</p><button type="button" onClick={() => dispatch({ type: 'luckyChanceDraw' })} disabled={structure.goldenTokens.balance < 1}>{bilingualText(MINIGAME_COPY.draw)} ({structure.goldenTokens.balance})</button><button type="button" onClick={() => dispatch({ type: 'minigameDailyObjective' })}>{bilingualText(MINIGAME_COPY.dailyObjective)}</button>{structure.luckyRewards.length > 0 ? <p role="status">{bilingualText(MINIGAME_COPY.reward(structure.luckyRewards[structure.luckyRewards.length - 1] ?? ''))}</p> : null}</section>
  </div>;
}
