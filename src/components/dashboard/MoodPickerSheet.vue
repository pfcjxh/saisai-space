<script setup lang="ts">
import CharacterAvatar from '@/components/common/CharacterAvatar.vue';
import type { CharacterKind } from '@/components/common/CharacterAvatar.vue';
import type { Mood } from '@/types/database';

/**
 * Tier 3 — 心情打卡抽屉。
 * 底部拟物弹层，5 种预设心情，选中即同步 profiles.mood（由父级处理）。
 * 动效严格 300ms 阻尼弹簧，尊重 reduced-motion 由系统级 transition 处理。
 */
defineProps<{
  open: boolean;
  character: CharacterKind;
  current: Mood | null;
}>();

const emit = defineEmits<{
  close: [];
  select: [mood: Mood];
}>();

const MOODS: { value: Mood; label: string }[] = [
  { value: 'calm', label: '平静' },
  { value: 'happy', label: '开心' },
  { value: 'tired', label: '疲惫' },
  { value: 'caring', label: '关怀' },
  { value: 'sleepy', label: '困倦' },
];
</script>

<template>
  <Teleport to="body">
    <!-- 背板 -->
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        aria-hidden="true"
        @click="emit('close')"
      />
    </Transition>

    <!-- 抽屉主体：与 App Shell 同宽居中 -->
    <Transition name="sheet">
      <div
        v-if="open"
        class="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[420px]"
        role="dialog"
        aria-modal="true"
        aria-label="此刻的心情"
      >
        <div
          class="rounded-t-3xl border border-separator bg-card px-6 pt-3 pb-[calc(20px+env(safe-area-inset-bottom))]"
        >
          <div class="mx-auto h-1 w-9 rounded-full bg-neutral-600" />
          <h2 class="mt-4 text-center text-base font-medium">此刻的心情</h2>

          <div class="mt-5 grid grid-cols-5 gap-2">
            <button
              v-for="m in MOODS"
              :key="m.value"
              type="button"
              class="flex flex-col items-center gap-1.5 rounded-2xl py-2 transition-all duration-200 ease-out-quart active:scale-95"
              :class="current === m.value ? 'bg-card-2 ring-1 ring-serene' : ''"
              :aria-pressed="current === m.value"
              @click="emit('select', m.value)"
            >
              <CharacterAvatar :character="character" :mood="m.value" :size="44" />
              <span
                class="text-[11px]"
                :class="current === m.value ? 'text-serene' : 'text-fg-soft'"
              >
                {{ m.label }}
              </span>
            </button>
          </div>
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
