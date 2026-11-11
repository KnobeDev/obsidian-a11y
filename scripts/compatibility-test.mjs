import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";

async function load(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, format: "esm", platform: "node", plugins: [{ name: "obsidian-stub", setup(b) {
    b.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
    // requireApiVersion compares against globalThis.__obsidianApiVersion (default: newer than any release).
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: `export const Platform = { isMobile: false };
      export const requireApiVersion = (want) => {
        const have = (globalThis.__obsidianApiVersion ?? "999.0.0").split(".").map(Number);
        const need = want.split(".").map(Number);
        for (let i = 0; i < 3; i++) if ((have[i] ?? 0) !== (need[i] ?? 0)) return (have[i] ?? 0) > (need[i] ?? 0);
        return true;
      };` }));
  } }] });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}

class ElementFake {
  constructor(tagName = "DIV") {
    this.tagName = tagName;
    this.dataset = {};
    this.attrs = new Map();
    this.listeners = new Map();
    this.classList = { contains: () => false, add() {}, remove() {} };
    this.clicks = 0;
    this.isConnected = true;
  }
  hasAttribute(name) { return this.attrs.has(name); }
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  setAttribute(name, value) { this.attrs.set(name, value); }
  removeAttribute(name) { this.attrs.delete(name); }
  matches(selector) {
    return (this.tagName === "BUTTON" && selector.includes("button")) ||
      (this.tagName === "INPUT" && selector.includes("input")) ||
      (this.tagName === "A" && this.hasAttribute("href") && selector.includes("a[href]"));
  }
  addEventListener(type, fn) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]); }
  removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) ?? []).filter((listener) => listener !== fn)); }
  click() { this.clicks++; }
  focus() { this.ownerDocument.activeElement = this; }
  fire(type, key, overrides = {}) {
    const event = { key, target: this, currentTarget: this, defaultPrevented: false, repeat: false, isComposing: false, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...overrides };
    for (const fn of this.listeners.get(type) ?? []) fn(event);
    return event;
  }
}

const { makeActivatable, isSidebarOpen } = await load("src/dom.ts");
const cases = [];
function test(name, fn) { cases.push([name, fn]); }

