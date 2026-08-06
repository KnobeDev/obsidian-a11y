# Accessibility Enhancer for Obsidian

A community-maintained Obsidian plugin that retrofits **WCAG 2.1 Level AA**
accessibility onto Obsidian's interface **at runtime** — no wait for upstream.

Obsidian's UI is built almost entirely from `<div>`s with click handlers: little
ARIA, few native controls, and state carried only by CSS classes. The result is
largely unusable with a keyboard or a screen reader. This plugin patches the live
DOM as Obsidian renders it, adding roles, names, states, keyboard operability,
visible focus, reduced-motion support, and live-region announcements.

> Full findings: [`docs/AUDIT-SUMMARY.md`](docs/AUDIT-SUMMARY.md) and the
> per-surface reports in [`docs/audit/`](docs/audit/).

## Why a plugin (and why this repo is separate)

The fixes **must** run inside Obsidian: only an in-process renderer plugin can
patch the live DOM, hook the view lifecycle, and manage focus. An external tool
can't reach into the Electron window.

But the **codebase lives outside any vault**, as this standalone open-source repo,
so the community can read, fork, and improve it — and so it can ship through
GitHub Releases / [BRAT](https://github.com/TfTHacker/obsidian42-brat) and,
eventually, the Community Plugins store. The build output is what gets installed
into a vault; the source stays here.

## What it fixes

Each toggle in **Settings → Accessibility Enhancer** maps to an audited finding:

| Module | WCAG SC | What it does |
|---|---|---|
| Chrome & navigation | 2.1.1, 4.1.2 | Ribbon, sidebar toggles, status-bar items → operable buttons; sidebar open/closed state exposed |
| Tabs & file tree | 1.3.1, 4.1.2 | `tablist`/`tab` + roving arrows; `tree`/`treeitem`/`group` with `aria-expanded`/`-level`/`-selected` |
| Modals & palettes | 2.1.1, 2.4.3, 4.1.2 | `dialog` + focus trap/restore; settings-nav tablist semantics (keyboard deferred to core on Obsidian ≥ 1.13.4 — see [Obsidian version compatibility](#obsidian-version-compatibility)); combobox/listbox for the palette |
| Settings controls | 1.3.1, 4.1.2 | Names/descriptions associated; toggle exposes `role="switch"` + `aria-checked` |
| Visible focus ring | 2.4.7 | Restores a focus indicator the global `outline:none` removed |
| Announce notices | 4.1.3 | Mirrors toast notices into a polite live region |
| Announce editor line | 1.3.1 | Speaks the caret's line number as it moves (the line-number gutter is visual-only) |
| Honor reduced motion | 2.3.3 | Suppresses animations when the OS asks |
| Contrast boost (opt-in) | 1.4.3, 1.4.11 | Overrides default-theme tokens that fail contrast |

## Android / Mobile Support

The plugin includes mobile-specific accessibility retrofits that resolve major screen reader (TalkBack/VoiceOver) and touch exploration issues on Android and iOS:

1. **Explore-by-Touch Compatibility**: Clickable `<div>` controls in the mobile navbar, action drawers, and settings screens are assigned explicit interactive roles (e.g., `role="button"`) and `tabindex="0"`, making them discoverable by swipe gestures.
2. **Focus Containment (`aria-hidden`)**: Opening the left or right side drawer automatically applies `aria-hidden="true"` to background content (like the editor workspace and bottom navbar), containing TalkBack swipe focus within the active drawer.
3. **Common Icon Translation**: Dozens of mobile-only icons (Menu, Search, Plus, folder chevron toggles, edit state, reading mode, close button) are mapped to meaningful screen reader labels instead of being read out as a generic nameless "button".
4. **Desktop Navigation Bypass**: Roving tab index and keyboard arrow-key captures are automatically bypassed on mobile devices to prevent any interference with native screen reader swipe gestures.

## Architecture

```
src/
  main.ts          Plugin entry; per-window observers + body feature flags
  observer.ts      Debounced MutationObserver bound to one Document
  announcer.ts     Owns the aria-live region; mirrors Notices
  dom.ts           Idempotent helpers (setAttr, makeActivatable, …)
  settings.ts      Settings tab (one toggle per module)
  enhancers/
    chrome.ts      Audit 01
    structure.ts   Audit 02
    overlays.ts    Audit 03
    forms.ts       Audit 04
styles.css         Injected focus ring / reduced motion / contrast (audit 05)
```

The observer re-runs every enhancer on each DOM change. Enhancers are **idempotent**
— re-applying an attribute that already matches is a no-op — which is what makes
them safe against Obsidian's constant re-rendering (tab strip, Infinity-scroll file
tree, per-invocation modals).

## Install

### Via BRAT (recommended while in beta)

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) community plugin.
2. BRAT → **Add beta plugin** → `https://github.com/KnobeDev/obsidian-a11y`.
3. Enable **Accessibility Enhancer** under Settings → Community plugins.

BRAT pulls the latest GitHub release, so you get updates automatically.

### Manual

Download `main.js`, `manifest.json`, and `styles.css` from the
[latest release](https://github.com/KnobeDev/obsidian-a11y/releases/latest) into
`<vault>/.obsidian/plugins/a11y-enhancer/`, then enable the plugin.

## Develop

```bash
npm install
npm run dev          # watch build
npm run deploy       # production build + copy into a vault for testing
```

`npm run deploy` copies the build into `OBSIDIAN_PLUGIN_DIR` (set it to your
vault's plugin folder; defaults to a repo-local `test-vault/`). Then enable
**Accessibility Enhancer** under Settings → Community plugins and reload.

Releases are cut automatically: push a tag equal to the `manifest.json` version
(e.g. `git tag 0.1.0 && git push origin 0.1.0`) and the
[release workflow](.github/workflows/release.yml) builds and publishes the assets.

## Obsidian version compatibility

As Obsidian ships its own accessibility improvements, this plugin **backs off**
the shims that are no longer needed — running both would double up. The plugin
still supports `minAppVersion` 1.4.0, so older installs keep the full shim; newer
ones defer to core.

| Shim | Deferred to core as of | Why |
|---|---|---|
| **Settings section list** — the whole enhancement: keyboard nav (arrows / `Enter` / roving tab order) **and** the `tablist`/`tab` ARIA + tab↔panel wiring | **Obsidian 1.13.4** | 1.13.4 added native keyboard navigation to Settings (arrow keys to move, `Enter` to open a tab, `Ctrl/Cmd-F` to focus search, plus Vim bindings), and 1.13.5 made `Tab`/`Shift-Tab` move to the next focusable element there. Keeping the plugin's own key handler on top caused a **double focus jump** on every arrow press. And because core drives the list as a *flat focusable list* (Tab steps through every item) rather than an APG tablist (one tab stop, arrow-only, Tab exits to the panel), leaving the `role="tab"`/`tablist` semantics in place would be a **WCAG 4.1.2 role/behavior mismatch** — the role would promise interaction core doesn't provide. So on ≥ 1.13.4 the plugin stops enhancing the settings section list entirely and lets Obsidian own both the keyboard and the semantics. |

If you're on an older Obsidian build, the plugin transparently re-enables its full
settings-nav shim.

> **Verification note:** keyboard reachability of the settings section list on
> Obsidian ≥ 1.13.4 relies on core. This has been reconciled against the changelog
> but still needs a live keyboard-only + screen-reader (NVDA/VoiceOver) pass on a
> real 1.13.4 build to confirm the list stays reachable and correctly announced
> with the shim disabled.

## Limitations (and what we punt upstream)

A plugin can't fix everything. These are **core-only** and tracked as upstream
issues:

- The modal close button should be a native `<button>` (we patch a `role`/keyboard
  shim onto the existing `<div>`).
- Obsidian's focus containment blurs escapees instead of cycling; we add a real Tab
  trap on top.
- The hostile viewport meta (`maximum-scale=1.0, user-scalable=no`) limits mobile zoom.
- Some icon-only controls store their label in a private JS `WeakMap` with
  `aria-label=""`; we can make them operable but can't always recover the name.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). New surface fixes should land as a new
`enhancers/*.ts` module backed by an audit note, stay idempotent, and degrade
gracefully if a selector disappears in a future Obsidian release.

## License

MIT — see [LICENSE](LICENSE).
