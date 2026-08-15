type Violation = {
  rule: string;
  element: Element;
  message: string;
};

const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  '[role="button"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="tab"]',
  '[role="radio"]',
  '[role="combobox"]',
  '[role="slider"]',
].join(',');

function compact(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function referencedText(element: Element, attribute: string): string {
  const nodeRoot = element.getRootNode();
  const referenceRoot = 'querySelectorAll' in nodeRoot
    ? nodeRoot as ParentNode
    : element.ownerDocument;
  return compact(
    (element.getAttribute(attribute) ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => findReferencedElement(referenceRoot, id)?.textContent ?? '')
      .join(' '),
  );
}

function findReferencedElement(root: ParentNode, id: string): Element | null {
  const local = Array.from(root.querySelectorAll('[id]')).find((element) => element.id === id);
  if (local) return local;
  const document = root instanceof Document ? root : (root as Node).ownerDocument;
  return document?.getElementById(id) ?? null;
}

function visibleText(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll('[aria-hidden="true"], [hidden]').forEach((node) => node.remove());
  return compact(clone.textContent);
}

function associatedLabelText(element: Element): string {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  ) {
    return compact(Array.from(element.labels ?? []).map((label) => label.textContent).join(' '));
  }
  return '';
}

function accessibleName(element: Element): string {
  return (
    compact(element.getAttribute('aria-label')) ||
    referencedText(element, 'aria-labelledby') ||
    associatedLabelText(element) ||
    (element instanceof HTMLImageElement ? compact(element.alt) : '') ||
    visibleText(element) ||
    compact(element.getAttribute('title'))
  );
}

function locator(element: Element): string {
  const id = element.id ? `#${element.id}` : '';
  const classes = Array.from(element.classList).slice(0, 2).map((name) => `.${name}`).join('');
  return `<${element.tagName.toLowerCase()}${id}${classes}>`;
}

function referenceViolations(root: ParentNode, attribute: string): Violation[] {
  return Array.from(root.querySelectorAll(`[${attribute}]`)).flatMap((element) => {
    const ids = (element.getAttribute(attribute) ?? '').split(/\s+/).filter(Boolean);
    const missing = ids.filter((id) => !findReferencedElement(root, id));
    return missing.length
      ? [{
          rule: 'aria-reference',
          element,
          message: `${attribute} references missing id${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`,
        }]
      : [];
  });
}

/**
 * Small deterministic semantic audit for rendered component tests (PLAN 8.21b).
 * It intentionally checks high-signal DOM invariants that jsdom can prove and
 * reports actionable element locators. Real screen readers and device/browser
 * accessibility trees remain manual release evidence.
 */
export function renderedAccessibilityViolations(root: ParentNode): string[] {
  const violations: Violation[] = [];
  const ids = new Map<string, Element[]>();

  for (const element of Array.from(root.querySelectorAll('[id]'))) {
    const id = element.id.trim();
    if (!id) continue;
    ids.set(id, [...(ids.get(id) ?? []), element]);
  }
  for (const [id, elements] of ids) {
    if (elements.length > 1) {
      violations.push({
        rule: 'unique-id',
        element: elements[1],
        message: `id "${id}" appears ${elements.length} times`,
      });
    }
  }

  for (const attribute of ['aria-labelledby', 'aria-describedby', 'aria-controls']) {
    violations.push(...referenceViolations(root, attribute));
  }

  for (const element of Array.from(root.querySelectorAll(INTERACTIVE_SELECTOR))) {
    if (!accessibleName(element)) {
      violations.push({
        rule: 'interactive-name',
        element,
        message: 'interactive control has no accessible name',
      });
    }
  }

  for (const element of Array.from(root.querySelectorAll('[aria-pressed]'))) {
    if (!['true', 'false', 'mixed'].includes(element.getAttribute('aria-pressed') ?? '')) {
      violations.push({
        rule: 'aria-pressed-value',
        element,
        message: `aria-pressed has invalid value "${element.getAttribute('aria-pressed')}"`,
      });
    }
  }

  for (const dialog of Array.from(root.querySelectorAll('[role="dialog"]'))) {
    if (dialog.getAttribute('aria-modal') !== 'true') {
      violations.push({
        rule: 'modal-dialog',
        element: dialog,
        message: 'dialog is missing aria-modal="true"',
      });
    }
    if (!accessibleName(dialog)) {
      violations.push({
        rule: 'dialog-name',
        element: dialog,
        message: 'dialog has no accessible name',
      });
    }
  }

  return violations.map(
    ({ rule, element, message }) => `[${rule}] ${locator(element)}: ${message}`,
  );
}

export function expectRenderedAccessibility(root: ParentNode): void {
  const violations = renderedAccessibilityViolations(root);
  if (violations.length > 0) {
    throw new Error(`Rendered accessibility audit failed:\n${violations.join('\n')}`);
  }
}
