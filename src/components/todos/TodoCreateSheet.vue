<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import type { RecurrenceRule, Todo, TodoCategory, TodoPriority } from '@/types/database';
import {
  DEFAULT_TIMEZONE,
  formatDateInTimezone,
  nowInTimezone,
  weekdayIndexOfDate,
} from '@/utils/date';
import { useKeyboardAvoid } from '@/composables/useKeyboardAvoid';

/**
 * TodoCreateSheet — 任务快速创建/编辑半屏抽屉
 *
 * - Teleport 挂载，300ms 弹簧滑入 + 柔和遮罩；
 * - 录入项：标题、备注、分类、优先级、循环规则（每周展开星期）、指定到期日、执行人；
 * - 键盘避让：useKeyboardAvoid composable（6 处抽屉共用，监听 visualViewport
 *   变化动态抬高抽屉），杜绝 iOS Safari 虚拟键盘遮挡输入框。
 */

export interface TodoFormPayload {
  title: string;
  description: string | null;
  category: TodoCategory;
  priority: TodoPriority;
  recurrence_rule: RecurrenceRule;
  /** weekly 时的星期（0=周日），非 weekly 为 null */
  weekday: number | null;
  /** 非 weekly 时的指定到期日 YYYY-MM-DD（可空） */
  specificDate: string | null;
  assignee: 'me' | 'partner' | 'both';
}

const props = defineProps<{
  open: boolean;
  /** 传入则为编辑模式 */
  editing: Todo | null;
  editingAssignee: 'me' | 'partner' | 'both';
  /** 用户时区：决定星期回填与「今天」基准（修复设备时区隐式依赖） */
  timezone?: string;
}>();

const emit = defineEmits<{
  close: [];
  submit: [payload: TodoFormPayload];
}>();

const CATEGORIES: { value: TodoCategory; label: string }[] = [
  { value: 'daily', label: '日常' },
  { value: 'recharge', label: '充电' },
  { value: 'bill', label: '记账' },
  { value: 'date', label: '约会' },
];

const RECURRENCES: { value: RecurrenceRule; label: string }[] = [
  { value: 'none', label: '单次' },
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
];

const PRIORITIES: { value: TodoPriority; label: string }[] = [
  { value: 'normal', label: '普通' },
  { value: 'important', label: '重要' },
];

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'] as const;

const ASSIGNEES: { value: 'me' | 'partner' | 'both'; label: string }[] = [
  { value: 'me', label: '我' },
  { value: 'partner', label: 'TA' },
  { value: 'both', label: '共同' },
];

const title = ref('');
const description = ref('');
const category = ref<TodoCategory>('daily');
const priority = ref<TodoPriority>('normal');
const recurrence = ref<RecurrenceRule>('none');
const weekday = ref<number>(0);
const specificDate = ref('');
const assignee = ref<'me' | 'partner' | 'both'>('both');

const titleInput = ref<HTMLInputElement | null>(null);

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    title.value = props.editing?.title ?? '';
    description.value = props.editing?.description ?? '';
    category.value = props.editing?.category ?? 'daily';
    priority.value = props.editing?.priority ?? 'normal';
    recurrence.value = props.editing?.recurrence_rule ?? 'none';
    const tz = props.timezone ?? DEFAULT_TIMEZONE;
    // 星期回填：先归到用户时区的日历日再取星期。
    // 修复：原实现 new Date(due_date).getDay() 按设备时区取值（跨时区差一天），
    // 且 specificDate 直接 slice(0,10) 取的是 UTC 日期，同样会偏一天。
    weekday.value = props.editing?.due_date
      ? weekdayIndexOfDate(formatDateInTimezone(props.editing.due_date, tz))
      : nowInTimezone(tz).weekday;
    specificDate.value =
      props.editing?.due_date && props.editing.recurrence_rule !== 'weekly'
        ? formatDateInTimezone(props.editing.due_date, tz)
        : '';
    assignee.value = props.editingAssignee;
    await nextTick();
    titleInput.value?.focus();
  },
);

function onSubmit(): void {
  const trimmed = title.value.trim();
  if (!trimmed) return;
  emit('submit', {
    title: trimmed,
    description: description.value.trim() || null,
    category: category.value,
    priority: priority.value,
    recurrence_rule: recurrence.value,
    weekday: recurrence.value === 'weekly' ? weekday.value : null,
    specificDate: recurrence.value !== 'weekly' ? specificDate.value || null : null,
    assignee: assignee.value,
  });
}

// ---------------------------------------------------------------- 键盘避让
// 逻辑统一由 useKeyboardAvoid 提供（原为 6 处逐行重复的实现）

const keyboardOffset = useKeyboardAvoid(computed(() => props.open));

