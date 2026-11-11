// Copies the built plugin into the dev vault for live testing.
import { copyFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";

// Set OBSIDIAN_PLUGIN_DIR to your vault's plugin folder. Defaults to a
// repo-local test vault so the script never depends on a personal path.
const VAULT_PLUGIN_DIR =
  process.env.OBSIDIAN_PLUGIN_DIR ||
  join(process.cwd(), "test-vault/.obsidian/plugins/accessibility-enhancer");

mkdirSync(VAULT_PLUGIN_DIR, { recursive: true });

for (const file of ["main.js", "manifest.json", "styles.css"]) {
  if (existsSync(file)) {
    copyFileSync(file, join(VAULT_PLUGIN_DIR, file));
    console.log(`copied ${file} -> ${VAULT_PLUGIN_DIR}`);
  } else {
    console.warn(`skip ${file} (not found)`);
  }
}
