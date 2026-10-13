<script setup lang="ts">
import { computed } from 'vue';

/**
 * AppTabs — 下划线式分段页签（参考设计语言）
 * 激活项白色加粗 + 淡紫指示条 300ms 弹簧滑动；支持数量徽标。
 */
export interface AppTabOption {
  value: string;
  label: string;
  badge?: number;
}

const props = defineProps<{
  modelValue: string;
  options: AppTabOption[];
}>();

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const activeIndex = computed(() =>
  Math.max(
    0,
    props.options.findIndex((o) => o.value === props.modelValue),
  ),
);
</script>

<template>
  <div
    class="relative grid border-b border-separator"
    :style="{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }"
    role="tablist"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="tab"
      :aria-selected="modelValue === option.value"
      class="flex h-10 items-center justify-center gap-1.5 text-sm transition-colors duration-300"
      :class="modelValue === option.value ? 'font-semibold text-fg' : 'text-fg-soft'"
      @click="emit('update:modelValue', option.value)"
    >
      {{ option.label }}
      <span
        v-if="option.badge !== undefined"
        class="text-[11px] tabular-nums"
        :class="modelValue === option.value ? 'text-lilac' : 'text-fg-mute'"
      >
        {{ option.badge }}
      </span>
    </button>
    <!-- 滑动指示条 -->
    <span
      class="absolute bottom-0 left-0 h-[2px] rounded-full bg-lilac transition-transform duration-300 ease-out-quart"
      :style="{
        width: `${100 / options.length}%`,
        transform: `translateX(${activeIndex * 100}%)`,
      }"
      aria-hidden="true"
    />
  </div>
</template>
