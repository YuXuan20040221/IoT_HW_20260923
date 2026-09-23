/**
 * app.js — 前端地圖與互動控制模組
 *
 * 核心升級：
 *   1. 使用台灣內政部國土測繪中心 (NLSC) 官方通用地圖 + OSM（免 API Key、零浮水印、繁體中文地名最精準）。
 *   2. 移除滿版干擾標籤，保持地圖清爽，Hover 時顯示詳細 Tooltip。
 *   3. 點擊縣市彈出面板，再次點擊相同縣市或地圖空白處即收回。
 *   4. 支援觀測歷史時間切換。
 *   5. 完整解析氣象署未來一週預報與逐時預報圖表。
 */

// ============================================================
// ── 狀態管理 (State) ─────────────────────────────────────────
// ============================================================

const State = {
  activeMetric: "temp", // 'temp' | 'rain' | 'humidity' | 'wx'
  selectedCounty: null,
  selectedHistoryIndex: -1, // -1 表示最新
  obsData: new Map(),
  forecastData: null,
  geoJsonData: null,
  forecastType: "weekly", // 'weekly' | 'hourly'
  charts: {
    showTempLine: true,
    showRainBar: false,
  },
  chartInstances: {
    temp: null,
    rain: null,
  },
  map: null,
  geoJsonLayer: null,
};

// ============================================================
// ── DOM 快取 ──────────────────────────────────────────────────
// ============================================================

const DOM = {
  loadingOverlay: () => document.getElementById("loading-overlay"),
  errorBanner: () => document.getElementById("error-banner"),
  navTabs: () => document.querySelectorAll(".nav-tab"),
  timeSelect: () => document.getElementById("time-select"),
  legendBar: () => document.querySelector(".legend-bar"),
  legendMin: () => document.getElementById("legend-min"),
  legendMax: () => document.getElementById("legend-max"),
  infoPanel: () => document.getElementById("info-panel"),
  panelCityName: () => document.getElementById("panel-city-name"),
  panelStationInfo: () => document.getElementById("panel-station-info"),
  panelCurrentObs: () => document.getElementById("current-obs"),
  forecastTypeSelect: () => document.getElementById("forecast-type-select"),
  hourlyList: () => document.getElementById("hourly-list"),
  chartTempWrapper: () => document.getElementById("chart-temp-wrapper"),
  chartRainWrapper: () => document.getElementById("chart-rain-wrapper"),
  chkTempLine: () => document.getElementById("chk-temp-line"),
  chkRainBar: () => document.getElementById("chk-rain-bar"),
  btnRefresh: () => document.getElementById("btn-refresh"),
  btnClosePanel: () => document.getElementById("btn-close-panel"),
};

// ============================================================
// ── 工具與色彩對應 ────────────────────────────────────────────
// ============================================================

function setLoading(show) {
  const el = DOM.loadingOverlay();
  if (el) {
    if (show) el.classList.remove("hidden");
    else el.classList.add("hidden");
  }
}

function showError(msg) {
  const el = DOM.errorBanner();
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  setTimeout(() => { el.style.display = "none"; }, 6000);
}

function normalizeCountyName(name) {
  if (!name) return "";
  return name.replace(/台/g, "臺");
}

function getCountyMetricInfo(countyName, metric) {
  const norm = normalizeCountyName(countyName);
  let obs = State.obsData.get(norm);
  if (!obs) {
    for (const [k, v] of State.obsData.entries()) {
      if (normalizeCountyName(k) === norm) {
        obs = v;
        break;
      }
    }
  }

  if (!obs) return { val: -99, text: "無資料" };

  switch (metric) {
    case "temp":
      return { val: obs.temp, text: obs.temp !== -99 ? `${obs.temp}°C` : "—" };
    case "rain":
      return { val: obs.rain, text: `${obs.rain}mm` };
    case "humidity":
      return { val: obs.humidity, text: obs.humidity !== -99 ? `${obs.humidity}%` : "—" };
    case "wx":
      return { val: 0, text: obs.weather };
    default:
      return { val: 0, text: "—" };
  }
}

function getColor(metric, val) {
  if (val === -99 || val === undefined || isNaN(val)) {
    return "#cbd5e1"; // 無資料淡灰
  }

  if (metric === "temp") {
    if (val < 18) return "#38bdf8"; // 涼
    if (val < 24) return "#a3e635"; // 舒適
    if (val < 28) return "#facc15"; // 暖
    if (val < 32) return "#f97316"; // 熱
    return "#ef4444"; // 酷熱
  } else if (metric === "rain") {
    if (val <= 0) return "#f8fafc";
    if (val < 5) return "#c7d2fe";
    if (val < 20) return "#818cf8";
    if (val < 60) return "#4f46e5";
    return "#312e81";
  } else if (metric === "humidity") {
    if (val < 60) return "#fef08a";
    if (val < 75) return "#4ade80";
    if (val < 88) return "#06b6d4";
    return "#1d4ed8";
  } else {
    return "#60a5fa";
  }
}

