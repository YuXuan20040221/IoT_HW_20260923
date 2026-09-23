# 台灣天氣預報儀表板 (IoT Weather Dashboard)

本專案採用 **Jamstack 架構**，專為 **Vercel** 與純靜態雲端平台最佳化：
- **前端 (Vercel)**：純靜態頁面（HTML5 + 原生 JavaScript + Vanilla CSS + Chart.js + **Leaflet.js 高精度台灣向量地圖**）。
- **資料自動定時更新 (GitHub Actions)**：定時排程抓取中央氣象署 API，產生獨立的 `data/O-A0001-001.json` 與 `data/F-D0047-091.json` 並自動 commit & push 回 GitHub。
- **自動化持續部署 (Vercel CI/CD)**：GitHub 收到新天氣資料後，**Vercel 會自動觸發即時重新部署**，使用者隨時都能看到最新預報！
- **安全性 (GitHub Secrets)**：API Key 妥善保存在 GitHub Secrets 中，**前端完全零金鑰暴露**，亦無 CORS 跨網域阻擋問題。

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
│   ├── O-A0001-001.json       # 氣象署即時觀測資料 (含歷史時間點累積)
│   ├── F-D0047-091.json       # 氣象署預報資料 (22 縣市未來一週與逐時預報)
│   └── taiwan_counties.json   # 台灣 22 縣市高精度向量邊界圖資 (GeoJSON)
├── index.html                 # 儀表板主要頁面
├── style.css                  # 響應式 (RWD) 現代化樣式
├── api.js                     # 讀取氣象 JSON 資料與解析器
├── app.js                     # Leaflet 地圖、縣市動態上色、Chart.js 圖表
├── vercel.json                # Vercel 部署路由與快取設定
└── package.json               # 專案資訊與執行腳本
```

---

## 🚀 Vercel 部署教學步驟（5 分鐘快速上線）

### 步驟 1：將程式碼 Push 到你的 GitHub Repository
在終端機（PowerShell / Git Bash）執行：
```powershell
git add .
git commit -m "feat: configure for vercel deployment"
git push origin main
```

---

### 步驟 2：在 GitHub 設定氣象署 API Key (Secrets)
1. 進入你的 GitHub Repository 頁面。
2. 點擊 **Settings** ➔ **Secrets and variables** ➔ **Actions**。
3. 點擊 **New repository secret**：
   - **Name**: `CWA_API_KEY`
   - **Secret**: 填入你在中央氣象署申請的授權碼（如 `CWA-3B6865FE-6EE7-43F4-97A1-4C51038A70CF`）。
4. 點擊 **Add secret**。
5. 前往 **Settings** ➔ **Actions** ➔ **General** ➔ 捲到下方 **Workflow permissions** ➔ 勾選 **Read and write permissions** ➔ 點擊 **Save**。

---

### 步驟 3：在 Vercel 上匯入專案並部署
1. 前往 [Vercel 官網 (vercel.com)](https://vercel.com/)，使用你的 **GitHub 帳號** 登入。
2. 登入後點擊右上角的 **「Add New...」** ➔ 選擇 **「Project」**。
3. 在 **Import Git Repository** 清單中，找到你的 `IoT_HW_20260923` 專案，點擊 **「Import」**。
4. **設定頁面 (Configure Project)**：
   - **Framework Preset**: 選擇 `Other`（或保留預設）。
   - **Root Directory**: `./`（保留預設）。
   - **Build and Output Settings**: 無需修改。
5. 點擊 **「Deploy」** 按鈕！
6. 幾秒鐘內建置完成，點擊畫面上的 **「Visit」** 或預覽圖，就能看到你的專屬 Vercel 上線網址（例如 `https://iot-hw-20260923.vercel.app`）！

---

### 步驟 4：測試與驗證自動更新
- 之後 GitHub Actions 每天定時抓取最新天氣資料並 push 回 GitHub 時，**Vercel 會自動偵測並重新部署最新資料**！
- 若想立即手動更新：
  前往 GitHub Repo ➔ **Actions** ➔ 點擊 **Update Weather Data** ➔ 點擊 **Run workflow**。


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
  