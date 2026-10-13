<script setup lang="ts">
import { WifiOff } from '@lucide/vue';
import { useAppStore } from '@/stores/app';

/**
 * OfflineStatusBar — 离线弱提示微条
 * 断网时在安全区下方滑出低饱和胶囊条，网络恢复后平滑收起。
 * 数据可读性由 offlineStorage 的本地快照兜底（networkFirst 自动降级）。
 */
const app = useAppStore();
</script>

<template>
  <Transition name="offline">
    <div
      v-if="!app.isOnline"
      class="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center pt-[calc(env(safe-area-inset-top)+8px)]"
      role="status"
    >
      <span
        class="flex items-center gap-1.5 rounded-full border border-serene/25 bg-serene/12 px-3.5 py-1.5 text-[11px] text-serene backdrop-blur-[12px] [-webkit-backdrop-filter:blur(12px)]"
      >
        <WifiOff :size="12" :stroke-width="2" />
        当前处于离线模式 · 显示本地缓存
      </span>
    </div>
  </Transition>
</template>

<style scoped>
.offline-enter-active,
.offline-leave-active {
  transition:
    opacity 300ms ease,
    transform 300ms cubic-bezier(0.25, 1, 0.5, 1);
}
.offline-enter-from,
.offline-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>