test("native controls keep native activation", () => {
  for (const tag of ["BUTTON", "INPUT", "A"]) {
    const el = new ElementFake(tag);
    if (tag === "A") el.setAttribute("href", "#note");
    makeActivatable(el, { role: "button" });
    assert.equal(el.listeners.size, 0, tag);
    assert.equal(el.hasAttribute("tabindex"), false, tag);
  }
});
test("non-native controls activate once, with cancellable Space", () => {
  const el = new ElementFake();
  makeActivatable(el);
  makeActivatable(el);
  el.fire("keydown", "Enter");
  assert.equal(el.clicks, 1);
  el.fire("keydown", " ");
  assert.equal(el.clicks, 1);
  el.fire("keyup", " ");
  assert.equal(el.clicks, 2);
  el.fire("keydown", " ");
  el.fire("blur", "");
  el.fire("keyup", " ");
  assert.equal(el.clicks, 2);
});
test("core focusable controls keep core keyboard ownership", () => {
  const el = new ElementFake();
  el.setAttribute("tabindex", "0");
  makeActivatable(el, { role: "button" });
  assert.equal(el.listeners.size, 0);
  assert.equal(el.getAttribute("tabindex"), "0");
});
test("held Space activates exactly once on release", () => {
  const el = new ElementFake();
  makeActivatable(el);
  el.fire("keydown", " ");
  for (let i = 0; i < 5; i++) el.fire("keydown", " ", { repeat: true });
  assert.equal(el.clicks, 0);
  el.fire("keyup", " ");
  el.fire("keyup", " ");
  assert.equal(el.clicks, 1);
});
test("nested, consumed, modified and composition events do not activate", () => {
  const el = new ElementFake();
  makeActivatable(el);
  for (const overrides of [{ target: new ElementFake("BUTTON") }, { defaultPrevented: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true }, { shiftKey: true }, { isComposing: true }, { repeat: true }]) {
    el.fire("keydown", "Enter", overrides);
    el.fire("keydown", " ", overrides);
    el.fire("keyup", " ", overrides);
  }
  assert.equal(el.clicks, 0);
});
test("modified or consumed Space release cancels pending activation", () => {
  const el = new ElementFake();
  makeActivatable(el);
  for (const overrides of [{ ctrlKey: true }, { defaultPrevented: true }]) {
    el.fire("keydown", " ");
    el.fire("keyup", " ", overrides);
    el.fire("keyup", " ");
  }
  assert.equal(el.clicks, 0);
});
// Core sets is-{left,right}-sidedock-open (visual side, RTL-aware) on .workspace for
// desktop sidedocks and mobile drawers alike — 1.12.7 through 1.15.1. Phones on
// 1.15.1 no longer slide the drawer itself, so its geometry can't signal "open".
function fakeWorkspace(...classes) {
  const workspace = new ElementFake();
  workspace.classList = { contains: (name) => classes.includes(name), add() {}, remove() {} };
  return workspace;
}
test("sidebar open state comes from core's .workspace classes, by visual side", () => {
  const doc = { querySelector: (s) => (s === ".workspace" ? fakeWorkspace("is-left-sidedock-open", "is-primary-sidedock-open") : null) };
  assert.equal(isSidebarOpen(doc, "left"), true);
  assert.equal(isSidebarOpen(doc, "right"), false);
  assert.equal(isSidebarOpen({ querySelector: () => null }, "left"), false, "before the workspace exists");
});
test("sidebar toggles report core's open state, which lives on .workspace, not body", async () => {
  const { enhanceChrome } = await load("src/enhancers/chrome.ts");
  const toggle = (side) => {
    const el = new ElementFake();
    el.classList = { contains: (name) => name === `mod-${side}` || name === "sidebar-toggle-button", add() {}, remove() {} };
    el.setAttribute("aria-label", `Toggle ${side} sidebar`);
    el.closest = () => null;
    el.querySelector = () => null;
    return el;
  };
  const left = toggle("left");
  const right = toggle("right");
  const body = new ElementFake("BODY"); // core never puts the sidedock classes here
  const workspace = fakeWorkspace("is-right-sidedock-open");
  const doc = {
    body,
    querySelector: (s) => (s === ".workspace" ? workspace : null),
    querySelectorAll: (s) => (s === ".sidebar-toggle-button" ? [left, right] : []),
  };
  enhanceChrome(doc);
  assert.equal(left.getAttribute("aria-expanded"), "false");
  assert.equal(right.getAttribute("aria-expanded"), "true");
});

