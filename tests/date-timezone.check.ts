/**
 * 时区工具跨时区验证（Node 24 原生类型剥离运行）
 *
 * 用法：
 *   node --experimental-strip-types tests/date-timezone.check.ts
 *
 * 验证目标（对应「时区三套写法」修复）：
 *   1. weekdayIndexOfDate 不受设备时区影响（原 new Date('YYYY-MM-DD').getDay() 会错）
 *   2. formatDateInTimezone 按指定时区归属日历日（原 getFullYear() 拼串依赖设备）
 *   3. zonedTimeToUtc 往返一致（原 new Date(`${date}T12:00:00`) 依赖设备）
 *   4. nowInTimezone 的 weekday 与日历事实一致
 */
import {
  addDays,
  daysBetween,
  formatDateInTimezone,
  formatDateWithWeekday,
  nowInTimezone,
  todayInTimezone,
  weekdayIndexOfDate,
  weekdayLabel,
  zonedTimeToUtc,
} from '../src/utils/date.ts';

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}${detail ? ` —— ${detail}` : ''}`);
  }
}

const TZ = process.env.TZ ?? '(system)';
console.log(`\n================ 时区: ${TZ} ================\n`);

// ---------------------------------------------------------------- 1. 日历事实

// 2026-09-16 是星期三（与设备时区无关）
check(
  'weekdayIndexOfDate("2026-09-16") === 3（周三）',
  weekdayIndexOfDate('2026-09-16') === 3,
  `实际 ${weekdayIndexOfDate('2026-09-16')}`,
);
check(
  'weekdayLabel("2026-09-16") === "周三"',
  weekdayLabel('2026-09-16') === '周三',
  weekdayLabel('2026-09-16'),
);
check(
  'formatDateWithWeekday("2026-09-16") === "9月16日 周三"',
  formatDateWithWeekday('2026-09-16') === '9月16日 周三',
  formatDateWithWeekday('2026-09-16'),
);

// 2026-01-01 是星期四
check(
  'weekdayIndexOfDate("2026-01-01") === 4（周四）',
  weekdayIndexOfDate('2026-01-01') === 4,
  `实际 ${weekdayIndexOfDate('2026-01-01')}`,
);

// 对照：旧的错误写法在 UTC 负时区会错一天
const legacy = new Date('2026-09-16').getDay();
console.log(
  `      [对照] 旧写法 new Date('2026-09-16').getDay() = ${legacy} ` +
    `(${legacy === 3 ? '本时区恰好正确' : '⚠ 本时区已错位'})`,
);

// ---------------------------------------------------------------- 2. 时间戳归属

// 2026-09-16T23:30:00Z：东八区是 9/17 07:30，UTC 是 9/16，纽约是 9/16 19:30
const iso = '2026-09-16T23:30:00.000Z';
check(
  'formatDateInTimezone(23:30Z, Asia/Shanghai) === "2026-09-17"',
  formatDateInTimezone(iso, 'Asia/Shanghai') === '2026-09-17',
  formatDateInTimezone(iso, 'Asia/Shanghai'),
);
check(
  'formatDateInTimezone(23:30Z, UTC) === "2026-09-16"',
  formatDateInTimezone(iso, 'UTC') === '2026-09-16',
  formatDateInTimezone(iso, 'UTC'),
);
check(
  'formatDateInTimezone(23:30Z, America/New_York) === "2026-09-16"',
  formatDateInTimezone(iso, 'America/New_York') === '2026-09-16',
  formatDateInTimezone(iso, 'America/New_York'),
);

// ---------------------------------------------------------------- 3. 往返一致

for (const tz of ['Asia/Shanghai', 'UTC', 'America/New_York', 'Asia/Kolkata']) {
  const date = '2026-09-16';
  const instant = zonedTimeToUtc(date, '12:00', tz);
  const back = formatDateInTimezone(instant.toISOString(), tz);
  check(`zonedTimeToUtc 往返一致（${tz}）`, back === date, `${date} -> ${instant.toISOString()} -> ${back}`);
}

// 东八区 12:00 应等于 04:00Z
check(
  'zonedTimeToUtc("2026-09-16","12:00",Asia/Shanghai) === 04:00Z',
  zonedTimeToUtc('2026-09-16', '12:00', 'Asia/Shanghai').toISOString() ===
    '2026-09-16T04:00:00.000Z',
  zonedTimeToUtc('2026-09-16', '12:00', 'Asia/Shanghai').toISOString(),
);
// UTC 12:00 就是 12:00Z
check(
  'zonedTimeToUtc("2026-09-16","12:00",UTC) === 12:00Z',
  zonedTimeToUtc('2026-09-16', '12:00', 'UTC').toISOString() === '2026-09-16T12:00:00.000Z',
  zonedTimeToUtc('2026-09-16', '12:00', 'UTC').toISOString(),
);

// 夏令时边界：纽约 2026-03-08 是 DST 开始日，12:00 应为 16:00Z（EDT, UTC-4）
check(
  'zonedTimeToUtc 跨夏令时（America/New_York 2026-03-08 12:00 -> 16:00Z）',
  zonedTimeToUtc('2026-03-08', '12:00', 'America/New_York').toISOString() ===
    '2026-03-08T16:00:00.000Z',
  zonedTimeToUtc('2026-03-08', '12:00', 'America/New_York').toISOString(),
);
// 冬季应为 17:00Z（EST, UTC-5）
check(
  'zonedTimeToUtc 冬季（America/New_York 2026-01-15 12:00 -> 17:00Z）',
  zonedTimeToUtc('2026-01-15', '12:00', 'America/New_York').toISOString() ===
    '2026-01-15T17:00:00.000Z',
  zonedTimeToUtc('2026-01-15', '12:00', 'America/New_York').toISOString(),
);

// ---------------------------------------------------------------- 4. nowInTimezone

const now = nowInTimezone('Asia/Shanghai');
check(
  'nowInTimezone 的 weekday 与日期自洽',
  now.weekday === weekdayIndexOfDate(now.date),
  `${now.date} weekday=${now.weekday}`,
);
check(
  'nowInTimezone 返回的 date 与 todayInTimezone 一致',
  now.date === todayInTimezone('Asia/Shanghai'),
  `${now.date} vs ${todayInTimezone('Asia/Shanghai')}`,
);

// ---------------------------------------------------------------- 5. 基础工具回归

check('daysBetween 正负号正确', daysBetween('2026-09-16', '2026-09-20') === 4);
check('daysBetween 跨月', daysBetween('2026-08-30', '2026-09-02') === 3);
check('addDays 跨月', addDays('2026-08-30', 3) === '2026-09-02');
check('addDays 跨年', addDays('2026-12-31', 1) === '2027-01-01');
check('addDays 负数', addDays('2026-01-01', -1) === '2025-12-31');

console.log(`\n结果: ${passed} 项通过, ${failed} 项失败\n`);
process.exit(failed > 0 ? 1 : 0);
