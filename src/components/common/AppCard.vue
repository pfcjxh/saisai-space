<script setup lang="ts">
import { computed } from 'vue';

/**
 * AppCard — 层级化容器卡片
 *
 * 曲率协调公式（impeccable 规范）：R_外 = R_内 + Padding
 *   - 一级容器：rounded-3xl (24px)，默认 padding 16px
 *   - 二级卡片：rounded-2xl (16px)
 *   当二级卡片直接嵌套于一级容器时，一级容器应使用 pad="sm" (8px)，
 *   使 24 = 16 + 8 成立；常规内容容器使用 pad="md" (16px)，
 *   此时其内部直接子元素圆角应为 8px (rounded-lg)。
 *
 * accent：参考设计的左侧色条（3px 竖条，上下内缩 12px 避开圆角裁切）。
 */
export type CardAccent = 'serene' | 'amber' | 'rose' | 'lilac';

const props = withDefaults(
  defineProps<{
    /** primary：一级容器 #1C1C1E；secondary：二级交互组件 #2C2C2E */
    variant?: 'primary' | 'secondary';
    /** none: 0 / sm: 8px（嵌套二级卡片时）/ md: 16px（默认） */
    pad?: 'none' | 'sm' | 'md';
    /** 可点按卡片：附弹簧缩放微动效 */
    interactive?: boolean;
    /** 左侧语义色条 */
    accent?: CardAccent | null;
  }>(),
  { variant: 'primary', pad: 'md', interactive: false, accent: null },
);

const ACCENT_BAR: Record<CardAccent, string> = {
  serene: 'bg-serene',
  amber: 'bg-amber-warm',
  rose: 'bg-rose',
  lilac: 'bg-lilac',
};

const classes = computed(() => [
  'relative border border-separator',
  props.variant === 'primary'
    ? 'rounded-3xl bg-card card-glow'
    : 'rounded-2xl bg-card-2 card-glow',
  props.pad === 'sm' ? 'p-2' : props.pad === 'md' ? 'p-4' : '',
  props.interactive
    ? 'cursor-pointer transition-all duration-200 ease-out-quart active:scale-[0.98]'
    : '',
]);
</script>

<template>
  <div :class="classes">
    <span
      v-if="accent"
      class="absolute top-3 bottom-3 left-0 w-[3px] rounded-full"
      :class="ACCENT_BAR[accent]"
      aria-hidden="true"
    />
    <slot />
  </div>
</template>
