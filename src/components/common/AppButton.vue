<script setup lang="ts">
import { computed } from 'vue';
import { LoaderCircle } from '@lucide/vue';

/**
 * AppButton — 物理手感按钮
 * 触摸态 active:scale-[0.97] + 阻尼弹簧曲线，最小触控高度 44px（md 起）。
 */
const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost';
    /** 仅 primary 生效：serene（小八蓝，默认）| amber（米菲橙，庆祝/纪念场景） */
    tone?: 'serene' | 'amber';
    size?: 'sm' | 'md' | 'lg';
    block?: boolean;
    disabled?: boolean;
    loading?: boolean;
    type?: 'button' | 'submit' | 'reset';
  }>(),
  {
    variant: 'primary',
    tone: 'serene',
    size: 'md',
    block: false,
    disabled: false,
    loading: false,
    type: 'button',
  },
);

const sizeClasses: Record<NonNullable<typeof props.size>, string> = {
  sm: 'h-8 rounded-xl px-3 text-xs',
  md: 'h-11 rounded-2xl px-5 text-sm',
  lg: 'h-12 rounded-2xl px-6 text-base',
};

const classes = computed(() => {
  const variantClasses =
    props.variant === 'primary'
      ? props.tone === 'amber'
        ? 'bg-amber-warm text-on-accent shadow-[0_4px_16px_rgba(255,174,93,0.22)]'
        : 'bg-serene text-on-accent shadow-[0_4px_16px_rgba(112,165,216,0.22)]'
      : props.variant === 'secondary'
        ? 'border border-separator bg-card-2 text-fg'
        : 'bg-transparent text-serene active:bg-card-2/60';

  return [
    'inline-flex select-none items-center justify-center gap-2 font-medium',
    'transition-all duration-200 ease-out-quart active:scale-[0.97]',
    'disabled:pointer-events-none disabled:opacity-40',
    sizeClasses[props.size],
    props.block ? 'w-full' : '',
    variantClasses,
  ];
});
</script>

<template>
  <button :type="type" :disabled="disabled || loading" :class="classes">
    <LoaderCircle v-if="loading" :size="16" class="animate-spin" :stroke-width="2.2" />
    <slot />
  </button>
</template>
