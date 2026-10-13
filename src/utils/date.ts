/**
 * 时区感知日期工具。
 * 所有"今天 / 第几天 / 还有几天"的概念一律以用户 profiles.timezone 为准，
 * 禁止依赖设备本地时区的隐式偏移。
 *
 * ---------------------------------------------------------------------------
 * 时区规约（统一入口，禁止在业务代码里自行 new Date(...).getFullYear() 拼串）
 * ---------------------------------------------------------------------------
 * 1. 日历事实（某年某月某日是周几）与时区无关：
 *    一律用 weekdayIndexOfDate()，它按日历构造，不受设备时区影响。
 *    ✗ 反例：new Date('2026-09-16').getDay()
 *      —— 日期串按 UTC 解析后再取本地星期，UTC 负时区会整体错一天。
 *
 * 2. 时间戳 → 日历日（某条记录算哪一天）必须显式指定时区：
 *    一律用 formatDateInTimezone(iso, timezone)。
 *    ✗ 反例：new Date(iso).getFullYear()/getMonth()/getDate() 拼串
 *      —— 隐式使用设备时区，与 profiles.timezone 不一致时分组会漂移。
 *
 * 3. 日历日 → 时间戳（把某个日期存成 timestamptz）必须显式指定时区：
 *    一律用 zonedTimeToUtc(date, time, timezone)。
 *    ✗ 反例：new Date(`${date}T12:00:00`).toISOString()
 *      —— 按设备时区解释，跨时区存取无法往返。
 * ---------------------------------------------------------------------------
 */

const DAY_MS = 86_400_000;

/** 缺省时区：仅在用户资料尚未加载时兜底，业务代码应传入 profiles.timezone */
export const DEFAULT_TIMEZONE = 'Asia/Shanghai';

interface DayParts {
  year: string;
  month: string;
  day: string;
  hour: number;
}

function partsInTimezone(timezone: string): DayParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  });
  const map: Record<string, string> = {};
  for (const part of fmt.formatToParts(new Date())) {
    map[part.type] = part.value;
  }
  return {
    year: map.year ?? '1970',
    month: map.month ?? '01',
    day: map.day ?? '01',
    // 部分环境 24 小时制午夜返回 "24"，归一化为 0
    hour: Number(map.hour ?? '0') % 24,
  };
}

/** 指定 IANA 时区的当地日期，YYYY-MM-DD */
export function todayInTimezone(timezone: string): string {
  const p = partsInTimezone(timezone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** 指定 IANA 时区的当前小时（0-23） */
export function hourInTimezone(timezone: string): number {
  return partsInTimezone(timezone).hour;
}

/**
 * 指定时区"此刻"的日历信息，用于需要年/月/日/星期的日期计算
 * （例如「下周三」这类相对推算），避免直接读设备时区。
 */
export interface ZonedNow {
  /** YYYY-MM-DD */
  date: string;
  year: number;
  /** 1-12 */
  month: number;
  /** 1-31 */
  day: number;
  /** 0=周日 … 6=周六 */
  weekday: number;
}

export function nowInTimezone(timezone: string): ZonedNow {
  const p = partsInTimezone(timezone);
  const date = `${p.year}-${p.month}-${p.day}`;
  return {
    date,
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    weekday: weekdayIndexOfDate(date),
  };
}

/** 时区在指定时刻的 UTC 偏移（毫秒，东八区为 +8h） */
function timezoneOffsetMs(timezone: string, at: Date): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const map: Record<string, string> = {};
  for (const part of fmt.formatToParts(at)) {
    map[part.type] = part.value;
  }
  const asUtc = Date.UTC(
    Number(map.year ?? 1970),
    Number(map.month ?? 1) - 1,
    Number(map.day ?? 1),
    Number(map.hour ?? 0) % 24,
    Number(map.minute ?? 0),
    Number(map.second ?? 0),
  );
  return asUtc - at.getTime();
}

/**
 * 把「某时区的墙上时间」转换为真实 UTC 时刻。
 * 迭代两次以正确跨越夏令时切换边界。
 */
export function zonedTimeToUtc(date: string, time: string, timezone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0);
  let ts = guess - timezoneOffsetMs(timezone, new Date(guess));
  ts = guess - timezoneOffsetMs(timezone, new Date(ts));
  return new Date(ts);
}

/** ISO 时间戳 -> 指定时区的 YYYY-MM-DD（记录归属哪一天） */
export function formatDateInTimezone(iso: string, timezone: string): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const map: Record<string, string> = {};
  for (const part of fmt.formatToParts(new Date(iso))) {
    map[part.type] = part.value;
  }
  return `${map.year ?? '1970'}-${map.month ?? '01'}-${map.day ?? '01'}`;
}

function parseDay(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** 两个 YYYY-MM-DD 相差的天数（to - from，可为负） */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to) - parseDay(from)) / DAY_MS);
}

/** YYYY-MM-DD 加 N 天 */
export function addDays(date: string, days: number): string {
  return new Date(parseDay(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** YYYY-MM-DD 格式化为「M月D日」 */
export function formatMonthDay(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m ?? ''}月${d ?? ''}日`;
}

const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'] as const;

/**
 * YYYY-MM-DD -> 星期索引 0-6（0=周日）。
 * 星期是日历事实，与时区无关：按日历分量构造 Date，不做 UTC 解析。
 */
export function weekdayIndexOfDate(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getDay();
}

/** YYYY-MM-DD -> 「周六」 */
export function weekdayLabel(date: string): string {
  return `周${WEEKDAY_NAMES[weekdayIndexOfDate(date)] ?? ''}`;
}

/** YYYY-MM-DD -> 「9月16日 周三」 */
export function formatDateWithWeekday(date: string): string {
  return `${formatMonthDay(date)} ${weekdayLabel(date)}`;
}

/** ISO 时间戳 -> 指定时区的「9月16日 21:18」 */
export function formatDateTimeInTimezone(iso: string, timezone: string): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const map: Record<string, string> = {};
  for (const part of fmt.formatToParts(new Date(iso))) {
    map[part.type] = part.value;
  }
  const hour = String(Number(map.hour ?? '0') % 24).padStart(2, '0');
  return `${Number(map.month ?? 1)}月${Number(map.day ?? 1)}日 ${hour}:${map.minute ?? '00'}`;
}
