// APG tree keyboard interaction for Obsidian's side menus (file explorer,
// outline, bookmarks), using the **aria-activedescendant** model.
//
// Why activedescendant and not roving tabindex+.focus():
//   Obsidian renders tree rows as non-focusable <div>s and tracks the "current"
//   row with a CSS class (`has-focus`), never real DOM focus. Clicking a file
//   leaves document.activeElement on <body>. An earlier version put a roving
//   tabindex on each .tree-item wrapper and called .focus() — but because normal
//   use never moves real focus onto a row, ArrowUp/Down landed on <body>, bubbled
//   straight to document, and the keystroke fell through to the scroll container:
//   the tree "only scrolled". (See docs/audit/02 — DS-07, which recommends exactly
//   this model.)
//
// The model here:
//   - The tree container ([role="tree"]) is the single tab stop (tabindex=0) and
//     the focus owner. It carries aria-activedescendant pointing at the "current"
//     treeitem; rows themselves are never tab stops.
//   - Arrow/Home/End/Enter/Space are handled on the container. We preventDefault
//     (kill scroll) AND stopPropagation (suppress Obsidian's own scope arrow-nav,
//     so the two models never double-move).
//   - A visible cursor (.a11y-tree-active on the row) is shown only while the tree
//     has focus, so keyboard users see where they are — distinct from selection.
//   - Clicking a row syncs the cursor there so keyboarding resumes from the click.
//
//   ArrowUp/ArrowDown  move between visible items
//   ArrowRight         expand a collapsed folder, else step into first child
//   ArrowLeft          collapse an expanded folder, else move to parent
//   Home/End           first / last visible item
//   Enter              activate immediately (open file / toggle folder)
//   Space              activate on key-up, cancellable by moving focus first

import { Platform } from "obsidian";
import { ensureId, isVisible, removeAttr, setAttr } from "../dom";

const TREEITEM = '[role="treeitem"]';
const ACTIVE_CLASS = "a11y-tree-active";

// Stash the bound handlers on the element so a plugin reload (disable→enable,
// e.g. after an update) replaces them instead of leaving the previous version's
// listeners attached. The dataset `once` flag survives across reloads on the
// persistent DOM node, so it cannot be used to re-arm these listeners.
interface TreeHandlers {
  keydown: (e: KeyboardEvent) => void;
  keyup: (e: KeyboardEvent) => void;
  click: (e: MouseEvent) => void;
  focusin: () => void;
  focusout: () => void;
}

interface KbdTreeEl extends HTMLElement {
  _a11yTreeKbd?: TreeHandlers;
}

/**
 * Remove the tree-keyboard listeners from a single element, if any. Exported so
 * structure.ts can strip them when a pane that was once treated as a tree is
 * demoted to a flat list (e.g. after a reload changed which views qualify).
 */
export function detachTreeKeyboard(el: HTMLElement): void {
  const node = el as KbdTreeEl;
  const h = node._a11yTreeKbd;
  if (!h) return;
  node.removeEventListener("keydown", h.keydown);
  node.removeEventListener("keyup", h.keyup);
  node.removeEventListener("click", h.click);
  node.removeEventListener("focusin", h.focusin);
  node.removeEventListener("focusout", h.focusout);
  delete node._a11yTreeKbd;
}

/** Remove every tree-keyboard listener in a document (called on plugin unload). */
export function uninstallTreeKeyboard(doc: Document): void {
  doc.querySelectorAll<HTMLElement>('[role="tree"]').forEach(detachTreeKeyboard);
}

function visibleItems(tree: Element): HTMLElement[] {
  return Array.from(tree.querySelectorAll<HTMLElement>(TREEITEM)).filter(isVisible);
}

function rowOf(item: HTMLElement): HTMLElement | null {
  return item.querySelector<HTMLElement>(":scope > .tree-item-self");
}

function isFolder(item: HTMLElement): boolean {
  return item.hasAttribute("aria-expanded");
}

function isExpanded(item: HTMLElement): boolean {
  return item.getAttribute("aria-expanded") === "true";
}

