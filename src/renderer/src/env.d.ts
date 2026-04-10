import { ElectronAPI } from "@electron-toolkit/preload";

export interface MonitorInfo {
  id: string;
  name: string;
  brightness: number;
  type: "internal" | "external";
  enabled: boolean;
  isOnline: boolean;
}

export interface Schedule {
  id: string;
  name: string;
  enabled: boolean;
}

export interface AppRule {
  id: string;
  appName: string;
  settings: Record<string, number>;
}

export interface AppSettings {
  schedules: Schedule[];
  appRules: AppRule[];
  hotkeys: {
    brightnessUp: string;
    brightnessDown: string;
  };
}

export interface CustomAPI {
  getMonitors: () => Promise<MonitorInfo[]>;
  setBrightness: (id: string, level: number) => Promise<void>;
  toggleMonitor: (id: string, state: boolean) => Promise<void>;
  getAutoLaunch: () => Promise<boolean>;
  setAutoLaunch: (enabled: boolean) => Promise<void>;
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: Partial<AppSettings>) => Promise<void>;
  setBlueLight: (level: number) => Promise<void>;
  setNightLight: (strength: number) => Promise<void>;
  hideWindow: () => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: CustomAPI;
  }
}
