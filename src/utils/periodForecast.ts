import type { PeriodCycle } from '@/types/database';
import { addDays, daysBetween } from '@/utils/date';

/**
 * periodForecast — 经期预测引擎（纯函数，无框架依赖，可单测）
 *
 * ============================================================================
 * 为什么重写（2026-10-15）
 * ============================================================================
 * 旧实现是「加权平均 + 样本标准差」：均值估计周期长度、标准差定波动窗口。
 * 两个统计学缺陷会实打实地把预测带偏：
 *
 *   1) 周期长度分布是**右偏长尾**的（Harlow & Zeger 1991；Guo et al. 2006
 *      用「正态 + 平移 Weibull」混合分布拟合这条长尾）。用**均值**做点估计
 *      会被偶发的长周期（或误录的短周期）拉走；本应用就真发生过：一条误录的
 *      17 天周期把平均值从 28 拉到 17 天。
 *   2) 样本标准差对离群值极敏感（崩点 0%），数据越少越不可靠，却仍被当作
 *      精确度来展示「预计 X~Y 天」——**过自信**比不精确更糟。
 *
 * 现在的做法（每一处都有文献依据）：
 *
 *   · **稳健位置/尺度**：加权中位数 + MAD（中位绝对偏差，崩点 50%），
 *     离群周期不再能左右点估计。
 *   · **贝叶斯收缩**：个体估计与群体先验按有效样本量加权——
 *         μ_post = (n_eff·μ_个体 + κ·μ_先验) / (n_eff + κ)
 *     只有 1 条记录时几乎全靠群体先验（诚实），记录攒够后自动过渡到个体规律。
 *     这与「贝叶斯层次模型预测周期长度」的思路一致，且实现上是闭式的。
 *   · **预测区间而非 ±SD**：由后验预测方差给出 80% 区间，
 *     并按样本量收窄/放宽（clamp 到 2~8 天）。
 *   · **逾期自适应（序贯更新）**：Fukaya et al. 2017（Stat Med 36:3361）与
 *     Kawamori et al. 2017（arXiv:1707.06452）用状态空间 + 序贯贝叶斯滤波证明
 *     「随着本周期推进，下次经期的预测会持续收敛」。这里用等价且闭式的做法：
 *     一旦今天已越过期望周期长度，就用**截断正态的条件期望**（逆米尔斯比）
 *     重算剩余天数，而不是干等「已推迟 N 天」越滚越大。
 *   · **规律性判定**：ACOG 以周期波动 > 7~9 天为「不规律」，据此给
 *     isIrregular 标记，界面据此说明「波动较大，预测仅供参考」。
 *   · **黄体期恒定假设**：Fehring et al. 2006 报告黄体期 12.4±2.0 天、
 *     卵泡期 16.5±3.4 天——周期长度的波动主要来自卵泡期。因此排卵日按
 *     「下次经期 − 黄体期天数」估算，黄体期取常用的 14 天常量。
 *
 * ⚠️ 仍然只是日历推演：无 BBT（基础体温）等生理信号时，个体内随机波动
 * 无法消除，本引擎给出的是**分布**而非确定日期。不可作为避孕或诊疗依据。
 */

export type CyclePhase = 'period' | 'follicular' | 'ovulation' | 'luteal';

/** 预测可信度：由有效样本量与周期规律性共同决定 */
export type ForecastConfidence = 'low' | 'medium' | 'high';

export interface PeriodInsight {
  hasData: boolean;
  phase: CyclePhase | null;
  /** 当前周期第 N 天（从最近一次经期开始日计 1） */
  dayOfCycle: number;
  isOnPeriod: boolean;
  /** 经期第 N 天（仅 isOnPeriod 时有值） */
  periodDay: number | null;
  /** 距下次预计经期天数；负值表示已推迟 */
  daysUntilNextPeriod: number;
  avgCycleLength: number;
  avgPeriodLength: number;
  /** 下次预计经期开始日 YYYY-MM-DD */
  predictedNextStart: string | null;
  /** 已闭合周期数量 */
  closedCount: number;
  /** 记录不足，均值主要由群体先验决定（28/5 一类的默认值） */
  usesDefaultAverages: boolean;
  /** 预测排卵日 YYYY-MM-DD */
  ovulationDate: string | null;
  /** 易孕窗口（排卵日前 5 天至后 4 天） */
  fertileWindow: { start: string; end: string } | null;
  /**
   * 预测波动半宽（天）：80% 后验预测区间的半宽，clamp 到 [2, 8]。
   * 0 表示无预测（无数据）。
   */
  predictedWindowDays: number;

