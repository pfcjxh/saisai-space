<script setup lang="ts">
import { computed } from 'vue';
import { ChevronRight } from '@lucide/vue';
import type { MemoryItem, MemoryKind } from '@/composables/useMemories';

/**
 * MemoryTimeline — "我们的故事"聚合时间轴
 * 沿用日记页的虚线轴 + 月份分组；三色圆点区分来源：
 * 日记 = Serene 蓝 / 纪念日 = Warm Amber / 情书 = 淡紫。情书行可点击直接拆信。
 */
const props = defineProps<{
  items: MemoryItem[];
}>();

const emit = defineEmits<{ openLetter: [letterId: string] }>();

const KIND_META: Record<MemoryKind, { label: string; dot: string }> = {
  diary: { label: '日记', dot: 'bg-serene' },
  anniversary: { label: '纪念日', dot: 'bg-amber-warm' },
  letter: { label: '情书', dot: 'bg-lilac' },
};

interface MonthGroup {
  key: string;
  label: string;
  items: MemoryItem[];
}

const groups = computed<MonthGroup[]>(() => {
  const map = new Map<string, MemoryItem[]>();
  for (const item of props.items) {
    const key = item.date.slice(0, 7);
    const list = map.get(key);
    if (list) {
      list.push(item);
    } else {
      map.set(key, [item]);
    }
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, items]) => ({
      key,
      label: `${Number(key.slice(0, 4))}年${Number(key.slice(5, 7))}月`,
      items,
    }));
});

function dayLabel(date: string): string {
  return `${date.slice(5, 7)}.${date.slice(8, 10)}`;
}
</script>

<template>
  <div v-for="group in groups" :key="group.key" class="relative pl-5">
    <!-- 左侧虚线时间轴 -->
    <span
      class="absolute top-1 bottom-0 left-1 w-px border-l border-dashed border-separator"
      aria-hidden="true"
    />
    <span
      class="absolute top-1.5 left-0 size-2 rounded-full bg-lilac shadow-[0_0_6px_rgba(196,181,253,0.6)]"
      aria-hidden="true"
    />
    <p class="py-2 text-xs font-medium text-fg-soft tabular-nums">{{ group.label }}</p>

    <ul class="flex flex-col gap-2 pb-4">
      <li v-for="item in group.items" :key="item.key">
        <component
          :is="item.kind === 'letter' ? 'button' : 'div'"
          class="flex w-full items-start gap-3 rounded-2xl bg-card-2 p-3 text-left"
          :class="
            item.kind === 'letter'
              ? 'transition-transform duration-200 ease-out-quart active:scale-[0.98]'
              : ''
          "
          @click="item.kind === 'letter' && emit('openLetter', item.refId)"
        >
          <span
            class="mt-1.5 size-2 shrink-0 rounded-full"
            :class="KIND_META[item.kind].dot"
            aria-hidden="true"
          />
          <span class="w-10 shrink-0 pt-0.5 text-[10px] text-fg-mute tabular-nums">
            {{ dayLabel(item.date) }}
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm text-fg">{{ item.title }}</span>
            <span v-if="item.excerpt" class="mt-0.5 block truncate text-[10px] text-fg-soft">
              {{ item.excerpt }}
            </span>
          </span>
          <span class="shrink-0 pt-1 text-[10px] text-fg-mute">
            {{ KIND_META[item.kind].label }}
          </span>
          <ChevronRight
            v-if="item.kind === 'letter'"
            :size="14"
            class="mt-1 shrink-0 text-fg-mute"
          />
        </component>
      </li>
    </ul>
  </div>
</template>
