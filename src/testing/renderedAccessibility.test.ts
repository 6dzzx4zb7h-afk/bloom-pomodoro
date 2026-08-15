/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';

import {
  expectRenderedAccessibility,
  renderedAccessibilityViolations,
} from './renderedAccessibility';

describe('rendered accessibility audit', () => {
  it('accepts named controls with valid ARIA references', () => {
    const host = document.createElement('div');
    host.innerHTML = `
      <h2 id="title">Preferences</h2>
      <p id="help">Choose one option.</p>
      <div role="dialog" aria-modal="true" aria-labelledby="title" aria-describedby="help">
        <label for="name">Name</label>
        <input id="name" />
        <button aria-pressed="false">Day</button>
      </div>
    `;

    expectRenderedAccessibility(host);
    expect(renderedAccessibilityViolations(host)).toEqual([]);
  });

  it('reports actionable rules and element locators', () => {
    const host = document.createElement('div');
    host.innerHTML = `
      <div id="repeat"></div>
      <div id="repeat"></div>
      <button class="icon-only"><span aria-hidden="true">×</span></button>
      <div role="dialog" aria-describedby="missing"></div>
    `;

    const violations = renderedAccessibilityViolations(host);
    expect(violations).toContain('[unique-id] <div#repeat>: id "repeat" appears 2 times');
    expect(violations).toContain(
      '[interactive-name] <button.icon-only>: interactive control has no accessible name',
    );
    expect(violations).toContain(
      '[aria-reference] <div>: aria-describedby references missing id: missing',
    );
    expect(violations).toContain(
      '[modal-dialog] <div>: dialog is missing aria-modal="true"',
    );
    expect(violations).toContain('[dialog-name] <div>: dialog has no accessible name');
    expect(() => expectRenderedAccessibility(host)).toThrow(/Rendered accessibility audit failed/);
  });
});
