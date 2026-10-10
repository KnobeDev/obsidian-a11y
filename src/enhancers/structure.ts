// Audit 02 — document structure: workspace tabs (tablist/tab) and the file /
// outline trees (tree/treeitem/group). State is otherwise class-only.

import { Platform } from "obsidian";
import {
  hideFromAT,
  makeActivatable,
  once,
  removeAttr,
  setAttr,
  setRoleIfAbsent,
  visibleText,
} from "../dom";
import { detachTreeKeyboard, installTreeKeyboard } from "./tree-keyboard";

// Obsidian reuses .tree-item markup for panes that are NOT hierarchical trees —
// the Search results pane, Backlinks / Outgoing links, and the Tag pane all
// render flat result rows with the same classes. Exposing those as role="tree"
// (with tree keyboard semantics) misrepresents structure (WCAG 1.3.1) and forces
// the wrong interaction model. Only the views below are genuinely hierarchical;
// everything else gets a plain list. Keyed on the enclosing view's data-type.
const HIERARCHICAL_VIEWS = new Set(["file-explorer", "outline", "bookmarks"]);

/** data-type of the workspace view enclosing `el`, or null. */
function viewType(el: Element): string | null {
  return el.closest(".workspace-leaf-content")?.getAttribute("data-type") ?? null;
}

/** Whether `el` lives in a view that should use tree (vs flat list) semantics. */
function isHierarchicalView(el: Element): boolean {
  const type = viewType(el);
  // Unknown views default to flat: a misapplied list is far less disruptive than
  // a misapplied tree (which would also wire up tree keyboard navigation).
  return type !== null && HIERARCHICAL_VIEWS.has(type);
}

function enhanceTabs(doc: Document, mobileSupportActive = false): void {
  doc
    .querySelectorAll<HTMLElement>(".workspace-tab-header-container")
    .forEach((container) => setRoleIfAbsent(container, "tablist"));

  doc.querySelectorAll<HTMLElement>(".workspace-tab-header").forEach((tab) => {
    const active =
      tab.classList.contains("is-active") || tab.classList.contains("mod-active");
    // On mobile, keep all tabs focusable so they are not skipped by screen reader swipes.
    const isMobile = mobileSupportActive && Platform.isMobile;
    const tabindex = isMobile ? 0 : (active ? 0 : -1);
    const coreKeyboard = tab.hasAttribute("tabindex") && !tab.dataset.a11yOnceKbd;
    makeActivatable(tab, { role: "tab", tabindex });
    setAttr(tab, "aria-selected", String(active));

    const title = visibleText(tab.querySelector(".workspace-tab-header-inner-title"));
    if (title && !tab.hasAttribute("aria-label")) setAttr(tab, "aria-label", title);

    // Roving arrow navigation. Manual activation: arrows move focus only; the
    // user presses Enter/Space (via makeActivatable) to actually switch tabs, so
    // arrowing past a tab never triggers a document load. Only register on desktop.
    if (!isMobile && !coreKeyboard && once(tab, "TabArrows")) {
      tab.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.target !== tab || e.defaultPrevented || e.isComposing ||
            e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        const group = Array.from(
          tab.parentElement?.querySelectorAll<HTMLElement>(".workspace-tab-header") ?? [],
        );
        const i = group.indexOf(tab);
        const rtl = tab.ownerDocument.defaultView?.getComputedStyle(tab).direction === "rtl";
        const next =
          (e.key === "ArrowRight") !== rtl
            ? group[i + 1] ?? group[0]
            : group[i - 1] ?? group[group.length - 1];
        if (next) {
          e.preventDefault();
          next.focus();
        }
      });
    }
  });
}

/** Tree depth (1-based) by counting enclosing groups up to the tree root. */
function levelOf(item: Element): number {
  let level = 1;
  let p: Element | null = item.parentElement;
  while (p) {
    if (p.classList.contains("tree-item-children")) level++;
    p = p.parentElement;
  }
  return level;
}

/** Resolve an item's accessible name from its row text, then a vault path. */
function itemName(self: HTMLElement | null): string {
  let name = visibleText(self?.querySelector(".tree-item-inner") ?? null);
  if (!name && self) {
    const path = self.getAttribute("data-path");
    if (path) name = path.split("/").pop() || path;
  }
  return name;
}

/** Whether a .tree-item is a collapsible folder (has children / nav-folder / mod-collapsible). */
function isCollapsible(item: HTMLElement, self: HTMLElement | null): boolean {
  return (
    !!item.querySelector(":scope > .tree-item-children") ||
    item.classList.contains("nav-folder") ||
    !!self?.classList.contains("mod-collapsible")
  );
}

