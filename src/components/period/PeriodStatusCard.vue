<script setup lang="ts">
import { computed } from 'vue';
import type { CycleModel } from '@/composables/usePeriodCalculator';
import { addDays, formatDateWithWeekday, formatMonthDay } from '@/utils/date';

/**
 * PeriodStatusCard — 核心状态卡（参考图 4）
 * 日期行 + 大字阶段状态 + 预测倒数 + 均值说明 + 周期进度条 + 四色图例。
 */
const props = defineProps<{
  model: CycleModel;
  /** 用户时区下的今天 YYYY-MM-DD */
  today: string;
  partnerView: boolean;
}>();

const PHASE_LABELS: Record<string, string> = {
  follicular: '舒适期',
  ovulation: '排卵期',
  luteal: '黄体期',
};

/** 大字状态标题 */
const headline = computed(() => {
  const i = props.model.insight;
  if (!i.hasData) return '等待首次记录';
  if (i.isOnPeriod) return `经期中 · 第 ${i.periodDay ?? 1} 天`;
  if (i.daysUntilNextPeriod < 0) return `经期推迟中 · ${-i.daysUntilNextPeriod} 天`;
  return PHASE_LABELS[i.phase ?? 'follicular'] ?? '舒适期';
});

/** 预测倒数行（含波动窗口） */
const prediction = computed(() => {
  const i = props.model.insight;
  if (!i.hasData || !i.predictedNextStart) return null;
  if (i.isOnPeriod) return null;
  if (i.daysUntilNextPeriod < 0) {
    return `下次预测 ${formatDateWithWeekday(i.predictedNextStart)} · 已推迟 ${-i.daysUntilNextPeriod} 天`;
  }
  const w = i.predictedWindowDays;
  if (w >= 2) {
    const start = addDays(i.predictedNextStart, -w);
    const end = addDays(i.predictedNextStart, w);
    return `下次经期预测 ${formatMonthDay(start)} ~ ${formatMonthDay(end)}（约 ${Math.max(0, i.daysUntilNextPeriod - w)}~${i.daysUntilNextPeriod + w} 天后）`;
  }
  return `下次经期预测 ${formatDateWithWeekday(i.predictedNextStart)}（约 ${i.daysUntilNextPeriod} 天后）`;
});

/** 波动提示：数据不足或波动大时明确告知不确定性 */
const volatilityNote = computed(() => {
  const i = props.model.insight;
  if (!i.hasData || i.usesDefaultAverages) return null;
  if (i.predictedWindowDays >= 4) return '周期波动较大，预测以区间为准';
  return null;
});

/** 均值说明行 */
const averagesLine = computed(() => {
  const i = props.model.insight;
  const cycleNote = i.usesDefaultAverages ? '（记录不足 2 次，用默认值）' : '';
  return `平均周期 ${i.avgCycleLength} 天${cycleNote} · 平均经期 ${i.avgPeriodLength} 天`;
});

/** 周期进度 */
const progressPct = computed(() => {
  const i = props.model.insight;
  if (!i.hasData) return 0;
  return Math.min(100, Math.round((i.dayOfCycle / i.avgCycleLength) * 100));
});

const LEGEND = [
  { label: '经期', dot: 'bg-rose' },
  { label: '预测经期', dot: 'bg-rose/40' },
  { label: '排卵日', dot: 'bg-ovulation' },
  { label: '排卵期', dot: 'bg-lilac' },
] as const;
</script>

<template>
  <div
    class="rounded-3xl border border-separator bg-card p-4 card-glow"
  >
    <p class="text-xs text-fg-soft tabular-nums">
      今天 · {{ formatDateWithWeekday(today) }}
    </p>

    <p class="mt-2 text-2xl font-bold tabular-nums">{{ headline }}</p>

    <p v-if="prediction" class="mt-1.5 text-xs text-fg-soft tabular-nums">
      {{ prediction }}
    </p>
    <p v-if="volatilityNote" class="mt-1 text-[10px] text-amber-warm/80">
      {{ volatilityNote }}
    </p>
    <p v-if="model.insight.hasData" class="mt-1 text-xs text-fg-soft tabular-nums">
      {{ averagesLine }}
    </p>

    <template v-if="model.insight.hasData">
      <div class="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-card-2">
        <div
          class="h-full rounded-full transition-all duration-500 ease-out-quart"
          :class="model.insight.isOnPeriod ? 'bg-rose' : 'bg-lilac'"
          :style="{ width: `${progressPct}%` }"
        />
      </div>
      <p class="mt-1.5 flex justify-between text-[10px] text-fg-mute tabular-nums">
        <span>本次周期第 {{ model.insight.dayOfCycle }} 天</span>
        <span>约 {{ model.insight.avgCycleLength }} 天一轮</span>
      </p>

      <!-- 阶段图例 -->
      <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span
          v-for="item in LEGEND"
          :key="item.label"
          class="flex items-center gap-1.5 text-[10px] text-fg-soft"
        >
          <span class="size-2 rounded-full" :class="item.dot" />
          {{ item.label }}
        </span>
      </div>
    </template>

    <p v-if="partnerView && model.insight.hasData" class="mt-3 text-[11px] text-serene">
      伴侣关怀模式：仅显示周期阶段估算，私密打卡内容不可见
    </p>
  </div>
</template>
