# Obsidian compatibility reviews

## Obsidian 1.15.1 review (plugin 0.7.2)

Reviewed on November 11, 2026 with two sources:

- **Core code.** The renderer bundle (`obsidian.asar` → `app.js`, `app.css`,
  `index.html`) of 1.15.1, the newest release, compared with 1.12.7, the build
  the original audit used.
- **Release notes.** All 60 desktop and mobile release pages from 1.12.0 to 1.15.1
  on the [official changelog](https://obsidian.md/changelog/), public and Catalyst
  (Obsidian's early-access channel).

Neither source shows core adding ARIA roles or states, between 1.12.7 and 1.15.1, to
any control the plugin shims; the only new roles are two `role="button"` controls
listed under "Kept".
No release note mentions ARIA, screen readers, focus-visible styles, reduced motion
or forced colors. What changed is keyboard and focus behaviour, which is where the
plugin can overlap with core.

### Changed in 0.7.2

| Area | What core does now | Plugin change |
|---|---|---|
| Settings section list | Keyboard navigation (arrows, Enter, Ctrl/Cmd-F, Vim keys) first shipped in **1.13.0 Catalyst** ("Added keyboard navigation…"), not 1.13.4 as the earlier review said. Tab/Shift-Tab change in 1.13.5 Catalyst / 1.13.6 public. | Defers from `requireApiVersion("1.13.0")`, checked on each sweep. Catalyst builds 1.13.0–1.13.3 no longer get both models (double focus jump). Before 1.13.5 core kept Tab on the current row, which isn't an APG tablist either, so the tab roles come off from 1.13.0 too. |
| Toggle switches | 1.15.1 handles Space/Enter on `label.checkbox-container` and sets the inner checkbox to `tabindex=-1`. 1.12.7 had no key handler on the label and left the checkbox at `tabindex=0` as the keyboard control. No release note names the version. | `enhanceToggle` reads the checkbox's tabindex before touching it. If core set `-1`, keys stay with core. Otherwise the plugin supplies Enter/Space on the label. Core's `is-disabled` class is now exposed as `aria-disabled`. When the plugin owns the keys it clicks the checkbox, not the label: on 1.12.7 a label click moved focus onto the hidden checkbox. This fixes a bug from 0.6.9, where older builds lost keyboard toggling because the plugin hid the checkbox and also deferred to the label's core tabindex. |
| Sidebar open/closed state | Core toggles `is-{left,right}-sidedock-open` on `.workspace` (not `body`) in 1.12.7 and 1.15.1, for desktop sidedocks and mobile drawers. In 1.15.1 it also adds `is-{primary,secondary}-…`; the left/right name is the visual side, as on `.mod-left`/`.mod-right`. From 1.15.1 Catalyst, phones slide the note instead of the drawer ("The sidebar itself no longer moves"). | `isSidebarOpen()` reads core's class. Sidebar toggles previously read `body`, so on desktop `aria-expanded` was always `false`. Mobile drawer state previously came from the drawer's on-screen position, which no longer changes on 1.15.1 phones. Containment still requires `.workspace-drawer-backdrop`, which tells an overlay drawer from a pinned one: in 1.15.1 it is attached only while a drawer is open (phones detach it in `end()`, which `settle()` calls only on close; tablets in `onClosed()`). |
| Settings window | Since 1.13 Settings opens in its own window by default (a "popout modal": core builds the window in `open()`, then `Modal.prototype.open` renders into it). It isn't a workspace window, so the workspace `window-open` event never fires. Without the plugin, a toggle there is a focusable `LabelText` with an empty accessible name. | The plugin wraps `Modal.prototype.open` and attaches to whichever document a modal renders into, and attaches at load if Settings is already open there. Before this, none of its fixes (switch roles, focus ring, live region) reached the Settings window. |

### Kept, because core still lacks it in 1.15.1

- **Roles and states:** `dialog`/`aria-modal`, `tablist`/`tab`, `tree`/`treeitem`,
  `switch`/`aria-checked`, combobox/listbox on prompts, and a live region for notices.
  Core's only ARIA is in CodeMirror, the PDF find bar, and two new `role="button"`
  controls (notice actions, text-icon buttons).
- **Keyboard access to chrome:** ribbon actions, nav buttons, view actions and the
  modal close button are still `createDiv("clickable-icon …")` with no tabindex.
  `makeActivatable` already leaves alone any control core makes focusable, such as
  the new focusable extra-setting buttons, notice actions and setting rows.
- **Focus ring:** core added `:focus-visible` rings for `.clickable-icon`, settings
  rows, settings nav items, community items and others. They use
  `--background-modifier-border-focus: var(--color-base-40)`, which is 1.88:1 against
  the light background and 2.29:1 against the dark one, under the 3:1 a focus
  indicator needs (1.4.11). The plugin's accent outline stays; where both apply,
  core's faint ring shows under it.
- **Reduced motion:** core checks `prefers-reduced-motion` for two animations only
  (the loading icon and a mobile onboarding step). The plugin's app-wide rule stays.
- **Tree keyboard:** still deliberately replaces core's `has-focus` arrow handling
  while the tree owns focus (see `tree-keyboard.ts`).
- **Viewport:** `index.html` still ships `maximum-scale=1.0, user-scalable=no`
  (CORE-6). 1.14.1 mobile scales with the system text size, which helps.

### Live verification (November 11, 2026)

Obsidian was driven over the Chrome DevTools Protocol: real key events, the DOM, and
Chromium's computed accessibility tree. No screen reader, voice control or phone was
used, so these are automated checks, not an assistive-technology pass.

| Build | Check | Result |
|---|---|---|
| 1.15.1 desktop (Catalyst), dev vault | 0.7.2 turned on while 0.6.9 was still on | Pass. The startup notice appeared and was mirrored into the single shared live region (`role="status"`, polite). |
| 1.15.1 | Old 0.6.9 copy turned off, then a core notice | Pass. The old copy removed its region; 0.7.2 created its own and announced the notice. |
| 1.15.1 | Sidebar toggle `aria-expanded` as the left sidebar closed and reopened | Pass. `true` → `false` → `true`. The accessibility tree shows buttons named "Toggle left/right sidebar" with the right expanded state. `body` never carries the sidedock classes. |
| 1.15.1 | Settings window reached | Pass. After the fix: focus-ring flag, live region, and toggles exposed as `switch` with their visible name, `aria-checked` and description. |
| 1.15.1 | Settings section list, keyboard only (search → ArrowDown ×3 → ArrowUp) | Pass. Identical with the plugin on and off (General → Appearance → Interface → Appearance). No plugin roles on the list. |
| 1.15.1 | Toggle Enter/Space in the Settings window | Pass. One change per key. The plugin installs no key handlers; focus stays on the switch. |
| 1.12.7, scratch vault and profile | Settings list shim | Pass. `tablist`/`tab` applied, as expected before 1.13.0. |
| 1.12.7 | Toggle Enter, Space, Enter, Space | Pass after the fix. Four changes, focus stays on the switch. Before the fix, Enter moved focus to the hidden checkbox. |

### Not verified

- Screen reader (NVDA, VoiceOver, Orca) and voice control: "click Contrast boost" and
  similar Label in Name checks.
- Phone drawers on 1.15.1 with "Mobile layout support" on, under TalkBack/VoiceOver.
- Other popout modals besides Settings, such as the community plugin browser.
- Twice during testing on 1.15.1 the Settings window closed. The test instance was on a
  desktop in use, so it was most likely closed by hand. Later runs didn't reproduce it,
  with or without the plugin.

Future live runs belong on a virtual display with a throwaway profile and vault copy,
not the dev vault on the working desktop.

## Obsidian 1.14 review (plugin 0.6.9)

Reviewed on October 9, 2026 against the [official changelog](https://obsidian.md/changelog/), including the October 5 public desktop/mobile 1.14 release and the 1.14.4 fixes included in it.

Version 0.6.9 keeps the 1.4.0 minimum version and existing feature settings. It hardens the accessibility shims around changes to native keyboard navigation, RTL workspaces, editor suggestions, and modal focus:

- Native controls and controls with an existing tabindex keep their keyboard activation. Plugin shims ignore nested controls, consumed keys, modifiers, IME input, and repeated activation keys. Space commits on release and remains cancellable.
- Plugin-owned tab and tree horizontal arrows follow computed RTL direction. Tab arrows defer to existing core focusable tabs; tree keys run only when the tree container owns focus.
- Mobile drawer visibility uses viewport intersection rather than assuming that a named drawer appears on a particular side.
- Modal enhancement preserves focus already placed inside by core (for example a prompt or Bases view-name field).
- Editor Escape waits until native handlers finish, yielding to consumed events, tooltips, suggestions, and Vim mode. Its listener is removed on unload and can be installed again after a reload.
- Settings navigation already defers to core on Obsidian 1.13.4 and later; this remains in place. (0.7.2 moved this to 1.13.0; see above.)

The plugin does not replace math rendering, Bases layouts, Markdown parsing, or font-size storage, so no implementation changes were needed for those changelog items. Reading-default remains an explicit plugin setting.

### Verification (1.14 review)

Run `npm test` and `npm run build`. Regression tests bundle real source modules with a stub for the Obsidian API and small DOM fixtures; they are behavioral unit tests, not a running Obsidian integration test.

Before release/merge, verify in actual Obsidian 1.14 on desktop and mobile: native Settings navigation/search; tab close buttons; RTL tab/tree arrows; filtered trees; prompt and Bases view-name focus; highlight/link suggestion Escape; plugin disable/re-enable; popout windows; keyboard, screen reader, and dictation/voice-control Label in Name checks. Automated browser inspection was unavailable because Chrome is not configured on the tool host. Full live compatibility is not yet verified.
