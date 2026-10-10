# Obsidian 1.14 compatibility review

Reviewed on October 9, 2026 against the [official changelog](https://obsidian.md/changelog/), including the October 5 public desktop/mobile 1.14 release and the 1.14.4 fixes included in it.

Version 0.6.9 keeps the 1.4.0 minimum version and existing feature settings. It hardens the accessibility shims around changes to native keyboard navigation, RTL workspaces, editor suggestions, and modal focus:

- Native controls and controls with an existing tabindex keep their keyboard activation. Plugin shims ignore nested controls, consumed keys, modifiers, IME input, and repeated activation keys. Space commits on release and remains cancellable.
- Plugin-owned tab and tree horizontal arrows follow computed RTL direction. Tab arrows defer to existing core focusable tabs; tree keys run only when the tree container owns focus.
- Mobile drawer visibility uses viewport intersection rather than assuming that a named drawer appears on a particular side.
- Modal enhancement preserves focus already placed inside by core (for example a prompt or Bases view-name field).
- Editor Escape waits until native handlers finish, yielding to consumed events, tooltips, suggestions, and Vim mode. Its listener is removed on unload and can be installed again after a reload.
- Settings navigation already defers to core on Obsidian 1.13.4 and later; this remains in place.

The plugin does not replace math rendering, Bases layouts, Markdown parsing, or font-size storage, so no implementation changes were needed for those changelog items. Reading-default remains an explicit plugin setting.

## Verification

Run `npm test` and `npm run build`. Regression tests bundle real source modules with a stub for the Obsidian API and small DOM fixtures; they are behavioral unit tests, not a running Obsidian integration test.

Before release/merge, verify in actual Obsidian 1.14 on desktop and mobile: native Settings navigation/search; tab close buttons; RTL tab/tree arrows; filtered trees; prompt and Bases view-name focus; highlight/link suggestion Escape; plugin disable/re-enable; popout windows; keyboard, screen reader, and dictation/voice-control Label in Name checks. Automated browser inspection was unavailable because Chrome is not configured on the tool host. Full live compatibility is not yet verified.
