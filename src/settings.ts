import { App, PluginSettingTab, Setting } from "obsidian";
import type A11yEnhancerPlugin from "./main";
import { A11ySettings } from "./types";

interface Toggle {
  key: keyof A11ySettings;
  name: string;
  desc: string;
}

const TOGGLES: Toggle[] = [
  { key: "chrome", name: "Chrome & navigation", desc: "Keyboard + ARIA for the ribbon, sidebar toggles, view headers, and status bar." },
  { key: "structure", name: "Tabs & file tree", desc: "Tablist/tab and tree/treeitem semantics with state and names." },
  { key: "overlays", name: "Modals & palettes", desc: "Dialog semantics, focus trap/restore, settings nav, and combobox/listbox." },
  { key: "forms", name: "Settings controls", desc: "Associate names/descriptions and expose toggle state." },
  { key: "focusRing", name: "Visible focus ring", desc: "Inject a focus indicator across the UI (overrides outline:none)." },
  { key: "announcer", name: "Announce notices", desc: "Mirror toast notices into a screen-reader live region." },
  { key: "lineAnnounce", name: "Announce editor line", desc: "Speak the current line number as the caret moves between lines, so screen readers convey position (the line-number gutter is invisible to them)." },
  { key: "escapeEditables", name: "Escape from editors", desc: "Press Escape in the editor or a text field to move focus back to navigable controls." },
  { key: "readingDefault", name: "Open notes in Reading view", desc: "Markdown opens in Reading view; editing stays opt-in via the note's edit toggle." },
  { key: "mobileSupport", name: "Mobile layout support", desc: "Experimental touch and screen-reader optimizations for mobile layouts (side drawer containment, bottom navbar toolbar roles, and TalkBack focus rings). Off by default." },
  { key: "reducedMotion", name: "Honor reduced motion", desc: "Suppress app animations when your OS requests reduced motion." },
  { key: "contrastBoost", name: "Contrast boost (opinionated)", desc: "Override default-theme tokens that fail WCAG contrast." },
];

export class A11ySettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: A11yEnhancerPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("p", {
      text: "Each fix maps to an audited WCAG 2.1 A/AA finding. Disable any that conflict with another plugin.",
    });

    for (const t of TOGGLES) {
      new Setting(containerEl)
        .setName(t.name)
        .setDesc(t.desc)
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings[t.key])
            .onChange(async (value) => {
              this.plugin.settings[t.key] = value;
              await this.plugin.saveSettings();
              if (t.key === "announcer" || t.key === "lineAnnounce") {
                this.plugin.syncAnnouncer();
              }
              if (t.key === "readingDefault" && value) this.plugin.enforceReadingMode();
              this.plugin.resweep();
            }),
        );
    }
  }
}
