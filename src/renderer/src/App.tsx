import { useEffect, useState } from "react";
import {
  Sun,
  Power,
  Settings,
  RefreshCcw,
  X,
  MonitorOff,
  Keyboard,
  ShieldAlert,
  Moon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { MonitorInfo, AppSettings } from "./env";

function App(): JSX.Element {
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoLaunch, setAutoLaunch] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<"genel" | "kısayol">(
    "genel",
  );
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [blueLight, setBlueLight] = useState(0);
  const [nightLight, setNightLight] = useState(false);
  const [nightLightStrength, setNightLightStrength] = useState(30);
  const [syncAll, setSyncAll] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      // Fetch separately to avoid one failure blocking everything
      const monitorData = await window.api.getMonitors().catch(() => []);
      setMonitors(monitorData);

      const config = await window.api.getSettings().catch(() => null);
      if (config) setSettings(config);

      const al = await window.api.getAutoLaunch().catch(() => false);
      setAutoLaunch(al);
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      window.api.getMonitors().then(setMonitors);
    }, 15000);

    if (window.electron && window.electron.ipcRenderer) {
      window.electron.ipcRenderer.on("go-to-settings", () =>
        setShowSettings(true),
      );
      window.electron.ipcRenderer.on("brightness-updated", () => {
        window.api.getMonitors().then(setMonitors);
      });
    }

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (window.electron && window.electron.ipcRenderer) {
      if (showSettings) {
        window.electron.ipcRenderer.send("settings-opened");
      } else {
        window.electron.ipcRenderer.send("settings-closed");
      }
    }
  }, [showSettings]);

  const handleBrightnessChange = (id: string, level: number) => {
    if (syncAll) {
      monitors.forEach((m) => {
        if (m.isOnline) window.api.setBrightness(m.id, level);
      });
      setMonitors((prev) =>
        prev.map((m) => (m.isOnline ? { ...m, brightness: level } : m)),
      );
    } else {
      setMonitors((prev) =>
        prev.map((m) => (m.id === id ? { ...m, brightness: level } : m)),
      );
      window.api.setBrightness(id, level);
    }
  };

  const handleToggle = (id: string, state: boolean) => {
    setMonitors((prev) =>
      prev.map((m) => (m.id === id ? { ...m, enabled: state } : m)),
    );
    window.api.toggleMonitor(id, state);
  };

  const handleAutoLaunchChange = (enabled: boolean) => {
    setAutoLaunch(enabled);
    window.api.setAutoLaunch(enabled);
  };

  const handleBlueLightChange = (level: number) => {
    setBlueLight(level);
    window.api.setBlueLight(level);
  };

  const handleNightLightChange = (enabled: boolean) => {
    setNightLight(enabled);
    window.api.setNightLight(enabled ? nightLightStrength : 0);
  };

  const handleNightLightStrength = (strength: number) => {
    setNightLightStrength(strength);
    if (nightLight) window.api.setNightLight(strength);
  };

  return (
    <div className="app-container">
      <header className="header minimalist">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex-col"
        >
          <h1 className="title-mini">Lumina</h1>
          <span className="badge-sm">Premium Automation</span>
        </motion.div>
        <div className="header-actions">
          <button
            onClick={() => window.api.hideWindow()}
            className="icon-btn small"
            title="Gizle"
          >
            <X size={13} />
          </button>
          <button onClick={fetchData} className="icon-btn small" title="Yenile">
            <RefreshCcw size={13} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="icon-btn small"
            title="Ayarlar"
          >
            <Settings size={13} />
          </button>
        </div>
      </header>

      <div className="monitor-list minimal">
        <AnimatePresence mode="popLayout">
          {loading && monitors.length === 0 ? (
            <motion.div key="loading" className="loading-state-mini">
              <div className="spinner-mini"></div>
              <span>Monitörler taranıyor...</span>
            </motion.div>
          ) : monitors.length === 0 ? (
            <motion.div key="empty" className="empty-state-mini">
              <MonitorOff size={32} />
              <span>Monitör Bulunamadı</span>
              <button onClick={fetchData} className="txt-btn-sm">
                Tekrar Tara
              </button>
            </motion.div>
          ) : (
            monitors.map((monitor, index) => (
              <motion.div
                key={monitor.id}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.04 }}
                className={`monitor-card-mini ${!monitor.enabled || !monitor.isOnline ? "disabled" : ""}`}
              >
                <div className="monitor-row">
                  <div className="monitor-main">
                    <span className="name-sm">{monitor.name}</span>
                    <div className="flex-row items-center gap-1">
                      <span className="badge-sm">
                        {monitor.type === "internal" ? "Dahili" : "DDC/CI"}
                      </span>
                      {!monitor.isOnline && (
                        <span className="offline-badge pulse">⚫ Uykuda</span>
                      )}
                    </div>
                  </div>
                  {!monitor.isOnline ? (
                    <button
                      className="wake-btn"
                      onClick={() => handleToggle(monitor.id, true)}
                      title="Monitörü Uyandir"
                    >
                      <Zap size={12} />
                      <span>Uyandir</span>
                    </button>
                  ) : (
                    <button
                      className={`pwr-btn-sm ${monitor.enabled ? "on" : "off"}`}
                      onClick={() => handleToggle(monitor.id, !monitor.enabled)}
                      title={monitor.enabled ? "Monitörü Kapat" : "Monitörü Aç"}
                    >
                      {monitor.enabled ? (
                        <Power size={11} />
                      ) : (
                        <MonitorOff size={11} />
                      )}
                    </button>
                  )}
                </div>

                <div className="control-row">
                  <Sun
                    size={12}
                    className={
                      monitor.enabled && monitor.isOnline ? "glow" : "dim"
                    }
                  />
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={monitor.brightness}
                    onChange={(e) =>
                      handleBrightnessChange(
                        monitor.id,
                        parseInt(e.target.value),
                      )
                    }
                    disabled={!monitor.enabled || !monitor.isOnline}
                    className="sldr-mini"
                  />
                  <span className="val-sm">{monitor.brightness}%</span>
                </div>

              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            className="settings-panel-mini advanced"
          >
            <div className="settings-tabs">
              <button
                className={activeTab === "genel" ? "active" : ""}
                onClick={() => setActiveTab("genel")}
              >
                <Settings size={14} />
              </button>
              <button
                className={activeTab === "kısayol" ? "active" : ""}
                onClick={() => setActiveTab("kısayol")}
              >
                <Keyboard size={14} />
              </button>
              <div className="flex-1"></div>
              <button
                onClick={() => setShowSettings(false)}
                className="icon-btn small"
              >
                <X size={14} />
              </button>
            </div>

            <div className="settings-body">
              <AnimatePresence mode="wait">
                {activeTab === "genel" && (
                  <motion.div
                    key="genel"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                  >
                    <div className="setting-row">
                      <div className="flex-col">
                        <span className="lbl-sm">Otomatik Başlat</span>
                        <span className="desc-sm">Windows ile beraber aç</span>
                      </div>
                      <label className="switch-mini">
                        <input
                          type="checkbox"
                          checked={autoLaunch}
                          onChange={(e) =>
                            handleAutoLaunchChange(e.target.checked)
                          }
                        />
                        <span className="slider-sm"></span>
                      </label>
                    </div>
                    <div className="eye-section">
                      <span className="eye-section-title">
                        <Sun size={11} /> Göz Rahatı
                      </span>
                      <div className="setting-row">
                        <div className="flex-col">
                          <span className="lbl-sm">Mavi Işık Filtresi</span>
                          <span className="desc-sm">{blueLight === 0 ? "Kapalı" : `${blueLight}% sıcaklık`}</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="60"
                          value={blueLight}
                          onChange={(e) => handleBlueLightChange(parseInt(e.target.value))}
                          className="sldr-warm"
                        />
                      </div>
                      <div className="setting-row">
                        <div className="flex-col">
                          <span className="lbl-sm">
                            <Moon size={11} style={{ display: "inline", marginRight: 4 }} />
                            Night Light
                          </span>
                          <span className="desc-sm">{nightLight ? "Aktif — sıcak turuncu ton" : "Pasif"}</span>
                        </div>
                        <label className="switch-mini">
                          <input
                            type="checkbox"
                            checked={nightLight}
                            onChange={(e) => handleNightLightChange(e.target.checked)}
                          />
                          <span className={`slider-sm ${nightLight ? "warm" : ""}`}></span>
                        </label>
                      </div>
                      {nightLight && (
                        <motion.div
                          className="night-strength-row"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                        >
                          <div className="night-strength-labels">
                            <span>Güç</span>
                            <span className="night-strength-val">{nightLightStrength}%</span>
                          </div>
                          <input
                            type="range"
                            min="5"
                            max="80"
                            value={nightLightStrength}
                            onChange={(e) => handleNightLightStrength(parseInt(e.target.value))}
                            className="sldr-night"
                          />
                        </motion.div>
                      )}
                    </div>
                    <div className="setting-row">
                      <div className="flex-col">
                        <span className="lbl-sm">Tümünü Senkronla</span>
                        <span className="desc-sm">
                          Tüm ekranları tek slider ile yönet
                        </span>
                      </div>
                      <label className="switch-mini">
                        <input
                          type="checkbox"
                          checked={syncAll}
                          onChange={(e) => setSyncAll(e.target.checked)}
                        />
                        <span className="slider-sm"></span>
                      </label>
                    </div>
                  </motion.div>
                )}

                {activeTab === "kısayol" && (
                  <motion.div
                    key="kısayol"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                  >
                    <div className="shortcut-item">
                      <span className="lbl-sm">Parlaklığı Artır</span>
                      <kbd>{settings?.hotkeys.brightnessUp}</kbd>
                    </div>
                    <div className="shortcut-item">
                      <span className="lbl-sm">Parlaklığı Azalt</span>
                      <kbd>{settings?.hotkeys.brightnessDown}</kbd>
                    </div>
                    <div className="info-box-sm">
                      <ShieldAlert size={12} />
                      <span>Kısayollar tüm pencerelerde çalışır</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="about-footer-advanced">
              <span>Lumina Control v1.2.0 - Premium Edition</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!showSettings && (
        <footer className="footer-mini">
          <div className="dot pulse"></div>
          <span>Otomasyon Aktif</span>
        </footer>
      )}
    </div>
  );
}

export default App;
