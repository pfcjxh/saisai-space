<script setup lang="ts">
import { computed, ref } from 'vue';
import { ChevronLeft, ChevronRight, PenLine } from '@lucide/vue';
import AppBadge from '@/components/common/AppBadge.vue';
import type { CycleModel } from '@/composables/usePeriodCalculator';
import { phaseOfDate } from '@/composables/usePeriodCalculator';
import type { PeriodLog } from '@/types/database';

/**
 * PeriodCalendarView — 生理期月历
 * 经期玫红 / 预测经期玫红浅底 / 排卵日紫色实心 / 排卵期淡紫底；
 * 选中日期下方展开打卡明细或打卡入口（伴侣视角只读）。
 */
const props = defineProps<{
  model: CycleModel;
  logs: PeriodLog[];
  today: string;
  /** 伴侣视角：隐藏打卡入口 */
  readonly: boolean;
}>();

const emit = defineEmits<{ log: [date: string] }>();

const viewYear = ref(Number(props.today.slice(0, 4)));
const viewMonth = ref(Number(props.today.slice(5, 7)));
const selected = ref(props.today);

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

interface DayCell {
  date: string;
  day: number;
}

const cells = computed<(DayCell | null)[]>(() => {
  const firstWeekday = new Date(viewYear.value, viewMonth.value - 1, 1).getDay();
  const daysInMonth = new Date(viewYear.value, viewMonth.value, 0).getDate();
  const result: (DayCell | null)[] = Array.from({ length: firstWeekday }, () => null);
  for (let d = 1; d <= daysInMonth; d++) {
    result.push({
      date: `${viewYear.value}-${pad2(viewMonth.value)}-${pad2(d)}`,
      day: d,
    });
  }
  return result;
});

const monthTitle = computed(() => `${viewYear.value}年${viewMonth.value}月`);

function prevMonth(): void {
  if (viewMonth.value === 1) {
    viewYear.value -= 1;
    viewMonth.value = 12;
  } else {
    viewMonth.value -= 1;
  }
}

function nextMonth(): void {
  if (viewMonth.value === 12) {
    viewYear.value += 1;
    viewMonth.value = 1;
  } else {
    viewMonth.value += 1;
  }
}

function phaseClass(date: string): string {
  const phase = phaseOfDate(date, props.model);
  switch (phase) {
    case 'period':
      return 'bg-rose/25 text-fg';
    case 'predicted':
      return 'bg-rose/10 text-fg-soft';
    case 'ovulation':
      return 'bg-ovulation font-semibold text-white';
    case 'fertile':
      return 'bg-lilac/15 text-fg';
    default:
      return 'text-fg-soft';
  }
}

function hasLog(date: string): boolean {
  return props.logs.some((l) => l.log_date === date);
}

const selectedLog = computed<PeriodLog | null>(
  () => props.logs.find((l) => l.log_date === selected.value) ?? null,
);

/** symptoms 存储为 JSONB，读取时收窄为字符串数组 */
function symptomsOf(log: PeriodLog): string[] {
  return Array.isArray(log.symptoms)
    ? log.symptoms.filter((s): s is string => typeof s === 'string')
    : [];
}

const selectedSymptoms = computed(() =>
  selectedLog.value ? symptomsOf(selectedLog.value) : [],
);

const PAIN_LABELS = ['无痛', '微痛', '轻度', '明显', '较重', '剧烈'] as const;

const WEEK_HEADER = ['日', '一', '二', '三', '四', '五', '六'] as const;
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- 月历面板 -->
    <div
      class="rounded-3xl border border-separator bg-card p-4 card-glow"
    >
      <div class="flex items-center justify-between">
        <button
          type="button"
          class="flex size-8 items-center justify-center rounded-full text-fg-soft transition-transform duration-200 ease-out-quart active:scale-90"
          aria-label="上个月"
          @click="prevMonth"
        >
          <ChevronLeft :size="18" />
        </button>
        <p class="text-sm font-semibold tabular-nums">{{ monthTitle }}</p>
        <button
          type="button"
          class="flex size-8 items-center justify-center rounded-full text-fg-soft transition-transform duration-200 ease-out-quart active:scale-90"
          aria-label="下个月"
          @click="nextMonth"
        >
          <ChevronRight :size="18" />
        </button>
      </div>

      <div class="mt-2 grid grid-cols-7 text-center">
        <span v-for="w in WEEK_HEADER" :key="w" class="py-1 text-[10px] text-fg-soft">
          {{ w }}
        </span>
      </div>

      <div class="grid grid-cols-7 gap-1">
        <template v-for="(cell, i) in cells" :key="i">
          <span v-if="!cell" />
          <button
            v-else
            type="button"
            class="relative flex h-10 flex-col items-center justify-center rounded-xl text-sm transition-colors duration-200"
            :class="[
              phaseClass(cell.date),
              cell.date === today ? 'ring-1 ring-lilac' : '',
              cell.date === selected ? 'ring-1 ring-fg/50' : '',
            ]"
            @click="selected = cell.date"
          >
            <span class="tabular-nums">{{ cell.day }}</span>
            <span
              v-if="hasLog(cell.date)"
              class="absolute bottom-1 size-1 rounded-full bg-white/70"
            />
          </button>
        </template>
      </div>
    </div>

    <!-- 选中日期明细 -->
    <div class="flex flex-col gap-2">
      <p class="text-xs text-fg-soft tabular-nums">
        {{ Number(selected.slice(5, 7)) }}月{{ Number(selected.slice(8, 10)) }}日
      </p>

      <div
        v-if="selectedLog"
        class="rounded-2xl border border-separator bg-card-2 p-3.5 text-sm"
      >
        <div class="flex items-center justify-between">
          <p class="font-medium">当日打卡</p>
          <AppBadge :tone="selectedLog.visibility === 'shared' ? 'serene' : 'neutral'">
            {{ selectedLog.visibility === 'shared' ? '公开给 TA' : '仅自己可见' }}
          </AppBadge>
        </div>
        <div class="mt-2 flex flex-col gap-1 text-xs text-fg-soft tabular-nums">
          <p v-if="selectedLog.flow_level">经量 {{ selectedLog.flow_level }} / 5</p>
          <p v-if="selectedLog.pain_level !== null">
            痛感 {{ PAIN_LABELS[selectedLog.pain_level] ?? selectedLog.pain_level }}
          </p>
          <p v-if="selectedSymptoms.length > 0">症状 {{ selectedSymptoms.join('、') }}</p>
          <p v-if="selectedLog.notes" class="text-fg-soft">{{ selectedLog.notes }}</p>
        </div>
      </div>

      <div
        v-else
        class="flex items-center justify-between rounded-2xl border border-dashed border-separator p-3.5"
      >
        <p class="text-xs text-fg-soft">这一天没有打卡记录</p>
        <button
          v-if="!readonly"
          type="button"
          class="flex items-center gap-1 text-xs text-lilac transition-transform duration-200 ease-out-quart active:scale-95"
          @click="emit('log', selected)"
        >
          <PenLine :size="12" />
          打卡这一天
        </button>
      </div>
    </div>
  </div>
</template>