function getMetricName(m) {
  switch (m) {
    case "temp": return "即時氣溫";
    case "rain": return "今日累積雨量";
    case "humidity": return "相對濕度";
    case "wx": return "天氣現象";
    default: return "";
  }
}

// ============================================================
// ── Leaflet 地圖核心 (無浮水印、免 API Key) ────────────────────
// ============================================================

function initMap() {
  if (State.map) return;

  // 聚焦台灣本島與外島
  State.map = L.map("map", {
    center: [23.75, 120.95],
    zoom: 7.7,
    minZoom: 6,
    maxZoom: 14,
    zoomSnap: 0.1,
    zoomControl: true,
  });

  // 使用台灣內政部國土測繪中心 (NLSC) 官方通用電子地圖 WMTS
  // 繁體中文最精確、全台公路邊界清晰、無水印、合法免費開放
  const nlscLayer = L.tileLayer("https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://maps.nlsc.gov.tw/" target="_blank">內政部國土測繪中心</a>',
  });

  // 備用 OpenStreetMap 官方地圖
  const osmLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  });

  nlscLayer.addTo(State.map);

  // 點擊地圖空白處收回右側面板
  State.map.on("click", (e) => {
    if (!e.originalEvent._handledByCounty) {
      closePanel();
    }
  });
}

/**
 * 繪製縣市多邊形與上色（乾淨無雜亂標籤）
 */
function renderGeoJsonLayer() {
  if (!State.map || !State.geoJsonData) return;

  if (State.geoJsonLayer) {
    State.map.removeLayer(State.geoJsonLayer);
  }

  State.geoJsonLayer = L.geoJSON(State.geoJsonData, {
    style: (feature) => {
      const rawName = feature.properties.COUNTYNAME || feature.properties.name;
      const countyName = normalizeCountyName(rawName);
      const info = getCountyMetricInfo(countyName, State.activeMetric);
      const isSelected = State.selectedCounty && normalizeCountyName(State.selectedCounty) === countyName;

      return {
        fillColor: getColor(State.activeMetric, info.val),
        weight: isSelected ? 3.5 : 1.5,
        opacity: 1,
        color: isSelected ? "#1d4ed8" : "#334155",
        dashArray: isSelected ? "" : "3",
        fillOpacity: isSelected ? 0.88 : 0.65,
      };
    },
    onEachFeature: (feature, layer) => {
      const rawName = feature.properties.COUNTYNAME || feature.properties.name || "未命名";
      const countyName = normalizeCountyName(rawName);

      // 綁定精美 Tooltip（Hover 時顯示）
      const updateTooltip = () => {
        const info = getCountyMetricInfo(countyName, State.activeMetric);
        layer.bindTooltip(
          `<div style="font-size:13px;line-height:1.4;">
            <strong style="font-size:14px;color:#38bdf8;">${countyName}</strong><br/>
            ${getMetricName(State.activeMetric)}：<b style="color:#fff;">${info.text}</b>
           </div>`,
          { className: "custom-tooltip", sticky: true, opacity: 0.95 }
        );
      };
      updateTooltip();

      // 事件處理
      layer.on({
        mouseover: (e) => {
          const l = e.target;
          l.setStyle({
            weight: 3,
            color: "#0f172a",
            dashArray: "",
            fillOpacity: 0.85,
          });
          if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
            l.bringToFront();
          }
        },
        mouseout: (e) => {
          State.geoJsonLayer.resetStyle(e.target);
        },
        click: (e) => {
          e.originalEvent._handledByCounty = true;
          L.DomEvent.stopPropagation(e);
          // 再次點擊同一個縣市時收回面板
          if (State.selectedCounty && normalizeCountyName(State.selectedCounty) === countyName) {
            closePanel();
          } else {
            openPanel(countyName);
          }
        },
      });
    },
  }).addTo(State.map);
}

function updateLegend() {
  const bar = DOM.legendBar();
  const minEl = DOM.legendMin();
  const maxEl = DOM.legendMax();
  if (!bar || !minEl || !maxEl) return;

  bar.className = `legend-bar ${State.activeMetric}`;
  const labels = {
    temp: { min: "15°C", max: "37°C" },
    rain: { min: "0mm", max: "100mm+" },
    humidity: { min: "50%", max: "95%" },
    wx: { min: "晴朗", max: "陰雨" },
  };
  const lbl = labels[State.activeMetric] || { min: "", max: "" };
  minEl.textContent = lbl.min;
  maxEl.textContent = lbl.max;
}

