import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

interface AppSettings {
  presets: Array<{ id: string; name: string }>;
  schedules: Array<{ id: string; name: string; enabled: boolean }>;
  appRules: Array<{
    id: string;
    appName: string;
    settings: Record<string, number>;
  }>;
  hotkeys: {
    brightnessUp: string;
    brightnessDown: string;
  };
}

// Custom APIs for renderer
const api = {
  getMonitors: () => ipcRenderer.invoke("get-monitors"),
  setBrightness: (id: string, level: number) =>
    ipcRenderer.invoke("set-brightness", id, level),
  toggleMonitor: (id: string, state: boolean) =>
    ipcRenderer.invoke("toggle-monitor", id, state),
  getAutoLaunch: () => ipcRenderer.invoke("get-auto-launch"),
  setAutoLaunch: (enabled: boolean) =>
    ipcRenderer.invoke("set-auto-launch", enabled),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (settings: Partial<AppSettings>) =>
    ipcRenderer.invoke("save-settings", settings),
  setBlueLight: (level: number) => ipcRenderer.invoke("set-blue-light", level),
  setNightLight: (strength: number) => ipcRenderer.invoke("set-night-light", strength),
  hideWindow: () => ipcRenderer.send("hide-window"),
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-expect-error (define in d.ts)
  window.electron = electronAPI;
  // @ts-expect-error (define in d.ts)
  window.api = api;
}
