<script setup lang="ts">
import { ref, watch } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import type { StickyNote, StickyNoteColor } from '@/types/database';

/**
 * NoteComposerSheet — 写 / 编辑便利贴
 * 选纸张色 + 一句话内容（≤200 字）+ 可置顶；编辑模式回填原内容。
 */
const props = defineProps<{
  open: boolean;
  editing: StickyNote | null;
}>();

const emit = defineEmits<{
  close: [];
  submit: [payload: { color: StickyNoteColor; content: string; pinned: boolean }];
}>();

const COLOR_SWATCHES: { key: StickyNoteColor; bg: string }[] = [
  { key: 'rose', bg: '#f9d8dd' },
  { key: 'butter', bg: '#f8ecd0' },
  { key: 'lavender', bg: '#e6defa' },
  { key: 'mint', bg: '#d9efe0' },
  { key: 'sky', bg: '#d7e8f7' },
];

const color = ref<StickyNoteColor>('lavender');
const content = ref('');
const pinned = ref(false);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    color.value = props.editing?.color ?? 'lavender';
    content.value = props.editing?.content ?? '';
    pinned.value = props.editing?.pinned ?? false;
  },
);

function onSubmit(): void {
  const text = content.value.trim();
  if (!text) return;
  emit('submit', { color: color.value, content: text, pinned: pinned.value });
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
        class="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[420px]"
        role="dialog"
        aria-modal="true"
        :aria-label="editing ? '编辑便利贴' : '写便利贴'"
      >
        <div
          class="rounded-t-3xl border border-separator bg-card px-5 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))]"
        >
          <div class="mx-auto h-1 w-9 rounded-full bg-neutral-600" />
          <h2 class="mt-4 text-center text-base font-medium">
            {{ editing ? '编辑便利贴' : '写一张便利贴' }}
          </h2>

          <!-- 纸张色 -->
          <p class="mt-4 mb-2 text-[11px] text-fg-soft">纸张颜色</p>
          <div class="flex items-center gap-2.5">
            <button
              v-for="swatch in COLOR_SWATCHES"
              :key="swatch.key"
              type="button"
              class="size-9 rounded-lg border border-black/5 transition-transform duration-150 ease-out-quart active:scale-90"
              :class="color === swatch.key ? 'ring-2 ring-fg/50 ring-offset-2 ring-offset-card' : ''"
              :style="{ backgroundColor: swatch.bg }"
              :aria-label="`纸张颜色 ${swatch.key}`"
              :aria-pressed="color === swatch.key"
              @click="color = swatch.key"
            />
          </div>

          <!-- 内容 -->
          <div class="mt-4">
            <textarea
              v-model="content"
              rows="4"
              maxlength="200"
              placeholder="写点什么贴在墙上…"
              class="w-full resize-none rounded-2xl bg-card-2 p-3 text-sm leading-6 text-fg placeholder-fg-mute outline-none"
            />
            <p class="mt-1 text-right text-[10px] text-fg-mute tabular-nums">
              {{ content.length }}/200
            </p>
          </div>

          <!-- 置顶 -->
          <div class="flex items-center justify-between rounded-2xl bg-card-2 p-3">
            <p class="text-sm text-fg">置顶在墙的左上角</p>
            <button
              type="button"
              role="switch"
              :aria-checked="pinned"
              class="flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors duration-200"
              :class="pinned ? 'justify-end bg-serene' : 'justify-start bg-neutral-600'"
              @click="pinned = !pinned"
            >
              <span class="block size-5 rounded-full bg-white shadow" />
            </button>
          </div>

          <AppButton block class="mt-4" :disabled="!content.trim()" @click="onSubmit">
            {{ editing ? '保存修改' : '贴到墙上' }}
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
