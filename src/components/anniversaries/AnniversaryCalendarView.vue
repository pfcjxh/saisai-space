<script setup lang="ts">
import { computed, ref } from 'vue';
import { Cake, ChevronLeft, ChevronRight, Coffee, Flag, Heart, ListTodo } from '@lucide/vue';
import type { Component } from 'vue';
import IconTile from '@/components/common/IconTile.vue';
import type { IconTileTone } from '@/components/common/IconTile.vue';
import type { Anniversary, AnniversaryCategory, Todo } from '@/types/database';
import { listFestivalsForYear, occurrenceInYear } from '@/utils/lunar';
import { daysBetween } from '@/utils/date';

/**
 * AnniversaryCalendarView — 极简月历面板
 * 月份左右切换；纪念日（琥珀点）/ 节日（淡紫点）/ 待办（蓝点）微型点位；
 * 选中日期下方展开当日事件清单。
 */
const props = defineProps<{
  anniversaries: Anniversary[];
  todos: Todo[];
  /** 用户时区下的今天 YYYY-MM-DD */
  today: string;
}>();

const viewYear = ref(Number(props.today.slice(0, 4)));
const viewMonth = ref(Number(props.today.slice(5, 7)));
const selected = ref(props.today);

// ---------------------------------------------------------------- 日历网格

interface DayCell {
  date: string;
  day: number;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
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

// ---------------------------------------------------------------- 事件聚合

interface DayEvents {
  anniversaries: { item: Anniversary; daysLeft: number }[];
  festivals: string[];
  todos: Todo[];
}

function emptyEvents(): DayEvents {
  return { anniversaries: [], festivals: [], todos: [] };
}

function localDateOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

const eventsMap = computed<Map<string, DayEvents>>(() => {
  const map = new Map<string, DayEvents>();
  const ensure = (date: string): DayEvents => {
    let e = map.get(date);
    if (!e) {
      e = emptyEvents();
      map.set(date, e);
    }
    return e;
  };

  for (const a of props.anniversaries) {
    const date = occurrenceInYear(a, viewYear.value);
    if (date && Number(date.slice(5, 7)) === viewMonth.value) {
      ensure(date).anniversaries.push({
        item: a,
        daysLeft: daysBetween(props.today, date),
      });
    }
  }

  for (const f of listFestivalsForYear(viewYear.value)) {
    if (Number(f.date.slice(5, 7)) === viewMonth.value) {
      ensure(f.date).festivals.push(f.title);
    }
  }

  for (const t of props.todos) {
    if (!t.due_date) continue;
    const date = localDateOf(t.due_date);
    if (
      Number(date.slice(0, 4)) === viewYear.value &&
      Number(date.slice(5, 7)) === viewMonth.value
    ) {
      ensure(date).todos.push(t);
    }
  }

  return map;
});

function dotsOf(date: string): string[] {
  const e = eventsMap.value.get(date);
  if (!e) return [];
  const dots: string[] = [];
  if (e.anniversaries.length > 0) dots.push('bg-amber-warm');
  if (e.festivals.length > 0) dots.push('bg-lilac');
  if (e.todos.length > 0) dots.push('bg-serene');
  return dots;
}

const selectedEvents = computed<DayEvents>(
  () => eventsMap.value.get(selected.value) ?? emptyEvents(),
);

const hasSelectedEvents = computed(
  () =>
    selectedEvents.value.anniversaries.length > 0 ||
    selectedEvents.value.festivals.length > 0 ||
    selectedEvents.value.todos.length > 0,
);

const CATEGORY_META: Record<
  AnniversaryCategory,
  { tone: IconTileTone; icon: Component }
> = {
  birthday: { tone: 'amber', icon: Cake },
  anniversary: { tone: 'rose', icon: Heart },
  holiday: { tone: 'lilac', icon: Flag },
  life: { tone: 'serene', icon: Coffee },
};

function anniversaryDaysLabel(daysLeft: number): string {
  if (daysLeft === 0) return '就是今天';
  if (daysLeft > 0) return `${daysLeft} 天后`;
  return `已过去 ${-daysLeft} 天`;
}

const WEEK_HEADER = ['日', '一', '二', '三', '四', '五', '六'] as const;
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- 月历面板 -->
    <div class="rounded-3xl border border-separator bg-card p-4 card-glow">
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
        <span
          v-for="w in WEEK_HEADER"
          :key="w"
          class="py-1 text-[10px] text-fg-soft"
        >
          {{ w }}
        </span>
      </div>

      <div class="grid grid-cols-7 gap-y-1">
        <template v-for="(cell, i) in cells" :key="i">
          <span v-if="!cell" />
          <button
            v-else
            type="button"
            class="relative flex h-10 flex-col items-center justify-center rounded-full text-sm transition-colors duration-200"
            :class="[
              cell.date === today ? 'bg-lilac font-semibold text-on-accent' : 'text-fg',
              cell.date === selected && cell.date !== today ? 'ring-1 ring-lilac' : '',
            ]"
            @click="selected = cell.date"
          >
            <span class="tabular-nums">{{ cell.day }}</span>
            <span class="absolute bottom-1 flex gap-0.5">
              <span
                v-for="(dot, j) in dotsOf(cell.date)"
                :key="j"
                class="size-1 rounded-full"
                :class="dot"
              />
            </span>
          </button>
        </template>
      </div>
    </div>

    <!-- 当日事件清单 -->
    <div class="flex flex-col gap-2">
      <p class="text-xs text-fg-soft tabular-nums">
        {{ Number(selected.slice(5, 7)) }}月{{ Number(selected.slice(8, 10)) }}日
      </p>

      <p v-if="!hasSelectedEvents" class="py-4 text-center text-xs text-fg-mute">
        这一天没有安排
      </p>

      <div
        v-for="entry in selectedEvents.anniversaries"
        :key="entry.item.id"
        class="flex items-center gap-3 rounded-2xl border border-separator bg-card-2 p-3"
      >
        <IconTile :tone="CATEGORY_META[entry.item.category].tone" :size="32">
          <component :is="CATEGORY_META[entry.item.category].icon" :size="16" :stroke-width="1.8" />
        </IconTile>
        <p class="min-w-0 flex-1 truncate text-sm">{{ entry.item.title }}</p>
        <span class="shrink-0 text-xs text-amber-warm tabular-nums">
          {{ anniversaryDaysLabel(entry.daysLeft) }}
        </span>
      </div>

      <div
        v-for="festival in selectedEvents.festivals"
        :key="festival"
        class="flex items-center gap-3 rounded-2xl border border-separator bg-card-2 p-3"
      >
        <IconTile tone="lilac" :size="32">
          <Flag :size="16" :stroke-width="1.8" />
        </IconTile>
        <p class="min-w-0 flex-1 truncate text-sm">{{ festival }}</p>
        <span class="shrink-0 text-xs text-fg-soft">节日</span>
      </div>

      <div
        v-for="todo in selectedEvents.todos"
        :key="todo.id"
        class="flex items-center gap-3 rounded-2xl border border-separator bg-card-2 p-3"
      >
        <IconTile tone="serene" :size="32">
          <ListTodo :size="16" :stroke-width="1.8" />
        </IconTile>
        <p class="min-w-0 flex-1 truncate text-sm">{{ todo.title }}</p>
        <span class="shrink-0 text-xs text-fg-soft">待办</span>
      </div>
    </div>
  </div>
</template>
