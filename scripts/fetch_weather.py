import os
import sys
import json
import urllib.request
import urllib.parse
from datetime import datetime

# 確保在 Windows 終端印出 UTF-8
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

API_KEY = os.environ.get('CWA_API_KEY')
CWA_BASE = 'https://opendata.cwa.gov.tw/api/v1/rest/datastore'

if not API_KEY:
    print('[ERROR] 請設定環境變數 CWA_API_KEY')
    exit(1)

import ssl

def fetch_cwa(endpoint, params=None):
    if params is None:
        params = {}
    query_params = {
        'Authorization': API_KEY,
        'format': 'JSON',
        **params
    }
    url = f"{CWA_BASE}/{endpoint}?{urllib.parse.urlencode(query_params)}"
    print(f"[INFO] 正在請求: {endpoint}...")
    ctx = ssl._create_unverified_context()
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, context=ctx) as response:
        if response.status != 200:
            raise Exception(f"HTTP Error: {response.status}")
        return json.loads(response.read().decode('utf-8'))

def main():
    try:
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        out_dir = os.path.join(base_dir, 'data')
        os.makedirs(out_dir, exist_ok=True)

        # 1. 抓取觀測資料 (O-A0001-001) 並以新增/歷史保存方式處理
        obs_raw = fetch_cwa('O-A0001-001')
        obs_path = os.path.join(out_dir, 'O-A0001-001.json')
        
        history_list = []
        if os.path.exists(obs_path):
            try:
                with open(obs_path, 'r', encoding='utf-8') as f:
                    old_data = json.load(f)
                    if isinstance(old_data, dict) and 'history' in old_data:
                        history_list = old_data['history']
                    elif isinstance(old_data, dict) and 'records' in old_data:
                        # 舊單筆格式，轉為第一筆歷史
                        history_list = [{'timestamp': old_data.get('records', {}).get('Station', [{}])[0].get('ObsTime', {}).get('DateTime', datetime.now().isoformat()), 'records': old_data.get('records')}]
            except Exception as e:
                print(f"[WARN] 讀取舊觀測資料失敗: {e}")

        # 產生當前時間標籤並追加到歷史中 (保留最多最近 48 筆/2天)
        current_time_str = datetime.now().isoformat()
        history_list.append({
            'timestamp': current_time_str,
            'records': obs_raw.get('records', {})
        })
        if len(history_list) > 48:
            history_list = history_list[-48:]

        saved_obs_payload = {
            'latest': obs_raw.get('records', {}),
            'updatedAt': current_time_str,
            'history': history_list
        }

        with open(obs_path, 'w', encoding='utf-8') as f:
            json.dump(saved_obs_payload, f, ensure_ascii=False, indent=2)
        print(f"[SUCCESS] 儲存觀測資料（歷史筆數: {len(history_list)}）：{obs_path}")

        # 2. 抓取預報資料 (F-D0047-091) 並存檔
        forecast_raw = fetch_cwa('F-D0047-091', {'elementName': 'Wx,MaxT,MinT,PoP12h,RH'})
        forecast_path = os.path.join(out_dir, 'F-D0047-091.json')
        with open(forecast_path, 'w', encoding='utf-8') as f:
            json.dump(forecast_raw, f, ensure_ascii=False, indent=2)
        print(f"[SUCCESS] 儲存預報資料：{forecast_path}")

        # 3. 確保 taiwan_counties.json 存在
        geo_path = os.path.join(out_dir, 'taiwan_counties.json')
        if not os.path.exists(geo_path):
            geo_url = 'https://raw.githubusercontent.com/g0v/twgeojson/master/json/twCounty2010.geo.json'
            print("[INFO] 下載台灣縣市邊界 GeoJSON...")
            ctx = ssl._create_unverified_context()
            req = urllib.request.Request(geo_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, context=ctx) as res:
                geo_data = json.loads(res.read())
            with open(geo_path, 'w', encoding='utf-8') as f:
                json.dump(geo_data, f, ensure_ascii=False)
            print(f"[SUCCESS] 儲存縣市邊界：{geo_path}")

    except Exception as e:
        print(f"[FAILED] 執行失敗: {e}")
        exit(1)

if __name__ == '__main__':
    main()

