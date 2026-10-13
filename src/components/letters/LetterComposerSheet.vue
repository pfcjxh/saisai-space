<script setup lang="ts">
import { ref, watch } from 'vue';
import AppButton from '@/components/common/AppButton.vue';

/**
 * LetterComposerSheet — 写一封情书
 * 标题可留空；正文 ≤5000 字。寄出后不可编辑（信已封口）。
 */
const props = defineProps<{
  open: boolean;
  partnerName: string;
}>();

const emit = defineEmits<{
  close: [];
  submit: [payload: { title: string; body: string }];
}>();

const title = ref('');
const body = ref('');

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    title.value = '';
    body.value = '';
  },
);

function onSubmit(): void {
  const text = body.value.trim();
  if (!text) return;
  emit('submit', { title: title.value.trim(), body: text });
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
        aria-label="写一封情书"
      >
        <div
          class="rounded-t-3xl border border-separator bg-card px-5 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))]"
        >
          <div class="mx-auto h-1 w-9 rounded-full bg-neutral-600" />
          <h2 class="mt-4 text-center text-base font-medium">写给 {{ partnerName }} 的信</h2>
          <p class="mt-1 text-center text-[10px] text-fg-soft">寄出后不可修改，落笔请慢一点</p>

          <input
            v-model="title"
            maxlength="20"
            placeholder="信的标题（可不填）"
            class="mt-4 h-11 w-full rounded-2xl bg-card-2 px-4 text-sm text-fg placeholder-fg-mute outline-none"
          />

          <div class="mt-3">
            <textarea
              v-model="body"
              rows="7"
              maxlength="5000"
              placeholder="亲爱的…"
              class="w-full resize-none rounded-2xl bg-card-2 p-3 text-sm leading-6 text-fg placeholder-fg-mute outline-none"
            />
            <p class="mt-1 text-right text-[10px] text-fg-mute tabular-nums">
              {{ body.length }}/5000
            </p>
          </div>

          <AppButton block class="mt-3" :disabled="!body.trim()" @click="onSubmit">
            封口寄出
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
