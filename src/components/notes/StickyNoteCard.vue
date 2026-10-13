<script setup lang="ts">
import { computed } from 'vue';
import { Pin, X } from '@lucide/vue';
import type { StickyNote, StickyNoteColor } from '@/types/database';

/**
 * StickyNoteCard — 便利贴
 * 纸张配色为固定物理色（不随主题变化，像真实便签纸），深棕文字保证对比度；
 * 按条目 id 交错微旋转，模拟软木板钉贴的手作感。
 */
const props = defineProps<{
  note: StickyNote;
  isAuthor: boolean;
  authorName: string;
}>();

const emit = defineEmits<{ edit: []; remove: [] }>();

/** 与 sticky_notes.color CHECK 约束同约定；edge 为右下折角阴影色 */
const PAPER: Record<StickyNoteColor, { bg: string; edge: string }> = {
  rose: { bg: '#f9d8dd', edge: '#eab8c0' },
  butter: { bg: '#f8ecd0', edge: '#e3cfa4' },
  lavender: { bg: '#e6defa', edge: '#cbbcec' },
  mint: { bg: '#d9efe0', edge: '#b2d9c3' },
  sky: { bg: '#d7e8f7', edge: '#b0cde8' },
};

const paper = computed(() => PAPER[props.note.color]);
const tilt = computed(() =>
  props.note.id.charCodeAt(props.note.id.length - 1) % 2 === 0
    ? 'rotate-[0.8deg]'
    : '-rotate-[0.6deg]',
);

function dateLabel(): string {
  const d = new Date(props.note.created_at);
  return `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}`;
}
</script>

<template>
  <div
    class="relative break-inside-avoid rounded-xl p-3 pr-6 pt-5 shadow-[0_5px_14px_rgba(0,0,0,0.16)] transition-transform duration-200 ease-out-quart active:scale-[0.97]"
    :class="tilt"
    :style="{ backgroundColor: paper.bg, boxShadow: `0 5px 14px rgba(0,0,0,0.16), inset -4px -4px 0 0 ${paper.edge}` }"
    role="button"
    tabindex="0"
    :aria-label="`便利贴：${note.content}`"
    @click="isAuthor && emit('edit')"
    @keydown.enter="isAuthor && emit('edit')"
  >
    <!-- 置顶图钉 -->
    <Pin
      v-if="note.pinned"
      :size="13"
      class="absolute left-2 top-2 text-[#7a4b52] fill-current"
      aria-label="已置顶"
    />
    <!-- 撕下（仅作者） -->
    <button
      v-if="isAuthor"
      type="button"
      class="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full text-[#8a6f5f] transition-transform duration-150 ease-out-quart active:scale-90"
      aria-label="撕下这张便利贴"
      @click.stop="emit('remove')"
    >
      <X :size="12" :stroke-width="2.4" />
    </button>

    <p class="text-[13px] leading-5 break-words text-[#3f342c] whitespace-pre-wrap">
      {{ note.content }}
    </p>
    <p class="mt-2 text-[10px] text-[#6b5c50] tabular-nums">
      {{ authorName }} · {{ dateLabel() }}
    </p>
  </div>
</template>
