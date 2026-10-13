<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import { useKeyboardAvoid } from '@/composables/useKeyboardAvoid';
import type { WishCategory } from '@/types/database';

/**
 * WishCreateSheet — 心愿创建抽屉（标题 / 备忘 / 分类）
 */
export interface WishFormPayload {
  title: string;
  description: string | null;
  category: WishCategory;
}

const props = defineProps<{ open: boolean }>();

const emit = defineEmits<{
  close: [];
  submit: [payload: WishFormPayload];
}>();

const CATEGORIES: { value: WishCategory; label: string }[] = [
  { value: 'travel', label: '旅行' },
  { value: 'food', label: '美食' },
  { value: 'experience', label: '体验' },
  { value: 'purchase', label: '大件采购' },
];

const title = ref('');
const description = ref('');
const category = ref<WishCategory>('experience');

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    title.value = '';
    description.value = '';
    category.value = 'experience';
  },
);

function onSubmit(): void {
  const trimmed = title.value.trim();
  if (!trimmed) return;
  emit('submit', {
    title: trimmed,
    description: description.value.trim() || null,
    category: category.value,
  });
}

function pillClass(active: boolean): string {
  return active
    ? 'border-lilac/40 bg-lilac/15 text-lilac'
    : 'border-transparent bg-card-2 text-fg-soft';
}

// ---------------------------------------------------------------- 键盘避让
// 逻辑统一由 useKeyboardAvoid 提供（原为 6 处逐行重复的实现）

const keyboardOffset = useKeyboardAvoid(computed(() => props.open));
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
        aria-label="新建心愿"
      >
        <div
          class="rounded-t-3xl border border-separator bg-card px-5 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))]"
        >
          <div class="mx-auto h-1 w-9 rounded-full bg-neutral-600" />
          <h2 class="mt-4 text-center text-base font-medium">新的心愿</h2>

          <input
            v-model="title"
            type="text"
            maxlength="40"
            placeholder="想一起做的事…"
            class="mt-4 h-11 w-full rounded-xl border border-separator bg-card-2 px-4 text-sm text-fg placeholder-fg-mute outline-none focus:border-lilac/50"
          />

          <textarea
            v-model="description"
            rows="2"
            maxlength="200"
            placeholder="愿望描述 / 攻略备忘（可选）"
            class="mt-2 w-full resize-none rounded-xl border border-separator bg-card-2 px-4 py-3 text-sm text-fg placeholder-fg-mute outline-none focus:border-lilac/50"
          />

          <p class="mt-3 mb-2 text-[11px] text-fg-soft">分类</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="c in CATEGORIES"
              :key="c.value"
              type="button"
              class="h-8 rounded-full border px-3 text-xs transition-all duration-200 ease-out-quart active:scale-95"
              :class="pillClass(category === c.value)"
              @click="category = c.value"
            >
              {{ c.label }}
            </button>
          </div>

          <AppButton block class="mt-5" :disabled="!title.trim()" @click="onSubmit">
            加入心愿单
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
