# PLAN 8.8 responsive verification — 2026-07-26

Scope: locally reproducible browser evidence for the touch-target and narrow
layout slice implemented in this worktree. Physical iOS Safari/Android WebView
evidence remains deferred release work; PLAN 8.8 explicitly requires the fast
browser milestone rather than device proof.

## Fixture

- Fresh origin at `http://127.0.0.1:5174/`
- In-app Chromium browser
- Explicit 320 × 568 CSS px viewport
- Day theme, empty task list

## Evidence

- The fresh Tasks accessibility tree exposes one named `main`, one `h1`, the
  empty state as a named region with an `h2`, one “add your first task” button,
  the labelled add form, and the primary navigation state.
- Before the responsive add-row rule, the task-name input rendered about
  40 px wide and its placeholder was visibly clipped.
- After the rule, the page measured 320 px client width and 320 px scroll
  width (no horizontal overflow). The add button measured 44 × 44 px, the
  task-name input measured 142 × 44 px at 16 px text, and the session-count
  button measured 44 × 44 px.
- In Settings, the sticky close measured 44 × 44 px, step buttons 44 × 44 px,
  switches 48 × 44 px, and the name input 130 × 44 px.

## Remaining before closure

- Several Focus/Settings controls are still below Bloom's 44 px web target,
  including mode tabs, the Settings gear, the optional opening-move control,
  chronotype choices, and mini actions.
- Goal-form reflow, compact-height Focus behavior, safe areas, 200% zoom,
  virtual keyboards, and the full small-phone/landscape matrix remain.
- The required real iOS Safari and Android WebView touch/keyboard/safe-area
  checks are unavailable in this run.

## Closure supplement — 2026-08-11

The final matrix used a foregrounded Codex in-app browser and isolated local
production-preview origins. Tests used the final build after both corrections
below; the console recorded no warnings or errors.

### Defects found and corrected

1. With an emulated 320 × 320 software-keyboard viewport, browser focus
   scrolling moved the outer overflow-hidden `.phone` shell to
   `scrollTop: 34.5`. Onboarding scrolled and submitted correctly, but Focus
   inherited that offset after the form unmounted, clipping the heading and
   Settings control. Submission now blurs the focused form control and resets
   the shell's horizontal and vertical scroll before saving the name. The final
   handoff measured `scrollTop: 0`; Settings rendered at y=15–59.
2. At 320 CSS px, Field Guide's five stage filters stayed on one horizontal
   row inside the vertically scrolling Guide. Recovering and Science ended at
   x=344 and x=428, creating a second scroll axis. The row now wraps at the
   compact breakpoint. Its 282 px client and scroll widths match; all five
   44 px-high controls are inside the viewport.

### Final browser matrix

| Fixture | Measured result |
| --- | --- |
| Onboarding, 320 × 568 | No autofocus (`BODY` active); name input 16 px / 51.5 px high; submit 47.5 px high; document 320/320 px with no horizontal overflow. |
| Emulated keyboard, 320 × 320 | Onboarding owns vertical scrolling (310 px client / 462 px scroll height); focused input and submit remain on-screen; submission reaches Focus and resets the outer shell to zero. |
| Focus, 320 × 568 | Main 497/497 px, Start 60 × 60 px at y=405–465, Settings 44 × 44 px at y=15–59; no clipped, overlapping, undersized, or horizontally overflowing control. |
| Focus, 390 × 844 | Main 773/773 px; Start 74 × 74 px at y=603–677; no clipping, undersized control, or horizontal overflow. |
| Goals, 390 × 844 | Goal name occupies row one; date/unit/amount/add share row two. Inputs are 44 px high and 16 px text; columns are 124/86/56/44 px with no overflow. |
| Goals, 320 × 568 / 200%-layout equivalent | Name, date, unit/amount, and add reflow to four vertical rows; document and main stay 320 px wide, all inputs are 16 px / 44 px, and only vertical scrolling remains. The browser surface exposes viewport sizing but not a page-zoom command, so this is labeled a layout-equivalent check rather than an actual zoom claim. |
| Settings, 320 × 568 | Sheet 320/320 px wide and vertically scrollable (534/1,329 px); every rendered control is at least 44 × 44 px and every input/select is at least 16 px. |
| Short landscape, 568 × 320 | No horizontal overflow or undersized control. Focus owns vertical scrolling (249/477 px); activating Start scrolls it into view and the resulting Pause control sits at y=44–104, proving the transport remains reachable. |
| Core-screen inventory, 320 × 568 | Focus, Tasks, History, Goals, Friends, Field Guide, and Settings contain no undersized ordinary control, narrow input below 16 px, or document-level horizontal overflow. Guide filters wrap instead of nesting a horizontal scroller. |

The permanent regression baseline also asserts the common-phone and 320 px
breakpoints, compact-height portrait and landscape rules, safe-area padding on
screens/navigation/sheets/onboarding, the complete 44 px web-control floor,
16 px narrow form text, scalable/concentric ring geometry, the onboarding
scroll handoff, and the wrapped Guide filters. Physical-device touch,
software-keyboard, and non-zero safe-area proof remains release QA and is not
claimed here.
