<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';
import { Heart, Trash2, X } from '@lucide/vue';
import AppButton from '@/components/common/AppButton.vue';
import type { LoveLetter } from '@/types/database';

/**
 * LetterEnvelopeOverlay — 拆信时刻
 * 全屏暗场 + 3D 信封：轻触后封盖向上翻开、信纸探出，随后展开成可读信纸。
 * 信纸为固定纸色（不随主题），像一张真的被寄到的信。
 */
const props = defineProps<{
  open: boolean;
  letter: LoveLetter | null;
  isAuthor: boolean;
  authorName: string;
}>();

const emit = defineEmits<{
  close: [];
  remove: [letter: LoveLetter];
}>();

type Phase = 'sealed' | 'opening' | 'reading';
const phase = ref<Phase>('sealed');

let openTimer: number | undefined;

function clearTimer(): void {
  if (openTimer !== undefined) {
    window.clearTimeout(openTimer);
    openTimer = undefined;
  }
}

watch(
  () => props.open,
  (open) => {
    clearTimer();
    if (open) {
      phase.value = 'sealed';
    }
  },
);

onUnmounted(clearTimer);

function startOpen(): void {
  if (phase.value !== 'sealed') return;
  phase.value = 'opening';
  // 封盖 650ms 翻开后切入信纸阅读态
  openTimer = window.setTimeout(() => {
    phase.value = 'reading';
  }, 750);
}

function dateLabel(): string {
  if (!props.letter) return '';
  const d = new Date(props.letter.created_at);
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open && letter"
        class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 px-6 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="拆信"
      >
        <button
          type="button"
          class="absolute top-[calc(16px+env(safe-area-inset-top))] right-4 flex size-9 items-center justify-center rounded-full bg-white/10 text-white transition-transform duration-150 ease-out-quart active:scale-90"
          aria-label="合上信封"
          @click="emit('close')"
        >
          <X :size="17" />
        </button>

        <!-- 3D 信封（封口 / 翻盖中） -->
        <div
          v-if="phase !== 'reading'"
          class="envelope"
          :class="{ 'is-open': phase !== 'sealed' }"
          role="button"
          tabindex="0"
          :aria-label="phase === 'sealed' ? '轻触拆信' : '拆信中'"
          @click="startOpen"
          @keydown.enter="startOpen"
        >
          <div class="letter-peek">
            <p class="pt-4 text-center text-[13px] font-semibold text-[#3b3228]">
              {{ letter.title || '无题信笺' }}
            </p>
          </div>
          <div class="pocket" />
          <div class="pocket-v" />
          <div class="flap">
            <span class="seal">
              <Heart :size="14" class="text-white" fill="currentColor" />
            </span>
          </div>
        </div>
        <p v-if="phase === 'sealed'" class="mt-7 text-xs text-fg-soft">轻触拆信</p>

        <!-- 信纸阅读态 -->
        <Transition name="paper">
          <div
            v-if="phase === 'reading'"
            class="flex max-h-[72dvh] w-full max-w-[340px] flex-col overflow-hidden rounded-2xl bg-[#fffdf6] shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
          >
            <div class="scrollbar-none min-h-0 flex-1 overflow-y-auto px-6 pt-6 pb-4">
              <p class="text-center text-lg font-semibold text-[#3b3228]">
                {{ letter.title || '无题信笺' }}
              </p>
              <p class="mt-1 text-center text-[10px] text-[#8b7f72] tabular-nums">
                {{ authorName }} · {{ dateLabel() }}
              </p>
              <div class="mx-auto my-4 h-px w-16 bg-[#3b3228]/15" />
              <p class="text-[14px] leading-7 text-[#4a3f35] whitespace-pre-wrap">
                {{ letter.body }}
              </p>
            </div>
            <div class="flex gap-2 border-t border-[#3b3228]/10 px-5 py-3">
              <AppButton variant="secondary" class="flex-1" @click="emit('close')">合上</AppButton>
              <AppButton
                v-if="isAuthor"
                variant="ghost"
                class="shrink-0"
                @click="emit('remove', letter)"
              >
                <Trash2 :size="15" />
                撤回
              </AppButton>
            </div>
          </div>
        </Transition>
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
.paper-enter-active {
  transition:
    opacity 300ms ease,
    transform 300ms cubic-bezier(0.25, 1, 0.5, 1);
}
.paper-enter-from {
  opacity: 0;
  transform: translateY(24px) scale(0.96);
}

/* 信封本体：透视容器 */
.envelope {
  position: relative;
  width: 250px;
  height: 156px;
  perspective: 900px;
  cursor: pointer;
}

/* 内嵌信纸：开盖后向上探出 */
.letter-peek {
  position: absolute;
  top: 8px;
  right: 10px;
  left: 10px;
  height: 120px;
  border-radius: 8px;
  background: #fffdf6;
  transition: transform 650ms cubic-bezier(0.25, 1, 0.5, 1);
}
.envelope.is-open .letter-peek {
  transform: translateY(-46px);
}

/* 信封兜（下半） */
.pocket {
  position: absolute;
  inset: 0;
  z-index: 2;
  border-radius: 12px;
  background: linear-gradient(180deg, #efe5d2, #dfcfb2);
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.4);
}
.pocket-v {
  position: absolute;
  inset: 0;
  z-index: 2;
  clip-path: polygon(0 0, 50% 58%, 100% 0);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.05);
}

/* 封盖：顶点为轴向上翻开，翻开瞬间退到信纸之后 */
.flap {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  z-index: 3;
  height: 54%;
  border-radius: 12px 12px 0 0;
  clip-path: polygon(0 0, 100% 0, 50% 100%);
  background: linear-gradient(180deg, #e8dcc4, #d9c9ab);
  transform-origin: top center;
  transition:
    transform 650ms cubic-bezier(0.25, 1, 0.5, 1),
    z-index 0s 0.01s;
}
.envelope.is-open .flap {
  z-index: 0;
  transform: rotateX(-180deg);
}

/* 封蜡：淡紫意象 */
.seal {
  position: absolute;
  top: 62%;
  left: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 9999px;
  background: radial-gradient(circle at 35% 35%, #d8b4fe, #a855f7);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  transform: translate(-50%, -50%);
  transition: opacity 200ms ease;
}
.envelope.is-open .seal {
  opacity: 0;
}
</style>
