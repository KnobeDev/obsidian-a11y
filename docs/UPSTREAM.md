# Upstream accessibility reports for Obsidian core

These are the issues the **Accessibility Enhancer** plugin can only *shim* at
runtime — the robust fix belongs in Obsidian itself. Obsidian's core is
closed-source, so these are written for submission to the
[Obsidian forum](https://forum.obsidian.md/) (**Bug reports** with a Sandbox-vault
repro, or **Feature requests**), not a GitHub tracker.

Each item cites where it was observed in the bundled renderer (`obsidian.asar` →
`app.js` / `app.css`, Obsidian 1.12.7) and notes how the plugin currently works
around it. Conformance target: **WCAG 2.1 Level A/AA**. Severities: 🔴 blocker ·
🟠 major · 🟡 minor.

---

## CORE-1 🔴 Interactive controls are non-native `<div>`s — not keyboard operable
**WCAG:** 2.1.1 Keyboard (A), 4.1.2 Name/Role/Value (A) · **Category:** Bug report

Most clickable chrome is built as `<div>` with a click handler and no `tabindex`,
no `role`, and no key handling: left-ribbon actions (`.side-dock-ribbon-action`),
status-bar items (`.status-bar-item`), sidebar collapse toggles
(`.sidebar-toggle-button`), the Settings navigation (`.vertical-tab-nav-item`),
and the modal close button (`.modal-close-button`).

**Repro (Sandbox vault):** Tab through the window with a keyboard only. The
ribbon, status bar, and — critically — the **Settings section list** cannot be
reached or activated. A keyboard user cannot change settings sections at all.

**Expected:** these are real `<button>`s (or have `role=button` + `tabindex=0` +
Enter/Space activation) and appear in the tab order.

**Plugin shim:** adds `role`/`tabindex` and Enter/Space handlers at runtime; a
native element would be more robust and wouldn't depend on class names.

**✅ Partially resolved upstream (Obsidian 1.13.4 / 1.13.5):** core added native
keyboard navigation to the **Settings** window — arrow keys to move, `Enter` to
open a tab, `Ctrl/Cmd-F` to focus search, Vim bindings (1.13.4), and
`Tab`/`Shift-Tab` moving to the next focusable element (1.13.5). As of plugin
0.6.8 the shim **stops enhancing the settings section list entirely on ≥ 1.13.4**
— both the keyboard handling (running both double-fired focus movement) and the
`tablist`/`tab` ARIA. Core drives the list as a flat focusable list, so leaving
the tab roles in place would be a 4.1.2 role/behavior mismatch; the plugin now
lets core own keyboard *and* semantics there. The ribbon, status bar, sidebar
toggles, and modal close button remain unresolved in core and are still shimmed.

> Residual (confirmed on Obsidian 1.13.5 via CDP against the live app, plugin
> 0.6.8 deferring): core makes the settings section items keyboard-operable
> (all `.vertical-tab-nav-item` get `tabindex="-1"`; ArrowUp/Down move focus one
> item at a time; `Tab` from the search box lands in the list), but each item's
> computed accessibility role is **`generic`** (name resolved from its text,
> `ignored: false`). So the items are reachable, focusable, and named, but lack a
> control role (`tab`/`button`). That is a core-only gap worth filing separately
> (**CORE-9**, below) — the plugin deliberately no longer papers over it with a
> mismatched `tab` role, since core's keyboard model is a flat focusable list, not
> an APG tablist.

---

## CORE-2 🔴 Global `:focus { outline: none }` removes the keyboard focus indicator
**WCAG:** 2.4.7 Focus Visible (AA) · **Category:** Bug report

`app.css` (~line 3218) declares a global `:focus { outline: none }`.
`:focus-visible` replacements exist for form controls and `<button>`s, but **not**
for the nav, file tree, tab headers, `.clickable-icon`s, menu items, or
suggestions — so keyboard focus is invisible across most of the shell.

**Repro:** Tab around the file explorer / ribbon with a keyboard — there is no
visible focus ring.

**Expected:** every focusable surface shows a visible, ≥3:1-contrast focus
indicator on keyboard focus.

**Plugin shim:** injects a `:focus-visible` ring stylesheet (it can only override,
not remove, the global rule).

---

## CORE-3 🔴 Modals lack dialog semantics and correct focus management
**WCAG:** 1.3.1 (A), 2.4.3 Focus Order (A), 4.1.2 (A) · **Category:** Bug report

Modals (`.modal` / `.modal-container`) have no `role="dialog"`, no
`aria-modal="true"`, and no `aria-labelledby` pointing at the title. Focus
handling has two structural problems:

- `Scope.onFocusIn` *blurs* elements that escape the modal rather than cycling
  focus within it — Tab can fall out to `document.body` (2.4.3).
- `shouldRestoreSelection` defaults to `false` and only restores editor
  selection, so focus is **not returned to the triggering control** when the
  modal closes.

**Expected:** `role=dialog` + `aria-modal` + label; a real focus trap that cycles
Tab/Shift-Tab; focus restored to the trigger on close.

**Plugin shim:** stamps the roles, overlays a real focus trap, and reimplements
trigger-restore — but cannot remove the core blur handler.

---

## CORE-4 🟠 File tree and workspace tabs lack tree/tab semantics
**WCAG:** 1.3.1 (A), 4.1.2 (A); 2.1.1 (A) for reorder · **Category:** Bug report