/**
 * Mobile/TalkBack variant. Touch screen readers navigate by swiping real DOM
 * nodes, not by the desktop aria-activedescendant model, and they will not swipe
 * into the descendants of a node that carries its own accessible name. Because
 * role=treeitem on the WRAPPER means the labeled node also CONTAINS the child
 * group, TalkBack lands on a folder and skips straight past its contents.
 *
 * So on mobile the treeitem semantics live on the ROW (.tree-item-self), which is
 * a leaf — it does not contain the group — and the wrapper is demoted to
 * role=none so it neither doubles as a treeitem nor hides the subtree behind its
 * name. Hierarchy is carried by aria-level (structural ownership is intentionally
 * pragmatic rather than spec-pure; the desktop path keeps the strict tree).
 */
function enhanceTreeItemMobile(item: HTMLElement): void {
  const self = item.querySelector<HTMLElement>(":scope > .tree-item-self");
  const children = item.querySelector<HTMLElement>(":scope > .tree-item-children");
  const collapsible = isCollapsible(item, self);

  if (self) {
    setRoleIfAbsent(self, "treeitem");
    setAttr(self, "aria-level", String(levelOf(item)));
    setAttr(self, "tabindex", "0"); // an explicit swipe stop for TalkBack
    if (collapsible) {
      setAttr(self, "aria-expanded", String(!item.classList.contains("is-collapsed")));
    } else {
      removeAttr(self, "aria-expanded");
    }
    // The open file is the selected row, so TalkBack announces which one it is.
    setAttr(
      self,
      "aria-selected",
      String(self.classList.contains("is-active") || self.classList.contains("has-focus")),
    );
    const name = itemName(self);
    if (name) setAttr(self, "aria-label", name);
    else if (!self.hasAttribute("aria-label")) {
      setAttr(self, "aria-label", collapsible ? "Folder" : "Item");
    }
    hideFromAT(self.querySelector(".tree-item-icon") ?? null);
  }

  // Demote the wrapper: it must not present as a second treeitem or swallow the
  // subtree behind its own name. Its children (the row + the nested group) are
  // promoted to the tree. setAttr (not setRoleIfAbsent) so a stale role=treeitem
  // from a prior desktop pass is actively corrected.
  setAttr(item, "role", "none");
  removeAttr(item, "aria-label");
  removeAttr(item, "aria-level");
  removeAttr(item, "aria-expanded");
  removeAttr(item, "aria-selected");

  if (children) setRoleIfAbsent(children, "group");

  const parent = item.parentElement;
  if (
    parent &&
    !parent.classList.contains("tree-item-children") &&
    !parent.hasAttribute("role")
  ) {
    setAttr(parent, "role", "tree");
    setAttr(parent, "aria-multiselectable", "false");
  }
}

/** Strip mobile row-level treeitem residue so the desktop model can reassert cleanly. */
function clearMobileTreeResidue(item: HTMLElement): void {
  const self = item.querySelector<HTMLElement>(":scope > .tree-item-self");
  if (self && self.getAttribute("role") === "treeitem") {
    removeAttr(self, "role");
    removeAttr(self, "tabindex");
    removeAttr(self, "aria-level");
    removeAttr(self, "aria-expanded");
    removeAttr(self, "aria-selected");
    removeAttr(self, "aria-label");
  }
  // A wrapper demoted to role=none on mobile must lose that role before the
  // desktop pass can set role=treeitem on it (setRoleIfAbsent won't overwrite).
  if (item.getAttribute("role") === "none") removeAttr(item, "role");
}