  // ---------------------------------------------------------------- 新增
  /** 预测可信度分级（界面文案用） */
  confidence: ForecastConfidence;
  /** 周期波动超过 ACOG 阈值（7~9 天），预测仅供参考 */
  isIrregular: boolean;
  /** 80% 预测区间起（含），无预测时为 null */
  windowStart: string | null;
  /** 80% 预测区间止（含），无预测时为 null */
  windowEnd: string | null;
  /** 参与计算的有效周期间隔数 */
  sampleSize: number;
  /** 本次推算使用的黄体期天数（排卵日 = 下次经期 − 该值） */
  lutealDays: number;
  /** 点估计来源说明（界面可透出「按平均 28 天推」「基于最近 N 个周期」） */
  methodLabel: string;
}

export interface PeriodRange {
  start: string;
  end: string;
  /** true = 预测经期段（未实际发生） */
  predicted: boolean;
}

export interface CycleModel {
  insight: PeriodInsight;
  /** 全部经期段（实际 + 预测），日历渲染用 */
  periodRanges: PeriodRange[];
  ovulationDate: string | null;
  fertileWindow: { start: string; end: string } | null;
}

export type CalendarPhase = 'period' | 'predicted' | 'ovulation' | 'fertile' | null;

// ============================================================================
// 常量：群体先验与生理边界
// ============================================================================

/**
 * 群体先验均值：育龄女性周期长度中位数约 28~29 天
 * （ACOG 定义为 21~35 天为正常范围；文献中位数多在 28~29）。
 */
const PRIOR_CYCLE_MEAN = 29;
/** 群体先验标准差：个体间周期长度 SD 约 4~5 天 */
const PRIOR_CYCLE_SD = 4.5;
/** 群体先验经期长度（出血天数）中位数约 5 天 */
const PRIOR_PERIOD_MEAN = 5;
/** 先验强度 κ：等价于 2 个观测——2 条记录时个体与先验各占一半 */
const PRIOR_STRENGTH = 2;

/** 有效间隔的生理可接受范围（天）：超出视为录入错误/异常周期，不参与点估计 */
const MIN_VALID_INTERVAL = 18;
const MAX_VALID_INTERVAL = 60;
/** 参与计算的最大间隔数（越近越重要，太旧的不代表当前生理状态） */
const MAX_INTERVALS = 6;
/** 指数权重半衰期（周期数）：每往前 4 个周期权重减半 */
const HALF_LIFE = 4;
/** 经期长度可接受范围（天） */
const MIN_VALID_PERIOD = 1;
const MAX_VALID_PERIOD = 15;
/** 预测窗口 clamp */
const MIN_WINDOW = 2;
const MAX_WINDOW = 8;
/** 80% 双侧正态分位点（z_{0.90}） */
const Z_80 = 1.2816;
/** ACOG：周期波动超过 8 天视为不规律（文献区间 7~9 天） */
const ACOG_VARIATION_LIMIT = 8;
/** 黄体期常量（天）：Fehring 2006 报告 12.4±2.0，临床常用 14 */
const LUTEAL_DAYS = 14;
/** 周期长度 clamp（生理边界） */
const MIN_CYCLE = 15;
const MAX_CYCLE = 90;

const EMPTY: PeriodInsight = {
  hasData: false,
  phase: null,
  dayOfCycle: 0,
  isOnPeriod: false,
  periodDay: null,
  daysUntilNextPeriod: 0,
  avgCycleLength: PRIOR_CYCLE_MEAN,
  avgPeriodLength: PRIOR_PERIOD_MEAN,
  predictedNextStart: null,
  closedCount: 0,
  usesDefaultAverages: true,
  ovulationDate: null,
  fertileWindow: null,
  predictedWindowDays: 0,
  confidence: 'low',
  isIrregular: false,
  windowStart: null,
  windowEnd: null,
  sampleSize: 0,
  lutealDays: LUTEAL_DAYS,
  methodLabel: '暂无数据',
};

