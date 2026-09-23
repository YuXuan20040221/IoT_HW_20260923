/**
 * scripts/fetch-weather.js
 * 
 * 在 GitHub Actions (Node.js 20+) 中自動執行：
 * 1. 從環境變數 process.env.CWA_API_KEY 取得授權碼
 * 2. 抓取 O-A0001-001 (自動氣象站觀測資料)
 * 3. 抓取 F-D0047-091 (全台未來一週預報資料)
 * 4. 整理後儲存為 data/weather.json
 */

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.CWA_API_KEY;
const CWA_BASE = 'https://opendata.cwa.gov.tw/api/v1/rest/datastore';

if (!API_KEY) {
  console.error('❌ 錯誤: 請設定環境變數 CWA_API_KEY');
  process.exit(1);
}

async function fetchCwa(endpoint, params = {}) {
  const query = new URLSearchParams({
    Authorization: API_KEY,
    format: 'JSON',
    ...params,
  });
  const url = `${CWA_BASE}/${endpoint}?${query.toString()}`;
  console.log(`📡 正在請求: ${endpoint}...`);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`API 請求失敗: [${res.status}] ${res.statusText}`);
  }
  return await res.json();
}

async function main() {
  try {
    const outDir = path.resolve(__dirname, '../data');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    // 1. 抓取即時觀測資料 (O-A0001-001) 並保留歷史記錄
    const obsData = await fetchCwa('O-A0001-001');
    const obsPath = path.join(outDir, 'O-A0001-001.json');
    
    let historyList = [];
    if (fs.existsSync(obsPath)) {
      try {
        const oldData = JSON.parse(fs.readFileSync(obsPath, 'utf8'));
        if (oldData && Array.isArray(oldData.history)) {
          historyList = oldData.history;
        } else if (oldData && oldData.records) {
          historyList = [{ timestamp: new Date().toISOString(), records: oldData.records }];
        }
      } catch (e) {
        console.warn('讀取舊資料失敗:', e.message);
      }
    }

    const currentTimeStr = new Date().toISOString();
    historyList.push({
      timestamp: currentTimeStr,
      records: obsData.records || {},
    });
    if (historyList.length > 48) {
      historyList = historyList.slice(-48);
    }

    const savedObsPayload = {
      latest: obsData.records || {},
      updatedAt: currentTimeStr,
      history: historyList,
    };
    fs.writeFileSync(obsPath, JSON.stringify(savedObsPayload, null, 2), 'utf8');
    console.log(`✅ 成功儲存觀測資料（歷史筆數: ${historyList.length}）：${obsPath}`);

    // 2. 抓取全台各縣市一週預報 (F-D0047-091)
    const forecastRaw = await fetchCwa('F-D0047-091', {
      elementName: 'Wx,MaxT,MinT,PoP12h,RH',
    });
    const forecastPath = path.join(outDir, 'F-D0047-091.json');
    fs.writeFileSync(forecastPath, JSON.stringify(forecastRaw, null, 2), 'utf8');
    console.log(`✅ 成功儲存預報資料：${forecastPath}`);

    // 3. 下載並確認 taiwan_counties.json 存在
    const geoPath = path.join(outDir, 'taiwan_counties.json');
    if (!fs.existsSync(geoPath)) {
      console.log('📡 下載台灣縣市邊界 GeoJSON...');
      const geoRes = await fetch('https://raw.githubusercontent.com/g0v/twgeojson/master/json/twCounty2010.geo.json');
      const geoData = await geoRes.json();
      fs.writeFileSync(geoPath, JSON.stringify(geoData), 'utf8');
      console.log(`✅ 成功儲存縣市邊界：${geoPath}`);
    }
  } catch (error) {
    console.error('❌ 執行失敗:', error);
    process.exit(1);
  }
}

main();
