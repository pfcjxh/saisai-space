<script setup lang="ts">
import { computed } from 'vue';
import { Droplets, CalendarPlus } from '@lucide/vue';
import AppCard from '@/components/common/AppCard.vue';
import AppButton from '@/components/common/AppButton.vue';
import IconTile from '@/components/common/IconTile.vue';
import type { PeriodInsight } from '@/composables/usePeriodCalculator';
import { formatMonthDay, weekdayLabel } from '@/utils/date';

/**
 * 生理期关怀卡（参考设计：玫红左色条 + 水滴瓷贴 + 周期进度条）。
 * 本人视角：周期进度 + 快捷记录入口；伴侣视角（partnerView）：关怀话术。
 * 合规：底部常驻「日历推演参考」微型标注。
 */
const props = defineProps<{
  insight: PeriodInsight;
  partnerView: boolean;
}>();

const emit = defineEmits<{ record: [] }>();

const headline = computed(() => {
  const i = props.insight;
  if (!i.hasData) return props.partnerView ? '她还没有记录周期' : '开始记录第一个周期';
  if (i.isOnPeriod) return `经期中 · 第 ${i.periodDay ?? 1} 天`;
  const w = i.predictedWindowDays;
  if (i.daysUntilNextPeriod > 0) {
    // 波动区间：数据不足/周期不稳时不装作精确
    if (w >= 2) {
      const lo = Math.max(0, i.daysUntilNextPeriod - w);
      return `预计 ${lo}~${i.daysUntilNextPeriod + w} 天后来临`;
    }
    return `预计 ${i.daysUntilNextPeriod} 天后来临`;
  }
  if (i.daysUntilNextPeriod < 0) return `已推迟 ${-i.daysUntilNextPeriod} 天`;
  return '预计今天来临';
});
const guide = computed(() => {
  const i = props.insight;
  if (!i.hasData) {
    return props.partnerView
      ? '她记录后，这里会给你贴心提示'
      : '完成首次打卡后，将为你推算周期节奏';
  }
  if (!props.partnerView) {
    if (i.isOnPeriod) return '注意保暖，今天也辛苦了';
    if (i.isIrregular) return '周期波动较大，日期仅供参考，以身体信号为准';
    if (i.daysUntilNextPeriod >= 0 && i.daysUntilNextPeriod <= 3)
      return '经期将至，提前备好卫生用品';
    if (i.phase === 'ovulation') return '排卵期前后，留意身体信号';
    return '周期规律运行中';
  }
  // 伴侣关怀话术：给行动，不给数据
  if (i.isOnPeriod) return '准备温水，提醒她少喝冷饮';
  if (i.daysUntilNextPeriod < 0) return '多些耐心陪伴，避免追问压力';
  // 周期不规律时不假装能算准，避免他按错误日期做准备/给压力
  if (i.isIrregular) return '她的周期不太规律，别按日期猜，多问一句更稳妥';
  if (i.daysUntilNextPeriod <= 3) return '经期将至，提前备好暖宝宝与红糖';
  if (i.phase === 'follicular') return '她精力正好，适合安排一场约会';
  if (i.phase === 'ovulation') return '情绪可能敏感，多倾听少争辩';
  return '她可能容易疲惫，适合安静的陪伴';
});

const prediction = computed(() => {
  const i = props.insight;
  if (!i.hasData || i.isOnPeriod || !i.predictedNextStart) return null;
  if (i.daysUntilNextPeriod < 0) return null;
  const w = i.predictedWindowDays;
  if (w >= 2 && i.windowStart && i.windowEnd) {
    // 用引擎给出的 80% 预测区间，而不是在这里重算 ±w
    return `下次预测 ${formatMonthDay(i.windowStart)} ~ ${formatMonthDay(i.windowEnd)}`;
  }
  return `下次预测 ${formatMonthDay(i.predictedNextStart)} ${weekdayLabel(i.predictedNextStart)} · 还有 ${i.daysUntilNextPeriod} 天`;
});

/** 周期进度：当前周期天数 / 平均周期长度 */
const progressPct = computed(() => {
  const i = props.insight;
  if (!i.hasData) return 0;
  return Math.min(100, Math.round((i.dayOfCycle / i.avgCycleLength) * 100));
});
</script>

<template>
  <AppCard accent="rose">
    <div class="flex items-center gap-3">
      <IconTile tone="rose">
        <Droplets :size="20" :stroke-width="1.8" />
      </IconTile>
      <p class="text-[11px] text-fg-soft">
        {{ partnerView ? '贴心伴侣指南' : '生理期' }}
      </p>
      <AppButton
        v-if="!partnerView"
        size="sm"
        variant="secondary"
        class="ml-auto"
        @click="emit('record')"
      >
        <CalendarPlus :size="14" :stroke-width="2" />
        记录
      </AppButton>
    </div>

    <p class="mt-3 text-lg font-semibold tabular-nums">{{ headline }}</p>
    <p class="mt-1 text-xs text-fg-soft tabular-nums">{{ prediction ?? guide }}</p>

    <template v-if="insight.hasData">
      <div class="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-card-2">
        <div
          class="h-full rounded-full bg-lilac transition-all duration-500 ease-out-quart"
          :style="{ width: `${progressPct}%` }"
        />
      </div>
      <p class="mt-1.5 flex justify-between text-[10px] text-fg-mute tabular-nums">
        <span>本次周期第 {{ insight.dayOfCycle }} 天</span>
        <span>约 {{ insight.avgCycleLength }} 天一轮</span>
      </p>
    </template>

    <p class="mt-2 text-right text-[10px] text-fg-mute">日历推演参考</p>
  </AppCard>
</template>
