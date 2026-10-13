<script setup lang="ts">
import { Mail } from '@lucide/vue';
import type { LoveLetter } from '@/types/database';

/**
 * EnvelopeCard — 信笺列表项（瓷贴 + 左色条设计语言）
 * 点击拆信；删除入口在拆信后的信纸页脚，列表保持干净。
 */
const props = defineProps<{
  letter: LoveLetter;
  authorName: string;
  isRead: boolean;
}>();

const emit = defineEmits<{ open: [] }>();

function dateLabel(): string {
  const d = new Date(props.letter.created_at);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}
</script>

<template>
  <button
    type="button"
    class="relative w-full overflow-hidden rounded-2xl bg-card-2 p-4 text-left transition-transform duration-200 ease-out-quart active:scale-[0.98]"
    :aria-label="`拆信：${letter.title || '无题信笺'}`"
    @click="emit('open')"
  >
    <!-- 左色条：信笺标识 -->
    <span class="absolute inset-y-0 left-0 w-[3px] bg-lilac" aria-hidden="true" />

    <div class="flex items-center gap-3 pl-2.5">
      <div class="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-card">
        <Mail :size="17" :stroke-width="1.8" class="text-lilac" />
        <!-- 未拆封蜡点 -->
        <span
          v-if="!isRead"
          class="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-amber-warm shadow-[0_0_6px_rgba(255,174,93,0.7)]"
          aria-label="未拆封"
        />
      </div>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm text-fg">{{ letter.title || '无题信笺' }}</p>
        <p class="mt-0.5 truncate text-[10px] text-fg-soft">
          {{ authorName }} · <span class="tabular-nums">{{ dateLabel() }}</span>
        </p>
      </div>
    </div>
  </button>
</template>
