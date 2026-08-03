# Bloom product quality standard

This document is the source of truth for Bloom's non-behavioral product quality: UX/UI,
accessibility, usability, reliability, performance, privacy, security, and engineering quality. It
applies to any surface changed by future work. It was adopted in July 2026 and applied prospectively,
so an older feature is not presumed to meet this baseline just because it shipped before then.

## Which source governs what

| Question | Binding source |
| --- | --- |
| Does a behavior-change mechanism have adequate evidence, and may Bloom make a scientific claim about it? | [`docs/science.md`](science.md) |
| Is user-facing wording warm, honest, optional where appropriate, and non-shaming? | [`docs/voice.md`](voice.md) |
| Is the product usable, accessible, secure, private, resilient, performant, and well tested? | This document |

Behavioral science is required for behavior-change mechanisms and user-facing scientific claims. It
is not an approval gate for ordinary interface or engineering work. A plan step for accessibility,
layout, error recovery, security, reliability, performance, refactoring, or testing may say
`Science: n/a` and cite the applicable section of this document, a standard, measured performance,
repository tests, or observed user behavior. Never invent a behavioral rationale for such work.

User-facing work can be governed by more than one source. For example, a cadence experiment uses
`science.md` for the mechanism, `voice.md` for its wording, and this document for the control's
semantics, responsive layout, failure states, and tests.

## How to apply this standard

For each unchecked numbered step:

1. Name the affected journeys, states, data, and supported platforms.
2. Add testable acceptance criteria from the applicable sections below. Use a `Quality:` line when
   it helps make the authority explicit.
3. Test at the lowest useful layer, then exercise the complete user path. Automated checks support
   but do not replace keyboard, screen-reader, visual, and real-device review.
4. Record the commands, fixtures, browsers/devices, accessibility settings, and measurements used.
5. If the work cannot meet an applicable criterion, keep the step open and add or update an
   unchecked remediation step. Do not silently bless the gap as a new baseline.

Apply criteria in proportion to the change, but do not omit a criterion that protects the affected
path. A copy-only edit does not need a performance trace; a new dialog does need semantics, focus,
keyboard, screen-reader, narrow-layout, and failure-state verification.

## Accessibility and semantics

