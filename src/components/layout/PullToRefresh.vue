<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import CharacterAvatar from '@/components/common/CharacterAvatar.vue';

/**
 * PullToRefresh — 下拉阻尼小八探头容器
 *
 * 作为页面的全高滚动容器使用（父级需给定高度）。
 * 下拉距离经 0.45 阻尼压缩，超过 60px 阈值时小八由平静转为开心，
 * 松手触发 refresh 事件并驻留探头，直至父级将 loading 置回 false。
 */
const props = withDefaults(
  defineProps<{
    /** 刷新进行中：探头驻留，松手不回弹 */
    loading?: boolean;
    disabled?: boolean;
  }>(),
  { loading: false, disabled: false },
);

const emit = defineEmits<{ refresh: [] }>();

const THRESHOLD = 60;
const MAX_PULL = 120;
const DAMPING = 0.45;
const HOLD_OFFSET = 48;

const scrollRef = ref<HTMLElement | null>(null);
const pull = ref(0);
const settling = ref(false);

let startY = 0;
let tracking = false;

const pastThreshold = computed(() => pull.value >= THRESHOLD);

function onTouchStart(e: TouchEvent): void {
  if (props.disabled || props.loading) return;
  const el = scrollRef.value;
  if (!el || el.scrollTop > 0) return;
  const touch = e.touches[0];
  if (!touch) return;
  startY = touch.clientY;
  tracking = true;
  settling.value = false;
}

function onTouchMove(e: TouchEvent): void {
  if (!tracking) return;
  const el = scrollRef.value;
  const touch = e.touches[0];
  if (!el || !touch) return;
  const dy = touch.clientY - startY;
  if (dy <= 0 || el.scrollTop > 0) {
    tracking = false;
    pull.value = 0;
    return;
  }
  if (e.cancelable) e.preventDefault();
  pull.value = Math.min(dy * DAMPING, MAX_PULL);
}

function onTouchEnd(): void {
  if (!tracking) return;
  tracking = false;
  settling.value = true;
  if (pull.value >= THRESHOLD && !props.loading) {
    emit('refresh');
    pull.value = HOLD_OFFSET;
  } else {
    pull.value = 0;
  }
}

watch(
  () => props.loading,
  (loading) => {
    if (!loading && !tracking) pull.value = 0;
  },
);
</script>

<template>
  <div
    ref="scrollRef"
    class="relative h-full overflow-y-auto overscroll-contain"
    style="touch-action: pan-y"
    @touchstart.passive="onTouchStart"
    @touchmove="onTouchMove"
    @touchend="onTouchEnd"
    @touchcancel="onTouchEnd"
  >
    <!-- 小八探头：随下拉自顶部边缘升起，越过阈值转为开心 -->
    <div
      class="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
      :class="settling ? 'transition-transform duration-300 ease-out-quart' : ''"
      :style="{ transform: `translateY(${pull - 52}px)` }"
    >
      <CharacterAvatar
        character="hachi"
        :mood="pastThreshold ? 'happy' : 'calm'"
        :size="44"
      />
    </div>

    <!-- 页面内容：随阻尼下移，松手弹簧回弹 -->
    <div
      :class="settling ? 'transition-transform duration-300 ease-out-quart' : ''"
      :style="{ transform: `translateY(${pull}px)` }"
    >
      <slot />
    </div>
  </div>
</template>
