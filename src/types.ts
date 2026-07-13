export interface A11ySettings {
  /** ARIA + keyboard operability for ribbon, sidebar toggles, view headers, status bar. */
  chrome: boolean;
  /** ARIA for workspace tabs and the file/outline trees. */
  structure: boolean;
  /** ARIA + focus management for modals, settings nav, command palette, menus. */
  overlays: boolean;
  /** Associate names/descriptions and expose state for Setting controls. */
  forms: boolean;
  /** Inject visible focus rings across the shell (overrides outline:none). */
  focusRing: boolean;
  /** Mirror Notices into a polite live region. */
  announcer: boolean;
  /** Override default-theme color tokens that fail contrast. Opinionated; off by default. */
  contrastBoost: boolean;
  /** Honor prefers-reduced-motion app-wide. */
  reducedMotion: boolean;
  /** Press Escape to move focus out of an editor/input back to navigable chrome. */
  escapeEditables: boolean;
  /** Open markdown documents in Reading view; editing stays opt-in via the edit toggle. */
  readingDefault: boolean;
  /** Experimental touch and screen-reader optimizations for mobile layouts. */
  mobileSupport: boolean;
}

export const DEFAULT_SETTINGS: A11ySettings = {
  chrome: true,
  structure: true,
  overlays: true,
  forms: true,
  focusRing: true,
  announcer: true,
  contrastBoost: false,
  reducedMotion: true,
  escapeEditables: true,
  readingDefault: true,
  mobileSupport: false,
};
