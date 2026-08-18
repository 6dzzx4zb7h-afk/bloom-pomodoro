import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

/**
 * ROADMAP "Now — make it stop feeling like a web app".
 *
 * These four properties are the concrete tells a WebView gives away: the grey
 * highlight rectangle on every tap, the selection magnifier on a long-press,
 * the Save Image sheet over artwork, and double-tap-to-zoom with its tap delay.
 * A desktop browser will not show any of them, so a test is the only cheap
 * guard against them regressing.
 */
describe('native-feel baseline', () => {
  it('clears the WebView tap highlight globally', () => {
    expect(css).toMatch(/\*\s*\{[\s\S]*?-webkit-tap-highlight-color:\s*transparent/);
  });

  it('stops long-press selection and the callout sheet on app chrome', () => {
    expect(css).toMatch(/body\s*\{[\s\S]*?[^-]user-select:\s*none/);
    expect(css).toMatch(/body\s*\{[\s\S]*?-webkit-user-select:\s*none/);
    expect(css).toMatch(/body\s*\{[\s\S]*?-webkit-touch-callout:\s*none/);
  });

  it('still lets people select and copy where they type', () => {
    // The restoring rule must name the real text surfaces, or disabling
    // selection on body would make inputs unusable to edit by touch.
    const restore = css.match(
      /input,\s*\ntextarea,\s*\n\[contenteditable='true'\],\s*\n\.selectable\s*\{[\s\S]*?\}/,
    );
    expect(restore).not.toBeNull();
    expect(restore?.[0]).toMatch(/[^-]user-select:\s*text/);
    expect(restore?.[0]).toMatch(/-webkit-touch-callout:\s*default/);
  });

  it('removes double-tap-to-zoom from links and roles the .phone rule misses', () => {
    const block = css.match(/\na,\s*\nbutton,[\s\S]*?touch-action:\s*manipulation;\s*\n\}/);
    expect(block).not.toBeNull();
    for (const selector of ['a,', 'label,', "[role='radio'],", "[role='menuitem'],"]) {
      expect(block?.[0]).toContain(selector);
    }
  });
});
