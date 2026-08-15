/** @vitest-environment jsdom */

import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_STATE } from '../store/useBloom';
import { expectRenderedAccessibility } from '../testing/renderedAccessibility';
import { CollectionScreen } from './CollectionScreen';

vi.mock('../components/PixelPal', () => ({
  PixelPal: () => <span aria-hidden="true" data-testid="pixel-pal" />,
}));

afterEach(cleanup);

describe('CollectionScreen direct accessibility', () => {
  it('selects a friend, exposes pressed state, and switches to the bundled Field Guide', () => {
    function Harness() {
      const [pal, setPal] = useState('Mochi');
      const bloom = {
        state: {
          ...DEFAULT_STATE,
          palXp: { Mochi: 3, Pudding: 8 },
          settings: { ...DEFAULT_STATE.settings, pal },
        },
        actions: {
          patchSettings: (patch: { pal?: string }) => {
            if (patch.pal) setPal(patch.pal);
          },
          markGuideArticleRead: vi.fn(),
        },
      } as unknown as Parameters<typeof CollectionScreen>[0]['bloom'];
      return <CollectionScreen bloom={bloom} />;
    }

    const { container } = render(<Harness />);
    expect(screen.getByRole('main', { name: 'My little friends' })).toBeTruthy();
    const sections = screen.getByRole('group', { name: 'Collection sections' });
    expect(within(sections).getByRole('button', { name: 'Friends' }).getAttribute('aria-pressed'))
      .toBe('true');

    const mochi = screen.getByRole('button', { name: /Mochi, on duty, level 2/i });
    const pudding = screen.getByRole('button', { name: /Pudding, level 3/i });
    expect(mochi.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(pudding);
    expect(screen.getByRole('button', { name: /Pudding, on duty, level 3/i }).getAttribute('aria-pressed'))
      .toBe('true');
    expect(screen.getByRole('button', { name: /Mochi, level 2/i }).getAttribute('aria-pressed'))
      .toBe('false');
    expectRenderedAccessibility(container);

    fireEvent.click(within(sections).getByRole('button', { name: 'Field Guide' }));
    expect(screen.getByRole('main', { name: 'Field Guide' })).toBeTruthy();
    expect(within(sections).getByRole('button', { name: 'Field Guide' }).getAttribute('aria-pressed'))
      .toBe('true');
    const filters = screen.getByRole('group', { name: 'Browse guide by stage' });
    fireEvent.click(within(filters).getByRole('button', { name: 'Recovering' }));
    expect(screen.getByRole('button', {
      name: /After distraction, soften the next step/i,
    })).toBeTruthy();
    expectRenderedAccessibility(container);
  });
});