function pillClass(active: boolean): string {
  return active
    ? 'border-serene/40 bg-serene/15 text-serene'
    : 'border-transparent bg-card-2 text-fg-soft';
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        aria-hidden="true"
        @click="emit('close')"
      />
    </Transition>

    <Transition name="sheet">
      <div
        v-if="open"
        class="fixed inset-x-0 z-50 mx-auto w-full max-w-[420px]"
        :style="{ bottom: `${keyboardOffset}px` }"
        role="dialog"
        aria-modal="true"
        :aria-label="editing ? '编辑待办' : '新建待办'"
      >
        <div
          class="rounded-t-3xl border border-separator bg-card px-5 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))]"
        >
          <div class="mx-auto h-1 w-9 rounded-full bg-neutral-600" />
          <h2 class="mt-4 text-center text-base font-medium">
            {{ editing ? '编辑待办' : '新建待办' }}
          </h2>

          <!-- 标题 -->
          <input
            ref="titleInput"
            v-model="title"
            type="text"
            maxlength="50"
            placeholder="要做点什么？"
            class="mt-4 h-11 w-full rounded-xl border border-separator bg-card-2 px-4 text-sm text-fg placeholder-fg-mute outline-none focus:border-serene/50"
            @keyup.enter="onSubmit"
          />

          <!-- 备注 -->
          <textarea
            v-model="description"
            rows="2"
            maxlength="200"
            placeholder="备注 / 细节（可选）"
            class="mt-2 w-full resize-none rounded-xl border border-separator bg-card-2 px-4 py-3 text-sm text-fg placeholder-fg-mute outline-none focus:border-serene/50"
          />

          <!-- 分类 -->
          <p class="mt-4 mb-2 text-[11px] text-fg-soft">分类</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="c in CATEGORIES"
              :key="c.value"
              type="button"
              class="h-8 rounded-full border px-3.5 text-xs transition-all duration-200 ease-out-quart active:scale-95"
              :class="pillClass(category === c.value)"
              @click="category = c.value"
            >
              {{ c.label }}
            </button>
          </div>

          <!-- 优先级 -->
          <p class="mt-4 mb-2 text-[11px] text-fg-soft">优先级</p>
          <div class="flex gap-2">
            <button
              v-for="p in PRIORITIES"
              :key="p.value"
              type="button"
              class="h-8 rounded-full border px-3.5 text-xs transition-all duration-200 ease-out-quart active:scale-95"
              :class="
                priority === p.value
                  ? p.value === 'important'
                    ? 'border-amber-warm/40 bg-amber-warm/15 text-amber-warm'
                    : 'border-serene/40 bg-serene/15 text-serene'
                  : 'border-transparent bg-card-2 text-fg-soft'
              "
              @click="priority = p.value"
            >
              {{ p.label }}
            </button>
          </div>

          <!-- 循环 -->
          <p class="mt-4 mb-2 text-[11px] text-fg-soft">循环</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="r in RECURRENCES"
              :key="r.value"
              type="button"
              class="h-8 rounded-full border px-3.5 text-xs transition-all duration-200 ease-out-quart active:scale-95"
              :class="pillClass(recurrence === r.value)"
              @click="recurrence = r.value"
            >
              {{ r.label }}
            </button>
          </div>
          <div v-if="recurrence === 'weekly'" class="mt-2 flex gap-1.5">
            <button
              v-for="(label, index) in WEEKDAYS"
              :key="index"
              type="button"
              class="size-8 rounded-full border text-xs transition-all duration-200 ease-out-quart active:scale-95"
              :class="pillClass(weekday === index)"
              @click="weekday = index"
            >
              {{ label }}
            </button>
          </div>
          <div v-else class="mt-2">
            <input
              v-model="specificDate"
              type="date"
              class="h-10 w-full rounded-xl border border-separator bg-card-2 px-3 text-sm text-fg outline-none focus:border-serene/50"
            />
            <p class="mt-1 text-[10px] text-fg-mute">指定日期（可留空表示不限期）</p>
          </div>

          <!-- 执行人 -->
          <p class="mt-4 mb-2 text-[11px] text-fg-soft">执行人</p>
          <div class="flex gap-2">
            <button
              v-for="a in ASSIGNEES"
              :key="a.value"
              type="button"
              class="h-8 rounded-full border px-3.5 text-xs transition-all duration-200 ease-out-quart active:scale-95"
              :class="pillClass(assignee === a.value)"
              @click="assignee = a.value"
            >
              {{ a.label }}
            </button>
          </div>

          <AppButton
            block
            class="mt-5"
            :disabled="!title.trim()"
            @click="onSubmit"
          >
            {{ editing ? '保存' : '添加' }}
          </AppButton>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 250ms ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.sheet-enter-active,
.sheet-leave-active {
  transition: transform 300ms cubic-bezier(0.25, 1, 0.5, 1);
}
.sheet-enter-from,
.sheet-leave-to {
  transform: translateY(100%);
}
</style>
