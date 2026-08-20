import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

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
import { MinigameAction, MinigameActionLabel, type MinigameActionIcon } from '../components/MinigameAction.js';
import { bilingualText, MINIGAME_COPY, type Bilingual } from '../game/copy.js';
import { useGameDispatch, useStructureSnapshot } from '../game/GameProvider.js';

const IDS: readonly MinigameId[] = ['klondike', 'memory_match', 'cookie_2048', 'minesweeper', 'breakout'];

function labelFor(id: MinigameId): string {
  return bilingualText(copyFor(id));
}

function copyFor(id: MinigameId) {
  return id === 'klondike' ? MINIGAME_COPY.klondike
    : id === 'memory_match' ? MINIGAME_COPY.memory
      : id === 'cookie_2048' ? MINIGAME_COPY.cookie2048
        : id === 'minesweeper' ? MINIGAME_COPY.minesweeper
          : MINIGAME_COPY.breakout;
}

function statusFor(status: 'active' | 'minimized' | 'completed' | 'abandoned') {
  return status === 'active' ? { en: 'Active', yue: '進行中' }
    : status === 'minimized' ? { en: 'Minimized', yue: '已縮細' }
      : status === 'completed' ? { en: 'Completed', yue: '已完成' }
        : { en: 'Abandoned', yue: '已放棄' };
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

function canMoveWaste(game: KlondikeState): boolean {
  const card = game.waste[game.waste.length - 1];
  if (!card) return false;
  return rank(card) === (game.foundations[suit(card)]?.length ?? 0) + 1;
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
    const wasteMoveAvailable = canMoveWaste(data);
    return (
      <section className="minigame-board minigame-board--cards" aria-label={labelFor('klondike')}>
        <p>{bilingualText({ en: `${data.stock.length} stock · ${data.waste[data.waste.length - 1] ?? '—'} waste`, yue: `牌堆 ${data.stock.length} 張 · 棄牌 ${data.waste[data.waste.length - 1] ?? '—'}` })}</p>
        <div className="minigame-actions" role="group" aria-label={bilingualText({ en: 'Klondike actions', yue: '接龍操作' })}>
          <MinigameAction data-action="klondike-draw" variant="filled" icon="cards" onClick={() => update(dispatch, drawThree(data))}>
            <MinigameActionLabel text={MINIGAME_COPY.drawCards} />
          </MinigameAction>
          <MinigameAction
            data-action="klondike-move"
            variant="outlined"
            icon="move"
            aria-disabled={!wasteMoveAvailable}
            aria-describedby={!wasteMoveAvailable ? 'klondike-move-unavailable' : undefined}
            onClick={() => {
              if (wasteMoveAvailable) update(dispatch, moveWaste(data));
            }}
          >
            <MinigameActionLabel text={MINIGAME_COPY.move} />
          </MinigameAction>
        </div>
        {!wasteMoveAvailable ? (
          <p className="minigame-action-reason" id="klondike-move-unavailable">
            {bilingualText({ en: 'The top waste card is not the next foundation rank.', yue: '棄牌頂嗰張唔係地基下一個點數。' })}
          </p>
        ) : null}
        <div className="minigame-tableau">
          {data.tableau.map((column, index) => (
            <div key={index} className="minigame-column" aria-label={bilingualText({ en: `Column ${index + 1}`, yue: `第 ${index + 1} 欄` })}>
              {column.map((card, cardIndex) => (
                <span key={`${card}-${cardIndex}`} className="minigame-card">
                  {data.faceUp[index]?.[cardIndex] ? card : '🂠'}
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>
    );
  }
  if (data.kind === 'memory_match') return <MemoryBoard game={data} dispatch={dispatch} />;
  if (data.kind === 'cookie_2048') {
    const directions = [
      ['up', 'up', { en: 'Move tiles up', yue: '向上移動方塊' }],
      ['left', 'left', { en: 'Move tiles left', yue: '向左移動方塊' }],
      ['down', 'down', { en: 'Move tiles down', yue: '向下移動方塊' }],
      ['right', 'right', { en: 'Move tiles right', yue: '向右移動方塊' }],
    ] as const satisfies readonly (readonly ['up' | 'left' | 'down' | 'right', MinigameActionIcon, { readonly en: string; readonly yue: string }])[];
    return (
      <section className="minigame-board minigame-board--2048" aria-label={labelFor('cookie_2048')}>
        <p>{bilingualText({ en: `Score ${data.score} · Best tile ${data.bestTile}`, yue: `分數 ${data.score} · 最高方塊 ${data.bestTile}` })}</p>
        <div className="minigame-2048-grid">
          {data.board.flatMap((row, rowIndex) => row.map((value, column) => (
            <span key={`${rowIndex}-${column}`} className="minigame-2048-cell">{value || '·'}</span>
          )))}
        </div>
        <div className="minigame-actions minigame-actions--directions" role="group" aria-label={bilingualText({ en: '2048 directions', yue: '2048 方向' })}>
          {directions.map(([direction, icon, label]) => (
            <MinigameAction
              key={direction}
              data-action={`2048-${direction}`}
              className="md3-action--icon"
              variant="tonal"
              icon={icon}
              aria-describedby="cookie-2048-direction-help"
              aria-disabled={move2048(data, direction) === data}
              onClick={() => {
                const next = move2048(data, direction);
                if (next !== data) update(dispatch, next);
              }}
            >
              <MinigameActionLabel text={label} />
            </MinigameAction>
          ))}
        </div>
        <p className="minigame-action-reason" id="cookie-2048-direction-help">
          {bilingualText({ en: 'A direction is unavailable when it cannot move any tile.', yue: '方向郁唔到任何方塊時就唔可以用。' })}
        </p>
      </section>
    );
  }
  if (data.kind === 'minesweeper') return <MinesweeperBoard game={data} dispatch={dispatch} />;
  const canAdvance = !data.paused && data.lives > 0 && data.bricks.some(Boolean);
  const canMoveLeft = data.paddleX > 0.1;
  const canMoveRight = data.paddleX < 0.9;
  return (
    <section className="minigame-board minigame-board--breakout" aria-label={labelFor('breakout')}>
      <div className="breakout-field">
        <div className="breakout-bricks">
          {data.bricks.map((brick, index) => <span key={index} className={brick ? 'is-live' : 'is-cleared'} />)}
        </div>
        <span className="breakout-ball" style={{ left: `${data.ball.x * 100}%`, top: `${data.ball.y * 100}%` }} />
        <span className="breakout-paddle" style={{ left: `${data.paddleX * 100}%` }} />
      </div>
      <p>{bilingualText({ en: `Score ${data.score} · Lives ${data.lives}`, yue: `分數 ${data.score} · 生命 ${data.lives}` })}</p>
      <div className="minigame-actions" role="group" aria-label={bilingualText({ en: 'Breakout actions', yue: '打磚塊操作' })}>
        <MinigameAction
          data-action="breakout-advance"
          variant="filled"
          icon="advance"
          aria-disabled={!canAdvance}
          aria-describedby={!canAdvance ? 'breakout-action-help' : undefined}
          onClick={() => {
            if (canAdvance) update(dispatch, advanceBreakout(data));
          }}
        >
          <MinigameActionLabel text={MINIGAME_COPY.advance} />
        </MinigameAction>
        <MinigameAction
          data-action="breakout-left"
          className="md3-action--icon"
          variant="tonal"
          icon="left"
          aria-describedby={!canMoveLeft ? 'breakout-action-help' : undefined}
          aria-disabled={!canMoveLeft}
          onClick={() => {
            if (canMoveLeft) update(dispatch, { ...data, paddleX: Math.max(0.1, data.paddleX - 0.1) });
          }}
        >
          <MinigameActionLabel text={{ en: 'Move paddle left', yue: '向左移動擋板' }} />
        </MinigameAction>
        <MinigameAction
          data-action="breakout-right"
          className="md3-action--icon"
          variant="tonal"
          icon="right"
          aria-describedby={!canMoveRight ? 'breakout-action-help' : undefined}
          aria-disabled={!canMoveRight}
          onClick={() => {
            if (canMoveRight) update(dispatch, { ...data, paddleX: Math.min(0.9, data.paddleX + 0.1) });
          }}
        >
          <MinigameActionLabel text={{ en: 'Move paddle right', yue: '向右移動擋板' }} />
        </MinigameAction>
      </div>
      {(!canAdvance || !canMoveLeft || !canMoveRight) ? (
        <p className="minigame-action-reason" id="breakout-action-help">
          {bilingualText({ en: 'Unavailable actions have reached the field edge or the round has ended.', yue: '用唔到嘅操作已到場邊，或者回合已經完咗。' })}
        </p>
      ) : null}
    </section>
  );
}

function MemoryBoard({ game, dispatch }: { game: MemoryMatchState; dispatch: ReturnType<typeof useGameDispatch> }) {
  const columns = 4;
  const [focusIndex, setFocusIndex] = useState(0);
  const [announcement, setAnnouncement] = useState<Bilingual | null>(null);
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const boardRef = useRef<HTMLElement | null>(null);

  function focusCard(index: number): void {
    const next = Math.max(0, Math.min(game.cards.length - 1, index));
    if (game.matched.includes(next) || game.revealed.includes(next)) return;
    setFocusIndex(next);
    cardRefs.current[next]?.focus();
  }

  function focusNextAvailable(index: number, exclude: number): void {
    const candidates = Array.from({ length: game.cards.length }, (_, offset) => (index + offset) % game.cards.length);
    const next = candidates.find((candidate) => candidate !== exclude && !game.matched.includes(candidate) && !game.revealed.includes(candidate));
    if (next !== undefined) focusCard(next);
    else boardRef.current?.focus();
  }

  function moveCardFocus(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const rowStart = Math.floor(index / columns) * columns;
    const rowEnd = Math.min(game.cards.length - 1, rowStart + columns - 1);
    const movement = event.key === 'ArrowLeft' ? { step: -1, limit: rowStart }
      : event.key === 'ArrowRight' ? { step: 1, limit: rowEnd }
        : event.key === 'ArrowUp' ? { step: -columns, limit: index % columns }
          : event.key === 'ArrowDown' ? { step: columns, limit: game.cards.length - columns + (index % columns) }
            : null;
    if (movement) {
      event.preventDefault();
      let target = index + movement.step;
      const inBounds = () => movement.step < 0 ? target >= movement.limit : target <= movement.limit && target < game.cards.length;
      while (inBounds() && (game.matched.includes(target) || game.revealed.includes(target))) target += movement.step;
      if (inBounds()) focusCard(target);
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const candidates = event.key === 'Home'
        ? Array.from({ length: game.cards.length }, (_, candidate) => candidate)
        : Array.from({ length: game.cards.length }, (_, candidate) => game.cards.length - candidate - 1);
      const next = candidates.find((candidate) => !game.matched.includes(candidate) && !game.revealed.includes(candidate));
      if (next !== undefined) focusCard(next);
    }
  }

  return (
    <section ref={boardRef} className="minigame-board minigame-board--memory-wrap" aria-label={labelFor('memory_match')} tabIndex={-1}>
      <p className="minigame-live-result" role="status" aria-live="polite">
        {announcement ? <MinigameActionLabel text={announcement} /> : null}
      </p>
      <p className="minigame-action-reason" id="memory-match-state-help">
        {bilingualText({ en: 'Arrow keys move between hidden cards. Revealed and matched cards name their value and are no longer actionable.', yue: '方向鍵喺隱藏牌之間移動。已揭開同已配對嘅牌會讀出牌面，亦唔可以再操作。' })}
      </p>
      <div
        className="minigame-board--memory"
        role="grid"
        aria-rowcount={Math.ceil(game.cards.length / columns)}
        aria-colcount={columns}
        aria-label={bilingualText({ en: 'Memory card grid', yue: '記憶牌棋盤' })}
        aria-describedby="memory-match-state-help"
      >
        {Array.from({ length: Math.ceil(game.cards.length / columns) }, (_, rowIndex) => (
          <div className="minigame-grid-row minigame-grid-row--memory" role="row" key={rowIndex}>
            {game.cards.slice(rowIndex * columns, (rowIndex + 1) * columns).map((card, columnIndex) => {
              const index = rowIndex * columns + columnIndex;
              const matched = game.matched.includes(index);
              const revealed = matched || game.revealed.includes(index);
              const state = matched ? { en: `Matched card ${card}`, yue: `已配對牌 ${card}` }
                : revealed ? { en: `Revealed card ${card}`, yue: `已揭開牌 ${card}` }
                  : { en: `Hidden card ${index + 1}`, yue: `隱藏牌 ${index + 1}` };
              return (
                <div
                  key={index}
                  className="minigame-memory-card-wrap"
                  role="gridcell"
                  aria-rowindex={rowIndex + 1}
                  aria-colindex={columnIndex + 1}
                >
                  <button
                    ref={(node) => { cardRefs.current[index] = node; }}
                    type="button"
                    className="minigame-memory-card"
                    aria-labelledby={`memory-card-${index}-label`}
                    aria-describedby={revealed ? 'memory-match-state-help' : undefined}
                    disabled={revealed}
                    tabIndex={index === focusIndex ? 0 : -1}
                    data-card-state={matched ? 'matched' : revealed ? 'revealed' : 'hidden'}
                    onFocus={() => setFocusIndex(index)}
                    onKeyDown={(event) => moveCardFocus(event, index)}
                    onClick={() => {
                      const first = game.revealed[0];
                      const pairResult = first === undefined
                        ? { en: `Card ${index + 1}: ${card}`, yue: `第 ${index + 1} 張牌：${card}` }
                        : game.cards[first] === card
                          ? { en: `Card ${index + 1}: ${card}. Pair matched.`, yue: `第 ${index + 1} 張牌：${card}。配對成功。` }
                          : { en: `Card ${index + 1}: ${card}. No match.`, yue: `第 ${index + 1} 張牌：${card}。配對唔成功。` };
                      setAnnouncement(pairResult);
                      focusNextAvailable(index + 1, index);
                      update(dispatch, memoryPick(game, index));
                    }}
                  >
                    <span aria-hidden="true">{revealed ? card : '？'}</span>
                    <span className="minigame-a11y-label" id={`memory-card-${index}-label`}>
                      <MinigameActionLabel text={state} />
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

function MinesweeperBoard({ game, dispatch }: { game: MinesweeperState; dispatch: ReturnType<typeof useGameDispatch> }) {
  const [flagMode, setFlagMode] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const [announcement, setAnnouncement] = useState<Bilingual | null>(null);
  const cellRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const boardRef = useRef<HTMLElement | null>(null);
  const totalCells = game.width * game.height;

  function focusCell(index: number): void {
    const next = Math.max(0, Math.min(totalCells - 1, index));
    if (game.revealed.includes(next)) return;
    setFocusIndex(next);
    cellRefs.current[next]?.focus();
  }

  function focusNextAvailable(index: number, exclude: number): void {
    const candidates = Array.from({ length: totalCells }, (_, offset) => (index + offset + totalCells) % totalCells);
    const next = candidates.find((candidate) => candidate !== exclude && !game.revealed.includes(candidate));
    if (next === undefined) return;
    focusCell(next);
  }

  function moveGridFocus(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const rowStart = Math.floor(index / game.width) * game.width;
    const rowEnd = rowStart + game.width - 1;
    const movement = event.key === 'ArrowLeft' ? { step: -1, limit: rowStart }
      : event.key === 'ArrowRight' ? { step: 1, limit: rowEnd }
        : event.key === 'ArrowUp' ? { step: -game.width, limit: index % game.width }
          : event.key === 'ArrowDown' ? { step: game.width, limit: totalCells - game.width + (index % game.width) }
            : null;
    if (movement) {
      event.preventDefault();
      let target = index + movement.step;
      const inBounds = () => movement.step < 0 ? target >= movement.limit : target <= movement.limit;
      while (inBounds() && game.revealed.includes(target)) target += movement.step;
      if (inBounds()) focusCell(target);
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const candidates = event.key === 'Home'
        ? Array.from({ length: totalCells }, (_, candidate) => candidate)
        : Array.from({ length: totalCells }, (_, candidate) => totalCells - candidate - 1);
      const next = candidates.find((candidate) => !game.revealed.includes(candidate));
      if (next !== undefined) focusCell(next);
    }
  }

  return (
    <section ref={boardRef} className="minigame-board minigame-board--mines-wrap" aria-label={labelFor('minesweeper')} tabIndex={-1}>
      <p className="minigame-live-result" role="status" aria-live="polite">
        {announcement ? <MinigameActionLabel text={announcement} /> : null}
      </p>
      <div className="minigame-actions" role="group" aria-label={bilingualText({ en: 'Minesweeper tools', yue: '踩地雷工具' })}>
        <MinigameAction
          data-action="minesweeper-flag-mode"
          variant={flagMode ? 'filled' : 'outlined'}
          icon="flag"
          aria-pressed={flagMode}
          onClick={() => setFlagMode((current) => !current)}
        >
          <MinigameActionLabel text={{ en: flagMode ? 'Flag mode on' : 'Flag mode off', yue: flagMode ? '插旗模式開啟' : '插旗模式關閉' }} />
        </MinigameAction>
      </div>
      <p className="minigame-action-reason" id="minesweeper-keyboard-help">
        {bilingualText({ en: 'Arrow keys move between cells. Flag mode makes Enter toggle a flag. Revealed mine and clear results stay labelled but are no longer actionable.', yue: '方向鍵喺格之間移動；插旗模式下按 Enter 會切換旗仔。已揭開嘅地雷同安全結果會保留標籤，但唔可以再操作。' })}
      </p>
      <div
        className="minigame-board--mines"
        role="grid"
        aria-rowcount={game.height}
        aria-colcount={game.width}
        aria-label={bilingualText({ en: 'Minesweeper grid', yue: '踩地雷棋盤' })}
        aria-describedby="minesweeper-keyboard-help"
      >
        {Array.from({ length: game.height }, (_, rowIndex) => (
          <div className="minigame-grid-row minigame-grid-row--mines" role="row" key={rowIndex}>
          {Array.from({ length: game.width }, (_, columnIndex) => {
          const index = rowIndex * game.width + columnIndex;
          const flagged = game.flagged.includes(index);
          const revealed = game.revealed.includes(index);
          const mine = game.mines.includes(index);
          const state = revealed ? { en: `${mine ? 'Mine' : 'Clear'} cell ${index + 1}, revealed`, yue: `${mine ? '地雷' : '安全'}格 ${index + 1}，已揭開` }
            : flagged ? { en: `Unflag cell ${index + 1}`, yue: `取消格 ${index + 1} 嘅旗仔` }
              : { en: `${flagMode ? 'Flag' : 'Reveal'} cell ${index + 1}`, yue: `${flagMode ? '插旗' : '揭開'}格 ${index + 1}` };
          return (
            <div
              key={index}
              className="minigame-mine-cell-wrap"
              role="gridcell"
              aria-rowindex={Math.floor(index / game.width) + 1}
              aria-colindex={(index % game.width) + 1}
            >
              <button
                ref={(node) => { cellRefs.current[index] = node; }}
                type="button"
                className="minigame-mine-cell"
                aria-labelledby={`mine-cell-${index}-label`}
                aria-describedby="minesweeper-keyboard-help"
                aria-pressed={flagMode ? flagged : undefined}
                disabled={revealed}
                tabIndex={index === focusIndex ? 0 : -1}
                data-cell-state={flagged ? 'flagged' : revealed ? 'revealed' : 'hidden'}
                onFocus={() => setFocusIndex(index)}
                onKeyDown={(event) => moveGridFocus(event, index)}
                onClick={() => {
                  const row = Math.floor(index / game.width) + 1;
                  const column = (index % game.width) + 1;
                  const result = flagged
                    ? { en: `Row ${row}, column ${column}: flag removed.`, yue: `第 ${row} 行第 ${column} 欄：已取消旗仔。` }
                    : flagMode
                      ? { en: `Row ${row}, column ${column}: flag placed.`, yue: `第 ${row} 行第 ${column} 欄：已插旗。` }
                      : mine
                        ? { en: `Row ${row}, column ${column}: mine revealed.`, yue: `第 ${row} 行第 ${column} 欄：揭開地雷。` }
                        : { en: `Row ${row}, column ${column}: clear.`, yue: `第 ${row} 行第 ${column} 欄：安全。` };
                  setAnnouncement(result);
                  if (!flagMode && !flagged) {
                    const nextAvailable = Array.from({ length: totalCells }, (_, offset) => (index + 1 + offset) % totalCells)
                      .find((candidate) => candidate !== index && !game.revealed.includes(candidate));
                    if (nextAvailable !== undefined) focusNextAvailable(nextAvailable, index);
                    else boardRef.current?.focus();
                  }
                  update(dispatch, flagged || flagMode ? flagMine(game, index) : revealMine(game, index));
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  const row = Math.floor(index / game.width) + 1;
                  const column = (index % game.width) + 1;
                  setAnnouncement(flagged
                    ? { en: `Row ${row}, column ${column}: flag removed.`, yue: `第 ${row} 行第 ${column} 欄：已取消旗仔。` }
                    : { en: `Row ${row}, column ${column}: flag placed.`, yue: `第 ${row} 行第 ${column} 欄：已插旗。` });
                  update(dispatch, flagMine(game, index));
                }}
              >
                <span aria-hidden="true">{flagged ? '⚑' : revealed ? (game.mines.includes(index) ? '✹' : '·') : '◼'}</span>
                <span className="minigame-a11y-label" id={`mine-cell-${index}-label`}>
                  <MinigameActionLabel text={state} />
                </span>
              </button>
            </div>
          );
        })}
          </div>
        ))}
      </div>
    </section>
  );
}

export function MinigamesScreen() {
  const structure = useStructureSnapshot();
  const dispatch = useGameDispatch();
  const unlocked = areMinigameEventsUnlocked(structure);
  const schedule = structure.minigameSchedule;
  const visibility = useMemo(() => schedule ? getMinigameVisibility(schedule.next, Date.now()) : null, [schedule]);
  const active = structure.minigames.active;
  const drawUnavailable = structure.goldenTokens.balance < 1;
  const dailyObjectiveKey = `daily_objective:${new Date().toISOString().slice(0, 10)}`;
  const dailyObjectiveClaimed = structure.goldenTokens.awardedKeys.includes(dailyObjectiveKey);
  const activeHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const firstStartRef = useRef<HTMLButtonElement | null>(null);
  const objectiveRef = useRef<HTMLButtonElement | null>(null);
  const luckyResultRef = useRef<HTMLParagraphElement | null>(null);
  const previousActiveStatusRef = useRef(active?.status);
  const previousBalanceRef = useRef(structure.goldenTokens.balance);
  const pendingActiveFocusRef = useRef(false);
  const pendingPickerFocusRef = useRef(false);
  const lastLuckyResult = structure.luckyChance.lastResult;
  const luckyResult = lastLuckyResult?.kind === 'win'
    ? MINIGAME_COPY.reward(lastLuckyResult.rewardId ?? '')
    : lastLuckyResult?.kind === 'duplicate'
      ? { en: `Duplicate reward: ${lastLuckyResult.rewardId ?? 'unknown'}. The draw was consumed, but nothing was added twice.`, yue: `重複獎勵：${lastLuckyResult.rewardId ?? '未知'}。抽獎次數已用，但唔會重複加獎勵。` }
      : lastLuckyResult?.kind === 'insufficient_tokens'
        ? MINIGAME_COPY.insufficient
        : lastLuckyResult?.kind === 'empty_pool'
          ? { en: 'No reward is available in the local pool.', yue: '本機獎池而家冇可用獎勵。' }
          : null;

  useEffect(() => {
    const previous = previousActiveStatusRef.current;
    const current = active?.status;
    if (current === 'active' && previous !== 'active' && pendingActiveFocusRef.current) {
      activeHeadingRef.current?.focus();
      pendingActiveFocusRef.current = false;
    }
    if ((current === 'completed' || current === 'abandoned') && current !== previous && pendingPickerFocusRef.current) {
      firstStartRef.current?.focus();
      pendingPickerFocusRef.current = false;
    }
    previousActiveStatusRef.current = current;
  }, [active?.id, active?.status]);

  useEffect(() => {
    const previous = previousBalanceRef.current;
    const current = structure.goldenTokens.balance;
    if (previous > 0 && current < 1) {
      if (luckyResultRef.current) luckyResultRef.current.focus();
      else if (!dailyObjectiveClaimed) objectiveRef.current?.focus();
      else activeHeadingRef.current?.focus();
    }
    previousBalanceRef.current = current;
  }, [dailyObjectiveClaimed, structure.goldenTokens.balance]);

  if (!unlocked || bnCompare(structure.stats.totalCookiesBaked, bnFromNumber(MINIGAME_UNLOCK_LIFETIME_COOKIES)) < 0) {
    return <div className="screen minigames-screen"><h1>{bilingualText(MINIGAME_COPY.title)}</h1><p className="screen-summary">{bilingualText(MINIGAME_COPY.locked)}</p></div>;
  }

  return (
    <div className="screen minigames-screen">
      <h1>{bilingualText(MINIGAME_COPY.title)}</h1>
      <p className="screen-summary">{bilingualText(MINIGAME_COPY.noOffline)}</p>
      {visibility?.isFinalThirtySeconds && !active ? (
        <div className="minigame-incoming" role="status">
          <strong>{bilingualText(MINIGAME_COPY.incoming)}</strong>
          <span>{bilingualText(MINIGAME_COPY.finalWindow)}</span>
        </div>
      ) : null}
      <section className="minigame-panel-card" aria-labelledby="active-minigame-heading">
        <div className="minigame-panel-card__header">
          <h2 id="active-minigame-heading" ref={activeHeadingRef} tabIndex={-1}>{bilingualText(MINIGAME_COPY.active)}</h2>
          <span className="token-badge">{bilingualText(MINIGAME_COPY.goldenTokens)}: {structure.goldenTokens.balance}</span>
        </div>
        {!active || active.status === 'completed' || active.status === 'abandoned' ? (
          <div className="minigame-picker" role="group" aria-label={bilingualText({ en: 'Choose a minigame', yue: '選擇小遊戲' })}>
            {IDS.map((id, index) => (
              <MinigameAction
                key={id}
                ref={index === 0 ? firstStartRef : undefined}
                data-action={`start-${id}`}
                className="minigame-action--start"
                variant="tonal"
                icon="play"
                onClick={() => {
                  pendingActiveFocusRef.current = true;
                  dispatch({ type: 'minigameStart', id });
                }}
              >
                <MinigameActionLabel text={{ en: `${copyFor(id).en} · ${MINIGAME_COPY.start.en}`, yue: `${copyFor(id).yue} · ${MINIGAME_COPY.start.yue}` }} />
              </MinigameAction>
            ))}
          </div>
        ) : (
          <>
            <p className="minigame-status">{labelFor(active.id)} · {bilingualText(statusFor(active.status))}</p>
            <ActiveGame data={active.data} dispatch={dispatch} />
            <div className="minigame-actions" role="group" aria-label={bilingualText({ en: 'Minigame lifecycle', yue: '小遊戲狀態操作' })}>
              <MinigameAction
                data-action="lifecycle-minimize"
                variant="outlined"
                icon={active.status === 'minimized' ? 'play' : 'minimize'}
                onClick={() => dispatch({ type: active.status === 'minimized' ? 'minigameResume' : 'minigameMinimize' })}
              >
                <MinigameActionLabel text={active.status === 'minimized' ? MINIGAME_COPY.resume : MINIGAME_COPY.minimize} />
              </MinigameAction>
              <MinigameAction data-action="lifecycle-restart" variant="tonal" icon="restart" onClick={() => dispatch({ type: 'minigameRestart' })}>
                <MinigameActionLabel text={MINIGAME_COPY.restart} />
              </MinigameAction>
              <MinigameAction data-action="lifecycle-abandon" variant="danger-outlined" icon="abandon" onClick={() => {
                pendingPickerFocusRef.current = true;
                dispatch({ type: 'minigameAbandon' });
              }}>
                <MinigameActionLabel text={MINIGAME_COPY.abandon} />
              </MinigameAction>
              <MinigameAction data-action="lifecycle-complete" variant="filled" icon="complete" onClick={() => {
                pendingPickerFocusRef.current = true;
                dispatch({ type: 'minigameComplete', grade: 3 });
              }}>
                <MinigameActionLabel text={MINIGAME_COPY.complete} />
              </MinigameAction>
            </div>
          </>
        )}
      </section>
      <section className="minigame-panel-card lucky-chance-card" aria-labelledby="lucky-chance-heading">
        <h2 id="lucky-chance-heading">{bilingualText(MINIGAME_COPY.luckyChance)}</h2>
        <p>{bilingualText(MINIGAME_COPY.luckyOdds)}</p>
        <MinigameAction
          data-action="lucky-draw"
          variant="filled"
          icon="spark"
          onClick={() => dispatch({ type: 'luckyChanceDraw' })}
          disabled={drawUnavailable}
          aria-describedby={drawUnavailable ? 'lucky-draw-unavailable' : undefined}
        >
          <MinigameActionLabel text={{ en: `${MINIGAME_COPY.draw.en} (${structure.goldenTokens.balance})`, yue: `${MINIGAME_COPY.draw.yue} (${structure.goldenTokens.balance})` }} />
        </MinigameAction>
        {drawUnavailable ? (
          <p className="minigame-action-reason" id="lucky-draw-unavailable">
            {bilingualText(MINIGAME_COPY.insufficient)}
          </p>
        ) : null}
        <MinigameAction
          ref={objectiveRef}
          data-action="daily-objective"
          variant="tonal"
          icon="objective"
          aria-disabled={dailyObjectiveClaimed}
          aria-describedby={dailyObjectiveClaimed ? 'daily-objective-claimed' : undefined}
          onClick={() => {
            if (!dailyObjectiveClaimed) dispatch({ type: 'minigameDailyObjective' });
          }}
        >
          <MinigameActionLabel text={MINIGAME_COPY.dailyObjective} />
        </MinigameAction>
        {dailyObjectiveClaimed ? (
          <p className="minigame-action-reason" id="daily-objective-claimed">
            {bilingualText({ en: "Today's objective has already been claimed.", yue: '今日目標已經領取咗。' })}
          </p>
        ) : null}
        {luckyResult ? (
          <p ref={luckyResultRef} role="status" tabIndex={-1}>{bilingualText(luckyResult)}</p>
        ) : null}
      </section>
    </div>
  );
}
