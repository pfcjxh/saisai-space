<script setup lang="ts">
/**
 * ImageGrid — 日记媒体区自适应网格
 * 1 图全宽；2 图并列；3~4 图两列（3 图末张跨列）；5+ 图三列九宫格。
 */
defineProps<{
  urls: string[];
}>();

const emit = defineEmits<{ open: [index: number] }>();

function gridClass(count: number): string {
  if (count === 1) return 'grid-cols-1';
  if (count <= 4) return 'grid-cols-2';
  return 'grid-cols-3';
}

/** 3 图时第三张跨两列，视觉更平衡 */
function spanClass(index: number, count: number): string {
  return count === 3 && index === 2 ? 'col-span-2' : '';
}

function aspectClass(index: number, count: number): string {
  if (count === 1) return 'aspect-[4/3]';
  if (count === 3 && index === 2) return 'aspect-[2/1]';
  return 'aspect-square';
}
</script>

<template>
  <div v-if="urls.length > 0" class="grid gap-1.5" :class="gridClass(urls.length)">
    <button
      v-for="(url, index) in urls"
      :key="url"
      type="button"
      class="overflow-hidden rounded-xl bg-card-2 transition-transform duration-200 ease-out-quart active:scale-[0.98]"
      :class="[spanClass(index, urls.length), aspectClass(index, urls.length)]"
      :aria-label="`查看第 ${index + 1} 张大图`"
      @click="emit('open', index)"
    >
      <img :src="url" alt="" class="size-full object-cover" loading="lazy" />
    </button>
  </div>
</template>
