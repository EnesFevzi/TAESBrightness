import {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  globalShortcut,
  screen as electronScreen,
} from "electron";
import { join } from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { MonitorManager } from "./monitor-manager";
import { store } from "./store";
import { overlayManager } from "./overlay";

const execAsync = promisify(exec);

let monitorManager: MonitorManager;
let tray: Tray | null = null;
let mainWindow: BrowserWindow | null = null;
let isDev: boolean;
let settingsOpen: boolean = false;

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function setAppUserModelId(id: string): void {
  if (process.platform === "win32") {
    app.setAppUserModelId(isDev ? process.execPath : id);
  }
}

function watchWindowShortcuts(window: BrowserWindow): void {
  window.webContents.on("before-input-event", (_, input) => {
    if (input.key === "F12" && input.type === "keyDown") {
      if (window.webContents.isDevToolsOpened()) {
        window.webContents.closeDevTools();
      } else {
        window.webContents.openDevTools();
      }
    }
  });
}

function setAutoLaunch(enabled: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: app.getPath("exe"),
  });
}

// Automation Engine
class AutomationEngine {
  private lastApp: string = "";
  private lastMinute: string = "";

  async start() {
    setInterval(() => this.check(), 2000);
  }

  private async check() {
    const settings = store.get();
    const now = new Date();
    const currentMinute = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    // 1. Check Schedules (once per minute)
    if (currentMinute !== this.lastMinute) {
      this.lastMinute = currentMinute;
      const schedule = settings.schedules.find(
        (s) => s.enabled && s.time === currentMinute,
      );
      if (schedule) {
        if (schedule.action === "preset") {
          await this.applyPresetById(schedule.target);
        }
      }
    }

    // 2. Check Active App
    try {
      const psCommand =
        'Add-Type \'@\nusing System;\nusing System.Runtime.InteropServices;\npublic class Win32 {\n    [DllImport("user32.dll")]\n    public static extern IntPtr GetForegroundWindow();\n    [DllImport("user32.dll")]\n    public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int lpdwProcessId);\n}\n@\'; [IntPtr]$hwnd = [Win32]::GetForegroundWindow(); $pid = 0; [Win32]::GetWindowThreadProcessId($hwnd, [ref]$pid); (Get-Process -Id $pid).Name';
      const { stdout } = await execAsync(`powershell -Command "${psCommand}"`);
      const activeApp = stdout.trim().toLowerCase();

      if (activeApp !== this.lastApp) {
        this.lastApp = activeApp;
        const rule = settings.appRules.find((r) =>
          activeApp.includes(r.processName.toLowerCase()),
        );
        if (rule) {
          const monitors = await monitorManager.refreshMonitors();
          for (const m of monitors) {
            await monitorManager.setBrightness(m.id, rule.brightness);
          }
        }
      }
    } catch (e) {
      /* ignore polling errors */
    }
  }
}

const engine = new AutomationEngine();

function registerShortcuts() {
  const settings = store.get();

  globalShortcut.unregisterAll();

  globalShortcut.register(settings.hotkeys.brightnessUp, async () => {
    const monitors = await monitorManager.refreshMonitors();
    for (const m of monitors) {
      const next = Math.min(100, m.brightness + 10);
      await monitorManager.setBrightness(m.id, next);
    }
    mainWindow?.webContents.send("brightness-updated");
  });

  globalShortcut.register(settings.hotkeys.brightnessDown, async () => {
    const monitors = await monitorManager.refreshMonitors();
    for (const m of monitors) {
      const next = Math.max(0, m.brightness - 10);
      await monitorManager.setBrightness(m.id, next);
    }
    mainWindow?.webContents.send("brightness-updated");
  });
}

function createWindow(): void {
  const primaryDisplay = electronScreen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } =
    primaryDisplay.workAreaSize;

  const width = 320;
  const height = 420;

  mainWindow = new BrowserWindow({
    width,
    height,
    x: screenWidth - width - 10,
    y: screenHeight - height - 10,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    transparent: true,
    skipTaskbar: true,
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("blur", () => {
    if (!isDev && !settingsOpen) {
      // Give a small delay to prevent accidental hiding during interactions
      setTimeout(() => {
        if (mainWindow && !settingsOpen) {
          mainWindow.hide();
        }
      }, 100);
    }
  });

  if (isDev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

function createTray(): void {
  const iconPath = join(__dirname, "../../resources/icon.png");
  try {
    const trayIcon = nativeImage.createFromPath(iconPath);
    tray = new Tray(trayIcon.isEmpty() ? nativeImage.createEmpty() : trayIcon);
  } catch {
    tray = new Tray(nativeImage.createEmpty());
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Göster",
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: "separator" },
    {
      label: "Ayarlar",
      click: () => {
        mainWindow?.show();
        mainWindow?.webContents.send("go-to-settings");
      },
    },
    { label: "Çıkış", click: () => app.quit() },
  ]);

  if (tray) {
    tray.setToolTip("Lumina Control");
    tray.setContextMenu(contextMenu);
    tray.on("click", () => {
      if (mainWindow?.isVisible()) mainWindow.hide();
      else {
        const trayBounds = tray?.getBounds();
        const winBounds = mainWindow?.getBounds();
        if (trayBounds && winBounds) {
          const x = Math.round(
            trayBounds.x + trayBounds.width / 2 - winBounds.width / 2,
          );
          const y = Math.round(trayBounds.y - winBounds.height);
          mainWindow?.setPosition(x, y, false);
        }
        mainWindow?.show();
        mainWindow?.focus();
      }
    });
  }
}

app.whenReady().then(() => {
  if (!gotTheLock) return;

  monitorManager = new MonitorManager();
  isDev = !app.isPackaged;
  setAppUserModelId("com.electron.lumina");

  app.on("browser-window-created", (_, window) => watchWindowShortcuts(window));

  createWindow();
  createTray();
  registerShortcuts();
  engine.start();

  // IPC Handlers
  ipcMain.handle(
    "get-monitors",
    async () => await monitorManager.refreshMonitors(),
  );
  ipcMain.handle(
    "set-brightness",
    async (_, id, level) => await monitorManager.setBrightness(id, level),
  );
  ipcMain.handle(
    "toggle-monitor",
    async (_, id, state) => await monitorManager.toggleMonitor(id, state),
  );
  ipcMain.handle("set-auto-launch", (_, enabled) => setAutoLaunch(enabled));
  ipcMain.handle(
    "get-auto-launch",
    () => app.getLoginItemSettings().openAtLogin,
  );

  // Advanced Features IPC
  ipcMain.handle("get-settings", () => store.get());
  ipcMain.handle("save-settings", (_, settings) => {
    store.save(settings);
    registerShortcuts();
  });
  let blueLightLevel = 0;
  let nightLightStrength = 0; // 0 = off, 1-100 = intensity

  ipcMain.handle("set-blue-light", (_, level: number) => {
    blueLightLevel = level;
    const alpha = Math.max(nightLightStrength / 100, level / 100);
    overlayManager.setAlpha(alpha);
  });

  // strength=0 means night light off, 1-100 means on with that intensity
  ipcMain.handle("set-night-light", (_, strength: number) => {
    nightLightStrength = strength;
    const alpha = Math.max(strength / 100, blueLightLevel / 100);
    overlayManager.setAlpha(alpha);
  });
  ipcMain.on("hide-window", () => {
    mainWindow?.hide();
  });
  ipcMain.on("settings-opened", () => {
    settingsOpen = true;
  });
  ipcMain.on("settings-closed", () => {
    settingsOpen = false;
  });
});

app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
