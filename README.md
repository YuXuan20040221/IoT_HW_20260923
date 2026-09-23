# 台灣天氣預報儀表板 (IoT Weather Dashboard)

本專案採用 **Jamstack 架構**：
- **前端 (GitHub Pages)**：純靜態頁面（HTML5 + 原生 JavaScript + Vanilla CSS + Chart.js + **Leaflet.js 高精度台灣地理邊界地圖**）。
- **資料自動更新 (GitHub Actions)**：定時排程執行後端腳本，分別呼叫中央氣象署 API，產生獨立的 `data/O-A0001-001.json` 與 `data/F-D0047-091.json` 並自動 commit & push。
- **安全機制 (GitHub Secrets)**：API Key 妥善保存在 GitHub Secrets 中，**前端程式碼完全不含任何金鑰**，亦無 CORS 跨網域阻擋問題。

---

## 系統架構

```
IoT_HW_20260923/
├── .github/workflows/
│   └── update-weather.yml     # GitHub Actions 定時更新工作流程
├── scripts/
│   ├── fetch_weather.py       # Python 抓取腳本 (支援無依賴執行)
│   └── fetch-weather.js       # Node.js 抓取腳本 (GitHub Actions 執行)
├── data/
│   ├── O-A0001-001.json       # 氣象署即時觀測資料 (22 縣市測站溫濕度、雨量)
│   ├── F-D0047-091.json       # 氣象署預報資料 (22 縣市未來一週與逐時預報)
│   └── taiwan_counties.json   # 台灣 22 縣市高精度向量邊界圖資 (GeoJSON)
├── index.html                 # 儀表板主要頁面 (Leaflet 地圖 + 雙欄儀表板)
├── style.css                  # 響應式 (RWD) 現代化樣式與地圖主題
├── api.js                     # 分別讀取 O-A0001-001.json 與 F-D0047-091.json 並提供解析
└── app.js                     # Leaflet 地圖渲染、縣市動態上色、地名標籤、Chart.js 圖表
```

---

## 核心功能亮點

1. **🗺️ Google Maps 風格高精度台灣地圖**：
   - 採用 **Leaflet.js + CartoDB Voyager** 高畫質向量底圖（含繁體中文地名、道路、清晰分界線）。
   - 台灣 22 縣市（含澎湖、金門、馬祖）精確真實經緯度多邊形邊界。
   - 縣市中心自動繪製浮動地名與即時數據 Badge 標籤（如 `臺北市 28.5°C`）。
   - 根據【溫度 / 雨量 / 濕度 / 天氣現象】動態計算色階半透明上色（Choropleth Map）。
2. **📊 模組化獨立 JSON 讀取**：
   - `fetchObservationData()` 直接精確解析 `O-A0001-001.json` 測站欄位。
   - `fetchForecastByCounty()` 直接精確解析 `F-D0047-091.json` 預報欄位。
3. **📈 互動趨勢圖表 (Chart.js)**：
   - 未來 7 天最高/最低溫平滑曲線圖。
   - 降雨機率長條圖。
   - 今日逐 3 小時天氣預報清單。

---

## 部署與設定指南 (GitHub Secrets)

### 步驟 1：設定 GitHub Secrets
1. 進入你的 GitHub Repository 頁面。
2. 點擊 **Settings** -> **Secrets and variables** -> **Actions**。
3. 點擊 **New repository secret**：
   - **Name**: `CWA_API_KEY`
   - **Secret**: 填入你在中央氣象署開放資料平台申請的授權碼（例如 `CWA-XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX`）。
4. 點擊 **Add secret** 儲存。

### 步驟 2：啟用 GitHub Actions 寫入權限
1. 在 Repository 點擊 **Settings** -> **Actions** -> **General**。
2. 捲動到 **Workflow permissions**，選擇 **Read and write permissions**。
3. 點擊 **Save**。

### 步驟 3：啟用 GitHub Pages
1. 在 Repository 點擊 **Settings** -> **Pages**。
2. **Source** 選擇 **Deploy from a branch**。
3. **Branch** 選擇 `main`（或 `master`），資料夾選擇 `/ (root)`。
4. 點擊 **Save**，幾分鐘後即可透過專屬網址瀏覽網站。

### 步驟 4：手動測試更新資料
1. 進入 Repository 的 **Actions** 分頁。
2. 點擊左側的 **Update Weather Data** 工作流程。
3. 點擊右側的 **Run workflow** 下拉選單並確認執行。
4. 成功完成後，`data/weather.json` 會自動更新！

---

## 本機預覽測試

若要在本機預覽：
1. 直接使用 VSCode 的 **Live Server** 擴充套件開啟 `index.html`。
2. 若要手動更新本地天氣資料，可執行：
   ```powershell
   $env:CWA_API_KEY="你的氣象署APIKey"; python scripts/fetch_weather.py
   ```
  