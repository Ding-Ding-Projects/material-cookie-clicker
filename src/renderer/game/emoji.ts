import type { AchievementDefinition } from '../../shared/game/achievements.js';
import type { ToolDefinition } from '../../shared/game/tools.js';
import type { UpgradeDefinition } from '../../shared/game/upgrades.js';

/**
 * The one place a game item gets its face. Emojis are presentation, not domain data — the
 * definitions in src/shared/game/** stay emoji-free, and every screen that renders an icon
 * resolves it here so no two surfaces can disagree about what a Grandma looks like.
 *
 * Every glyph is decorative: each render site keeps it inside an aria-hidden wrapper, with the
 * accessible name carried by the adjacent bilingual text.
 */
export const GENERATOR_EMOJI: Record<string, string> = {
  cursor: '👆',
  grandma: '👵',
  farm: '🌾',
  mine: '⛏️',
  factory: '🏭',
  bank: '🏦',
  temple: '🛕',
  wizardTower: '🧙',
  shipment: '🚀',
  alchemyLab: '⚗️',
  portal: '🌀',
  timeMachine: '⏳',
  antimatterCondenser: '⚛️',
  prism: '🌈',
};

export const TOOL_EMOJI: Record<string, string> = {
  commandPalette: '🎛️',
  regexBuilder: '🔍',
  tabGroups: '🗂️',
  appearanceEditor: '🎨',
  colourTranslator: '🌈',
  notificationCentre: '🔔',
  localHistory: '🕰️',
  authenticator: '🔐',
  toyLocks: '🔒',
  supportTickets: '🎫',
  scheduledSettings: '⏰',
  fileConverter: '🔄',
  localModelManager: '🧠',
  narrator: '📣',
  personalVocabulary: '📖',
  appLogoCustomization: '🖼️',
  offlineDocs: '📚',
  externalEditor: '✏️',
  exports: '📦',
  bulkActions: '🛒',
};

export function generatorEmoji(generatorId: string): string {
  return GENERATOR_EMOJI[generatorId] ?? '🏭';
}

export function toolEmoji(toolId: string): string {
  return TOOL_EMOJI[toolId] ?? '🧰';
}

/** An upgrade wears the face of what it improves. */
export function upgradeEmoji(def: UpgradeDefinition): string {
  switch (def.effect.kind) {
    case 'clickMultiplier':
      return '💪';
    case 'globalCpsMultiplier':
      return '🚀';
    case 'generatorMultiplier':
      return generatorEmoji(def.effect.generatorId);
  }
}

/** An achievement badge wears the face of the milestone family it celebrates. */
export function achievementEmoji(def: AchievementDefinition): string {
  switch (def.condition.kind) {
    case 'lifetimeCookies':
      return '🍪';
    case 'totalClicks':
      return '👆';
    case 'generatorOwned':
      return generatorEmoji(def.condition.generatorId);
    case 'prestigeCount':
      return '🌟';
  }
}

/**
 * The jewel tool-tier ladder (design/tokens-color.html): the fixed roster escalates bronze →
 * emerald → amethyst in thirds, so later tools visibly belong to a higher shelf.
 */
export function toolTier(def: ToolDefinition, rosterIndex: number, rosterSize: number): 1 | 2 | 3 {
  void def;
  const third = rosterSize / 3;
  if (rosterIndex < third) return 1;
  if (rosterIndex < third * 2) return 2;
  return 3;
}