// ============================================================================
// 统计工具（全部为纯函数，便于单测）
// ============================================================================

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** 标准正态密度 φ(z) */
function normPdf(z: number): number {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

/** 误差函数 erf(x)，Abramowitz & Stegun 7.1.26 有理逼近（|误差| < 1.5e-7） */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

/** 标准正态分布函数 Φ(z) */
function normCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/**
 * 逆米尔斯比 λ(z) = φ(z) / (1 − Φ(z))
 * 用途：截断正态的条件期望 E[X | X > a] = μ + σ·λ((a−μ)/σ)。
 * 逾期预测就靠它——越久没来，条件期望越往右推，但不会无限膨胀。
 */
function inverseMillsRatio(z: number): number {
  const tail = 1 - normCdf(z);
  if (tail <= 1e-12) return z; // 极端远期：退化为线性外推，避免除零
  return normPdf(z) / tail;
}

/** 加权中位数（权重和的一半处插值） */
function weightedMedian(values: number[], weights: number[]): number {
  if (values.length === 0) return Number.NaN;
  const pairs = values
    .map((v, i) => ({ v, w: weights[i] ?? 1 }))
    .sort((a, b) => a.v - b.v);
  const total = pairs.reduce((sum, p) => sum + p.w, 0);
  if (total <= 0) return pairs[Math.floor(pairs.length / 2)]?.v ?? Number.NaN;
  let acc = 0;
  for (const p of pairs) {
    acc += p.w;
    if (acc >= total / 2) return p.v;
  }
  return pairs[pairs.length - 1]?.v ?? Number.NaN;
}

/** 加权 MAD（中位绝对偏差），用于稳健尺度估计 */
function weightedMad(values: number[], weights: number[], center: number): number {
  if (values.length === 0) return Number.NaN;
  const devs = values.map((v) => Math.abs(v - center));
  return weightedMedian(devs, weights);
}

/**
 * Kish 有效样本量 n_eff = (Σw)² / Σw²
 * 加权后「相当于几个独立观测」，用于贝叶斯收缩与可信度分级。
 */
function effectiveSampleSize(weights: number[]): number {
  const sum = weights.reduce((a, b) => a + b, 0);
  const sumSq = weights.reduce((a, b) => a + b * b, 0);
  if (sumSq <= 0) return 0;
  return (sum * sum) / sumSq;
}

/** 指数衰减权重：index 0（最近）权重最高 */
function expWeights(n: number): number[] {
  return Array.from({ length: n }, (_, i) => Math.pow(0.5, i / HALF_LIFE));
}

// ============================================================================
// 主计算
// ============================================================================

export function computePeriodInsight(cycles: PeriodCycle[], today: string): PeriodInsight {
  if (cycles.length === 0) return EMPTY;

  const sorted = [...cycles].sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
  const latest = sorted[0];
  if (!latest) return EMPTY;

  // ---------------------------------------------------------------- 周期间隔
  // 相邻开始日之差（新→旧），过滤生理上不可能的取值
  const rawIntervals: number[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const curr = sorted[i];
    const prev = sorted[i + 1];
    if (!curr || !prev) continue;
    const gap = daysBetween(prev.start_date, curr.start_date);
    if (gap >= MIN_VALID_INTERVAL && gap <= MAX_VALID_INTERVAL) rawIntervals.push(gap);
  }
  const intervals = rawIntervals.slice(0, MAX_INTERVALS);
  const weights = expWeights(intervals.length);
  const nEff = effectiveSampleSize(weights);

  // ---------------------------------------------------------------- 稳健个体估计
  const indCenter = intervals.length > 0 ? weightedMedian(intervals, weights) : null;
  const indMad = intervals.length >= 3 ? weightedMad(intervals, weights, indCenter ?? 0) : null;
  // MAD → σ 的一致性系数（正态下 1.4826·MAD ≈ σ）
  const indSigma = indMad !== null && Number.isFinite(indMad) ? 1.4826 * indMad : null;

  // ---------------------------------------------------------------- 贝叶斯收缩
  // 位置：个体中位数与群体先验按有效样本量加权
  const muPost =
    indCenter === null
      ? PRIOR_CYCLE_MEAN
      : (nEff * indCenter + PRIOR_STRENGTH * PRIOR_CYCLE_MEAN) / (nEff + PRIOR_STRENGTH);

  // 尺度：个体稳健 σ 与先验 σ² 同样收缩（避免小样本过自信）
  const varPrior = PRIOR_CYCLE_SD * PRIOR_CYCLE_SD;
  const varInd = indSigma !== null ? indSigma * indSigma : varPrior;
  const varPost = (nEff * varInd + PRIOR_STRENGTH * varPrior) / (nEff + PRIOR_STRENGTH);
  const sigma = Math.sqrt(varPost);

  const avgCycleLength = clamp(Math.round(muPost), MIN_CYCLE, MAX_CYCLE);

  // ---------------------------------------------------------------- 经期长度（稳健 + 收缩）
  const closed = sorted
    .filter((c): c is PeriodCycle & { end_date: string } => c.end_date !== null)
    .slice(0, MAX_INTERVALS);
  const periodLengths = closed
    .map((c) => daysBetween(c.start_date, c.end_date) + 1)
    .filter((len) => len >= MIN_VALID_PERIOD && len <= MAX_VALID_PERIOD);
  const periodWeights = expWeights(periodLengths.length);
  const nEffPeriod = effectiveSampleSize(periodWeights);
  const indPeriod = periodLengths.length > 0 ? weightedMedian(periodLengths, periodWeights) : null;
  const avgPeriodLength = Math.round(
    indPeriod === null
      ? PRIOR_PERIOD_MEAN
      : (nEffPeriod * indPeriod + PRIOR_STRENGTH * PRIOR_PERIOD_MEAN) /
          (nEffPeriod + PRIOR_STRENGTH),
  );

  // ---------------------------------------------------------------- 当前周期进度
  const dayOfCycle = daysBetween(latest.start_date, today) + 1;

  // 逾期自适应：已越过期望长度时，用截断正态的条件期望更新剩余天数
  // （Fukaya 2017 / Kawamori 2017 的序贯更新思想，这里用闭式条件期望实现）
  let expectedLength = muPost;
  if (dayOfCycle > muPost) {
    const z = (dayOfCycle - muPost) / Math.max(sigma, 0.5);
    expectedLength = muPost + sigma * inverseMillsRatio(z);
  }
  const predictedNextStart = addDays(latest.start_date, Math.round(expectedLength));
  const daysUntilNextPeriod = daysBetween(today, predictedNextStart);

  // ---------------------------------------------------------------- 预测区间
  // 后验预测方差 = 个体波动 + 均值估计不确定性
  const predictiveVar = varPost * (1 + 1 / (nEff + PRIOR_STRENGTH));
  const predictedWindowDays = clamp(
    Math.ceil(Z_80 * Math.sqrt(predictiveVar)),
    MIN_WINDOW,
    MAX_WINDOW,
  );
  const windowStart = addDays(predictedNextStart, -predictedWindowDays);
  const windowEnd = addDays(predictedNextStart, predictedWindowDays);

  // ---------------------------------------------------------------- 规律性（ACOG）
  const recent = intervals.slice(0, MAX_INTERVALS);
  const spread = recent.length >= 2 ? Math.max(...recent) - Math.min(...recent) : 0;
  const isIrregular =
    recent.length >= 3 &&
    (spread > ACOG_VARIATION_LIMIT || (indSigma !== null && indSigma > 3.5));

  // ---------------------------------------------------------------- 经期判定
  const isOnPeriod = latest.end_date
    ? today >= latest.start_date && today <= latest.end_date
    : dayOfCycle >= 1 && dayOfCycle <= avgPeriodLength;
  const periodDay = isOnPeriod ? daysBetween(latest.start_date, today) + 1 : null;

  // ---------------------------------------------------------------- 排卵与分期
  // 黄体期相对稳定（Fehring 2006：12.4±2.0 天），故由「下次经期 − 黄体期」反推排卵
  const ovulationDate = addDays(predictedNextStart, -LUTEAL_DAYS);
  const fertileWindow = {
    start: addDays(ovulationDate, -5),
    end: addDays(ovulationDate, 4),
  };

  const ovulationDay = Math.max(1, Math.round(expectedLength) - LUTEAL_DAYS);
  let phase: CyclePhase;
  if (isOnPeriod) {
    phase = 'period';
  } else if (dayOfCycle <= ovulationDay - 2) {
    phase = 'follicular';
  } else if (dayOfCycle <= ovulationDay + 1) {
    phase = 'ovulation';
  } else {
    phase = 'luteal';
  }

  // ---------------------------------------------------------------- 可信度分级
  // 阈值按「指数加权后的有效样本量」定：nEff≈1（1 个间隔）/≈2（2 个）/≈2.9（3 个）
  // /≈3.9（4 个）/≈5.5（6 个）。3 个间隔（=4 次经期记录）起算高可信。
  const confidence: ForecastConfidence =
    nEff >= 2.5 && !isIrregular ? 'high' : nEff >= 1.5 ? 'medium' : 'low';

  const methodLabel =
    intervals.length === 0
      ? `按平均 ${PRIOR_CYCLE_MEAN} 天推算`
      : confidence === 'high'
        ? `基于最近 ${intervals.length} 个周期`
        : `基于 ${intervals.length} 个周期（还在学习）`;

  return {
    hasData: true,
    phase,
    dayOfCycle,
    isOnPeriod,
    periodDay,
    daysUntilNextPeriod,
    avgCycleLength,
    avgPeriodLength,
    predictedNextStart,
    closedCount: closed.length,
    usesDefaultAverages: intervals.length === 0,
    ovulationDate,
    fertileWindow,
    predictedWindowDays,
    confidence,
    isIrregular,
    windowStart,
    windowEnd,
    sampleSize: intervals.length,
    lutealDays: LUTEAL_DAYS,
    methodLabel,
  };
}

/** 完整周期模型：状态 + 日历渲染所需的全部区间 */
export function buildCycleModel(cycles: PeriodCycle[], today: string): CycleModel {
  const insight = computePeriodInsight(cycles, today);
  const periodRanges: PeriodRange[] = [];

  for (const c of cycles) {
    periodRanges.push({
      start: c.start_date,
      end: c.end_date ?? addDays(c.start_date, insight.avgPeriodLength - 1),
      predicted: false,
    });
  }
  if (insight.predictedNextStart) {
    periodRanges.push({
      start: insight.predictedNextStart,
      end: addDays(insight.predictedNextStart, insight.avgPeriodLength - 1),
      predicted: true,
    });
  }

  return {
    insight,
    periodRanges,
    ovulationDate: insight.ovulationDate,
    fertileWindow: insight.fertileWindow,
  };
}

/** 某日期的阶段标记（日历逐格渲染用） */
export function phaseOfDate(date: string, model: CycleModel): CalendarPhase {
  for (const range of model.periodRanges) {
    if (date >= range.start && date <= range.end) {
      return range.predicted ? 'predicted' : 'period';
    }
  }
  if (model.ovulationDate && date === model.ovulationDate) return 'ovulation';
  if (
    model.fertileWindow &&
    date >= model.fertileWindow.start &&
    date <= model.fertileWindow.end
  ) {
    return 'fertile';
  }
  return null;
}

/** 供测试与调试使用的常量快照 */
export const FORECAST_CONSTANTS = {
  PRIOR_CYCLE_MEAN,
  PRIOR_CYCLE_SD,
  PRIOR_PERIOD_MEAN,
  PRIOR_STRENGTH,
  MIN_VALID_INTERVAL,
  MAX_VALID_INTERVAL,
  MAX_INTERVALS,
  HALF_LIFE,
  MIN_WINDOW,
  MAX_WINDOW,
  ACOG_VARIATION_LIMIT,
  LUTEAL_DAYS,
} as const;