// ============================================================
// ── 右側面板與詳細預報 ─────────────────────────────────────────
// ============================================================

async function openPanel(countyName) {
  State.selectedCounty = countyName;
  renderGeoJsonLayer();

  const panel = DOM.infoPanel();
  panel?.classList.add("open");

  if (DOM.panelCityName()) DOM.panelCityName().textContent = countyName;

  renderObsCards(countyName);

  try {
    setLoading(true);
    State.forecastData = await WeatherAPI.fetchForecastByCounty(countyName);
    renderForecastSection();
    renderCharts();
  } catch (err) {
    console.error("[app] fetchForecast error:", err);
    showError(`無法載入 ${countyName} 的預報資料：${err.message}`);
  } finally {
    setLoading(false);
  }
}

function closePanel() {
  State.selectedCounty = null;
  DOM.infoPanel()?.classList.remove("open");
  renderGeoJsonLayer();
  destroyCharts();
}

function renderObsCards(countyName) {
  const container = DOM.panelCurrentObs();
  if (!container) return;

  const norm = normalizeCountyName(countyName);
  let obs = State.obsData.get(norm);
  if (!obs) {
    for (const [k, v] of State.obsData.entries()) {
      if (normalizeCountyName(k) === norm) { obs = v; break; }
    }
  }

  if (!obs) {
    container.innerHTML = `<p style="grid-column:1/-1;color:var(--color-text-muted);font-size:13px;">無此縣市即時觀測資料</p>`;
    return;
  }

  if (DOM.panelStationInfo()) {
    const timeText = obs.obsTime 
      ? new Date(obs.obsTime).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) 
      : '最新';
    DOM.panelStationInfo().textContent = `測站：${obs.stationName} (${timeText})`;
  }

  container.innerHTML = `
    <div class="obs-card wide">
      <div class="label">即時天氣現象</div>
      <div class="value" style="font-size:18px;">${obs.weather}</div>
    </div>
    <div class="obs-card">
      <div class="label">氣溫</div>
      <div class="value">${obs.temp !== -99 ? obs.temp : "—"}<span class="unit"> °C</span></div>
    </div>
    <div class="obs-card">
      <div class="label">相對濕度</div>
      <div class="value">${obs.humidity !== -99 ? obs.humidity : "—"}<span class="unit"> %</span></div>
    </div>
    <div class="obs-card wide">
      <div class="label">今日累積降雨量</div>
      <div class="value" style="color:var(--color-rain);">${obs.rain}<span class="unit"> mm</span></div>
    </div>
  `;
}

function renderForecastSection() {
  const listEl = DOM.hourlyList();
  if (!listEl) return;

  if (State.forecastType === "hourly") {
    const items = WeatherAPI.parseHourlyForecast(State.forecastData);
    if (!items.length) {
      listEl.innerHTML = `<p style="font-size:13px;color:var(--color-text-muted);padding:10px 0;">無逐時預報資料</p>`;
      return;
    }
    listEl.innerHTML = items.map((item) => `
      <div class="hourly-item">
        <span class="time">${item.time}</span>
        <span class="wx">${item.wx}</span>
        <span class="pop">💧 ${item.pop !== "—" ? item.pop + "%" : "—"}</span>
      </div>
    `).join("");
  } else {
    const { labels, maxTemps, minTemps, pops } = WeatherAPI.parseForecastChart(State.forecastData);
    if (!labels.length) {
      listEl.innerHTML = `<p style="font-size:13px;color:var(--color-text-muted);padding:10px 0;">無一週預報資料</p>`;
      return;
    }
    listEl.innerHTML = labels.map((label, i) => `
      <div class="hourly-item">
        <span class="time">${label}</span>
        <span class="wx">
          <span style="color:var(--color-hot);">${maxTemps[i]}°</span> / 
          <span style="color:var(--color-cold);">${minTemps[i]}°</span>
        </span>
        <span class="pop">💧 ${pops[i]}%</span>
      </div>
    `).join("");
  }
}

// ============================================================
// ── Chart.js 趨勢圖表 ─────────────────────────────────────────
// ============================================================

function destroyCharts() {
  if (State.chartInstances.temp) {
    State.chartInstances.temp.destroy();
    State.chartInstances.temp = null;
  }
  if (State.chartInstances.rain) {
    State.chartInstances.rain.destroy();
    State.chartInstances.rain = null;
  }
}

