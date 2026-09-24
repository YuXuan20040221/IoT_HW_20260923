/**
 * api.js — 負責讀取分別存放的氣象資料檔與邊界圖資
 *
 * 支援：
 *   - ./data/O-A0001-001.json   (含歷史累積觀測資料)
 *   - ./data/F-D0047-091.json   (22 縣市未來一週與逐時預報資料)
 *   - ./data/taiwan_counties.json (台灣 22 縣市精確邊界 GeoJSON)
 */

let _cachedObsPayload = null;
let _cachedForecastData = null;
let _cachedGeoData = null;

/**
 * 取得最新資料抓取的時間戳記或指定歷史時間戳記
 * @param {number} [historyIndex=-1]
 * @returns {string}
 */
function getLatestUpdateTime(historyIndex = -1) {
  if (!_cachedObsPayload) return "即時更新";

  const history = _cachedObsPayload.history || [];
  let targetTimestamp = null;

  if (historyIndex >= 0 && history[historyIndex]) {
    targetTimestamp = history[historyIndex].timestamp;
  } else if (_cachedObsPayload.updatedAt) {
    targetTimestamp = _cachedObsPayload.updatedAt;
  } else if (history.length > 0) {
    targetTimestamp = history[history.length - 1].timestamp;
  }

  if (targetTimestamp) {
    const d = new Date(targetTimestamp);
    if (!isNaN(d.getTime())) {
      return d.toLocaleString("zh-TW", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }
  return "最新觀測";
}

/**
 * 取得即時觀測歷史時間清單（過去最多 12 小時 / 12 個時段）
 * @returns {Promise<Array<{ label: string, index: number, timestamp: string }>>}
 */
async function fetchObservationHistoryList() {
  if (!_cachedObsPayload) {
    const res = await fetch(`./data/O-A0001-001.json?_t=${Date.now()}`);
    if (!res.ok) throw new Error(`讀取觀測資料失敗 (${res.status})`);
    _cachedObsPayload = await res.json();
  }

  const allHistory = _cachedObsPayload.history || [];
  if (!allHistory.length) {
    return [{ label: "最新觀測記錄", index: -1, timestamp: new Date().toISOString() }];
  }

  // 取出過去最多 12 筆
  const history = allHistory.slice(-12);
  const totalCount = history.length;

  return history.map((item, idx) => {
    const originalIndex = allHistory.length - totalCount + idx;
    const d = new Date(item.timestamp);
    const timeLabel = isNaN(d.getTime())
      ? `第 ${idx + 1} 次觀測`
      : d.toLocaleString("zh-TW", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });

    return {
      label: `${timeLabel}`,
      index: originalIndex,
      timestamp: item.timestamp,
    };
  }).reverse(); // 最新的排在最前面
}

/**
 * 取得指定歷史時間點（或最新）的縣市觀測資料
 * @param {number} [historyIndex=-1] - 歷史記錄索引，-1 為最新
 * @returns {Promise<Map<string, Object>>} Map<countyName, obsData>
 */
async function fetchObservationData(historyIndex = -1) {
  if (!_cachedObsPayload) {
    const res = await fetch(`./data/O-A0001-001.json?_t=${Date.now()}`);
    if (!res.ok) throw new Error(`讀取觀測資料失敗 (${res.status})`);
    _cachedObsPayload = await res.json();
  }

  let records = _cachedObsPayload.latest || _cachedObsPayload.records || {};
  const history = _cachedObsPayload.history || [];

  if (historyIndex >= 0 && history[historyIndex]) {
    records = history[historyIndex].records || {};
  } else if (history.length > 0) {
    records = history[history.length - 1].records || records;
  }

  const stations = records.Station ?? [];
  const countyMap = new Map();

  // 1. 遍歷測站，依品質挑選最佳代表測站（優先選有氣溫者）
  for (const station of stations) {
    const county = station.GeoInfo?.CountyName || station.CountyName;
    if (!county) continue;

    const el = station.WeatherElement ?? {};
    const nowObj = el.Now ?? {};
    const temp = parseFloat(el.AirTemperature ?? -99);
    const humidity = parseFloat(el.RelativeHumidity ?? -99);
    const rain = parseFloat(nowObj.Precipitation ?? 0);
    const weather = el.Weather ?? "—";

    const candidate = {
      temp,
      humidity,
      rain: isNaN(rain) || rain < 0 ? 0 : rain,
      weather: weather === "-99" ? "—" : weather,
      stationName: station.StationName ?? county,
      obsTime: station.ObsTime?.DateTime ?? null,
    };

    if (!countyMap.has(county)) {
      countyMap.set(county, candidate);
    } else {
      const existing = countyMap.get(county);
      // 若既有測站無氣溫，而當前候選者有氣溫，則替換成更佳的測站
      if (existing.temp === -99 && temp !== -99) {
        countyMap.set(county, candidate);
      }
    }
  }

  return countyMap;
}

/**
 * 取得並解析指定縣市的預報資料 (F-D0047-091)
 * @param {string} countyName - 縣市名稱（例如 "臺北市" 或 "宜蘭縣"）
 * @returns {Promise<Object|null>}
 */
async function fetchForecastByCounty(countyName) {
  if (!_cachedForecastData) {
    const res = await fetch(`./data/F-D0047-091.json?_t=${Date.now()}`);
    if (!res.ok) throw new Error(`讀取預報資料失敗 (${res.status})`);
    _cachedForecastData = await res.json();
  }

  const locations = _cachedForecastData?.records?.Locations?.[0]?.Location ?? [];
  if (!locations.length) return null;

  const normalizeName = (n) => (n ? n.replace(/台/g, "臺") : "");
  const targetNorm = normalizeName(countyName);

  const loc = locations.find((l) => normalizeName(l.LocationName) === targetNorm) || locations[0];
  if (!loc) return null;

  // 整理 WeatherElement 陣列為 Map 物件
  const elements = {};
  for (const el of loc.WeatherElement ?? []) {
    elements[el.ElementName] = el.Time ?? [];
  }

  return {
    locationName: loc.LocationName,
    elements,
  };
}

/**
 * 取得台灣 22 縣市 GeoJSON 邊界
 */
async function fetchCountiesGeoJSON() {
  if (!_cachedGeoData) {
    const res = await fetch(`./data/taiwan_counties.json`);
    if (!res.ok) throw new Error(`讀取邊界圖資失敗 (${res.status})`);
    _cachedGeoData = await res.json();
  }
  return _cachedGeoData;
}

// ── 資料解析函式 ──────────────────────────────────────────────────────────────

/**
 * 解析未來 7 天最高/最低溫與降雨機率（支援氣象署中文 ElementName）
 */
function parseForecastChart(forecastData) {
  if (!forecastData || !forecastData.elements) {
    return { labels: [], maxTemps: [], minTemps: [], pops: [] };
  }

  const el = forecastData.elements;
  // 支援中文與英文欄位名稱
  const maxTimes = el["最高溫度"] || el["MaxT"] || [];
  const minTimes = el["最低溫度"] || el["MinT"] || [];
  const popTimes = el["12小時降雨機率"] || el["PoP12h"] || [];

  const count = Math.min(7, Math.max(maxTimes.length, minTimes.length));
  const labels = [];
  const maxTemps = [];
  const minTemps = [];
  const pops = [];

  for (let i = 0; i < count; i++) {
    const timeObj = maxTimes[i] || minTimes[i] || {};
    const dateStr = timeObj.StartTime || timeObj.DataTime || "";
    const label = dateStr
      ? new Date(dateStr).toLocaleDateString("zh-TW", {
        month: "numeric",
        day: "numeric",
        weekday: "short",
      })
      : `Day ${i + 1}`;

    const maxVal = maxTimes[i]?.ElementValue?.[0]?.MaxTemperature || maxTimes[i]?.ElementValue?.[0]?.MaxT || 0;
    const minVal = minTimes[i]?.ElementValue?.[0]?.MinTemperature || minTimes[i]?.ElementValue?.[0]?.MinT || 0;
    const popVal = popTimes[i]?.ElementValue?.[0]?.ProbabilityOfPrecipitation || popTimes[i]?.ElementValue?.[0]?.PoP12h || 0;

    labels.push(label);
    maxTemps.push(parseFloat(maxVal) || 0);
    minTemps.push(parseFloat(minVal) || 0);
    pops.push(parseFloat(popVal) || 0);
  }

  return { labels, maxTemps, minTemps, pops };
}

/**
 * 解析逐時預報清單（支援氣象署中文 ElementName）
 */
function parseHourlyForecast(forecastData) {
  if (!forecastData || !forecastData.elements) return [];

  const el = forecastData.elements;
  const wxTimes = el["天氣現象"] || el["Wx"] || el["天氣預報綜合描述"] || [];
  const popTimes = el["12小時降雨機率"] || el["PoP12h"] || [];
  const tempTimes = el["平均溫度"] || el["最高溫度"] || [];

  const count = Math.min(10, wxTimes.length);
  const result = [];

  for (let i = 0; i < count; i++) {
    const startStr = wxTimes[i]?.StartTime || wxTimes[i]?.DataTime || "";
    const time = startStr
      ? new Date(startStr).toLocaleString("zh-TW", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
      : `時段 ${i + 1}`;

    const wxItem = wxTimes[i]?.ElementValue?.[0] || {};
    const popItem = popTimes[i]?.ElementValue?.[0] || {};
    const tempItem = tempTimes[i]?.ElementValue?.[0] || {};

    const wx = wxItem.Weather || wxItem.WeatherDescription || "多雲";
    const pop = popItem.ProbabilityOfPrecipitation || popItem.PoP12h || "—";
    const temp = tempItem.Temperature || tempItem.MaxTemperature || "";

    result.push({
      time,
      wx: temp ? `${wx} (${temp}°C)` : wx,
      pop: pop === " " ? "0" : pop,
    });
  }

  return result;
}

function refreshData() {
  _cachedObsPayload = null;
  _cachedForecastData = null;
  return Promise.all([fetchObservationData(), fetchForecastByCounty("臺北市")]);
}

window.WeatherAPI = {
  getLatestUpdateTime,
  fetchObservationHistoryList,
  fetchObservationData,
  fetchForecastByCounty,
  fetchCountiesGeoJSON,
  parseForecastChart,
  parseHourlyForecast,
  refreshData,
};



