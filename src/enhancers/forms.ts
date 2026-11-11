// Audit 04 — Setting controls: associate the visible name/description with the
// control, expose toggle state, and label the search clear button. Names are
// <div>s and the real checkbox is hidden, so we associate via aria-labelledby
// (not <label for>).

import {
  ensureId,
  hideFromAT,
  makeActivatable,
  removeAttr,
  setAttr,
  setRoleIfAbsent,
  visibleText,
} from "../dom";

const CONTROL_SELECTOR =
  'input, select, textarea, .checkbox-container, .dropdown, .slider, [role="button"]';

/** Marks a toggle checkbox that the plugin, not core, took out of the tab order. */
const PLUGIN_UNFOCUSED = "a11yPluginUnfocused";

/**
 * Toggle switch: a `label.checkbox-container` wrapping a checkbox. Newer core
 * (seen in 1.15.1) handles Space/Enter on the label and sets the checkbox to
 * tabindex -1; older core (1.12.7) left the checkbox as the keyboard control.
 * The plugin exposes the label as the one switch either way, so it supplies
 * Space/Enter only when core doesn't.
 */
export function enhanceToggle(container: HTMLElement): void {
  const input = container.querySelector<HTMLElement>('input[type="checkbox"]');
  const coreOwnsKeys =
    !!input && input.getAttribute("tabindex") === "-1" && !input.dataset[PLUGIN_UNFOCUSED];
  if (input) {
    hideFromAT(input);
    if (input.getAttribute("tabindex") !== "-1") {
      input.dataset[PLUGIN_UNFOCUSED] = "1";
      setAttr(input, "tabindex", "-1");
    }
  }
  setRoleIfAbsent(container, "switch");
  setAttr(container, "aria-checked", String(container.classList.contains("is-enabled")));
  // Core marks a disabled toggle only with a class (and ignores clicks on it).
  if (container.classList.contains("is-disabled")) setAttr(container, "aria-disabled", "true");
  else removeAttr(container, "aria-disabled");
  makeActivatable(container, coreOwnsKeys ? {} : { ownKeys: true });
}

export function enhanceForms(doc: Document): void {
  if (!doc.body) return;
  doc.querySelectorAll<HTMLElement>(".setting-item").forEach((item) => {
    const nameEl = item.querySelector<HTMLElement>(".setting-item-name");
    const descEl = item.querySelector<HTMLElement>(".setting-item-description");
    const controlWrap = item.querySelector<HTMLElement>(".setting-item-control");

    // Headings: expose as real headings.
    if (item.classList.contains("setting-item-heading") && nameEl) {
      setRoleIfAbsent(nameEl, "heading");
      setAttr(nameEl, "aria-level", "3");
      return;
    }

    const name = nameEl ? visibleText(nameEl) : "";
    const nameId = nameEl && name ? ensureId(nameEl) : "";
    const descId = descEl && visibleText(descEl) ? ensureId(descEl) : "";

    const controls = controlWrap
      ? Array.from(controlWrap.querySelectorAll<HTMLElement>(CONTROL_SELECTOR))
      : [];

    controls.forEach((control) => {
      // The checkbox inside a toggle is handled with its switch (enhanceToggle).
      if (control.closest(".checkbox-container") && !control.classList.contains("checkbox-container")) {
        return;
      }

      const label = nameId || name;
      if (label && !control.hasAttribute("aria-label") && !control.hasAttribute("aria-labelledby")) {
        if (nameId) setAttr(control, "aria-labelledby", nameId);
      }
      if (descId && !control.hasAttribute("aria-describedby")) {
        setAttr(control, "aria-describedby", descId);
      }

      // Toggle switch: expose state + keyboard operability + guaranteed name.
      if (control.classList.contains("checkbox-container")) {
        enhanceToggle(control);
        if (!nameId && name && !control.hasAttribute("aria-label")) {
          setAttr(control, "aria-label", name);
        }
      }
    });
  });

  // Search clear buttons are unlabeled, non-focusable divs.
  doc.querySelectorAll<HTMLElement>(".search-input-clear-button").forEach((btn) => {
    makeActivatable(btn, { role: "button" });
    if (!btn.getAttribute("aria-label")) setAttr(btn, "aria-label", "Clear search");
  });
}
