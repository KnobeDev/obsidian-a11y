// Up to 0.6.x the plugin id was `a11y-enhancer`. Obsidian's manifest reference
// allows only lowercase letters and hyphens in an id, so 0.7.0 moved to
// `accessibility-enhancer`. BRAT and manual installs of the old id keep their
// settings in a folder named after it; these helpers carry those settings over
// and detect an old copy that is still turned on alongside this one.

import { A11ySettings, DEFAULT_SETTINGS } from "./types";

export const LEGACY_PLUGIN_ID = "a11y-enhancer";

/** The part of Obsidian's DataAdapter these helpers read through. */
export interface VaultFiles {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
}

function legacyPath(configDir: string, file: string): string {
  return `${configDir}/plugins/${LEGACY_PLUGIN_ID}/${file}`;
}

/** Parsed JSON from a vault file, or undefined when missing, unreadable or malformed. */
async function readJson(files: VaultFiles, path: string): Promise<unknown> {
  try {
    if (!(await files.exists(path))) return undefined;
    return JSON.parse(await files.read(path)) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Settings saved under the old id, limited to known toggles with boolean
 * values. Returns null when there is nothing usable to carry over.
 */
export async function readLegacySettings(
  files: VaultFiles,
  configDir: string,
): Promise<Partial<A11ySettings> | null> {
  const saved = await readJson(files, legacyPath(configDir, "data.json"));
  if (!isRecord(saved)) return null;
  const known = Object.keys(DEFAULT_SETTINGS) as (keyof A11ySettings)[];
  const entries = known
    .filter((key) => typeof saved[key] === "boolean")
    .map((key) => [key, saved[key] as boolean] as const);
  return entries.length > 0 ? (Object.fromEntries(entries) as Partial<A11ySettings>) : null;
}

export interface InitialSettings {
  settings: A11ySettings;
  /** True when the settings came from an old-id install and should be saved. */
  carriedOver: boolean;
}

/**
 * Settings to start with, given what `loadData()` returned: the saved ones,
 * else (first run) those carried over from an old-id install, else defaults.
 */
export async function initialSettings(
  saved: unknown,
  files: VaultFiles,
  configDir: string,
): Promise<InitialSettings> {
  if (saved != null) {
    const merged = { ...DEFAULT_SETTINGS, ...(isRecord(saved) ? saved : {}) };
    return { settings: merged as A11ySettings, carriedOver: false };
  }
  const legacy = await readLegacySettings(files, configDir);
  return { settings: { ...DEFAULT_SETTINGS, ...legacy }, carriedOver: legacy !== null };
}

/**
 * True when a copy installed under the old id is still enabled. A folder
 * overwritten in place with a newer build carries the new id in its manifest,
 * so it doesn't count.
 */
export async function isLegacyCopyEnabled(files: VaultFiles, configDir: string): Promise<boolean> {
  const manifest = await readJson(files, legacyPath(configDir, "manifest.json"));
  if (!isRecord(manifest) || manifest.id !== LEGACY_PLUGIN_ID) return false;
  const enabled = await readJson(files, `${configDir}/community-plugins.json`);
  return Array.isArray(enabled) && enabled.includes(LEGACY_PLUGIN_ID);
}