// Obsidian 1.15.1 handles Space/Enter on the toggle's <label> and takes the inner
// checkbox out of the tab order (tabindex -1). 1.12.7 left the checkbox focusable
// (tabindex 0) as the keyboard control and gave the label no key handling.
function fakeToggle(innerTabindex) {
  const label = new ElementFake("LABEL");
  label.classList = { contains: (name) => name === "checkbox-container", add() {}, remove() {} };
  label.setAttribute("tabindex", "0");
  const input = new ElementFake("INPUT");
  input.setAttribute("type", "checkbox");
  input.setAttribute("tabindex", innerTabindex);
  label.querySelector = (s) => (s.includes("input") ? input : null);
  return { label, input };
}
test("toggle keys stay with core once core takes the checkbox out of the tab order", async () => {
  const { enhanceToggle } = await load("src/enhancers/forms.ts");
  const { label, input } = fakeToggle("-1");
  enhanceToggle(label);
  enhanceToggle(label);
  assert.equal(label.getAttribute("role"), "switch");
  assert.equal(label.getAttribute("aria-checked"), "false");
  assert.equal(input.getAttribute("aria-hidden"), "true");
  assert.equal(label.listeners.size, 0, "no plugin key handlers on top of core's");
  assert.equal(label.hasAttribute("aria-disabled"), false);
  label.classList.contains = (name) => name === "checkbox-container" || name === "is-disabled";
  enhanceToggle(label);
  assert.equal(label.getAttribute("aria-disabled"), "true", "core's is-disabled is exposed");
  label.classList.contains = (name) => name === "checkbox-container";
  enhanceToggle(label);
  assert.equal(label.hasAttribute("aria-disabled"), false);
});
test("toggle keys come from the plugin on builds where only the checkbox was keyboard-operable", async () => {
  const { enhanceToggle } = await load("src/enhancers/forms.ts");
  const { label, input } = fakeToggle("0");
  enhanceToggle(label);
  enhanceToggle(label); // a later sweep sees tabindex -1, but the plugin set it, not core
  assert.equal(input.getAttribute("tabindex"), "-1", "one tab stop: the switch");
  label.fire("keydown", "Enter");
  label.fire("keydown", " ");
  label.fire("keyup", " ");
  assert.equal(label.clicks, 2);
});
test("settings section list defers to core keyboard navigation from 1.13.0", async () => {
  const { enhanceOverlays } = await load("src/enhancers/overlays.ts");
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  const roleOn = (version) => {
    globalThis.__obsidianApiVersion = version;
    const header = new ElementFake();
    header.querySelector = () => null;
    header.querySelectorAll = () => [];
    const doc = { body: {}, querySelectorAll: (s) => (s === ".vertical-tab-header" ? [header] : []) };
    header.ownerDocument = doc;
    enhanceOverlays(doc);
    return header.getAttribute("role");
  };
  try {
    assert.equal(roleOn("1.13.0"), null, "1.13.0 Catalyst shipped core keyboard nav");
    assert.equal(roleOn("1.15.1"), null);
    assert.equal(roleOn("1.12.7"), "tablist", "older builds keep the shim");
  } finally {
    delete globalThis.__obsidianApiVersion;
  }
});
test("modal enhancement preserves core initial focus", async () => {
  const { enhanceOverlays } = await load("src/enhancers/overlays.ts");
  const container = new ElementFake();
  const input = new ElementFake("INPUT");
  const first = new ElementFake("BUTTON");
  const doc = { body: {}, activeElement: input, defaultView: { setTimeout: () => 1, clearTimeout() {} }, querySelectorAll: (selector) => selector === ".modal-container" ? [container] : [] };
  container.ownerDocument = input.ownerDocument = first.ownerDocument = doc;
  container.contains = (el) => el === input || el === first;
  container.querySelector = () => null;
  container.querySelectorAll = () => [first, input];
  first.getClientRects = input.getClientRects = () => [{}];
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  enhanceOverlays(doc);
  assert.equal(doc.activeElement, input);
});
test("Escape lets editor handlers consume the key before exiting and supports reinstall", async () => {
  const { installEscapeEditable } = await load("src/escape-editable.ts");
  const doc = new ElementFake();
  const content = new ElementFake();
  const target = new ElementFake("BUTTON");
  const editor = new ElementFake();
  let tooltip = false;
  let enabled = true;
  doc.body = new ElementFake("BODY");
  doc.activeElement = content;
  doc.defaultView = { setTimeout };
  doc.querySelector = () => target;
  doc.querySelectorAll = () => [];
  content.closest = (selector) => selector === ".cm-editor" ? editor : null;
  editor.closest = () => null;
  editor.querySelector = () => tooltip ? {} : null;
  target.ownerDocument = content.ownerDocument = doc;
  const app = { vault: { getConfig: () => false } };
  let cleanup = installEscapeEditable(doc, app, () => enabled);
  const consumed = doc.fire("keydown", "Escape");
  await Promise.resolve();
  assert.equal(doc.activeElement, content, "capture must not exit at a microtask checkpoint");
  consumed.preventDefault();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(doc.activeElement, content);
  tooltip = true;
  doc.fire("keydown", "Escape");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(doc.activeElement, content);
  tooltip = false;
  doc.fire("keydown", "Escape");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(doc.activeElement, target);
  doc.activeElement = content;
  doc.fire("keydown", "Escape");
  enabled = false;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(doc.activeElement, content);
  enabled = true;
  cleanup();
  doc.fire("keydown", "Escape");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(doc.activeElement, content);
  cleanup = installEscapeEditable(doc, app, () => enabled);
  doc.fire("keydown", "Escape");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(doc.activeElement, target);
  cleanup();
});
test("RTL tab arrows follow visual direction and ignore nested or consumed events", async () => {
  const { enhanceStructure } = await load("src/enhancers/structure.ts");
  const tabs = [new ElementFake(), new ElementFake(), new ElementFake()];
  const container = new ElementFake();
  const doc = { body: {}, activeElement: tabs[1], defaultView: { getComputedStyle: () => ({ direction: "rtl" }) }, querySelectorAll(selector) {
    if (selector === ".workspace-tab-header-container") return [container];
    if (selector === ".workspace-tab-header") return tabs;
    return [];
  } };
  container.ownerDocument = doc;
  container.querySelectorAll = () => tabs;
  tabs.forEach((tab) => {
    tab.ownerDocument = doc;
    tab.parentElement = container;
    tab.querySelector = () => null;
  });
  enhanceStructure(doc);
  tabs[1].fire("keydown", "ArrowRight");
  assert.equal(doc.activeElement, tabs[0]);
  tabs[1].fire("keydown", "ArrowLeft");
  assert.equal(doc.activeElement, tabs[2]);
  doc.activeElement = tabs[1];
  for (const overrides of [{ target: new ElementFake("BUTTON") }, { defaultPrevented: true }, { ctrlKey: true }, { isComposing: true }]) tabs[1].fire("keydown", "ArrowLeft", overrides);
  assert.equal(doc.activeElement, tabs[1]);
});
test("core-owned tabs retain native arrow navigation", async () => {
  const { enhanceStructure } = await load("src/enhancers/structure.ts");
  const tab = new ElementFake();
  tab.setAttribute("tabindex", "0");
  tab.querySelector = () => null;
  const doc = { body: {}, querySelectorAll: (selector) => selector === ".workspace-tab-header" ? [tab] : [] };
  tab.ownerDocument = doc;
  enhanceStructure(doc);
  assert.equal(tab.listeners.size, 0);
  assert.equal(tab.getAttribute("tabindex"), "0");
});
test("RTL tree expansion reverses horizontal arrows and ignores nested controls", async () => {
  const { installTreeKeyboard } = await load("src/enhancers/tree-keyboard.ts");
  const tree = new ElementFake();
  const item = new ElementFake();
  const row = new ElementFake();
  item.id = "folder";
  item.setAttribute("aria-expanded", "false");
  item.getClientRects = () => [{}];
  item.querySelector = () => row;
  const doc = { defaultView: { getComputedStyle: () => ({ direction: "rtl" }) }, getElementById: () => item };
  tree.ownerDocument = item.ownerDocument = doc;
  tree.closest = () => null;
  tree.contains = (el) => el === item;
  tree.querySelectorAll = () => [item];
  tree.querySelector = () => null;
  installTreeKeyboard(tree);
  tree.fire("keydown", "ArrowLeft");
  assert.equal(row.clicks, 1);
  item.setAttribute("aria-expanded", "true");
  tree.fire("keydown", "ArrowRight");
  assert.equal(row.clicks, 2);
  for (const overrides of [{ target: new ElementFake("INPUT") }, { defaultPrevented: true }, { ctrlKey: true }, { isComposing: true }]) tree.fire("keydown", "ArrowRight", overrides);
  assert.equal(row.clicks, 2);
});

