// Owns a visually-hidden polite live region and mirrors Obsidian Notices into
// it, so toast messages are announced to screen readers (SC 4.1.3). The notice
// DOM is created per-toast, so we detect new `.notice` nodes during the sweep.
//
// Another installed copy of this plugin (one still under the pre-0.7.0 id, see
// legacy-id.ts) uses the same region id. Whichever copy mounts second shares
// the first copy's region instead of going silent, and creates its own if that
// copy unloads and removes it.

import { setAttr } from "./dom";

const REGION_ID = "a11y-enhancer-live";

export class Announcer {
  private region: HTMLElement | null = null;
  /** True when this announcer created `region` and so removes it on unmount. */
  private ownsRegion = false;
  private active = false;
  private sayTimer: number | null = null;

  constructor(private readonly doc: Document) {}

  private get win(): Window {
    return (this.doc.defaultView ?? window) as Window;
  }

  mount(): void {
    this.active = true;
    this.ensureRegion();
  }

  /** The connected region to speak through: ours, one shared by another copy, or a new one. */
  private ensureRegion(): HTMLElement | null {
    if (this.region?.isConnected) return this.region;
    this.region = null;
    this.ownsRegion = false;
    if (!this.doc.body) return null;
    const existing = this.doc.getElementById(REGION_ID);
    if (existing) {
      this.region = existing;
      return existing;
    }
    const el = this.doc.createElement("div");
    el.id = REGION_ID;
    el.className = "a11y-enhancer-sr-only";
    setAttr(el, "aria-live", "polite");
    setAttr(el, "aria-atomic", "true");
    setAttr(el, "role", "status");
    this.doc.body.appendChild(el);
    this.region = el;
    this.ownsRegion = true;
    return el;
  }

  /** Announce arbitrary text. */
  say(message: string): void {
    if (!this.active || !message) return;
    const region = this.ensureRegion();
    if (!region) return;
    // Clearing first guarantees re-announcement of identical consecutive messages.
    region.textContent = "";
    if (this.sayTimer !== null) this.win.clearTimeout(this.sayTimer);
    this.sayTimer = this.win.setTimeout(() => {
      this.sayTimer = null;
      region.textContent = message;
    }, 50);
  }

  /** Scan for unannounced notices and mirror their text. */
  sweepNotices(): void {
    const notices = this.doc.querySelectorAll<HTMLElement>(".notice");
    notices.forEach((n) => {
      if (n.dataset.a11yAnnounced) return;
      n.dataset.a11yAnnounced = "1";
      const text = (n.textContent ?? "").trim();
      if (text) this.say(text);
    });
  }

  unmount(): void {
    this.active = false;
    if (this.sayTimer !== null) {
      this.win.clearTimeout(this.sayTimer);
      this.sayTimer = null;
    }
    if (this.ownsRegion) this.region?.remove();
    this.region = null;
    this.ownsRegion = false;
  }
}
