<script setup lang="ts">
import { computed } from 'vue';

/**
 * IconTile — 参考设计的图标瓷贴：圆角方形 + 15% 色调底 + 同色系图标。
 */
export type IconTileTone = 'serene' | 'amber' | 'rose' | 'lilac' | 'neutral';

const props = withDefaults(
  defineProps<{
    tone?: IconTileTone;
    /** 边长 px，默认 40 */
    size?: number;
  }>(),
  { tone: 'neutral', size: 40 },
);

const TONE_CLASSES: Record<IconTileTone, string> = {
  serene: 'bg-serene/15 text-serene',
  amber: 'bg-amber-warm/15 text-amber-warm',
  rose: 'bg-rose/15 text-rose',
  lilac: 'bg-lilac/15 text-lilac',
  neutral: 'bg-card-2 text-fg-soft',
};

const classes = computed(() => [
  'flex shrink-0 items-center justify-center rounded-2xl',
  TONE_CLASSES[props.tone],
]);
</script>

<template>
  <div :class="classes" :style="{ width: `${size}px`, height: `${size}px` }">
    <slot />
  </div>
</template>
