import { Plugin, Platform } from "obsidian";
import { A11ySettings, DEFAULT_SETTINGS } from "./types";
import { A11yObserver } from "./observer";
import { Announcer } from "./announcer";
import { enhanceChrome } from "./enhancers/chrome";
import { enhanceStructure } from "./enhancers/structure";
import { enhanceOverlays } from "./enhancers/overlays";
import { enhanceForms } from "./enhancers/forms";
import { A11ySettingTab } from "./settings";
import { installEscapeEditable } from "./escape-editable";
import { forceActiveReading } from "./reading-mode";
import { uninstallTreeKeyboard } from "./enhancers/tree-keyboard";
import { isDrawerOpen } from "./dom";
import { lineAnnouncer } from "./line-announce";

interface DocContext {
  observer: A11yObserver;
  announcer: Announcer;
  removeEscapeHandler: () => void;
}

export default class A11yEnhancerPlugin extends Plugin {
  settings: A11ySettings = DEFAULT_SETTINGS;
  private contexts = new Map<Document, DocContext>();

  async onload(): Promise<void> {
    await this.loadSettings();
    console.info("[a11y-enhancer] loaded");
    this.addSettingTab(new A11ySettingTab(this.app, this));

    if (document.body) {
      this.initializePlugin();
    } else {
      const checkBody = setInterval(() => {
        if (document.body) {
          clearInterval(checkBody);
          this.initializePlugin();
        }
      }, 50);
    }
  }

  private initializePlugin(): void {
    this.applyBodyFlags(document);
    this.attach(document);
    this.registerEvent(
      this.app.workspace.on("window-open", (_win: unknown, win: Window) => {
        if (win?.document) this.attach(win.document);
      }),
    );
    this.registerEvent(
      this.app.workspace.on("window-close", (_win: unknown, win: Window) => {
        if (win?.document) this.detach(win.document);
      }),
    );

    // Reading view by default: force the just-opened note to preview (editing
    // stays opt-in). Idempotent, so this never fights a view the user has
    // deliberately switched to editing.
    this.registerEvent(
      this.app.workspace.on("file-open", () => this.enforceReadingMode()),
    );
    this.app.workspace.onLayoutReady(() => this.enforceReadingMode());

    // Announce the editor's current line as the caret moves. The extension
    // self-gates on the setting, so it is always registered; toggling the
    // setting takes effect without reconfiguring the editor.
    this.registerEditorExtension(
      lineAnnouncer(
        () => this.settings.lineAnnounce,
        (message, doc) => this.announceInDoc(doc, message),
      ),
    );
  }

  /** Speak a message through a given document's live region, if attached. */
  private announceInDoc(doc: Document, message: string): void {
    this.contexts.get(doc)?.announcer.say(message);
  }

  /** The live region backs both notice mirroring and line announcements. */
  private wantsLiveRegion(): boolean {
    return this.settings.announcer || this.settings.lineAnnounce;
  }

  /** Default the active markdown view to Reading view when the setting is on. */
  enforceReadingMode(): void {
    if (this.settings.readingDefault) forceActiveReading(this.app);
  }

  onunload(): void {
    for (const doc of Array.from(this.contexts.keys())) this.detach(doc);
    // The main document is in `contexts`, so detach() already cleared its flags.
  }

  private attach(doc: Document): void {
    if (this.contexts.has(doc)) return;
    if (!doc.body) return;
    this.applyBodyFlags(doc);
    const announcer = new Announcer(doc);
    if (this.wantsLiveRegion()) announcer.mount();
    const observer = new A11yObserver(doc, (d) => this.sweep(d, announcer));
    observer.start();
    const removeEscapeHandler = installEscapeEditable(doc, this.app, () => this.settings.escapeEditables);
    this.contexts.set(doc, { observer, announcer, removeEscapeHandler });
  }

  private detach(doc: Document): void {
    const ctx = this.contexts.get(doc);
    if (!ctx) return;
    ctx.observer.stop();
    ctx.removeEscapeHandler();
    ctx.announcer.unmount();
    uninstallTreeKeyboard(doc); // raw listeners aren't registerDomEvent-managed
    this.clearBodyFlags(doc);
    this.contexts.delete(doc);
  }

