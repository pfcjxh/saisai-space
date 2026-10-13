<script setup lang="ts">
import { ref, watch } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import type { PeriodCycle } from '@/types/database';

/**
 * CycleFormSheet — 补录 / 编辑周期（开始日 + 可选结束日）
 */
export interface CycleFormPayload {
  start_date: string;
  end_date: string | null;
}

const props = defineProps<{
  open: boolean;
  editing: PeriodCycle | null;
}>();

const emit = defineEmits<{
  close: [];
  submit: [payload: CycleFormPayload];
}>();

const startDate = ref('');
const endDate = ref('');

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    startDate.value = props.editing?.start_date ?? '';
    endDate.value = props.editing?.end_date ?? '';
  },
);

function onSubmit(): void {
  if (!startDate.value) return;
  if (endDate.value && endDate.value < startDate.value) {
    endDate.value = startDate.value;
  }
  emit('submit', {
    start_date: startDate.value,
    end_date: endDate.value || null,
  });
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
        :aria-label="editing ? '编辑周期' : '补录周期'"
      >
        <div
          class="rounded-t-3xl border border-separator bg-card px-5 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))]"
        >
          <div class="mx-auto h-1 w-9 rounded-full bg-neutral-600" />
          <h2 class="mt-4 text-center text-base font-medium">
            {{ editing ? '编辑周期' : '补录周期' }}
          </h2>

          <p class="mt-4 mb-2 text-[11px] text-fg-soft">开始日期</p>
          <input
            v-model="startDate"
            type="date"
            class="h-11 w-full rounded-xl border border-separator bg-card-2 px-4 text-sm text-fg outline-none focus:border-rose/50"
          />

          <p class="mt-4 mb-2 text-[11px] text-fg-soft">结束日期（可留空表示进行中）</p>
          <input
            v-model="endDate"
            type="date"
            :min="startDate || undefined"
            class="h-11 w-full rounded-xl border border-separator bg-card-2 px-4 text-sm text-fg outline-none focus:border-rose/50"
          />

          <AppButton
            block
            class="mt-5"
            :disabled="!startDate"
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
