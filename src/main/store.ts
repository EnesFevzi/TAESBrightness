import { app } from "electron";
import { join } from "path";
import { readFileSync, writeFileSync, existsSync } from "fs";

export interface Schedule {
  id: string;
  time: string; // HH:mm
  action: "preset" | "toggle";
  target: string; // presetId or 'on'/'off'
  enabled: boolean;
}

export interface AppRule {
  processName: string;
  brightness: number;
}

export interface AppSettings {
  schedules: Schedule[];
  appRules: AppRule[];
  hotkeys: {
    brightnessUp: string;
    brightnessDown: string;
  };
}

const DEFAULT_SETTINGS: AppSettings = {
  schedules: [],
  appRules: [],
  hotkeys: {
    brightnessUp: "Control+Alt+Up",
    brightnessDown: "Control+Alt+Down",
  },
};

class Store {
  private path: string | null = null;
  private data: AppSettings = DEFAULT_SETTINGS;
  private initialized = false;

  private init(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.path = join(app.getPath("userData"), "settings.json");
    this.data = this.load();
  }

  private load(): AppSettings {
    try {
      if (this.path && existsSync(this.path)) {
        const content = readFileSync(this.path, "utf-8");
        return { ...DEFAULT_SETTINGS, ...JSON.parse(content) };
      }
    } catch (e) {
      console.error("Store load failed:", e);
    }
    return DEFAULT_SETTINGS;
  }

  save(data?: Partial<AppSettings>): void {
    this.init();
    if (data) {
      this.data = { ...this.data, ...data };
    }
    try {
      if (this.path) writeFileSync(this.path, JSON.stringify(this.data, null, 2));
    } catch (e) {
      console.error("Store save failed:", e);
    }
  }

  get(): AppSettings {
    this.init();
    return this.data;
  }
}

export const store = new Store();
