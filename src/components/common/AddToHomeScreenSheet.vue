<script setup lang="ts">
import { Check, Share, SquarePlus, Sparkles } from '@lucide/vue';
import AppButton from '@/components/common/AppButton.vue';

/**
 * AddToHomeScreenSheet — iOS 添加到主屏幕引导（Apple HIG 拟物步骤图解）
 * 三步示意 + 我知道了 / 稍后再说（3 天防骚扰由 usePWAInstall 处理）。
 */
defineProps<{ open: boolean }>();

const emit = defineEmits<{
  close: [];
  snooze: [];
}>();

const STEPS = [
  {
    icon: Share,
    title: '点击「分享」按钮',
    body: '在 Safari 底部工具栏的正中间，找到方框向上箭头的分享图标',
    tone: 'text-serene',
    tile: 'bg-serene/15',
  },
  {
    icon: SquarePlus,
    title: '找到「添加到主屏幕」',
    body: '在弹出的菜单中向上轻滑，点击带「+」号的这一项',
    tone: 'text-lilac',
    tile: 'bg-lilac/15',
  },
  {
    icon: Check,
    title: '点击右上角「添加」',
    body: '桌面上就会生成专属图标，打开后没有地址栏，像原生 App 一样',
    tone: 'text-amber-warm',
    tile: 'bg-amber-warm/15',
  },
] as const;
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
        aria-label="添加到主屏幕引导"
      >
        <div
          class="rounded-t-3xl border border-separator bg-card px-5 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))]"
        >
          <div class="mx-auto h-1 w-9 rounded-full bg-neutral-600" />

          <div class="mt-4 flex flex-col items-center gap-2 text-center">
            <div class="flex items-center -space-x-2">
              <img
                src="/avatars/me.webp"
                alt=""
                class="size-9 rounded-lg bg-white object-cover ring-2 ring-card"
              />
              <img
                src="/avatars/partner.webp"
                alt=""
                class="size-9 rounded-lg bg-white object-cover ring-2 ring-card"
              />
            </div>
            <h2 class="text-base font-semibold">把她装进手机主屏幕</h2>
            <p class="text-[11px] leading-4 text-fg-soft">
              全屏体验、消息提醒、离线也能看回忆<br />
              只需三步，30 秒完成
            </p>
          </div>

          <!-- 三步图解 -->
          <ol class="mt-4 flex flex-col gap-2.5">
            <li
              v-for="(step, index) in STEPS"
              :key="step.title"
              class="flex items-start gap-3 rounded-2xl bg-card-2 p-3"
            >
              <span
                class="flex size-9 shrink-0 items-center justify-center rounded-xl"
                :class="step.tile"
              >
                <component :is="step.icon" :size="17" :stroke-width="2" :class="step.tone" />
              </span>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium">
                  <span class="mr-1 text-fg-soft tabular-nums">{{ index + 1 }}.</span>
                  {{ step.title }}
                </p>
                <p class="mt-0.5 text-[11px] leading-4 text-fg-soft">{{ step.body }}</p>
              </div>
            </li>
          </ol>

          <div class="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-fg-mute">
            <Sparkles :size="11" class="text-amber-warm" />
            添加到主屏幕后才能开启消息提醒（iOS 16.4+）
          </div>

          <AppButton block class="mt-4" @click="emit('close')">我知道了</AppButton>
          <button
            type="button"
            class="mt-2 w-full text-center text-[11px] text-fg-soft"
            @click="emit('snooze')"
          >
            稍后再说（3 天内不再提示）
          </button>
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
  transition: transform 350ms cubic-bezier(0.25, 1, 0.5, 1);
}
.sheet-enter-from,
.sheet-leave-to {
  transform: translateY(100%);
}
</style>