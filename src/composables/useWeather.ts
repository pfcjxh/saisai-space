/**
 * useWeather — Open-Meteo 免费气象查询（无需鉴权）
 *
 * 数据：当前温度与天况 + 今日/明日最低最高温与明日天况。
 * 策略：Cache-First，双层缓存（内存 Map + localStorage），TTL 6 小时。
 * 网络异常时平滑回退到上次缓存数据并以 stale 标记透出，
 * 绝不让天气卡片在弱网/离线下空白。
 */

export interface WeatherInfo {
  /** 当前摄氏温度（已取整） */
  temperature: number;
  /** 当前 WMO 天气代码 */
  weatherCode: number;
  isDay: boolean;
  todayMin: number;
  todayMax: number;
  /** 明日 WMO 天气代码 */
  tomorrowCode: number;
  tomorrowMin: number;
  tomorrowMax: number;
  /** 数据获取时间戳（ms） */
  fetchedAt: number;
  /** true = 网络失败时回退的过期缓存 */
  stale: boolean;
}

type CachedWeather = Omit<WeatherInfo, 'stale'>;

/**
 * 常用城市经纬度字典：仅在未显式配置坐标时作为快速命中，
 * 命中不了会自动走 Open-Meteo 地理编码（见 resolveCoords），
 * 因此用户**可以填写任意城市名**，不必局限于此列表。
 */
const CITY_COORDS: Record<string, { lat: number; lon: number }> = {
  // 广东（用户在深圳，可能在广州）
  广州: { lat: 23.1291, lon: 113.2644 },
  深圳: { lat: 22.5431, lon: 114.0579 },
  东莞: { lat: 23.0207, lon: 113.7518 },
  佛山: { lat: 23.0215, lon: 113.1214 },
  珠海: { lat: 22.2707, lon: 113.5767 },
  惠州: { lat: 23.1115, lon: 114.4162 },
  // 山东（她家在莱阳，在山东上学）
  莱阳: { lat: 36.9789, lon: 120.7117 },
  青岛: { lat: 36.0671, lon: 120.3826 },
  烟台: { lat: 37.4638, lon: 121.4479 },
  济南: { lat: 36.6512, lon: 117.1201 },
  潍坊: { lat: 36.7069, lon: 119.1618 },
  威海: { lat: 37.5128, lon: 122.1201 },
  临沂: { lat: 35.1045, lon: 118.3564 },
  // 其他常用
  北京: { lat: 39.9042, lon: 116.4074 },
  上海: { lat: 31.2304, lon: 121.4737 },
  杭州: { lat: 30.2741, lon: 120.1551 },
  成都: { lat: 30.5728, lon: 104.0668 },
  重庆: { lat: 29.563, lon: 106.5516 },
  武汉: { lat: 30.5928, lon: 114.3055 },
  西安: { lat: 34.3416, lon: 108.9398 },
  南京: { lat: 32.0603, lon: 118.7969 },
  苏州: { lat: 31.2989, lon: 120.5853 },
  长沙: { lat: 28.2282, lon: 112.9388 },
  厦门: { lat: 24.4798, lon: 118.0894 },
  天津: { lat: 39.0851, lon: 117.1993 },
  昆明: { lat: 24.8801, lon: 102.8329 },
  哈尔滨: { lat: 45.8038, lon: 126.5349 },
  香港: { lat: 22.3193, lon: 114.1694 },
  澳门: { lat: 22.1987, lon: 113.5439 },
  台北: { lat: 25.033, lon: 121.5654 },
};

/**
 * 供设置页做「常用城市」快选的城市名列表（按地域分组，便于快速定位）。
 * 注意：这只是快捷入口，用户仍可自由输入任意城市名。
 */
export const CITY_GROUPS: { label: string; cities: string[] }[] = [
  { label: '广东', cities: ['深圳', '广州', '东莞', '佛山', '珠海', '惠州'] },
  { label: '山东', cities: ['莱阳', '青岛', '烟台', '济南', '潍坊', '威海', '临沂'] },
  {
    label: '其他',
    cities: [
      '北京', '上海', '杭州', '成都', '重庆', '武汉',
      '西安', '南京', '苏州', '长沙', '厦门', '天津',
      '昆明', '哈尔滨', '香港', '澳门', '台北',
    ],
  },
];

const TTL_MS = 6 * 60 * 60 * 1000;
// v2：缓存结构含双日预报，与旧版不兼容，换 key 前缀作废弃旧缓存
const CACHE_PREFIX = 'saisai:weather:v2:';
/** 地理编码结果缓存（城市名 -> 坐标），避免每次刷新都请求 */
const GEO_PREFIX = 'saisai:geo:v1:';
/** 地理编码结果的长期缓存时长（坐标不会变） */
const GEO_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const memoryCache = new Map<string, CachedWeather>();
const geoMemory = new Map<string, { lat: number; lon: number }>();

