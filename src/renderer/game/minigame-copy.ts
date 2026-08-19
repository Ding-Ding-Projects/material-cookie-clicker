import type { MinigameId } from '../../shared/game/minigames.js';
import type { Bilingual } from './copy.js';

export const MINIGAME_IDS: readonly MinigameId[] = [
  'klondike',
  'memory_match',
  'cookie_2048',
  'minesweeper',
  'breakout',
];

export const MINIGAME_COPY = {
  title: { en: 'Minigame events', yue: '小遊戲事件' },
  summary: {
    en: 'Five short games can be scheduled, paused, and resumed from one event board.',
    yue: '五款短小遊戲可以喺同一個事件板度安排、暫停同繼續。',
  },
  gamesHeading: { en: 'Choose a minigame', yue: '揀一款小遊戲' },
  gamesSummary: {
    en: 'Choose a board when an event is ready. Its exact position is saved with the game.',
    yue: '有事件準備好就揀一塊棋盤。完整位置會同遊戲一齊儲低。',
  },
  eventHeading: { en: 'Event state', yue: '事件狀態' },
  noEvent: { en: 'No event is scheduled.', yue: '而家未有安排事件。' },
  schedule: { en: 'Schedule', yue: '安排' },
  abandon: { en: 'Abandon event', yue: '放棄事件' },
  minimize: { en: 'Minimize event', yue: '縮細事件' },
  resume: { en: 'Resume event', yue: '繼續事件' },
  restart: { en: 'Restart event', yue: '重新開始事件' },
  status: {
    scheduled: { en: 'Scheduled', yue: '已安排' },
    active: { en: 'In progress', yue: '進行中' },
    minimized: { en: 'Minimized', yue: '已縮細' },
    completed: { en: 'Completed', yue: '已完成' },
    abandoned: { en: 'Abandoned', yue: '已放棄' },
  },
  scheduledFor: (when?: string): Bilingual => ({
    en: `Scheduled for ${when ?? 'the parent-selected time'}`,
    yue: `安排咗喺 ${when ?? '父層揀嘅時間'}`,
  }),
  activeNote: {
    en: 'The board is live and its exact position is saved.',
    yue: '棋盤而家開緊，完整位置已經儲低。',
  },
  minimizedNote: {
    en: 'The game is paused off the main surface until you resume it.',
    yue: '遊戲暫停咗，離開主畫面，直到你繼續。',
  },
  completedNote: {
    en: 'This event is finished. Schedule the game again when the parent allows it.',
    yue: '呢個事件完咗。父層容許時可以再安排呢款遊戲。',
  },
  abandonedNote: {
    en: 'This event ended without a completion result. You can schedule a fresh one.',
    yue: '呢個事件未有完成結果就結束咗。你可以重新安排一個新事件。',
  },
  goldenTokenHeading: { en: 'Golden Token', yue: '金色代幣' },
  goldenTokenSummary: {
    en: 'Completed minigames and other verified rewards can add tokens to this balance.',
    yue: '完成小遊戲同其他已確認獎勵可以增加呢個代幣餘額。',
  },
  luckyChanceHeading: { en: 'Lucky Chance', yue: '幸運機會' },
  luckyChanceSummary: {
    en: 'Spend one Golden Token for one local Lucky Chance draw.',
    yue: '用一枚金色代幣抽一次本機嘅幸運機會。',
  },
  luckyChanceOfflineRule: {
    en: 'Tokens are earned from completed work; they are not farmable while offline.',
    yue: '代幣要靠完成工作取得；離線時唔可以刷代幣。',
  },
  openLuckyChance: { en: 'Open Lucky Chance drawer', yue: '打開幸運機會抽屜' },
  closeLuckyChance: { en: 'Close Lucky Chance drawer', yue: '關閉幸運機會抽屜' },
  drawLuckyChance: { en: 'Draw Lucky Chance', yue: '抽幸運機會' },
  insufficientTokens: {
    en: 'One Golden Token is needed before a draw can start.',
    yue: '要有一枚金色代幣先可以開始抽獎。',
  },
  tokenBalance: (balance: number): Bilingual => ({
    en: `${balance} Golden Token${balance === 1 ? '' : 's'}`,
    yue: `${balance} 枚金色代幣`,
  }),
  lastDrawHeading: { en: 'Latest draw', yue: '最近一次抽獎' },
  drawerDisclosure: {
    en: 'The balance, odds, and result are saved locally with the game.',
    yue: '餘額、機率同結果會同遊戲一齊儲喺本機。',
  },
  games: {
    klondike: {
      en: 'Klondike Solitaire',
      yue: '克朗代克紙牌',
    },
    memory_match: {
      en: 'Memory Match',
      yue: '記憶配對',
    },
    cookie_2048: {
      en: 'Cookie 2048',
      yue: '曲奇 2048',
    },
    minesweeper: {
      en: 'Minesweeper',
      yue: '掃雷',
    },
    breakout: {
      en: 'Breakout',
      yue: '打磚塊',
    },
  } satisfies Record<MinigameId, Bilingual>,
} as const;

export type MinigameStatusCopy = keyof typeof MINIGAME_COPY.status;
