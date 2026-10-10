import assert from "node:assert/strict";
import { build } from "esbuild";

async function load(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, format: "esm", platform: "node", plugins: [{ name: "obsidian-stub", setup(b) {
    b.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export const Platform = { isMobile: false }; export const requireApiVersion = () => true;" }));
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

const { makeActivatable, isDrawerOpen } = await load("src/dom.ts");
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
test("drawer visibility uses viewport intersection independent of RTL side", () => {
  const drawer = new ElementFake();
  drawer.ownerDocument = { defaultView: { innerWidth: 1000, innerHeight: 700 } };
  for (const side of ["mod-left", "mod-right"]) {
    drawer.classList.contains = (name) => name === side;
    for (const [left, right, open] of [[-300, 0, false], [1000, 1300, false], [0, 300, true], [700, 1000, true]]) {
      drawer.getBoundingClientRect = () => ({ left, right, top: 0, bottom: 700, width: 300, height: 700 });
      assert.equal(isDrawerOpen(drawer), open, `${side} ${left}`);
    }
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

let failures = 0;
for (const [name, fn] of cases) {
  try { await fn(); console.log(`PASS ${name}`); }
  catch (error) { failures++; console.error(`FAIL ${name}: ${error.message}`); }
}
if (failures) process.exitCode = 1;
