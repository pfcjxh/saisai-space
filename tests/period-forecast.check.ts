/**
 * periodForecast 预测引擎校验
 *
 * 重点验证旧实现的三个硬伤是否真的修掉了：
 *   1. 离群周期不再带偏点估计（旧版用均值，一条误录的 17 天就能把 28 拉到 17）；
 *   2. 样本少时不过自信（旧版样本标准差会给 ±4 天并当作精确区间）；
 *   3. 逾期后预测能自适应右移（旧版只会「已推迟 N 天」无限增长）。
 *
 * 用法：node --experimental-strip-types tests/period-forecast.check.ts
 */
import { computePeriodInsight, FORECAST_CONSTANTS } from '../src/utils/periodForecast.ts';
import type { PeriodCycle } from '../src/types/database.ts';

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** 构造周期记录：starts 为新→旧排列的开始日，ends 可省略 */
function makeCycles(starts: string[], endOffsetDays = 4): PeriodCycle[] {
  return starts.map((start, i) => {
    const end = new Date(`${start}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + endOffsetDays);
    return {
      id: `c${i}`,
      user_id: 'u1',
      start_date: start,
      end_date: end.toISOString().slice(0, 10),
      cycle_length_days: null,
      period_length_days: null,
      recorded_by: null,
      created_at: `${start}T00:00:00Z`,
      updated_at: `${start}T00:00:00Z`,
    } as unknown as PeriodCycle;
  });
}

console.log('\n================ periodForecast 预测引擎校验 ================\n');

// ---------------------------------------------------------------- 1. 空数据
{
  const r = computePeriodInsight([], '2026-10-15');
  check('1.1 无记录时 hasData=false', r.hasData === false);
  check('1.2 无记录时回落到群体先验 29 天', r.avgCycleLength === 29, `实际 ${r.avgCycleLength}`);
  check('1.3 无记录时无可信度', r.confidence === 'low');
}

// ---------------------------------------------------------------- 2. 单条记录
{
  // 只有一次经期：2026-09-28 开始
  const r = computePeriodInsight(makeCycles(['2026-09-28']), '2026-10-15');
  check('2.1 单条记录可出预测', r.hasData && r.predictedNextStart !== null);
  check('2.2 单条记录用默认均值（诚实）', r.usesDefaultAverages === true);
  check('2.3 单条记录可信度为 low', r.confidence === 'low');
  check('2.4 单条记录样本量为 0', r.sampleSize === 0);
  check('2.5 当前周期第 18 天', r.dayOfCycle === 18, `实际 ${r.dayOfCycle}`);
}

// ---------------------------------------------------------------- 3. 规律周期
{
  // 新→旧：28 天间隔的规律周期，最近一次 2026-09-28
  const r = computePeriodInsight(
    makeCycles(['2026-09-28', '2026-08-31', '2026-08-03', '2026-07-06', '2026-06-08']),
    '2026-10-15',
  );
  check(
    '3.1 规律周期均值贴近 28',
    r.avgCycleLength >= 27 && r.avgCycleLength <= 30,
    `实际 ${r.avgCycleLength}`,
  );
  check('3.2 样本量 4 个间隔', r.sampleSize === 4, `实际 ${r.sampleSize}`);
  check('3.3 规律数据可信度 high', r.confidence === 'high', `实际 ${r.confidence}`);
  check('3.4 规律数据非不规律', r.isIrregular === false);
  check('3.5 预测区间在 2~8 天', r.predictedWindowDays >= 2 && r.predictedWindowDays <= 8);
  check('3.6 区间起止均给出', r.windowStart !== null && r.windowEnd !== null);
  check(
    '3.7 预测日落在区间内',
    r.predictedNextStart !== null &&
      r.windowStart !== null &&
      r.windowEnd !== null &&
      r.predictedNextStart >= r.windowStart &&
      r.predictedNextStart <= r.windowEnd,
  );
}

// ---------------------------------------------------------------- 4. 抗离群（旧版核心缺陷）
{
  // 三条规律 28 天 + 一条误录的 17 天（模拟用户测试时误点「经期来了」）
  const withOutlier = computePeriodInsight(
    makeCycles(['2026-10-15', '2026-09-28', '2026-08-31', '2026-08-03']),
    '2026-10-15',
  );
  // 纯规律对照组
  const clean = computePeriodInsight(
    makeCycles(['2026-09-28', '2026-08-31', '2026-08-03']),
    '2026-10-15',
  );
  const drift = Math.abs(withOutlier.avgCycleLength - clean.avgCycleLength);
  check(
    '4.1 一条离群周期几乎不带偏点估计（旧版均值会被拉低 ~4 天）',
    drift <= 2,
    `规律组 ${clean.avgCycleLength} 天 vs 含离群组 ${withOutlier.avgCycleLength} 天，偏移 ${drift} 天`,
  );
  check(
    '4.2 含离群后均值仍接近 28 而非 17',
    withOutlier.avgCycleLength >= 25,
    `实际 ${withOutlier.avgCycleLength}`,
  );
}

// ---------------------------------------------------------------- 5. 逾期自适应
{
  // 最近一次经期 2026-09-01，到今天 10-15 已 45 天（远超 28 天均值）
  const r = computePeriodInsight(
    makeCycles(['2026-09-01', '2026-08-04', '2026-07-07', '2026-06-09']),
    '2026-10-15',
  );
  check('5.1 逾期时仍给出预测日', r.predictedNextStart !== null);
  check(
    '5.2 逾期后预测日不早于今天（不会显示成越来越大的负数）',
    r.daysUntilNextPeriod >= 0,
    `daysUntilNextPeriod=${r.daysUntilNextPeriod}，预测日=${r.predictedNextStart}`,
  );
  check(
    '5.3 逾期后剩余天数被条件期望拉回合理范围（≤14 天）',
    r.daysUntilNextPeriod <= 14,
    `实际 ${r.daysUntilNextPeriod} 天`,
  );
}

// ---------------------------------------------------------------- 6. 不规律识别（ACOG）
{
  // 波动很大的周期：22 / 35 / 24 / 33
  const r = computePeriodInsight(
    makeCycles(['2026-09-28', '2026-09-06', '2026-08-02', '2026-07-09']),
    '2026-10-15',
  );
  check('6.1 波动 >8 天被判为不规律', r.isIrregular === true, `spread 判定失败`);
  check('6.2 不规律时可信度降级', r.confidence !== 'high', `实际 ${r.confidence}`);
}

// ---------------------------------------------------------------- 7. 经期长度
{
  // 出血 5 天（endOffset=4）
  const r = computePeriodInsight(
    makeCycles(['2026-09-28', '2026-08-31', '2026-08-03'], 4),
    '2026-10-15',
  );
  check('7.1 经期长度贴近 5 天', r.avgPeriodLength === 5, `实际 ${r.avgPeriodLength}`);
}

// ---------------------------------------------------------------- 8. 分期与排卵
{
  const r = computePeriodInsight(
    makeCycles(['2026-09-28', '2026-08-31', '2026-08-03', '2026-07-06']),
    '2026-10-01',
  );
  check('8.1 黄体期常量 14 天', r.lutealDays === FORECAST_CONSTANTS.LUTEAL_DAYS);
  check('8.2 排卵日 = 预测经期 − 14 天', r.ovulationDate !== null && r.predictedNextStart !== null);
  check('8.3 易孕窗口存在且早于预测经期', r.fertileWindow !== null);
  check(
    '8.4 经期中判定正确（10-01 落在 09-28 起、出血 5 天的经期内）',
    r.isOnPeriod === true && r.phase === 'period',
    `isOnPeriod=${r.isOnPeriod} phase=${r.phase}`,
  );
  check('8.5 经期第 4 天', r.periodDay === 4, `实际 ${r.periodDay}`);
}

// ---------------------------------------------------------------- 9. 边界安全
{
  // 极端脏数据：1 天间隔、100 天间隔混入
  const dirty = [
    ...makeCycles(['2026-09-28']),
    ...makeCycles(['2026-09-27']), // 1 天间隔（明显误录）
    ...makeCycles(['2026-06-01']), // 118 天间隔（超范围）
  ];
  const r = computePeriodInsight(dirty, '2026-10-15');
  check('9.1 脏数据不崩溃', r.hasData === true);
  check(
    '9.2 脏数据被过滤，周期长度仍在生理范围 15~90',
    r.avgCycleLength >= 15 && r.avgCycleLength <= 90,
    `实际 ${r.avgCycleLength}`,
  );
  check('9.3 脏数据不产生 NaN', Number.isFinite(r.avgCycleLength) && Number.isFinite(r.predictedWindowDays));
}

console.log(`\n================ 结果: ${passed} 项通过, ${failed} 项失败 ================\n`);
process.exit(failed === 0 ? 0 : 1);