// Rules from https://docs.obsidian.md/Reference/Manifest (checked 2026-11-10).
test("manifest follows Obsidian's manifest reference", () => {
  const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const versions = JSON.parse(readFileSync("versions.json", "utf8"));
  for (const key of ["id", "name", "version", "minAppVersion", "description", "author"]) {
    assert.equal(typeof manifest[key], "string", key);
    assert.ok(manifest[key].length > 0, key);
  }
  assert.equal(typeof manifest.isDesktopOnly, "boolean");
  assert.match(manifest.id, /^[a-z-]+$/, "id: lowercase letters and hyphens only");
  assert.doesNotMatch(manifest.id, /plugin$/, "id can't end with plugin");
  assert.doesNotMatch(manifest.id, /obsidian/, "id can't contain obsidian");
  assert.match(manifest.name, /^[A-Za-z0-9 ()+-]+$/, "name: Basic Latin, only - + ( ) punctuation");
  assert.doesNotMatch(manifest.name, /obsi|sidian/i, "name can't include Obsidian or variants");
  assert.doesNotMatch(manifest.name, /plugin/i, "name can't include Plugin");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/, "version: x.y.z");
  assert.match(manifest.minAppVersion, /^\d+\.\d+\.\d+$/);
  assert.equal(pkg.version, manifest.version, "package.json version");
  assert.equal(versions[manifest.version], manifest.minAppVersion, "versions.json entry");
  assert.match(manifest.authorUrl, /^https:\/\//);
  const repoUrl = pkg.repository.url.replace(/\.git$/, "");
  assert.notEqual(manifest.authorUrl, repoUrl, "authorUrl is the author's site, not the plugin repo");
});

