<script setup lang="ts">
import { computed, ref } from 'vue';
import { Check, Pencil, Trash2 } from '@lucide/vue';
import AppBadge from '@/components/common/AppBadge.vue';
import type { Todo, TodoCategory } from '@/types/database';
import { addDays, formatMonthDay, todayInTimezone } from '@/utils/date';

/**
 * TodoItemCard — 任务卡片（参考设计：大圆勾选框 + 色点 + 淡紫循环胶囊）
 * 勾选弹簧按压 + 划线动画；左滑呼出 编辑/删除 操作。
 */
const props = defineProps<{
  todo: Todo;
  /** 归属视角：me 我 / partner TA / both 共同 */
  assignee: 'me' | 'partner' | 'both';
  /** 正在播放完成划线动画 */
  completing: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
  edit: [];
  remove: [];
}>();

// ---------------------------------------------------------------- 元信息

const CATEGORY_DOT: Record<TodoCategory, string> = {
  daily: 'bg-neutral-400',
  recharge: 'bg-serene',
  bill: 'bg-amber-warm',
  date: 'bg-rose',
};

const dotClass = computed(() => CATEGORY_DOT[props.todo.category]);

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'] as const;

const recurrenceLabel = computed<string | null>(() => {
  if (props.todo.recurrence_rule === 'daily') return '每天';
  if (props.todo.recurrence_rule === 'weekly') {
    if (props.todo.due_date) {
      return `每周${WEEKDAYS[new Date(props.todo.due_date).getDay()] ?? ''}`;
    }
    return '每周';
  }
  return null;
});

/** 到期日换算为 今天 / 明天 / M月D日 */
const dueLabel = computed<string | null>(() => {
  if (!props.todo.due_date) return null;
  const d = new Date(props.todo.due_date);
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = todayInTimezone('Asia/Shanghai');
  if (dateStr <= today) return '今天';
  if (dateStr === addDays(today, 1)) return '明天';
  return formatMonthDay(dateStr);
});

const isOverdue = computed(() => {
  if (!props.todo.due_date || props.todo.is_completed) return false;
  return new Date(props.todo.due_date).getTime() < Date.now();
});

const ASSIGNEE_META = {
  me: { label: '我', tone: 'serene' },
  partner: { label: 'TA', tone: 'amber' },
  both: { label: '共同', tone: 'neutral' },
} as const;

const assigneeMeta = computed(() => ASSIGNEE_META[props.assignee]);

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

function closeActions(): void {
  settling.value = true;
  offsetX.value = 0;
}

function onEdit(): void {
  closeActions();
  emit('edit');
}

function onRemove(): void {
  closeActions();
  emit('remove');
}
</script>

<template>
  <div class="relative overflow-hidden rounded-2xl">
    <!-- 滑出的操作区 -->
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
      class="relative flex touch-pan-y items-center gap-3 rounded-2xl border border-separator bg-card-2 p-3 card-glow"
      :class="settling ? 'transition-transform duration-300 ease-out-quart' : ''"
      :style="{ transform: `translateX(${offsetX}px)` }"
      @touchstart.passive="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
      @touchcancel="onTouchEnd"
    >
      <!-- 大圆勾选框 -->
      <button
        type="button"
        class="flex size-7 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-all duration-200 ease-out-quart active:scale-90"
        :class="
          completing || todo.is_completed
            ? 'border-lilac bg-lilac'
            : 'border-neutral-500'
        "
        :aria-label="todo.is_completed ? `恢复「${todo.title}」` : `完成「${todo.title}」`"
        @click="emit('toggle')"
      >
        <Check
          v-if="completing || todo.is_completed"
          :size="15"
          class="text-on-accent"
          :stroke-width="3"
        />
      </button>

      <!-- 内容 -->
      <div class="min-w-0 flex-1">
        <p
          class="truncate text-[15px] font-medium transition-colors duration-300"
          :class="
            completing || todo.is_completed
              ? 'text-fg-mute line-through'
              : 'text-fg'
          "
        >
          {{ todo.title }}
        </p>
        <p
          v-if="todo.description"
          class="mt-0.5 truncate text-xs text-fg-soft"
        >
          {{ todo.description }}
        </p>
        <div class="mt-1 flex items-center gap-1.5">
          <span class="size-1.5 rounded-full" :class="dotClass" aria-hidden="true" />
          <span
            v-if="dueLabel"
            class="text-[11px] tabular-nums"
            :class="isOverdue ? 'text-red-400' : 'text-fg-soft'"
          >
            {{ isOverdue ? '已过期 · ' : '' }}{{ dueLabel }}
          </span>
          <span v-else class="text-[11px] text-fg-soft">随时</span>
          <span
            v-if="recurrenceLabel"
            class="rounded-md bg-lilac/15 px-1.5 py-px text-[10px] text-lilac"
          >
            {{ recurrenceLabel }}
          </span>
          <span
            v-if="todo.priority === 'important'"
            class="rounded-md bg-amber-warm/15 px-1.5 py-px text-[10px] text-amber-warm"
          >
            重要
          </span>
        </div>
      </div>

      <!-- 指派归属 -->
      <AppBadge :tone="assigneeMeta.tone" class="shrink-0">
        {{ assigneeMeta.label }}
      </AppBadge>
    </div>
  </div>
</template>
