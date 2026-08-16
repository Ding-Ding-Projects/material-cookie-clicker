import { getActiveLanguageMode, showsCantonese, showsEnglish, type Bilingual } from '../game/copy.js';

/**
 * A bilingual paragraph whose two languages are stacked on separate lines rather than joined by
 * the "·" separator — the layout several screens use for prose that is too long to sit on one.
 *
 * It exists so those screens obey the language-mode setting without every one of them repeating
 * the same three-way conditional. In 'both' mode it renders exactly what the hardcoded markup
 * rendered before: English, a line break, Cantonese.
 */
export function BilingualLines({ text }: { text: Bilingual }) {
  const mode = getActiveLanguageMode();
  return (
    <>
      {showsEnglish(mode) ? text.en : null}
      {mode === 'both' ? <br /> : null}
      {showsCantonese(mode) ? text.yue : null}
    </>
  );
}
