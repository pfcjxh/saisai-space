<script setup lang="ts">
import { computed, ref } from 'vue';
import { Check, MoreVertical, Pencil, Trash2 } from '@lucide/vue';
import AppBadge from '@/components/common/AppBadge.vue';
import InlineConfirm from '@/components/common/InlineConfirm.vue';
import { useSwipeActions } from '@/composables/useSwipeActions';
import type { Todo, TodoCategory } from '@/types/database';
import {
  DEFAULT_TIMEZONE,
  daysBetween,
  formatDateInTimezone,
  formatMonthDay,
  todayInTimezone,
  weekdayIndexOfDate,
} from '@/utils/date';

/**
 * TodoItemCard — 任务卡片（参考设计：大圆勾选框 + 色点 + 淡紫循环胶囊）
 * 勾选弹簧按压 + 划线动画；左滑呼出 编辑/删除 操作。
 */
const props = withDefaults(
  defineProps<{
    todo: Todo;
    /** 归属视角：me 我 / partner TA / both 共同 */
    assignee: 'me' | 'partner' | 'both';
    /** 正在播放完成划线动画 */
    completing: boolean;
    /** 用户时区（profiles.timezone），决定「今天/明天」的判定基准 */
    timezone?: string;
  }>(),
  { timezone: DEFAULT_TIMEZONE },
);

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

const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'] as const;

const recurrenceLabel = computed<string | null>(() => {
  if (props.todo.recurrence_rule === 'daily') return '每天';
  if (props.todo.recurrence_rule === 'weekly') {
    if (props.todo.due_date) {
      // 修复：原实现用 new Date(iso).getDay() 按设备时区取星期，
      // 跨时区会显示成相邻的一天；先归到用户时区的日历日再取星期。
      const dateStr = formatDateInTimezone(props.todo.due_date, props.timezone);
      return `每周${WEEKDAY_NAMES[weekdayIndexOfDate(dateStr)] ?? ''}`;
    }
    return '每周';
  }
  return null;
});

/** 到期日换算为 今天 / 明天 / M月D日（已过期则给出实际描述） */
const dueLabel = computed<string | null>(() => {
  if (!props.todo.due_date) return null;
  const dateStr = formatDateInTimezone(props.todo.due_date, props.timezone);
  const today = todayInTimezone(props.timezone);
  const diff = daysBetween(today, dateStr);
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  if (diff < 0) {
    // 修复：原实现把过期项也写成「今天」，并与「已过期」前缀拼成
    // 「已过期 · 今天」这种自相矛盾的文案。
    return `${formatMonthDay(dateStr)}`;
  }
  return formatMonthDay(dateStr);
});

/**
 * 是否已过期：按用户时区的日历日比较。
 * 修复：原实现用 `new Date(due_date).getTime() < Date.now()`，会把
 * 「今天 12:00 到期」的任务在当天下午误判为已过期。到期日只精确到天，
 * 因此应以日历日为准。
 */
const isOverdue = computed(() => {
  if (!props.todo.due_date || props.todo.is_completed) return false;
  const dateStr = formatDateInTimezone(props.todo.due_date, props.timezone);
  return daysBetween(todayInTimezone(props.timezone), dateStr) < 0;
});

const ASSIGNEE_META = {
  me: { label: '我', tone: 'serene' },
  partner: { label: 'TA', tone: 'amber' },
  both: { label: '共同', tone: 'neutral' },
} as const;

const assigneeMeta = computed(() => ASSIGNEE_META[props.assignee]);

// ---------------------------------------------------------------- 左滑操作

/**
 * 手势逻辑统一由 useSwipeActions 提供（此前本组件与其他 3 处各自维护一份
 * 逐行相同的实现）。改为 Pointer Events 后，桌面端也可直接拖动验证。
 */
const {
  offsetX,
  settling,
  isOpen,
  close: closeActions,
  open: openActions,
  handlers: swipeHandlers,
} = useSwipeActions({ actionWidth: 144, snapThreshold: 70 });

/** 常显「⋮」：展开/收起同一操作层（电脑端鼠标点得到，手机端也省一次左滑） */
function toggleActions(): void {
  if (isOpen.value) closeActions();
  else openActions();
}

function onEdit(): void {
  closeActions();
  emit('edit');
}

// 删除二次确认：此前点下去即真删，误触无挽回余地
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
        @click="requestRemove"
      >
        <Trash2 :size="17" :stroke-width="2" />
      </button>
    </div>

    <!-- 卡片本体（touch-pan-y：竖向滚动交还浏览器，横滑由手势逻辑接管） -->
    <div
      class="relative flex touch-pan-y items-center gap-3 rounded-2xl border border-separator bg-card-2 p-3 card-glow"
      :class="settling ? 'transition-transform duration-300 ease-out-quart' : ''"
      :style="{ transform: `translateX(${offsetX}px)` }"
      v-on="swipeHandlers"
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

      <!-- 常显操作入口：不依赖左滑，桌面与手机都能直接点开编辑/删除 -->
      <button
        type="button"
        class="flex size-8 shrink-0 items-center justify-center rounded-full bg-card text-fg-soft transition-colors active:bg-card-2"
        :aria-label="isOpen ? '收起操作' : '更多操作'"
        :aria-expanded="isOpen"
        @click.stop="toggleActions"
      >
        <MoreVertical :size="15" />
      </button>
    </div>

    <InlineConfirm
      v-if="confirmingRemove"
      message="删除这条待办？"
      @cancel="cancelRemove"
      @confirm="confirmRemove"
    />
  </div>
</template>
