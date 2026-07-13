// Small idempotent DOM helpers. Every enhancer is run repeatedly by the
// MutationObserver, so each helper must be safe to call many times on the same
// node and must be cheap when there is nothing to change.

// Per-load random suffix so ids from a previous plugin load can't collide with
// freshly minted ones after a hot reload (which resets the counter).
const SESSION = Math.random().toString(36).slice(2, 7);
let idSeq = 0;

/** Ensure the element has an id; return it. */
export function ensureId(el: Element, prefix = "a11y"): string {
  if (!el.id) el.id = `${prefix}-${SESSION}-${++idSeq}`;
  return el.id;
}

/** Set an attribute only when its value would change (avoids needless mutations). */
export function setAttr(el: Element, name: string, value: string): void {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

/** Remove an attribute only if present. */
export function removeAttr(el: Element, name: string): void {
  if (el.hasAttribute(name)) el.removeAttribute(name);
}

/** Set role only if the element does not already declare one. */
export function setRoleIfAbsent(el: Element, role: string): void {
  if (!el.hasAttribute("role")) el.setAttribute("role", role);
}

/** Run `fn` once per element for the given key (tracked via a data attribute). */
export function once(el: HTMLElement, key: string): boolean {
  const flag = `a11yOnce${key}`;
  if (el.dataset[flag]) return false;
  el.dataset[flag] = "1";
  return true;
}

interface ActivatableOptions {
  role?: string;
  /** Explicit tabindex (use -1/0 for roving). Defaults to 0 if unset and missing. */
  tabindex?: number;
}

/**
 * Make a non-native control keyboard operable: assigns a role, makes it
 * focusable, and activates it on Enter (keydown) and Space (keyup, so the user
 * can cancel by moving focus before release — SC 2.5.2 parity).
 * The click handler Obsidian already attached does the real work.
 */
export function makeActivatable(el: HTMLElement, opts: ActivatableOptions = {}): void {
  if (opts.role) setRoleIfAbsent(el, opts.role);

  // tabindex is set on every pass (cheaply, via setAttr) so roving state stays
  // correct as the active element changes.
  if (typeof opts.tabindex === "number") {
    setAttr(el, "tabindex", String(opts.tabindex));
  } else if (!el.hasAttribute("tabindex")) {
    setAttr(el, "tabindex", "0");
  }

  if (!once(el, "Kbd")) return;

  let spaceArmed = false;
  el.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      el.click();
    } else if (e.key === " " || e.key === "Spacebar") {
      // Prevent page scroll; defer activation to keyup (so it can be cancelled).
      e.preventDefault();
      spaceArmed = true;
    }
  });
  el.addEventListener("keyup", (e: KeyboardEvent) => {
    if ((e.key === " " || e.key === "Spacebar") && spaceArmed) {
      e.preventDefault();
      spaceArmed = false;
      el.click();
    }
  });
  el.addEventListener("blur", () => {
    spaceArmed = false;
  });
}

/** Hide a decorative element from assistive tech. */
export function hideFromAT(el: Element | null): void {
  if (el) setAttr(el, "aria-hidden", "true");
}

/** Best-effort accessible name from an element's visible text. */
export function visibleText(el: Element | null): string {
  return (el?.textContent ?? "").trim();
}

/** Whether an element is currently rendered (handles position:fixed). */
export function isVisible(el: HTMLElement): boolean {
  return el.getClientRects().length > 0;
}

/** Detect if a mobile side drawer is visually open by measuring its bounding rect. */
export function isDrawerOpen(drawer: HTMLElement): boolean {
  const rect = drawer.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  
  const isLeft = drawer.classList.contains("mod-left");
  if (isLeft) {
    return rect.right > 10;
  } else {
    const win = drawer.ownerDocument.defaultView ?? window;
    return rect.left < win.innerWidth - 10;
  }
}
