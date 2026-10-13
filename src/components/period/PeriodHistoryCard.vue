<script setup lang="ts">
import { computed, ref } from 'vue';
import { Droplets, Pencil, Trash2 } from '@lucide/vue';
import AppButton from '@/components/common/AppButton.vue';
import IconTile from '@/components/common/IconTile.vue';
import type { PeriodCycle } from '@/types/database';
import { daysBetween, formatMonthDay, weekdayLabel } from '@/utils/date';

/**
 * PeriodHistoryCard — 周期记录卡片
 * 进行中：玫红水滴瓷贴 + 「进行中」标注 + 快捷结束；
 * 历史：起止日期 + 经期/周期天数；非只读时支持左滑 编辑/删除。
 */
const props = defineProps<{
  cycle: PeriodCycle;
  /** 周期天数（本次开始至下次开始的间隔），无则 null */
  cycleLengthDays: number | null;
  /** 伴侣视角：隐藏一切操作 */
  readonly: boolean;
}>();

const emit = defineEmits<{
  end: [];
  edit: [];
  remove: [];
}>();

const ongoing = computed(() => props.cycle.end_date === null);

const periodDays = computed(() => {
  if (!props.cycle.end_date) return null;
  return daysBetween(props.cycle.start_date, props.cycle.end_date) + 1;
});

const titleYear = computed(() => {
  const [y, m, d] = props.cycle.start_date.split('-').map(Number);
  return `${y}年${m}月${d}日`;
});

const subline = computed(() => {
  const start = `${formatMonthDay(props.cycle.start_date)} ${weekdayLabel(props.cycle.start_date)}`;
  if (ongoing.value) return `开始 ${start} · 未填结束日`;
  const parts = [`${start} → ${formatMonthDay(props.cycle.end_date ?? '')}`];
  if (periodDays.value !== null) parts.push(`经期 ${periodDays.value} 天`);
  if (props.cycleLengthDays !== null) parts.push(`周期 ${props.cycleLengthDays} 天`);
  return parts.join(' · ');
});

// ---------------------------------------------------------------- 左滑操作

const ACTION_WIDTH = 144;
const offsetX = ref(0);
const settling = ref(false);

let startX = 0;
let startY = 0;
let baseOffset = 0;
let direction: 'unknown' | 'horizontal' | 'vertical' = 'unknown';

function onTouchStart(e: TouchEvent): void {
  if (props.readonly) return;
  const touch = e.touches[0];
  if (!touch) return;
  startX = touch.clientX;
  startY = touch.clientY;
  baseOffset = offsetX.value;
  direction = 'unknown';
  settling.value = false;
}

function onTouchMove(e: TouchEvent): void {
  if (props.readonly) return;
  const touch = e.touches[0];
  if (!touch) return;
  const dx = touch.clientX - startX;
  const dy = touch.clientY - startY;
  if (direction === 'unknown') {
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      direction = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
    }
    return;
  }
  if (direction !== 'horizontal') return;
  if (e.cancelable) e.preventDefault();
  offsetX.value = Math.min(0, Math.max(-ACTION_WIDTH, baseOffset + dx));
}

function onTouchEnd(): void {
  if (props.readonly || direction !== 'horizontal') return;
  settling.value = true;
  offsetX.value = offsetX.value < -70 ? -ACTION_WIDTH : 0;
}

function onEdit(): void {
  settling.value = true;
  offsetX.value = 0;
  emit('edit');
}

function onRemove(): void {
  settling.value = true;
  offsetX.value = 0;
  emit('remove');
}
</script>

<template>
  <div class="relative overflow-hidden rounded-2xl">
    <div v-if="!readonly" class="absolute inset-y-0 right-0 flex w-36">
      <button
        type="button"
        class="flex flex-1 items-center justify-center bg-serene/15 text-serene"
        aria-label="编辑"
        @click="onEdit"
      >
        <Pencil :size="17" :stroke-width="2" />
      </button>
      <button
        type="button"
        class="flex flex-1 items-center justify-center bg-red-500/15 text-red-400"
        aria-label="删除"
        @click="onRemove"
      >
        <Trash2 :size="17" :stroke-width="2" />
      </button>
    </div>

    <div
      class="relative flex touch-pan-y items-center gap-3 rounded-2xl border border-separator bg-card-2 p-3.5 card-glow"
      :class="settling ? 'transition-transform duration-300 ease-out-quart' : ''"
      :style="{ transform: `translateX(${offsetX}px)` }"
      @touchstart.passive="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
      @touchcancel="onTouchEnd"
    >
      <IconTile tone="rose">
        <Droplets :size="20" :stroke-width="1.8" />
      </IconTile>

      <div class="min-w-0 flex-1">
        <p class="text-[15px] font-medium tabular-nums">{{ titleYear }}</p>
        <p class="mt-0.5 truncate text-xs text-fg-soft tabular-nums">{{ subline }}</p>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <span v-if="ongoing" class="text-sm font-semibold text-rose">进行中</span>
        <AppButton v-if="ongoing && !readonly" size="sm" variant="secondary" @click="emit('end')">
          结束
        </AppButton>
      </div>
    </div>
  </div>
</template>
