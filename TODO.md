# Brightness Control - Fix Plan (Electron Runtime Error)

## ✅ Plan Bilgisi
- **Sorun:** electron.app undefined (ESM/CJS conflict)
- **Sebep:** electron-vite externalization eksik
- **Hedef:** npm run dev → çalışan app → çalışan EXE

## 📋 Adımlar (Sırasıyla)

### [✅] 1. Config Fix
- electron.vite.config.ts → externalize ekle **TAMAMLANDI**
- Test: npm run dev **BAŞARILI** - Electron çalışıyor!

### [✅] 2. Package.json Scripts
- Production build **BAŞARILI**
- out/renderer production assets hazır

### [ ] 3. Runtime Test
- **HATA:** Access denied (dist/ kilitli)
- **Çözüm:** Klasör temizle + rebuild
- EXE test: hotkeys, tray, monitors

### [ ] 4. Cleanup
- TODO.md sil
- Final test

**Durum: %90 - Dev çalışıyor, EXE için manuel cleanup**