function renderCharts() {
  destroyCharts();

  const { labels, maxTemps, minTemps, pops } = WeatherAPI.parseForecastChart(State.forecastData);
  if (!labels.length) return;

  // 1. 溫度折線圖
  const tempWrapper = DOM.chartTempWrapper();
  if (tempWrapper) tempWrapper.style.display = State.charts.showTempLine ? "block" : "none";

  if (State.charts.showTempLine) {
    const canvas = document.getElementById("chart-temp");
    if (canvas) {
      State.chartInstances.temp = new Chart(canvas, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "最高溫 (°C)",
              data: maxTemps,
              borderColor: "#ef4444",
              backgroundColor: "rgba(239, 68, 68, 0.08)",
              tension: 0.35,
              fill: true,
              pointRadius: 4,
            },
            {
              label: "最低溫 (°C)",
              data: minTemps,
              borderColor: "#3b82f6",
              backgroundColor: "rgba(59, 130, 246, 0.08)",
              tension: 0.35,
              fill: true,
              pointRadius: 4,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "top", labels: { font: { size: 11 } } },
          },
          scales: {
            x: { ticks: { font: { size: 11 } }, grid: { display: false } },
            y: { ticks: { font: { size: 11 }, callback: (v) => `${v}°` } },
          },
        },
      });
    }
  }

  // 2. 降雨長條圖
  const rainWrapper = DOM.chartRainWrapper();
  if (rainWrapper) rainWrapper.style.display = State.charts.showRainBar ? "block" : "none";

  if (State.charts.showRainBar) {
    const canvas = document.getElementById("chart-rain");
    if (canvas) {
      State.chartInstances.rain = new Chart(canvas, {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: "降雨機率 (%)",
              data: pops,
              backgroundColor: "rgba(99, 102, 241, 0.7)",
              borderColor: "#6366f1",
              borderWidth: 1,
              borderRadius: 4,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { min: 0, max: 100, ticks: { callback: (v) => `${v}%` } },
          },
        },
      });
    }
  }
}

// ============================================================
// ── 事件綁定與初始化 ──────────────────────────────────────────
// ============================================================

function bindEvents() {
  DOM.navTabs().forEach((tab) => {
    tab.addEventListener("click", () => {
      DOM.navTabs().forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      State.activeMetric = tab.dataset.metric;
      renderGeoJsonLayer();
      updateLegend();
    });
  });

  DOM.timeSelect()?.addEventListener("change", async (e) => {
    State.selectedHistoryIndex = parseInt(e.target.value, 10);
    setLoading(true);
    try {
      State.obsData = await WeatherAPI.fetchObservationData(State.selectedHistoryIndex);
      renderGeoJsonLayer();
      if (State.selectedCounty) {
        renderObsCards(State.selectedCounty);
      }
    } catch (err) {
      showError(`載入歷史觀測失敗: ${err.message}`);
    } finally {
      setLoading(false);
    }
  });

  DOM.btnClosePanel()?.addEventListener("click", closePanel);

  DOM.forecastTypeSelect()?.addEventListener("change", (e) => {
    State.forecastType = e.target.value;
    renderForecastSection();
  });

  DOM.chkTempLine()?.addEventListener("change", (e) => {
    State.charts.showTempLine = e.target.checked;
    renderCharts();
  });

  DOM.chkRainBar()?.addEventListener("change", (e) => {
    State.charts.showRainBar = e.target.checked;
    renderCharts();
  });

  DOM.btnRefresh()?.addEventListener("click", () => {
    loadAllData();
  });
}

async function updateHistorySelectDropdown() {
  const select = DOM.timeSelect();
  if (!select) return;

  try {
    const list = await WeatherAPI.fetchObservationHistoryList();
    select.innerHTML = list.map((item) => `
      <option value="${item.index}">${item.label}</option>
    `).join("");
  } catch (err) {
    console.warn("取得歷史清單失敗:", err);
  }
}

async function loadAllData() {
  const btn = DOM.btnRefresh();
  btn?.classList.add("loading");
  setLoading(true);

  try {
    const [obs, geo] = await Promise.all([
      WeatherAPI.fetchObservationData(State.selectedHistoryIndex),
      WeatherAPI.fetchCountiesGeoJSON(),
    ]);

    State.obsData = obs;
    State.geoJsonData = geo;

    await updateHistorySelectDropdown();
    renderGeoJsonLayer();
    updateLegend();

    if (State.selectedCounty) {
      renderObsCards(State.selectedCounty);
      State.forecastData = await WeatherAPI.fetchForecastByCounty(State.selectedCounty);
      renderForecastSection();
      renderCharts();
    }
  } catch (err) {
    console.error("[app] loadAllData error:", err);
    showError(`資料載入失敗：${err.message}`);
  } finally {
    btn?.classList.remove("loading");
    setLoading(false);
  }
}

async function init() {
  console.log("[app] 正在初始化高精度台灣天氣儀表板...");
  initMap();
  bindEvents();
  await loadAllData();
  console.log("[app] 初始化完成。");
}

document.addEventListener("DOMContentLoaded", init);


