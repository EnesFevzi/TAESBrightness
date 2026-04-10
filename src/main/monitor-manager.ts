import { exec } from "child_process";
import { promisify } from "util";
import ddcci from "@hensm/ddcci";

const execAsync = promisify(exec);

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timeout")), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

function encodePsCommand(script: string): string {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return `powershell -NoProfile -EncodedCommand ${encoded}`;
}

const WMI_NAMES_SCRIPT = `
Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorID | ForEach-Object {
  $id = $_.InstanceName
  $f = ''
  if ($_.UserFriendlyName) { $f = -join ($_.UserFriendlyName | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ }) }
  $m = ''
  if ($_.ManufacturerName) { $m = -join ($_.ManufacturerName | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ }) }
  $n = 'Monitor'
  if ($f) { $n = $f } elseif ($m) { $n = $m }
  Write-Output "$id|$n"
}
`.trim();

export interface MonitorInfo {
  id: string;
  name: string;
  brightness: number;
  type: "internal" | "external";
  enabled: boolean;
  isOnline: boolean;
}

export class MonitorManager {
  private knownMonitors: Map<string, MonitorInfo> = new Map();
  private wmiMonitorNames: Map<string, string> = new Map();
  private claimedWmiIds: Set<string> = new Set();

  async refreshMonitors(): Promise<MonitorInfo[]> {
    this.claimedWmiIds.clear();
    try {
      await withTimeout(this.refreshWmiMonitors(), 10000);
    } catch { /* ignore */ }
    try {
      await withTimeout(this.refreshInternalMonitors(), 8000);
    } catch { /* ignore */ }
    try {
      await withTimeout(this.refreshExternalMonitors(), 10000);
    } catch { /* ignore */ }
    return Array.from(this.knownMonitors.values());
  }