/** Tag a genuinely hierarchical .tree-item as treeitem/group + tree root. */
function enhanceTreeItem(item: HTMLElement, mobile = false): void {
  if (mobile) {
    enhanceTreeItemMobile(item);
    return;
  }
  clearMobileTreeResidue(item);
  // The role goes on the WRAPPER so the tree → treeitem → group ownership
  // chain validates (the wrapper is a direct child of the tree root or of a
  // parent's group; its own .tree-item-children is the nested group).
  setRoleIfAbsent(item, "treeitem");
  setAttr(item, "aria-level", String(levelOf(item)));

  const self = item.querySelector<HTMLElement>(":scope > .tree-item-self");

  // aria-selected is owned by tree-keyboard.ts, which makes selection follow the
  // keyboard cursor (APG single-select). Setting it here too would fight that on
  // every sweep, so the selection state is intentionally not touched here.

  const children = item.querySelector<HTMLElement>(":scope > .tree-item-children");
  const collapsible =
    !!children ||
    item.classList.contains("nav-folder") ||
    !!self?.classList.contains("mod-collapsible");
  if (collapsible) {
    setAttr(item, "aria-expanded", String(!item.classList.contains("is-collapsed")));
  }

  // Always give the treeitem an explicit name. Because role=treeitem sits on
  // the wrapper (which contains the child group), an empty name would make a
  // screen reader fall back to reading the entire subtree. Prefer the row
  // text, then the vault path's basename, then a generic last resort.
  const name = itemName(self);
  if (name) {
    // Keep the real name in sync (handles late render + rename). setAttr is
    // idempotent, so this doesn't churn once the name is stable.
    setAttr(item, "aria-label", name);
  } else if (!item.hasAttribute("aria-label")) {
    // Last resort only — never clobber a real name resolved on a later sweep.
    setAttr(item, "aria-label", collapsible ? "Folder" : "Item");
  }

  // Collapse triangle is decorative once state is on aria-expanded.
  hideFromAT(self?.querySelector(".tree-item-icon") ?? null);

  if (children) setRoleIfAbsent(children, "group");

  // Root container: a .tree-item whose parent is not itself a group marks the
  // top of a tree. Tag that parent as the tree root.
  const parent = item.parentElement;
  if (
    parent &&
    !parent.classList.contains("tree-item-children") &&
    !parent.hasAttribute("role")
  ) {
    setAttr(parent, "role", "tree");
    setAttr(parent, "aria-multiselectable", "false");
  }
}

/**
 * Expose a flat result row (search / backlinks / outgoing links / tags) as a
 * plain listitem instead of a treeitem. setAttr is used (not setRoleIfAbsent) so
 * a stale role="tree"/"treeitem"/"group" left by a prior plugin load is actively
 * corrected, and the tree keyboard residue (tabindex, aria-activedescendant, the
 * cursor class) is stripped so the pane is no longer a tab stop driving the wrong
 * keyboard model. Tree keyboard listeners are removed on unload before this runs.
 */
function enhanceFlatItem(item: HTMLElement): void {
  setAttr(item, "role", "listitem");
  removeAttr(item, "aria-level");
  removeAttr(item, "aria-expanded");
  removeAttr(item, "aria-selected");

  const self = item.querySelector<HTMLElement>(":scope > .tree-item-self");
  self?.classList.remove("a11y-tree-active");

  // A listitem reads its own content, so no explicit aria-label is forced here
  // (unlike treeitem, whose wrapper-contains-group shape needs one).
  const children = item.querySelector<HTMLElement>(":scope > .tree-item-children");
  if (children) setAttr(children, "role", "list");

  // Root container: the parent that is not itself a nested list.
  const parent = item.parentElement;
  if (parent && !parent.classList.contains("tree-item-children")) {
    makeFlatContainer(parent);
  }
}

/**
 * Turn a container into a flat list root and strip every trace of the tree
 * model: the tree role/label, the single-tab-stop wiring (tabindex,
 * aria-activedescendant, aria-multiselectable), and any bound tree keyboard
 * handlers. Idempotent — a no-op once the container is already a clean list.
 */
function makeFlatContainer(el: HTMLElement): void {
  setAttr(el, "role", "list");
  removeAttr(el, "aria-multiselectable");
  removeAttr(el, "aria-activedescendant");
  removeAttr(el, "tabindex");
  // The label only ever came from the tree model (labelForTree); drop it so a
  // demoted pane doesn't keep announcing a stale "Search results" tree name.
  removeAttr(el, "aria-label");
  detachTreeKeyboard(el);
}

function enhanceTrees(doc: Document, mobileSupportActive = false): void {
  const mobile = mobileSupportActive && Platform.isMobile;
  doc.querySelectorAll<HTMLElement>(".tree-item").forEach((item) => {
    if (isHierarchicalView(item)) enhanceTreeItem(item, mobile);
    else enhanceFlatItem(item);
  });

  // Reconcile every container still carrying a tree role. Genuine trees get the
  // keyboard model (idempotent; maintains roving). A flat view that still reads
  // as a tree — e.g. an empty Search pane left over from a prior load, which the
  // per-item pass above never reached — is demoted here so it is never re-armed
  // with tree semantics.
  doc.querySelectorAll<HTMLElement>('[role="tree"]').forEach((tree) => {
    if (isHierarchicalView(tree)) installTreeKeyboard(tree, mobileSupportActive);
    else makeFlatContainer(tree);
  });
}

export function enhanceStructure(doc: Document, mobileSupportActive = false): void {
  if (!doc.body) return;
  enhanceTabs(doc, mobileSupportActive);
  enhanceTrees(doc, mobileSupportActive);
}