The file explorer (`.tree-item` / `.tree-item-self`) exposes no `tree`/`treeitem`/
`group` roles and no `aria-expanded`/`-level`/`-selected`; collapsed and active
state live only in CSS classes (`is-collapsed`, `is-active`). Workspace tabs
(`.workspace-tab-header`) expose no `tablist`/`tab`/`aria-selected`. Tab and pane
**reordering is drag-only** with no keyboard equivalent.

**Note:** the tree is virtualized via `InfinityScroll` (rows recycled), so any
plugin-applied ARIA must be continuously re-stamped — a strong argument for native
semantics.

**Expected:** native tree/tablist ARIA that tracks state; a keyboard command for
reordering tabs/panes.

**Plugin shim:** applies roles/state via a `MutationObserver` (with first-render
flash and re-render races that only core can fully avoid).

---

## CORE-5 🟠 Notices/toasts are not announced to assistive tech
**WCAG:** 4.1.3 Status Messages (AA) · **Category:** Bug report

`Notice` toasts render into `.notice-container > .notice > .notice-message` with no
`role="alert"` / `aria-live`, so screen-reader users get no notification. Search
and backlink counts in `.tree-item-flair` also update silently.

**Expected:** the notice container carries `role="alert"` (or an `aria-live`
region), and result counts are exposed via a polite live region.

**Plugin shim:** owns a visually-hidden `aria-live` region and mirrors each new
notice's text into it.

---

## CORE-6 🟠 Viewport meta blocks zoom; UI typography is px-locked
**WCAG:** 1.4.4 Resize Text (AA), 1.4.10 Reflow (AA), 1.4.12 Text Spacing (AA) · **Category:** Bug report

`index.html` ships `<meta name="viewport" content="… maximum-scale=1.0,
user-scalable=no …">`, which disables browser zoom. UI text uses px-locked tokens
(`--font-ui-smaller:12px`, `--font-ui-small:13px`, `--font-ui-medium:15px`; body
`font-size:15px`) and many rows are fixed-`height` in px, so user text-zoom /
text-spacing can't apply without truncation.

**Expected:** drop `maximum-scale`/`user-scalable`; express UI type in
`rem`/`em` and prefer `min-height` over fixed `height` on text rows.

**Plugin shim:** can rewrite the meta tag and re-map `--font-ui-*` tokens, but
fixed heights are baked into many rules.

---

## CORE-7 🟠 Icon controls ship empty `aria-label`; palette lacks combobox semantics
**WCAG:** 4.1.2 (A) · **Category:** Bug report

Two internal helpers build controls differently: one (`Mv`) sets a real
`aria-label`, but a second (`Sv`) sets `aria-label=""` and stores the intended
name in a private `WeakMap` (`yv`) used only to render the custom tooltip on
hover. Controls built via the second path therefore have **no accessible name**
for a screen reader. Separately, the command palette / quick switcher inputs are
plain textboxes with no `combobox`/`listbox`/`option` semantics — the selected
result (`.is-selected`) is invisible to AT.

**Expected:** always set a real `aria-label` (the tooltip text *is* the name);
expose the palette as an APG combobox with `aria-activedescendant`.

**Plugin shim:** re-derives some names from icon classes and applies
combobox/listbox roles via observer — but cannot read the private `WeakMap` to
recover the exact intended label.

---

## CORE-8 🟡 No validation/error channel on the Setting API
**WCAG:** 3.3.1 Error Identification (A), 3.3.3 Error Suggestion (AA) · **Category:** Feature request

The `Setting` builder has no API to mark a control invalid or attach an error
message, so neither core settings nor plugins can expose `aria-invalid` +
`role="alert"` error text in a standard way.

**Requested:** a first-class `Setting.setError(message)` / validation hook that
wires `aria-invalid`, `aria-describedby`, and a live error region.

**Plugin shim:** generic patching can't detect "invalid"; plugin authors must
hand-roll error regions on their own controls.

---

## CORE-9 🟡 Settings section items are keyboard-operable but expose no control role
**WCAG:** 4.1.2 Name/Role/Value (A) · **Category:** Bug report

Obsidian 1.13.4 added keyboard navigation to the **Settings** section list and
1.13.5 refined its `Tab` behaviour, but the items (`.vertical-tab-nav-item`)
remain plain `<div>`s. Verified on 1.13.5 (CDP against the live app): each item is
focusable (`tabindex="-1"`, moved via core's arrow-key handler), `Tab` from the
settings search box lands in the list, and the item's accessible **name** resolves
from its text — but its computed **role is `generic`**. A screen-reader user hears
the label with no indication that it is a selectable section control.

**Expected:** the items carry a control role that matches core's interaction model
— either native `<button>`s in a labelled list, or a proper APG `tab`/`tablist`
with the roving/`Tab`-exits-to-panel keyboard model to match the role.

**Plugin shim:** none, by design. Before 1.13.4 the plugin stamped `role="tab"`;
now that core owns the keyboard as a flat focusable list, stamping `tab` would be a
role/behaviour mismatch, so as of 0.6.8 the plugin defers entirely and leaves this
for core.

---

### Suggested submission order
Lead with **CORE-1**, **CORE-2**, **CORE-3** — these are the Level-A blockers that
make Obsidian unusable by keyboard/screen-reader users. CORE-4–7 follow as major
AA issues; CORE-8 is a small enabling feature request, and CORE-9 a minor AA
role gap surfaced once core added the keyboard nav.