  private async refreshWmiMonitors(): Promise<void> {
    this.wmiMonitorNames.clear();
    try {
      const { stdout } = await execAsync(
        encodePsCommand(WMI_NAMES_SCRIPT),
        { timeout: 8000 }
      );

      stdout
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.includes("|"))
        .forEach((l) => {
          const sepIndex = l.indexOf("|");
          const id = l.substring(0, sepIndex).trim();
          const name = l.substring(sepIndex + 1).trim();
          if (id && name) {
            this.wmiMonitorNames.set(id, name);
          }
        });

      console.log("WMI monitor names:", Object.fromEntries(this.wmiMonitorNames));
    } catch (err) {
      console.error("Failed to refresh WMI monitors:", err);
    }
  }

  private normalizeMonitorId(id: string): string {
    return id
      .replace(/^\\\\\?\\/, "")
      .replace(/#\{[^}]+\}$/, "")
      .replace(/_\d+$/, "")
      .replace(/\\/g, "#")
      .toUpperCase();
  }

  private matchWmiName(ddcciId: string, defaultName: string): string {
    const normDdcci = this.normalizeMonitorId(ddcciId);
    for (const [wmiId, name] of this.wmiMonitorNames) {
      if (this.claimedWmiIds.has(wmiId)) continue;
      const normWmi = this.normalizeMonitorId(wmiId);
      if (normDdcci === normWmi) {
        this.claimedWmiIds.add(wmiId);
        return name;
      }
    }
    for (const [wmiId, name] of this.wmiMonitorNames) {
      if (this.claimedWmiIds.has(wmiId)) continue;
      const normWmi = this.normalizeMonitorId(wmiId);
      if (normDdcci.includes(normWmi) || normWmi.includes(normDdcci)) {
        this.claimedWmiIds.add(wmiId);
        return name;
      }
    }
    for (const [wmiId, name] of this.wmiMonitorNames) {
      if (this.claimedWmiIds.has(wmiId)) continue;
      return name;
    }
    return defaultName;
  }

  private async refreshInternalMonitors(): Promise<void> {
    try {
      const script = `Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorBrightness | ForEach-Object { Write-Output "$($_.InstanceName)|$($_.CurrentBrightness)" }`;
      const { stdout } = await execAsync(encodePsCommand(script));

      stdout
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.includes("|"))
        .forEach((line) => {
          const sepIndex = line.lastIndexOf("|");
          const id = line.substring(0, sepIndex).trim();
          const brightness = parseInt(line.substring(sepIndex + 1).trim());
          if (!id || isNaN(brightness)) return;

          const monitor: MonitorInfo = {
            id,
            name: this.matchWmiName(id, "Dahili Ekran"),
            brightness,
            type: "internal",
            enabled: true,
            isOnline: true,
          };
          this.knownMonitors.set(id, monitor);
        });
    } catch (err) {
      // Internal monitors usually don't disappear, but let's be safe
    }
  }

  private async refreshExternalMonitors(): Promise<void> {
    try {
      const monitorIds = ddcci.getMonitorList();

      this.knownMonitors.forEach((m) => {
        if (m.type === "external") m.isOnline = false;
      });

      const internalIds = new Set<string>();
      this.knownMonitors.forEach((m) => {
        if (m.type === "internal") internalIds.add(m.id);
      });

      const onlineDdcciIds: string[] = [];

      await Promise.all(
        monitorIds.map(async (id) => {
          try {
            const brightness = await withTimeout(ddcci.getBrightness(id), 3000);
            const existing = this.knownMonitors.get(id);

            const monitor: MonitorInfo = {
              id,
              name: this.matchWmiName(id, "Harici Ekran"),
              brightness,
              type: "external",
              enabled: existing ? existing.enabled : true,
              isOnline: true,
            };
            this.knownMonitors.set(id, monitor);
            onlineDdcciIds.push(id);
          } catch (e) {
            // keep as offline
          }
        }),
      );

      const onlineIdsSet = new Set(onlineDdcciIds);
      for (const [wmiId, name] of this.wmiMonitorNames) {
        if (this.claimedWmiIds.has(wmiId)) continue;
        this.claimedWmiIds.add(wmiId);
        const fakeId = `wmi-unreachable-${wmiId}`;
        const existing = this.knownMonitors.get(fakeId);
        const monitor: MonitorInfo = {
          id: fakeId,
          name,
          brightness: existing?.brightness ?? 0,
          type: "external",
          enabled: false,
          isOnline: false,
        };
        this.knownMonitors.set(fakeId, monitor);
      }
    } catch (err) {
      console.error("Refresh external monitors failed:", err);
    }
  }

  async setBrightness(id: string, level: number): Promise<void> {
    const monitor = this.knownMonitors.get(id);
    if (!monitor) return;

    if (monitor.type === "internal") {
      const command = `powershell -Command "(Get-WmiObject -Namespace root/wmi -Class WmiMonitorBrightnessMethods).WmiSetBrightness(0, ${level})"`;
      await execAsync(command);
      monitor.brightness = level;
    } else {
      try {
        await ddcci.setBrightness(id, level);
        monitor.brightness = level;
      } catch (e) {
        console.error("Failed to set external brightness:", e);
      }
    }
  }

  async toggleMonitor(id: string, state: boolean): Promise<void> {
    const monitor = this.knownMonitors.get(id);
    if (!monitor || monitor.type === "internal") return;

    try {
      if (state) {
        try {
          const wakeScript = `
Add-Type -TypeDefinition '
using System;
using System.Runtime.InteropServices;
public class MonitorPower {
  [DllImport("user32.dll")]
  public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")]
  public static extern IntPtr GetDesktopWindow();
}
' -PassThru | Select-Object -First 1 | Out-Null
$HWND = [MonitorPower]::GetDesktopWindow()
[MonitorPower]::SendMessage($HWND, 0x0112, [IntPtr]0xF170, [IntPtr]2) | Out-Null
Start-Sleep -Milliseconds 500
[MonitorPower]::SendMessage($HWND, 0x0112, [IntPtr]0xF170, [IntPtr]2) | Out-Null
Start-Sleep -Milliseconds 500
`.trim();
          await execAsync(encodePsCommand(wakeScript), { timeout: 5000 });
        } catch {
          /* ignore wake signal errors */
        }

        try {
          await ddcci._setVCP(id, 0xd6, 1);
          await new Promise((r) => setTimeout(r, 800));
          await ddcci._setVCP(id, 0xd6, 1);
        } catch {
          /* monitor may not respond yet */
        }

        if (monitor.brightness === 0) {
          try {
            await ddcci.setBrightness(id, 10);
            monitor.brightness = 10;
          } catch {
            /* ignore */
          }
        }
      } else {
        await ddcci._setVCP(id, 0xd6, 4);
      }
      monitor.enabled = state;
    } catch (e) {
      console.error("Failed to toggle power:", e);
    }
  }

}