function activate(item: HTMLElement): void {
  rowOf(item)?.click();
}

function parentItem(item: HTMLElement, tree: Element): HTMLElement | null {
  let p: HTMLElement | null = item.parentElement;
  while (p && p !== tree) {
    if (p.matches(TREEITEM)) return p;
    p = p.parentElement;
  }
  return null;
}

/**
 * Accessible name for the whole tree, from the enclosing view's data-type.
 * Only genuinely hierarchical views reach here (see HIERARCHICAL_VIEWS in
 * structure.ts); flat panes such as search, backlinks, and tags are exposed as
 * lists, never trees, so they are intentionally absent from this switch.
 */
function labelForTree(tree: Element): string {
  const type = tree.closest(".workspace-leaf-content")?.getAttribute("data-type");
  switch (type) {
    case "file-explorer":
      return "Files";
    case "outline":
      return "Outline";
    case "bookmarks":
      return "Bookmarks";
    default:
      return "Navigation";
  }
}

/** The current activedescendant element, if it still exists and is visible. */
function currentActive(tree: HTMLElement): HTMLElement | null {
  const id = tree.getAttribute("aria-activedescendant");
  if (!id) return null;
  const el = tree.ownerDocument.getElementById(id);
  return el && tree.contains(el) && isVisible(el) ? (el as HTMLElement) : null;
}

/**
 * Point aria-activedescendant at `item`, move the visible cursor to its row, and
 * make selection follow focus (APG single-select tree): the active row is the
 * one that carries aria-selected="true".
 */
function setActive(tree: HTMLElement, item: HTMLElement): void {
  setAttr(tree, "aria-activedescendant", ensureId(item, "a11y-tree"));
  const row = rowOf(item);
  tree.querySelectorAll<HTMLElement>(TREEITEM).forEach((t) => {
    setAttr(t, "aria-selected", String(t === item));
    const r = rowOf(t);
    if (r && r !== row) r.classList.remove(ACTIVE_CLASS);
  });
  row?.classList.add(ACTIVE_CLASS);
}

/** The open file's row, if any — Obsidian marks it is-active / has-focus. */
function openItem(tree: HTMLElement): HTMLElement | null {
  const row = tree.querySelector<HTMLElement>(
    ":scope .tree-item-self.is-active, :scope .tree-item-self.has-focus",
  );
  return (row?.closest(TREEITEM) as HTMLElement | null) ?? null;
}

/**
 * Ensure aria-activedescendant references a real, visible row. Rows recycle
 * (InfinityScroll virtualization), so the prior target can vanish; fall back to
 * the open file, then the first visible row. Idempotent.
 */
function syncActive(tree: HTMLElement): HTMLElement | null {
  let cur = currentActive(tree);
  if (!cur) {
    const open = openItem(tree);
    cur = (open && isVisible(open) ? open : null) ?? visibleItems(tree)[0] ?? null;
  }
  if (cur) setActive(tree, cur);
  else removeAttr(tree, "aria-activedescendant");
  return cur;
}

function move(tree: HTMLElement, target: HTMLElement | null | undefined): void {
  if (!target) return;
  setActive(tree, target);
  target.scrollIntoView({ block: "nearest" });
}

