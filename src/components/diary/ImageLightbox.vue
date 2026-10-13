<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { X } from '@lucide/vue';

/**
 * ImageLightbox — 全屏大图灯箱
 * 单指横滑切换、双指捏合缩放（1~3x）、缩放后单指平移、未缩放时下滑关闭、
 * 单击背景关闭。全部手势为原生 touch 事件，无额外依赖。
 */
const props = defineProps<{
  open: boolean;
  urls: string[];
  startIndex: number;
}>();

const emit = defineEmits<{ close: [] }>();

const index = ref(0);
const scale = ref(1);
const offset = ref({ x: 0, y: 0 });
const slideOffset = ref(0);

watch(
  () => props.open,
  (open) => {
    if (open) {
      index.value = Math.min(props.startIndex, Math.max(0, props.urls.length - 1));
      scale.value = 1;
      offset.value = { x: 0, y: 0 };
      slideOffset.value = 0;
    }
  },
);

const currentUrl = computed(() => props.urls[index.value] ?? '');
const hasMultiple = computed(() => props.urls.length > 1);

// ---------------------------------------------------------------- 手势状态

let mode: 'none' | 'pan' | 'slide' | 'dismiss' | 'pinch' = 'none';
let startX = 0;
let startY = 0;
let baseOffset = { x: 0, y: 0 };
let baseScale = 1;
let pinchDistance = 0;
let moved = false;

function distance(t: TouchList): number {
  const a = t[0];
  const b = t[1];
  if (!a || !b) return 0;
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function onTouchStart(e: TouchEvent): void {
  const t = e.touches[0];
  if (!t) return;
  moved = false;
  startX = t.clientX;
  startY = t.clientY;
  baseOffset = { ...offset.value };
  baseScale = scale.value;
  if (e.touches.length === 2) {
    mode = 'pinch';
    pinchDistance = distance(e.touches);
  } else if (scale.value > 1) {
    mode = 'pan';
  } else {
    mode = 'none';
  }
}

function onTouchMove(e: TouchEvent): void {
  const t = e.touches[0];
  if (!t) return;
  const dx = t.clientX - startX;
  const dy = t.clientY - startY;
  if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moved = true;

  if (mode === 'pinch' && e.touches.length === 2) {
    const d = distance(e.touches);
    if (pinchDistance > 0) {
      scale.value = Math.min(3, Math.max(1, baseScale * (d / pinchDistance)));
      if (scale.value === 1) offset.value = { x: 0, y: 0 };
    }
    if (e.cancelable) e.preventDefault();
    return;
  }

  if (mode === 'none') {
    // 首次移动时判定方向
    if (Math.abs(dx) > Math.abs(dy) && hasMultiple.value) {
      mode = 'slide';
    } else if (dy > 0) {
      mode = 'dismiss';
    } else {
      mode = 'pan';
    }
  }

  if (mode === 'pan' && scale.value > 1) {
    offset.value = { x: baseOffset.x + dx, y: baseOffset.y + dy };
    if (e.cancelable) e.preventDefault();
  } else if (mode === 'slide') {
    slideOffset.value = dx;
  } else if (mode === 'dismiss') {
    offset.value = { x: 0, y: dy };
  }
}

function onTouchEnd(): void {
  if (mode === 'slide') {
    if (slideOffset.value < -60 && index.value < props.urls.length - 1) {
      index.value += 1;
    } else if (slideOffset.value > 60 && index.value > 0) {
      index.value -= 1;
    }
    slideOffset.value = 0;
  } else if (mode === 'dismiss') {
    if (offset.value.y > 90) {
      emit('close');
    }
    offset.value = { x: 0, y: 0 };
  } else if (mode === 'none' && !moved) {
    emit('close'); // 单击关闭
  }
  mode = 'none';
}

const imageStyle = computed(() => ({
  transform: `translate(${offset.value.x}px, ${offset.value.y + 0}px) scale(${scale.value})`,
}));

const slideStyle = computed(() => ({
  transform: `translateX(${slideOffset.value}px)`,
  opacity: 1 - Math.min(1, Math.abs(slideOffset.value) / 300) * 0.4,
}));
</script>

<template>
  <Teleport to="body">
    <Transition name="lightbox">
      <div
        v-if="open"
        class="fixed inset-0 z-[60] flex items-center justify-center bg-black/95"
        role="dialog"
        aria-modal="true"
        aria-label="大图预览"
        @touchstart.passive="onTouchStart"
        @touchmove="onTouchMove"
        @touchend="onTouchEnd"
      >
        <button
          type="button"
          class="absolute top-[calc(12px+env(safe-area-inset-top))] right-4 z-10 flex size-9 items-center justify-center rounded-full bg-white/10 text-white"
          aria-label="关闭"
          @click="emit('close')"
        >
          <X :size="18" />
        </button>

        <img
          :src="currentUrl"
          alt=""
          class="max-h-full max-w-full select-none transition-transform duration-100"
          :style="scale > 1 || offset.y !== 0 ? imageStyle : slideStyle"
          draggable="false"
        />

        <p
          v-if="hasMultiple"
          class="absolute bottom-[calc(16px+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 text-xs text-white/70 tabular-nums"
        >
          {{ index + 1 }} / {{ urls.length }}
        </p>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.lightbox-enter-active,
.lightbox-leave-active {
  transition: opacity 200ms ease;
}
.lightbox-enter-from,
.lightbox-leave-to {
  opacity: 0;
}
</style>
