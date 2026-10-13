<script setup lang="ts">
import { computed } from 'vue';

/**
 * AppBadge — 低饱和胶囊标签
 * 底色为 Accent 15% 透明度，数值强制 tabular-nums 防抖动。
 */
const props = withDefaults(
  defineProps<{
    tone?: 'serene' | 'amber' | 'neutral';
  }>(),
  { tone: 'neutral' },
);

const toneClasses: Record<NonNullable<typeof props.tone>, string> = {
  serene: 'bg-serene/15 text-serene',
  amber: 'bg-amber-warm/15 text-amber-warm',
  neutral: 'bg-card-2 text-fg-soft',
};

const classes = computed(() => [
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium tabular-nums',
  toneClasses[props.tone],
]);
</script>

<template>
  <span :class="classes">
    <slot />
  </span>
</template>