  /** Hide background workspace content when mobile side drawers are open. */
  private containMobileDrawers(doc: Document): void {
    const leftDrawer = doc.querySelector<HTMLElement>(".workspace-drawer.mod-left");
    const rightDrawer = doc.querySelector<HTMLElement>(".workspace-drawer.mod-right");

    // The backdrop overlay is dynamically added to the DOM only when a drawer is open on mobile.
    const backdrop = doc.querySelector(".workspace-drawer-backdrop");
    const drawerOpen = !!backdrop;

    const leftOpen = drawerOpen && !!leftDrawer && isDrawerOpen(leftDrawer);
    const rightOpen = drawerOpen && !!rightDrawer && isDrawerOpen(rightDrawer);

    const bgSelectors = [
      ".workspace-split.mod-root",
      ".mobile-navbar",
      ".workspace-ribbon",
      ".status-bar"
    ];

    bgSelectors.forEach((selector) => {
      doc.querySelectorAll<HTMLElement>(selector).forEach((el) => {
        if (drawerOpen) {
          if (el.getAttribute("aria-hidden") !== "true") {
            el.setAttribute("aria-hidden", "true");
          }
        } else {
          if (el.getAttribute("aria-hidden") === "true") {
            el.removeAttribute("aria-hidden");
          }
        }
      });
    });

    // Toggle aria-hidden and aria-modal on left/right drawers based on their open state.
    // If a drawer is closed, it must be hidden from screen readers and not act as a modal.
    if (leftDrawer) {
      if (leftOpen) {
        leftDrawer.removeAttribute("aria-hidden");
        leftDrawer.setAttribute("aria-modal", "true");
      } else {
        leftDrawer.setAttribute("aria-hidden", "true");
        leftDrawer.removeAttribute("aria-modal");
      }
    }

    if (rightDrawer) {
      if (rightOpen) {
        rightDrawer.removeAttribute("aria-hidden");
        rightDrawer.setAttribute("aria-modal", "true");
      } else {
        rightDrawer.setAttribute("aria-hidden", "true");
        rightDrawer.removeAttribute("aria-modal");
      }
    }
  }

  /** Idempotent pass over a document; run by the observer on every change. */
  private sweep(doc: Document, announcer: Announcer): void {
    const s = this.settings;
    if (s.mobileSupport && Platform.isMobile) {
      this.containMobileDrawers(doc);
    }
    if (s.chrome) enhanceChrome(doc, s.mobileSupport);
    if (s.structure) enhanceStructure(doc, s.mobileSupport);
    if (s.overlays) enhanceOverlays(doc, s.mobileSupport);
    if (s.forms) enhanceForms(doc);
    if (s.announcer) announcer.sweepNotices();
  }

  /** Re-run all enhancers immediately (after a settings change). */
  resweep(): void {
    for (const [doc, ctx] of this.contexts) this.sweep(doc, ctx.announcer);
  }

  /** CSS feature flags are toggled via body classes that styles.css keys off. */
  applyBodyFlags(doc: Document): void {
    const b = doc.body;
    if (!b) return;
    b.classList.toggle("a11y-focus-ring", this.settings.focusRing);
    b.classList.toggle("a11y-reduced-motion", this.settings.reducedMotion);
    b.classList.toggle("a11y-contrast-boost", this.settings.contrastBoost);
    b.classList.toggle("a11y-mobile-support", this.settings.mobileSupport);
  }

  private clearBodyFlags(doc: Document): void {
    const b = doc.body;
    if (!b) return;
    b.classList.remove(
      "a11y-focus-ring",
      "a11y-reduced-motion",
      "a11y-contrast-boost",
      "a11y-mobile-support",
    );
  }

  /** Reflect the live-region settings (notices + line announce) across documents. */
  syncAnnouncer(): void {
    for (const ctx of this.contexts.values()) {
      if (this.wantsLiveRegion()) ctx.announcer.mount();
      else ctx.announcer.unmount();
    }
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    for (const doc of this.contexts.keys()) this.applyBodyFlags(doc);
  }
}