export function installTreeKeyboard(tree: HTMLElement, mobileSupportActive = false): void {
  if (Platform.isMobile && mobileSupportActive) {
    if (!tree.hasAttribute("aria-label")) setAttr(tree, "aria-label", labelForTree(tree));
    tree
      .querySelectorAll<HTMLElement>(TREEITEM)
      .forEach((t) => removeAttr(t, "tabindex"));
    detachTreeKeyboard(tree as KbdTreeEl);
    return;
  }

  // The container owns focus; rows are never tab stops in this model.
  setAttr(tree, "tabindex", "0");
  if (!tree.hasAttribute("aria-label")) setAttr(tree, "aria-label", labelForTree(tree));
  tree
    .querySelectorAll<HTMLElement>(TREEITEM)
    .forEach((t) => removeAttr(t, "tabindex")); // clear any stale roving stops
  // Only re-resolve the cursor when it has gone stale (a recycled/removed row).
  // currentActive is cheap; syncActive walks the tree, so skip it when valid.
  if (!currentActive(tree)) syncActive(tree);

  // Replace any handlers from a previous plugin load before binding fresh ones.
  const el = tree as KbdTreeEl;
  detachTreeKeyboard(el);
  
  let spaceArmed: HTMLElement | null = null;


  const onKeydown = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement;
    // Don't hijack typing (inline rename input, search filter, etc.).
    if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;

    // Any non-Space key cancels a pending Space activation (prevents double-fire).
    if (e.key !== " " && e.key !== "Spacebar") spaceArmed = null;

    const list = visibleItems(tree);
    if (!list.length) return;
    const cur = currentActive(tree) ?? syncActive(tree);
    const i = cur ? list.indexOf(cur) : -1;

    // Everything we handle suppresses the default scroll AND stops the event from
    // reaching Obsidian's document-level scope nav, so the models never collide.
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        e.stopPropagation();
        move(tree, i < 0 ? list[0] : list[Math.min(i + 1, list.length - 1)]);
        break;
      case "ArrowUp":
        e.preventDefault();
        e.stopPropagation();
        move(tree, i < 0 ? list[0] : list[Math.max(i - 1, 0)]);
        break;
      case "Home":
        e.preventDefault();
        e.stopPropagation();
        move(tree, list[0]);
        break;
      case "End":
        e.preventDefault();
        e.stopPropagation();
        move(tree, list[list.length - 1]);
        break;
      case "ArrowRight":
        e.preventDefault();
        e.stopPropagation();
        if (cur && isFolder(cur)) {
          if (!isExpanded(cur)) {
            activate(cur); // expand in place
          } else {
            const child = cur.querySelector<HTMLElement>(
              `:scope > .tree-item-children > ${TREEITEM}`,
            );
            if (child && isVisible(child)) move(tree, child);
          }
        }
        break;
      case "ArrowLeft":
        e.preventDefault();
        e.stopPropagation();
        if (cur && isFolder(cur) && isExpanded(cur)) {
          activate(cur); // collapse in place
        } else if (cur) {
          move(tree, parentItem(cur, tree));
        }
        break;
      case "Enter":
        e.preventDefault();
        e.stopPropagation();
        if (cur) activate(cur); // immediate
        break;
      case " ":
      case "Spacebar":
        e.preventDefault(); // suppress scroll; activate on key-up
        e.stopPropagation();
        spaceArmed = cur;
        break;
      default:
        break;
    }
  };

  const onKeyup = (e: KeyboardEvent): void => {
    if (e.key !== " " && e.key !== "Spacebar") return;
    if (spaceArmed && spaceArmed === currentActive(tree)) {
      e.preventDefault();
      activate(spaceArmed); // committed activation
    }
    spaceArmed = null;
  };

  // A pointer click on a row syncs the cursor there (keyboarding resumes from the
  // click) without stealing focus — Obsidian still handles opening the file.
  const onClick = (e: MouseEvent): void => {
    const item = (e.target as HTMLElement)?.closest?.(TREEITEM) as HTMLElement | null;
    if (item && tree.contains(item)) setActive(tree, item);
  };

  // Gaining focus guarantees a visible cursor: without an active descendant the
  // focused container would have no focus indicator at all (SC 2.4.7).
  const onFocusin = (): void => {
    if (!currentActive(tree)) syncActive(tree);
  };

  // Moving focus away cancels a pending Space activation.
  const onFocusout = (): void => {
    spaceArmed = null;
  };

  el.addEventListener("keydown", onKeydown);
  el.addEventListener("keyup", onKeyup);
  el.addEventListener("click", onClick);
  el.addEventListener("focusin", onFocusin);
  el.addEventListener("focusout", onFocusout);
  el._a11yTreeKbd = {
    keydown: onKeydown,
    keyup: onKeyup,
    click: onClick,
    focusin: onFocusin,
    focusout: onFocusout,
  };
}
