import { Lunar, Solar } from 'lunar-javascript';
import type { Anniversary } from '@/types/database';
import { daysBetween } from '@/utils/date';

/**
 * lunar.ts — 公历/农历双轨算法引擎（零网络依赖）
 *
 * 存储约定：anniversaries.target_date 永远存公历日期；
 * is_lunar=true 时该公历日期仅代表"录入当年"的对应日，
 * 后续每年的真实公历日期由其反推的农历月日动态换算（闰月按负月处理）。
 */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toDateStr(solar: Solar): string {
  return `${solar.getYear()}-${pad2(solar.getMonth())}-${pad2(solar.getDay())}`;
}

/** 农历 Y-M-D -> 公历 YYYY-MM-DD（month 传负值表示闰月） */
export function lunarToSolar(year: number, month: number, day: number): string {
  return toDateStr(Lunar.fromYmd(year, month, day).getSolar());
}

/** 公历日期 -> 农历中文标签，如「八月十五」 */
export function lunarLabelOfSolar(solarDate: string): string {
  const [y, m, d] = solarDate.split('-').map(Number);
  const lunar = Solar.fromYmd(y ?? 1970, m ?? 1, d ?? 1).getLunar();
  return `${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`;
}

export interface Occurrence {
  /** 下一次（或本次）对应公历日期 YYYY-MM-DD */
  date: string;
  /** 距 today 的天数；负值表示已过去 */
  daysLeft: number;
}

/**
 * 计算纪念日的下一次到期：
 * - repeat_yearly=true：农历按"农历月日"换算今年/明年公历；公历按"月日"滚动；
 * - repeat_yearly=false：一次性事件，直接返回目标日（可能已过期）。
 */
export function nextOccurrence(
  a: Pick<Anniversary, 'target_date' | 'is_lunar' | 'repeat_yearly'>,
  today: string,
): Occurrence | null {
  if (!a.repeat_yearly) {
    return { date: a.target_date, daysLeft: daysBetween(today, a.target_date) };
  }

  const year = Number(today.slice(0, 4));

  if (a.is_lunar) {
    const [sy, sm, sd] = a.target_date.split('-').map(Number);
    const lunar = Solar.fromYmd(sy ?? 1970, sm ?? 1, sd ?? 1).getLunar();
    const lunarMonth = lunar.getMonth(); // 负值 = 闰月
    const lunarDay = lunar.getDay();
    for (const y of [year, year + 1]) {
      const date = lunarToSolar(y, lunarMonth, lunarDay);
      const daysLeft = daysBetween(today, date);
      if (daysLeft >= 0) return { date, daysLeft };
    }
    return null;
  }

  const [, m, d] = a.target_date.split('-');
  for (const y of [year, year + 1]) {
    const date = `${y}-${m ?? '01'}-${d ?? '01'}`;
    const daysLeft = daysBetween(today, date);
    if (daysLeft >= 0) return { date, daysLeft };
  }
  return null;
}

/** 计算纪念日在指定公历年份的对应日期（日历点位用）；无对应则 null */
export function occurrenceInYear(
  a: Pick<Anniversary, 'target_date' | 'is_lunar' | 'repeat_yearly'>,
  year: number,
): string | null {
  if (!a.repeat_yearly) {
    return Number(a.target_date.slice(0, 4)) === year ? a.target_date : null;
  }
  if (a.is_lunar) {
    const [sy, sm, sd] = a.target_date.split('-').map(Number);
    const lunar = Solar.fromYmd(sy ?? 1970, sm ?? 1, sd ?? 1).getLunar();
    return lunarToSolar(year, lunar.getMonth(), lunar.getDay());
  }
  const [, m, d] = a.target_date.split('-');
  return `${year}-${m ?? '01'}-${d ?? '01'}`;
}

// ---------------------------------------------------------------- 节日表

export interface Festival {
  title: string;
  date: string;
  lunar: boolean;
}

/** 公历节日（固定月日） */
const SOLAR_FESTIVALS = [
  { title: '元旦', month: 1, day: 1 },
  { title: '情人节', month: 2, day: 14 },
  { title: '告白日', month: 5, day: 20 },
  { title: '儿童节', month: 6, day: 1 },
  { title: '国庆节', month: 10, day: 1 },
  { title: '圣诞节', month: 12, day: 25 },
] as const;

/** 农历传统节日 */
const LUNAR_FESTIVALS = [
  { title: '春节', month: 1, day: 1 },
  { title: '元宵', month: 1, day: 15 },
  { title: '端午', month: 5, day: 5 },
  { title: '七夕', month: 7, day: 7 },
  { title: '中秋', month: 8, day: 15 },
  { title: '重阳', month: 9, day: 9 },
] as const;

/** 指定公历年份的全部节日（农历已换算为公历日期） */
export function listFestivalsForYear(year: number): Festival[] {
  const festivals: Festival[] = [];
  for (const f of SOLAR_FESTIVALS) {
    festivals.push({
      title: f.title,
      date: `${year}-${pad2(f.month)}-${pad2(f.day)}`,
      lunar: false,
    });
  }
  for (const f of LUNAR_FESTIVALS) {
    festivals.push({
      title: f.title,
      date: lunarToSolar(year, f.month, f.day),
      lunar: true,
    });
  }
  return festivals;
}
