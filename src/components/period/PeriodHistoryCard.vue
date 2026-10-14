<script setup lang="ts">
import { computed, ref } from 'vue';
import { Droplets, MoreVertical, Pencil, Trash2 } from '@lucide/vue';
import AppButton from '@/components/common/AppButton.vue';
import IconTile from '@/components/common/IconTile.vue';
import InlineConfirm from '@/components/common/InlineConfirm.vue';
import { useSwipeActions } from '@/composables/useSwipeActions';
import type { PeriodCycle } from '@/types/database';
import { daysBetween, formatMonthDay, weekdayLabel } from '@/utils/date';

/**
 * PeriodHistoryCard — 周期记录卡片
 * 进行中：玫红水滴瓷贴 + 「进行中」标注 + 快捷结束；
 * 历史：起止日期 + 经期/周期天数。
 *
 * 操作入口（2026-10-15 修复）：
 * 此前编辑/删除**只能靠左滑**呼出，桌面端鼠标无从发现，用户直接反馈
 * 「只能创建不能删除」。现补一个常显的「⋮」按钮：点击即展开同一操作层
 * （复用 useSwipeActions 的 open/close，不新增第二套 UI），左滑手势保留。
 * 删除同时加 InlineConfirm 二次确认——此前误触即真删，无挽回余地。
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

// ---------------------------------------------------------------- 左滑 / 点击展开
// 手势逻辑统一由 useSwipeActions 提供。伴侣视角（readonly）不得响应手势，
// 故在事件层做守卫而不只是隐藏按钮——否则仍可滑出操作区。

const {
  offsetX,
  settling,
  isOpen,
  close: closeActions,
  open: openActions,
  handlers: swipeHandlers,
} = useSwipeActions({ actionWidth: 144, snapThreshold: 70 });

const guardedHandlers = {
  onPointerdown: (e: PointerEvent): void => {
    if (props.readonly) return;
    swipeHandlers.onPointerdown(e);
  },
  onPointermove: (e: PointerEvent): void => {
    if (props.readonly) return;
    swipeHandlers.onPointermove(e);
  },
  onPointerup: (e: PointerEvent): void => {
    if (props.readonly) return;
    swipeHandlers.onPointerup(e);
  },
  onPointercancel: (e: PointerEvent): void => {
    if (props.readonly) return;
    swipeHandlers.onPointercancel(e);
  },
};

/** 常显「⋮」：展开/收起同一操作层（桌面端的主要入口） */
function toggleActions(): void {
  if (isOpen.value) closeActions();
  else openActions();
}

function onEdit(): void {
  closeActions();
  emit('edit');
}

// ---------------------------------------------------------------- 删除二次确认

const confirmingRemove = ref(false);

function requestRemove(): void {
  closeActions();
  confirmingRemove.value = true;
}

function cancelRemove(): void {
  confirmingRemove.value = false;
}

function confirmRemove(): void {
  confirmingRemove.value = false;
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
        @click="requestRemove"
      >
        <Trash2 :size="17" :stroke-width="2" />
      </button>
    </div>

    <div
      class="relative flex touch-pan-y items-center gap-3 rounded-2xl border border-separator bg-card-2 p-3.5 card-glow"
      :class="settling ? 'transition-transform duration-300 ease-out-quart' : ''"
      :style="{ transform: `translateX(${offsetX}px)` }"
      v-on="guardedHandlers"
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
        <!-- 常显操作入口：不依赖左滑，桌面与手机都能一眼看到 -->
        <button
          v-if="!readonly"
          type="button"
          class="flex size-8 items-center justify-center rounded-full bg-card text-fg-soft transition-colors active:bg-card-2"
          :aria-label="isOpen ? '收起操作' : '更多操作'"
          :aria-expanded="isOpen"
          @click.stop="toggleActions"
        >
          <MoreVertical :size="15" />
        </button>
      </div>
    </div>

    <InlineConfirm
      v-if="confirmingRemove"
      message="删除这条经期记录？"
      @cancel="cancelRemove"
      @confirm="confirmRemove"
    />
  </div>
</template>
