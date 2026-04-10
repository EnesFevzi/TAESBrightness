import { BrowserWindow, screen } from "electron";

export class OverlayManager {
  private overlayWindows: BrowserWindow[] = [];
  private alpha: number = 0;

  setAlpha(alpha: number): void {
    this.alpha = alpha;
    if (alpha <= 0) {
      this.close();
      return;
    }

    if (this.overlayWindows.length === 0) {
      this.create();
    } else {
      this.overlayWindows.forEach((win) => {
        win.setOpacity(alpha);
      });
    }
  }

  private create(): void {
    const displays = screen.getAllDisplays();

    displays.forEach((display) => {
      const { x, y, width, height } = display.bounds;

      const win = new BrowserWindow({
        x,
        y,
        width,
        height,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        enableLargerThanScreen: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      // Magic for click-through on Windows
      win.setIgnoreMouseEvents(true, { forward: true });

      // Warm orange color
      win.loadURL(`data:text/html;charset=utf-8,
        <body style="background-color: rgba(255, 120, 0, 1); margin: 0; overflow: hidden;"></body>
      `);

      win.setOpacity(this.alpha);
      this.overlayWindows.push(win);
    });
  }

  private close(): void {
    this.overlayWindows.forEach((win) => {
      if (!win.isDestroyed()) win.close();
    });
    this.overlayWindows = [];
  }
}

export const overlayManager = new OverlayManager();
