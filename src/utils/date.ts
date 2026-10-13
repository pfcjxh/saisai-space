/**
 * 时区感知日期工具。
 * 所有"今天 / 第几天 / 还有几天"的概念一律以用户 profiles.timezone 为准，
 * 禁止依赖设备本地时区的隐式偏移。
 */

const DAY_MS = 86_400_000;

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

/** YYYY-MM-DD -> 「周六」（按日历日展示，仅本地构造读取星期） */
export function weekdayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const wd = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getDay();
  return `周${WEEKDAY_NAMES[wd] ?? ''}`;
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