interface GeoResult {
  latitude?: number;
  longitude?: number;
  name?: string;
}

/**
 * 解析城市坐标：先查内置字典与缓存，未命中则调用 Open-Meteo 地理编码。
 * 这样用户可以填写**任意**城市名（含县级市），不受内置列表限制。
 */
async function resolveCoords(city: string): Promise<{ lat: number; lon: number } | null> {
  const name = city.trim();
  if (!name) return null;

  const builtin = CITY_COORDS[name];
  if (builtin) return builtin;

  const mem = geoMemory.get(name);
  if (mem) return mem;

  try {
    const raw = localStorage.getItem(`${GEO_PREFIX}${name}`);
    if (raw) {
      const parsed = JSON.parse(raw) as { lat: number; lon: number; at: number };
      if (Date.now() - parsed.at < GEO_TTL_MS) {
        const coords = { lat: parsed.lat, lon: parsed.lon };
        geoMemory.set(name, coords);
        return coords;
      }
    }
  } catch {
    // 存储不可用则继续走网络
  }

  try {
    const url =
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}` +
      `&count=1&language=zh&format=json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as { results?: GeoResult[] };
    const hit = json.results?.[0];
    if (!hit || typeof hit.latitude !== 'number' || typeof hit.longitude !== 'number') {
      return null;
    }
    const coords = { lat: hit.latitude, lon: hit.longitude };
    geoMemory.set(name, coords);
    try {
      localStorage.setItem(
        `${GEO_PREFIX}${name}`,
        JSON.stringify({ ...coords, at: Date.now() }),
      );
    } catch {
      // 存储失败不影响本次使用
    }
    return coords;
  } catch {
    return null;
  }
}

interface OpenMeteoResponse {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
    is_day?: number;
  };
  daily?: {
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    weather_code?: number[];
  };
}

function readCache(key: string): CachedWeather | null {
  const mem = memoryCache.get(key);
  if (mem) return mem;
  try {    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedWeather;
    if (typeof parsed.temperature !== 'number' || typeof parsed.fetchedAt !== 'number') {
      return null;
    }
    memoryCache.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(key: string, data: CachedWeather): void {
  memoryCache.set(key, data);
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // 存储被禁用（如 iOS 隐私模式）时静默降级为仅内存缓存
  }
}

function num(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function useWeather(): {
  fetchWeather: (
    city: string,
    lat?: number | null,
    lon?: number | null,
  ) => Promise<WeatherInfo>;
} {
  async function fetchWeather(
    city: string,
    lat?: number | null,
    lon?: number | null,
  ): Promise<WeatherInfo> {
    const key = `${CACHE_PREFIX}${city}`;
    const cached = readCache(key);

    if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
      return { ...cached, stale: false };
    }

    const coords = lat != null && lon != null ? { lat, lon } : await resolveCoords(city);
    if (!coords) {
      if (cached) return { ...cached, stale: true };
      throw new Error(`无法定位城市: ${city}`);
    }

    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}` +
        `&longitude=${coords.lon}` +
        `&current=temperature_2m,weather_code,is_day` +
        `&daily=temperature_2m_max,temperature_2m_min,weather_code` +
        `&forecast_days=2&timezone=auto`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
      const json = (await res.json()) as OpenMeteoResponse;

      const temperature = num(json.current?.temperature_2m);
      const weatherCode = num(json.current?.weather_code);
      const todayMin = num(json.daily?.temperature_2m_min?.[0]);
      const todayMax = num(json.daily?.temperature_2m_max?.[0]);
      const tomorrowCode = num(json.daily?.weather_code?.[1]);
      const tomorrowMin = num(json.daily?.temperature_2m_min?.[1]);
      const tomorrowMax = num(json.daily?.temperature_2m_max?.[1]);
      if (
        temperature === null ||
        weatherCode === null ||
        todayMin === null ||
        todayMax === null ||
        tomorrowCode === null ||
        tomorrowMin === null ||
        tomorrowMax === null
      ) {
        throw new Error('Open-Meteo 返回数据结构异常');
      }

      const data: CachedWeather = {
        temperature: Math.round(temperature),
        weatherCode,
        isDay: json.current?.is_day !== 0,
        todayMin: Math.round(todayMin),
        todayMax: Math.round(todayMax),
        tomorrowCode,
        tomorrowMin: Math.round(tomorrowMin),
        tomorrowMax: Math.round(tomorrowMax),
        fetchedAt: Date.now(),
      };
      writeCache(key, data);
      return { ...data, stale: false };
    } catch (err) {
      if (cached) return { ...cached, stale: true };
      throw err instanceof Error ? err : new Error('天气请求失败');
    }
  }

  return { fetchWeather };
}