Bloom targets [WCAG 2.2 Level AA](https://www.w3.org/TR/WCAG22/) for the complete web app and its
complete user processes. The [WAI-ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)
is informative pattern guidance, not a substitute for WCAG or native HTML.

Acceptance criteria:

- Prefer native HTML elements and behavior. Add ARIA only when native semantics cannot express the
  interaction; custom widgets follow the matching APG roles, states, properties, and keyboard model.
- Each screen has a meaningful `main` landmark and heading structure. Lists, forms, groups, status
  regions, and navigation use programmatic structure that matches the visible hierarchy.
- Every control exposes an accurate, distinct accessible name, role, value, state, and purpose. A
  visible label is programmatically associated with its control and appears in the accessible name.
- Instructions, requirements, and errors are connected to the relevant field. Placeholder text is
  never the only label or instruction.
- Meaningful images, canvas content, icons, and sounds have an equivalent accessible treatment.
  Decorative content is hidden from assistive technology.
- Reading order and focus order match the intended task order. CSS placement alone never changes
  the meaning of the sequence.
- Status changes that do not move focus use an appropriate, concise live region. Timer ticks and
  decorative animation do not flood announcements.
- Page language, headings, labels, text alternatives, zoom, text spacing, reflow, and complete
  processes satisfy all applicable WCAG A and AA criteria.

## Keyboard, touch, and screen readers

Acceptance criteria:

- Every action works with a keyboard alone in a logical order, with no keyboard trap. Focus is
  visible, is not hidden by sticky UI or overlays, and returns somewhere logical after removal or
  dismissal.
- Selection, focus, expansion, pressed state, and disabled state are programmatically distinct.
  Hover, color, position, or pointer precision is never the only way to discover or operate an
  action.
- Composite widgets use the expected keys from the
  [APG keyboard guidance](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/). Native
  buttons remain buttons; navigation remains navigation.
- A modal dialog is used only when the rest of the app must be unavailable. It has an accessible
  name, appropriate description, initial focus, contained Tab order, inert background, an explicit
  close/cancel action, a safe Escape policy, and focus restoration, following the
  [APG dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). Routine check-ins and
  status messages remain non-modal and do not steal focus.
- WCAG 2.2's target-size minimum remains the conformance floor. Bloom's stronger web touch target is
  an effective hit area of at least 44 by 44 CSS pixels for ordinary controls; the Android wrapper
  also verifies the platform's 48 by 48 dp recommendation. Keep enough separation to prevent
  adjacent activation. These are product/platform targets informed by
  [Apple's accessibility guidance](https://developer.apple.com/design/human-interface-guidelines/accessibility)
  and [Android's touch-target guidance](https://developer.android.com/guide/topics/ui/accessibility/apps#touch-targets),
  not a claim that WCAG requires 44 pixels.
- Drag, swipe, multipoint, or path-based actions have a simple single-pointer alternative. Pointer
  actions can be canceled or undone where WCAG requires it.
- Critical paths are completed using screen-reader output alone. Test at minimum with VoiceOver on
  Safari and TalkBack in the Android app for release; add an appropriate desktop screen reader when
  the changed interaction differs across engines.
- Screen-reader announcements identify the changed object and result without repeating the entire
  screen. Errors and recoveries are announced without unexpectedly moving focus.

## Responsive layout, safe areas, and virtual keyboards

Acceptance criteria:

- Ordinary vertical content reflows without loss or two-dimensional scrolling at 320 CSS pixels
  wide, at 200% text zoom, and under the WCAG text-spacing overrides. Essential content is not
  clipped or truncated; long names and localized-length test strings wrap safely.
- A changed path works in portrait and landscape, at the smallest supported phone height, at a
  representative tablet size, and at desktop width. Height breakpoints reduce decoration before
  hiding content or controls.
- Interactive and essential content stays outside display cutouts, system bars, browser chrome,
  gesture areas, and installed-app safe areas. Use the platform's insets and CSS
  [`safe-area-inset-*`](https://www.w3.org/TR/css-env-1/) values where applicable.
- With the virtual keyboard open, the focused field, its label and validation, and the relevant
  submit/cancel controls remain visible, scrollable, and operable. Keyboard show/hide and
  orientation changes do not strand focus or reset valid input.
- Mobile text inputs use a practical font size that avoids forced browser zoom; Bloom's default
  target is at least 16 CSS pixels unless real-device verification proves an accessible exception.
- Emulation is supplemented by a real iOS Safari and Android WebView/device check for keyboard,
  safe-area, gesture, and viewport behavior. Android WebView behavior follows the current
  [window-insets guidance](https://developer.android.com/develop/ui/views/layout/webapps/understand-window-insets).

## Visual hierarchy, readability, contrast, and motion

Acceptance criteria:

- Each state has a clear information hierarchy and one visually evident primary action when a
  primary action exists. Related controls sit with the content they affect; progressive disclosure
  reduces clutter without hiding required context.
- Body and essential supporting text remain readable over the lightest and darkest possible
  background states. Moving or translucent backgrounds do not sit directly behind essential text
  unless a stable surface preserves contrast.
- Normal text has at least 4.5:1 contrast and large text at least 3:1. Meaningful graphics, control
  boundaries, focus indicators, and visual states meet the applicable 3:1 non-text contrast
  requirement. Disabled controls are still understandable even when a contrast exception applies.
- Color, shape, animation, or sound is never the only carrier of meaning. Verify default, hover,
  focus, pressed, selected, error, and disabled states in both Bloom themes.
- At 200% zoom and with user text-spacing overrides, content remains legible and operable without
  overlap. Essential copy is not rendered as an image.
- `prefers-reduced-motion: reduce` removes or replaces nonessential translation, scale, parallax,
  looping, celebration, and interaction animation. Essential state changes remain perceivable
  without motion. Bloom adopts this as a product requirement beyond the AA minimum, using the
  [`prefers-reduced-motion`](https://www.w3.org/TR/mediaqueries-5/#prefers-reduced-motion) standard.
- Auto-moving content can be paused, stopped, or hidden when required; flashing never exceeds WCAG
  thresholds. `prefers-contrast: more` and forced-colors modes retain readable text, boundaries,
  focus, and state distinctions.

## Error prevention, confirmation, undo, and recovery

Acceptance criteria:

- Prevent invalid actions with clear constraints, safe defaults, and timely inline guidance. Do
  not disable an action without making the reason discoverable.
- Destructive, overwrite, finalization, and live-timer transition actions state the object, scope,
  and consequence before commitment. Prefer lossless undo for reversible actions; require explicit
  confirmation when meaningful data or unresolved state cannot be restored.
- The least destructive action is easy to reach and receives initial focus when appropriate.
  Cancel, Back, Escape, and outside-click behavior never silently commits or discards data.
- Forms preserve valid input after an error, identify the field and problem in text, suggest a
  concrete correction when known, and move or announce focus only as necessary.
- Mutations are atomic from the user's perspective. A failed import, migration, save, delete, or
  merge leaves the last known-good data usable and offers retry, export, restore, or another honest
  recovery path.
- Undo restores identity, relationships, ordering, progress, and selection—not merely visible copy.
- Error and recovery wording follows `docs/voice.md`: precise and non-blaming. Required safety,
  privacy, and recovery instructions may be direct; warmth must not make them vague.

## Loading, empty, offline, conflict, and failure states

Every data-backed or asynchronous surface defines the states that can actually occur. Do not add a
fake loading state to an instantaneous local operation, but never leave a perceptible wait blank.

Acceptance criteria:

- Loading preserves layout where practical, communicates what is happening, and never becomes an
  infinite spinner without timeout, retry, cancel, or fallback semantics.
- Empty states distinguish first use, filtered-empty, cleared data, unavailable data, and error
  conditions. They explain the state and offer the next useful action when one exists.
- Local-only and offline paths keep the complete core app usable. Last known-good local data remains
  available; optional network controls report queued, paused, stale, or unavailable state without
  blocking local work.
- Conflict UI never hides or blindly overwrites two valid versions. It identifies the affected
  data, explains the choices and consequences, preserves a recoverable copy, and supports keyboard
  and screen-reader operation.
- Partial success states say what completed and what did not. Retry is idempotent and does not
  duplicate sessions, credits, messages, or destructive actions.
- Failure fixtures cover storage denial/quota, corrupt input, unavailable network, timeout,
  cancellation, stale response, and reload at a meaningful intermediate state when those failures
  are in scope.

## Perceived and measured performance

Acceptance criteria:

- Input receives immediate visual feedback, and expensive work does not block timer controls,
  typing, scrolling, or dialog dismissal. Use progressive rendering or chunking when a list or
  import can grow materially.
- Material UI or dependency changes record production bundle delta and a reproducible before/after
  trace on a stated browser, device profile, cache state, and data fixture. Set a step-specific
  budget before optimizing rather than relying on “feels faster.”
- Hidden or obscured tabs stop decorative animation and other unnecessary work. Shared schedulers
  avoid multiplying timers or animation loops per component.
- Avoid layout shifts, late font swaps, and blank startup. Bundled assets are compressed and sized
  appropriately without becoming remote runtime dependencies.
- Where legitimate field data exists, the current Core Web Vitals “good” targets are LCP at or below
  2.5 seconds, INP at or below 200 milliseconds, and CLS at or below 0.1 at the 75th percentile,
  segmented by mobile and desktop. See [Web Vitals](https://web.dev/articles/vitals). Lab results
  are useful proxies but must not be described as field percentiles.
- Do not add default or undisclosed runtime analytics to obtain performance data. Any device-sent
  performance or error report is a separately planned optional diagnostic feature and must satisfy
  the consent and data rules below.

## Privacy and security

Local-first is a hard product boundary, not a performance mode:

- No account is required. Local-only is the default, sends no user data, makes no application-data
  request after the app shell loads, and keeps the complete core usable offline.
- Fonts, images, audio, guide content, and other runtime assets may be bundled locally. Remote
  runtime assets, advertising, and tracking are prohibited.
- Every optional network feature requires its own numbered plan step, explicit feature-specific
  opt-in, documented endpoint allowlist, exact inventory of data sent, local-only regression
  coverage, and clear pause, export, and deletion semantics. One feature's consent never authorizes
  another. Pausing or signing out keeps the complete local copy unless the user explicitly deletes it.
- Diagnostic reporting is a separate optional network feature. It is off by default, explicitly
  enabled, minimized, redacted, and disclosed payload-by-payload before enablement. It contains no
  behavioral analytics by default and supplies pause, review/export, and deletion controls.

Security acceptance criteria:

- Treat localStorage, imports, synced envelopes, URLs, and server responses as untrusted input.
  Validate type, schema, range, references, and size before use; bound parsing and rendering work.
- Persisted-shape changes bump `SCHEMA_VERSION` and append a forward migration. Never wipe, orphan,
  silently truncate, blindly overwrite, or invent historical user data. Preserve a recoverable copy
  before risky migration, import, repair, or account-switch operations.
- Never store credentials, session tokens, encryption keys, or secrets in localStorage. Do not claim
  that localStorage data is encrypted or confidential when it is not.
- Use least privilege, safe DOM rendering, restrictive connection/content policy, authenticated and
  authorized endpoints, secure transport, replay protection where relevant, and logs that exclude
  secrets and focus-content payloads.
- Pin and review dependencies, address known vulnerabilities proportionate to risk, and document
  security-sensitive assumptions and threat boundaries. Apply
  [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) to web
  surfaces and [OWASP MASVS](https://mas.owasp.org/MASVS/) to the Android wrapper as applicable.
- Consent is specific and as easy to withdraw as to grant; collection is minimized to the user's
  goal. Use the [W3C Privacy Principles](https://www.w3.org/TR/privacy-principles/) for minimization,
  transparency, data rights, consent, and withdrawal.
- Security failures fail closed for remote access while preserving recoverable local data and the
  offline core. Security copy is precise, accessible, and non-blaming.

## Browser and device verification

The affected path must define its support matrix. The release baseline is:

- current stable Chromium, Firefox, and Safari on desktop;
- current mobile Safari on a supported iPhone/iPad class device;
- current Chrome/Android WebView plus the Android wrapper on the oldest and newest Android versions
  the project declares supported;
- representative 320-pixel small phone, common phone, tablet, desktop, and short-landscape layouts;
- light and night themes, keyboard-only, touch/coarse pointer, screen reader, reduced motion,
  increased contrast/forced colors where supported, and network-blocked local-only mode.

Emulation is acceptable for fast iteration. A real device is required where emulation cannot prove
touch targeting, safe areas, virtual-keyboard behavior, audio/permissions, background visibility,
WebView integration, or assistive-technology output. Record unavailable matrix cells as open release
work; do not call them verified.

## Component, integration, accessibility, and visual regression testing

Acceptance criteria:

- Pure functions and reducers have deterministic unit tests for boundaries, malformed input, and
  invariants. Time, storage, visibility, and network dependencies are controlled in tests.
- Component tests assert observable names, roles, states, focus, keyboard/pointer behavior, live
  announcements, validation, undo, and recovery. DOM snapshots alone do not prove behavior.
- Integration tests cover the complete critical path across timer transitions, reload/background,
  persistence/migration, offline mode, import/export, failure injection, and optional-network
  conflict/retry when those concerns are affected.
- Automated accessibility checks run on representative screens and states, including overlays,
  but are supplemented by manual keyboard and screen-reader review. W3C notes that
  [no tool alone can determine accessibility conformance](https://www.w3.org/WAI/test-evaluate/).
- Visual regression uses a pinned rendering environment and representative normal, empty, error,
  offline, modal, and dense-data fixtures at narrow and wide sizes, in both themes and relevant user
  preference modes. Baseline updates are reviewed as product changes; known defects are not accepted
  merely by regenerating snapshots.
- Tests cover meaning, not implementation trivia, and fail with actionable output. Flaky tests are
  fixed or quarantined with an owned remediation step; they are not silently retried into green.

## Architecture changes

Descriptions such as “no router,” “one reducer,” or the current localStorage layout describe the
system today. They are not permanent prohibitions. A future numbered step may change architecture
when it includes:

- a clear product or engineering reason;
- data, state, and compatibility migration plus rollback considerations;
- measured bundle, startup, and runtime-performance impact;
- unit, integration, migration, and regression coverage appropriate to the change; and
- an architecture decision record (ADR) for a material decision.

Outside such a step, preserve the existing boundaries so an unrelated change does not smuggle in an
architecture migration.

## Primary references

Baseline reviewed 2026-07-19. Use current published versions when a future step begins:

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) and
  [How to Meet WCAG 2.2](https://www.w3.org/WAI/WCAG22/quickref/)
- [WAI-ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)
- [W3C accessibility evaluation guidance](https://www.w3.org/WAI/test-evaluate/)
- [Media Queries Level 5 user preferences](https://www.w3.org/TR/mediaqueries-5/#user-preference)
- [Apple accessibility guidance](https://developer.apple.com/design/human-interface-guidelines/accessibility)
  and [Android accessibility testing](https://developer.android.com/guide/topics/ui/accessibility/testing)
- [Core Web Vitals](https://web.dev/articles/vitals)
- [W3C Privacy Principles](https://www.w3.org/TR/privacy-principles/)
- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/),
  [OWASP MASVS](https://mas.owasp.org/MASVS/), and the
  [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
