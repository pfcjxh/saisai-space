<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Component } from 'vue';
import { Cake, Coffee, Flag, Heart, Pencil, Pin, Trash2 } from '@lucide/vue';
import IconTile from '@/components/common/IconTile.vue';
import type { IconTileTone } from '@/components/common/IconTile.vue';
import type { AnniversaryCategory } from '@/types/database';
import type { AnniversaryView } from '@/composables/useAnniversaries';
import { formatMonthDay, weekdayLabel } from '@/utils/date';
import { lunarLabelOfSolar } from '@/utils/lunar';

/**
 * AnniversaryCard — 纪念日卡片（参考图 3 风格）
 * 左侧分类图标瓷贴 + 标题/日期行 + 右侧大号天数（tabular-nums）。
 * 左滑呼出 编辑/删除。
 */
const props = defineProps<{
  anniversary: AnniversaryView;
}>();

const emit = defineEmits<{
  edit: [];
  remove: [];
}>();

const CATEGORY_META: Record<
  AnniversaryCategory,
  { label: string; tone: IconTileTone; icon: Component }
> = {
  birthday: { label: '生日', tone: 'amber', icon: Cake },
  anniversary: { label: '纪念日', tone: 'rose', icon: Heart },
  holiday: { label: '假期', tone: 'lilac', icon: Flag },
  life: { label: '生活', tone: 'serene', icon: Coffee },
};

const meta = computed(() => CATEGORY_META[props.anniversary.category]);

/** 日期行：农历标注原始农历月日 + 下一次公历落点 */
const dateLine = computed(() => {
  const a = props.anniversary;
  const nextStr = `${formatMonthDay(a.occurrenceDate)} ${weekdayLabel(a.occurrenceDate)}`;
  if (a.is_lunar) {
    return `农历 ${lunarLabelOfSolar(a.target_date)} · 下一次 ${nextStr}`;
  }
  return `${formatMonthDay(a.target_date)} · 下一次 ${nextStr}`;
});

/** 右侧大数字：倒计时 / 已过去 */
const daysDisplay = computed(() => {
  const d = props.anniversary.occurrenceDaysLeft;
  if (d === 0) return { kind: 'today' as const, value: 0, label: '' };
  if (d > 0) return { kind: 'future' as const, value: d, label: '天后' };
  return { kind: 'past' as const, value: -d, label: '已过去' };
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
  const touch = e.touches[0];
  if (!touch) return;
  startX = touch.clientX;
  startY = touch.clientY;
  baseOffset = offsetX.value;
  direction = 'unknown';
  settling.value = false;
}

function onTouchMove(e: TouchEvent): void {
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
  if (direction !== 'horizontal') return;
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
    <!-- 滑出操作区 -->
    <div class="absolute inset-y-0 right-0 flex w-36">
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

    <!-- 卡片本体（touch-pan-y：竖向滚动交还浏览器，横滑由手势逻辑接管） -->
    <div
      class="relative flex touch-pan-y items-center gap-3 rounded-2xl border border-separator bg-card p-3.5 card-glow"
      :class="settling ? 'transition-transform duration-300 ease-out-quart' : ''"
      :style="{ transform: `translateX(${offsetX}px)` }"
      @touchstart.passive="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
      @touchcancel="onTouchEnd"
    >
      <IconTile :tone="meta.tone">
        <component :is="meta.icon" :size="20" :stroke-width="1.8" />
      </IconTile>

      <div class="min-w-0 flex-1">
        <p class="flex items-center gap-1 text-[15px] font-medium">
          <span class="truncate">{{ anniversary.title }}</span>
          <Pin
            v-if="anniversary.pinned"
            :size="11"
            class="shrink-0 text-amber-warm"
            fill="currentColor"
            aria-label="已置顶"
          />
        </p>
        <p class="mt-0.5 truncate text-xs text-fg-soft tabular-nums">{{ dateLine }}</p>
      </div>

      <div class="shrink-0 text-right">
        <p v-if="daysDisplay.kind === 'today'" class="text-sm font-semibold text-amber-warm">
          就是今天
        </p>
        <template v-else>
          <p
            class="text-2xl leading-none font-semibold tabular-nums"
            :class="daysDisplay.kind === 'past' ? 'text-fg-soft' : 'text-amber-warm'"
          >
            {{ daysDisplay.value }}
          </p>
          <p class="mt-1 text-[10px] text-fg-soft">{{ daysDisplay.label }}</p>
        </template>
      </div>
    </div>
  </div>
</template>
