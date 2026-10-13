/**
 * 在多个时区下依次运行时区工具测试。
 *
 * 为什么需要：时区 bug 的特征是「在本机时区恰好正确，换个时区就错」。
 * 单一 TZ 下跑绿不能说明问题——必须跨时区验证。
 *
 * 用法：npm run test:date:all-tz
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const testFile = join(root, 'tests', 'date-timezone.check.ts');

/** 覆盖东八区、UTC、UTC 负时区、半小时偏移、夏令时地区 */
const ZONES = [
  'Asia/Shanghai',
  'UTC',
  'America/New_York',
  'Europe/London',
  'Asia/Kolkata',
  'Australia/Sydney',
];

let failedZones = 0;

for (const tz of ZONES) {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--no-warnings', testFile],
    { cwd: root, env: { ...process.env, TZ: tz }, stdio: 'inherit' },
  );
  if (result.status !== 0) failedZones++;
}

if (failedZones > 0) {
  console.error(`\n❌ ${failedZones}/${ZONES.length} 个时区存在失败用例\n`);
  process.exit(1);
}
console.log(`\n✅ 全部 ${ZONES.length} 个时区通过\n`);