function fakeFiles(map, { failReads = false } = {}) {
  return {
    async exists(path) { return Object.hasOwn(map, path); },
    async read(path) {
      if (failReads || !Object.hasOwn(map, path)) throw new Error(`ENOENT ${path}`);
      return map[path];
    },
  };
}
const LEGACY_DATA = "cfg/plugins/a11y-enhancer/data.json";
const LEGACY_MANIFEST = "cfg/plugins/a11y-enhancer/manifest.json";
const ENABLED_LIST = "cfg/community-plugins.json";

test("settings carry over from the old a11y-enhancer folder, known toggles only", async () => {
  const { readLegacySettings } = await load("src/legacy-id.ts");
  const files = fakeFiles({ [LEGACY_DATA]: JSON.stringify({ chrome: false, contrastBoost: true, focusRing: "yes", unknown: true }) });
  assert.deepEqual(await readLegacySettings(files, "cfg"), { chrome: false, contrastBoost: true });
});
test("missing, unreadable, malformed or empty old settings are ignored", async () => {
  const { readLegacySettings } = await load("src/legacy-id.ts");
  assert.equal(await readLegacySettings(fakeFiles({}), "cfg"), null, "missing");
  assert.equal(await readLegacySettings(fakeFiles({ [LEGACY_DATA]: "{}" }, { failReads: true }), "cfg"), null, "unreadable");
  for (const contents of ["{not json", "null", "[true]", "42", '"x"', "{}", '{"unknown":true}']) {
    assert.equal(await readLegacySettings(fakeFiles({ [LEGACY_DATA]: contents }), "cfg"), null, contents);
  }
});
test("an older copy counts as running only when it is enabled under the old id", async () => {
  const { isLegacyCopyEnabled } = await load("src/legacy-id.ts");
  const base = {
    [LEGACY_MANIFEST]: JSON.stringify({ id: "a11y-enhancer", version: "0.6.9" }),
    [ENABLED_LIST]: JSON.stringify(["dataview", "a11y-enhancer"]),
  };
  assert.equal(await isLegacyCopyEnabled(fakeFiles(base), "cfg"), true);
  const cases = {
    "not enabled": { ...base, [ENABLED_LIST]: '["dataview"]' },
    "old folder overwritten with the new build": { ...base, [LEGACY_MANIFEST]: JSON.stringify({ id: "accessibility-enhancer" }) },
    "old folder removed": { [ENABLED_LIST]: base[ENABLED_LIST] },
    "no enabled list": { [LEGACY_MANIFEST]: base[LEGACY_MANIFEST] },
    "malformed enabled list": { ...base, [ENABLED_LIST]: "{" },
    "malformed manifest": { ...base, [LEGACY_MANIFEST]: "{" },
  };
  for (const [label, map] of Object.entries(cases)) {
    assert.equal(await isLegacyCopyEnabled(fakeFiles(map), "cfg"), false, label);
  }
  assert.equal(await isLegacyCopyEnabled(fakeFiles(base, { failReads: true }), "cfg"), false, "unreadable");
});

