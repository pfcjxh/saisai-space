<script setup lang="ts">
import { Check } from '@lucide/vue';
import { useTheme } from '@/composables/useTheme';
import type { ThemeMode } from '@/composables/useTheme';

/**
 * ThemeSettingSheet — 外观主题设置
 * 纯黑 / 米白 / 雾蓝 / 樱粉 / 跟随系统；点击即时生效，
 * 半透明遮罩外可实时预览；按设备本地存储，双人各自独立。
 */
defineProps<{ open: boolean }>();

const emit = defineEmits<{ close: [] }>();

const { mode, options, setTheme } = useTheme();

function onSelect(next: ThemeMode): void {
  setTheme(next);
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
        aria-label="外观主题设置"
      >
        <div
          class="max-h-[85dvh] overflow-y-auto rounded-t-3xl border border-separator bg-card px-5 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))]"
        >
          <div class="mx-auto h-1 w-9 rounded-full bg-neutral-600" />
          <h2 class="mt-4 text-center text-base font-medium">外观主题</h2>

          <div role="radiogroup" aria-label="选择主题" class="mt-4 flex flex-col gap-2">
            <button
              v-for="option in options"
              :key="option.mode"
              type="button"
              role="radio"
              :aria-checked="mode === option.mode"
              class="flex items-center gap-3 rounded-2xl p-3 text-left transition-transform duration-200 ease-out-quart active:scale-[0.98]"
              :class="mode === option.mode ? 'bg-serene/10 ring-1 ring-serene/40' : 'bg-card-2'"
              @click="onSelect(option.mode)"
            >
              <!-- 色板预览：主题底色 + 迷你卡片贴片 + 前景色圆点 -->
              <span
                class="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-separator"
                :style="{ background: option.swatch.bg }"
              >
                <span class="h-4 w-6 rounded-[5px]" :style="{ background: option.swatch.card }" />
                <span
                  class="absolute right-1.5 bottom-1.5 size-1.5 rounded-full"
                  :style="{ background: option.swatch.fg }"
                />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-sm text-fg">{{ option.label }}</span>
                <span class="mt-0.5 block text-[10px] text-fg-soft">{{ option.hint }}</span>
              </span>
              <span
                class="flex size-5 shrink-0 items-center justify-center rounded-full"
                :class="mode === option.mode ? 'bg-serene' : 'border border-separator'"
              >
                <Check
                  v-if="mode === option.mode"
                  :size="12"
                  :stroke-width="3"
                  class="text-on-accent"
                />
              </span>
            </button>
          </div>

          <p class="mt-4 text-center text-[10px] leading-4 text-fg-mute">
            主题保存在本机，TA 的设备可单独设置
          </p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 与 NotificationSettingSheet 一致的遮罩与抽屉动效 */
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
