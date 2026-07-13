// Owns a visually-hidden polite live region and mirrors Obsidian Notices into
// it, so toast messages are announced to screen readers (SC 4.1.3). The notice
// DOM is created per-toast, so we detect new `.notice` nodes during the sweep.

import { setAttr } from "./dom";

const REGION_ID = "a11y-enhancer-live";

export class Announcer {
  private region: HTMLElement | null = null;
  private sayTimer: number | null = null;

  constructor(private readonly doc: Document) {}

  private get win(): Window {
    return (this.doc.defaultView ?? window) as Window;
  }

  mount(): void {
    if (!this.doc.body) return;
    if (this.doc.getElementById(REGION_ID)) return;
    const el = this.doc.createElement("div");
    el.id = REGION_ID;
    el.className = "a11y-enhancer-sr-only";
    setAttr(el, "aria-live", "polite");
    setAttr(el, "aria-atomic", "true");
    setAttr(el, "role", "status");
    this.doc.body.appendChild(el);
    this.region = el;
  }

  /** Announce arbitrary text. */
  say(message: string): void {
    if (!this.region || !message) return;
    // Clearing first guarantees re-announcement of identical consecutive messages.
    this.region.textContent = "";
    const region = this.region;
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
    if (this.sayTimer !== null) {
      this.win.clearTimeout(this.sayTimer);
      this.sayTimer = null;
    }
    this.region?.remove();
    this.region = null;
  }
}
