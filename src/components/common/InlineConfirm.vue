<script setup lang="ts">
/**
 * InlineConfirm — 卡片内联二次确认浮层
 *
 * 用途：删除类不可逆操作的确认，覆盖在卡片之上，不跳页、不弹系统对话框。
 * 背景：此前四张列表卡（待办/生理期/纪念日/心愿）的删除都藏在「左滑」手势后面，
 * 且点下去**没有二次确认**——桌面端既发现不了、误触了还无法挽回。
 * 两件事一起修：操作改为常显入口 + 删除必须过一次确认。
 */
defineProps<{
  /** 确认文案，如「删除这条经期记录？」 */
  message: string;
  /** 确认按钮文字 */
  confirmLabel?: string;
}>();

const emit = defineEmits<{ confirm: []; cancel: [] }>();
</script>

<template>
  <div
    class="absolute inset-0 z-10 flex items-center justify-between gap-2 rounded-2xl border border-red-500/30 bg-card px-3.5"
  >
    <p class="min-w-0 flex-1 truncate text-xs text-fg">{{ message }}</p>
    <div class="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        class="h-8 rounded-xl px-3 text-xs text-fg-soft transition-colors active:bg-card-2"
        @click="emit('cancel')"
      >
        取消
      </button>
      <button
        type="button"
        class="h-8 rounded-xl bg-red-500/15 px-3 text-xs font-medium text-red-400 transition-colors active:bg-red-500/25"
        @click="emit('confirm')"
      >
        {{ confirmLabel ?? '删除' }}
      </button>
    </div>
  </div>
</template>
