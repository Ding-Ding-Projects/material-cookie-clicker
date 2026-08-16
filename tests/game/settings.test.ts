import { describe, expect, it } from "vitest";

import { computeDisclosure } from "../../src/shared/game/disclosure";
import { TOOL_DEFINITIONS } from "../../src/shared/game/tools";
import {
  consolePanelIds,
  openFeatureRequest,
  SETTINGS_PANEL_ID,
} from "../../src/renderer/game/console-panels";
import {
  APP_SETTINGS_KEY,
  coerceFunnyLevel,
  createLocalStorageAppSettings,
  DEFAULT_APP_SETTINGS,
  normalizeAppSettings,
  type AppSettings,
  type SettingsStorageLike,
} from "../../src/renderer/game/app-settings";
import { bilingualText, formatBilingual, getActiveLanguageMode, setActiveLanguageMode } from "../../src/renderer/game/copy";
import { freshState } from "./test-helpers";

/** A minimal in-memory Web Storage stand-in, so the round-trip is a real encode/decode. */
function memoryStorage(): SettingsStorageLike & { readonly map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

describe("LOAD-BEARING: Settings is visible on a brand-new save", () => {
  it("puts the Settings emblem on the console of a completely fresh game", () => {
    const disclosure = computeDisclosure(freshState());
    // Sanity: the fresh save really is at the starting point, with no game emblem earned.
    expect(Object.values(disclosure.consoles).some(Boolean)).toBe(false);

    expect(consolePanelIds(disclosure)).toContain(SETTINGS_PANEL_ID);
  });

  it("is the ONLY button on that console, so the cluster is never empty", () => {
    expect(consolePanelIds(computeDisclosure(freshState()))).toEqual([SETTINGS_PANEL_ID]);
  });

  it("progressive disclosure has no opinion about Settings at all", () => {
    // If a `settings` key ever appears in the disclosure record, someone has started gating an
    // application surface behind progress. It is not a game surface and must never be listed.
    const consoles = computeDisclosure(freshState()).consoles as Record<string, boolean>;
    expect(consoles.settings).toBeUndefined();
  });

  it("keeps Settings last in the row once game emblems are earned", () => {
    const disclosure = {
      ...computeDisclosure(freshState()),
      consoles: { achievements: true, tools: true, statistics: false, prestige: false },
    };
    expect(consolePanelIds(disclosure)).toEqual(["achievements", "tools", SETTINGS_PANEL_ID]);
  });
});

describe("Tools 'Open it now' opens the Settings surface", () => {
  it("lands on Settings for every tool in the roster, in any unlock state", () => {
    for (const def of TOOL_DEFINITIONS) {
      expect(openFeatureRequest(def.id).panel).toBe(SETTINGS_PANEL_ID);
    }
  });

  it("points the voice-flavoured tools at the funny sliders and the rest at the language mode", () => {
    expect(openFeatureRequest("narrator").row).toBe("funny");
    expect(openFeatureRequest("personalVocabulary").row).toBe("funny");
    expect(openFeatureRequest("regexBuilder").row).toBe("language");
    // An id that is not a tool at all still gets a destination rather than an error: this
    // function decides where to look, never whether the player may.
    expect(openFeatureRequest("not-a-tool").panel).toBe(SETTINGS_PANEL_ID);
  });
});

describe("Language mode switches the rendered copy", () => {
  const pair = { en: "Settings", yue: "設定" };

  it("renders one language per single-language mode and both in bilingual mode", () => {
    expect(formatBilingual(pair, "en")).toBe("Settings");
    expect(formatBilingual(pair, "yue")).toBe("設定");
    expect(formatBilingual(pair, "both")).toBe("Settings · 設定");
  });

  it("bilingualText — the function every screen already calls — follows the active mode", () => {
    const restore = getActiveLanguageMode();
    try {
      setActiveLanguageMode("yue");
      expect(bilingualText(pair)).toBe("設定");
      expect(bilingualText(pair)).not.toContain("Settings");
      setActiveLanguageMode("en");
      expect(bilingualText(pair)).toBe("Settings");
      setActiveLanguageMode("both");
      expect(bilingualText(pair)).toBe("Settings · 設定");
    } finally {
      setActiveLanguageMode(restore);
    }
  });

  it("never invents, translates or reorders text — it only chooses", () => {
    const long = { en: "Bought 3 × Grandma", yue: "買咗 3 個婆婆" };
    expect(formatBilingual(long, "en")).toBe(long.en);
    expect(formatBilingual(long, "yue")).toBe(long.yue);
  });
});

describe("App settings persistence round-trip", () => {
  it("stores and reloads all three values under its own key", () => {
    const storage = memoryStorage();
    const store = createLocalStorageAppSettings(storage);
    const chosen: AppSettings = { languageMode: "yue", funnyLevelEn: 1, funnyLevelYue: 5 };

    store.save(chosen);
    expect(storage.map.has(APP_SETTINGS_KEY)).toBe(true);
    // A fresh store over the same storage: exactly what a relaunch does.
    expect(createLocalStorageAppSettings(storage).load()).toEqual(chosen);
  });

  it("keeps settings OUT of the game save's key space", () => {
    const storage = memoryStorage();
    createLocalStorageAppSettings(storage).save(DEFAULT_APP_SETTINGS);
    for (const key of storage.map.keys()) {
      expect(key).not.toContain(":save:");
    }
  });

  it("starts from the defaults when nothing has been stored", () => {
    expect(createLocalStorageAppSettings(memoryStorage()).load()).toEqual(DEFAULT_APP_SETTINGS);
  });

  it("falls back to the defaults rather than throwing on unreadable preferences", () => {
    const storage = memoryStorage();
    storage.setItem(APP_SETTINGS_KEY, "{not json");
    expect(createLocalStorageAppSettings(storage).load()).toEqual(DEFAULT_APP_SETTINGS);
  });

  it("repairs individual bad fields without discarding the good ones", () => {
    expect(normalizeAppSettings({ languageMode: "klingon", funnyLevelEn: 4, funnyLevelYue: 99 })).toEqual({
      languageMode: DEFAULT_APP_SETTINGS.languageMode,
      funnyLevelEn: 4,
      funnyLevelYue: 5,
    });
    expect(coerceFunnyLevel(-3, 3)).toBe(1);
    expect(coerceFunnyLevel("4", 3)).toBe(3);
    expect(coerceFunnyLevel(2.4, 3)).toBe(2);
  });
});

describe("LOAD-BEARING: the two funny levels are independent", () => {
  it("moving one level never moves the other, through a full save/load cycle", () => {
    const storage = memoryStorage();
    const store = createLocalStorageAppSettings(storage);
    store.save({ ...DEFAULT_APP_SETTINGS, funnyLevelEn: 1 });
    const afterEnglish = store.load();
    expect(afterEnglish.funnyLevelEn).toBe(1);
    expect(afterEnglish.funnyLevelYue).toBe(DEFAULT_APP_SETTINGS.funnyLevelYue);

    store.save({ ...afterEnglish, funnyLevelYue: 5 });
    const afterCantonese = store.load();
    expect(afterCantonese.funnyLevelYue).toBe(5);
    expect(afterCantonese.funnyLevelEn).toBe(1); // untouched by the Cantonese write
  });

  it("the settings record has two separate level fields, not one shared one", () => {
    const keys = Object.keys(DEFAULT_APP_SETTINGS);
    expect(keys).toContain("funnyLevelEn");
    expect(keys).toContain("funnyLevelYue");
    expect(keys).not.toContain("funnyLevel");
  });
});