test("saved settings win over an old-id install", async () => {
  const { initialSettings } = await load("src/legacy-id.ts");
  const { DEFAULT_SETTINGS } = await load("src/types.ts");
  const files = fakeFiles({ [LEGACY_DATA]: JSON.stringify({ chrome: true, forms: false }) });
  const result = await initialSettings({ chrome: false }, files, "cfg");
  assert.deepEqual(result, { settings: { ...DEFAULT_SETTINGS, chrome: false }, carriedOver: false });
});
test("first run carries over old-id settings, otherwise uses defaults", async () => {
  const { initialSettings } = await load("src/legacy-id.ts");
  const { DEFAULT_SETTINGS } = await load("src/types.ts");
  const files = fakeFiles({ [LEGACY_DATA]: JSON.stringify({ contrastBoost: true }) });
  assert.deepEqual(await initialSettings(null, files, "cfg"), { settings: { ...DEFAULT_SETTINGS, contrastBoost: true }, carriedOver: true });
  assert.deepEqual(await initialSettings(undefined, fakeFiles({}), "cfg"), { settings: DEFAULT_SETTINGS, carriedOver: false });
  assert.deepEqual(await initialSettings("corrupt", files, "cfg"), { settings: DEFAULT_SETTINGS, carriedOver: false });
});

const REGION_ID = "a11y-enhancer-live";
function fakeDoc() {
  const byId = new Map();
  const doc = {
    body: {
      appendChild(el) {
        el.isConnected = true;
        byId.set(el.id, el);
        el.remove = () => { el.isConnected = false; byId.delete(el.id); };
      },
    },
    getElementById: (id) => byId.get(id) ?? null,
    createElement: () => ({
      id: "", className: "", textContent: "", isConnected: false, attrs: new Map(),
      getAttribute(name) { return this.attrs.get(name) ?? null; },
      setAttribute(name, value) { this.attrs.set(name, value); },
    }),
    defaultView: { setTimeout: (fn) => { fn(); return 1; }, clearTimeout() {} },
  };
  return doc;
}
test("a second copy shares an existing live region instead of going silent", async () => {
  const { Announcer } = await load("src/announcer.ts");
  const doc = fakeDoc();
  const older = new Announcer(doc);
  older.mount();
  const newer = new Announcer(doc);
  newer.mount();
  newer.say("Older copy still on");
  assert.equal(doc.getElementById(REGION_ID).textContent, "Older copy still on");
});
test("announcer recreates its region after the other copy removes the shared one", async () => {
  const { Announcer } = await load("src/announcer.ts");
  const doc = fakeDoc();
  const older = new Announcer(doc);
  older.mount();
  const newer = new Announcer(doc);
  newer.mount();
  older.unmount(); // the old copy is turned off and takes its region with it
  assert.equal(doc.getElementById(REGION_ID), null);
  newer.say("Line 4");
  assert.equal(doc.getElementById(REGION_ID)?.textContent, "Line 4");
});
test("unmounting a shared region leaves it for the copy that created it", async () => {
  const { Announcer } = await load("src/announcer.ts");
  const doc = fakeDoc();
  const owner = new Announcer(doc);
  owner.mount();
  const guest = new Announcer(doc);
  guest.mount();
  guest.unmount();
  owner.say("Still here");
  assert.equal(doc.getElementById(REGION_ID)?.textContent, "Still here");
  guest.say("Should stay quiet");
  assert.equal(doc.getElementById(REGION_ID).textContent, "Still here");
});

let failures = 0;
for (const [name, fn] of cases) {
  try { await fn(); console.log(`PASS ${name}`); }
  catch (error) { failures++; console.error(`FAIL ${name}: ${error.message}`); }
}
if (failures) process.exitCode = 1;
