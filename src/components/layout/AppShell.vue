<script setup lang="ts">
import { onMounted } from 'vue';
import AddToHomeScreenSheet from '@/components/common/AddToHomeScreenSheet.vue';
import OfflineStatusBar from '@/components/common/OfflineStatusBar.vue';
import { usePWAInstall } from '@/composables/usePWAInstall';

/**
 * AppShell — 视口与断点防御容器
 *
 * - 全端锁定 100dvh，body 级滚动被禁用（见 main.css），滚动只发生在页面内容器，
 *   杜绝移动端滚动穿透与橡皮筋白边。
 * - 移动端 (<640px)：全屏自适应，内容区顶底由 pt-safe / pb-safe 对齐安全区。
 * - 桌面端 (>=640px)：视口强制居中，最大宽度 420px 复刻 iPhone 机身比例，
 *   两侧 OLED 纯黑留白 + 细分隔线与微弱环境光晕构成磨砂边缘轮廓。
 * - 全局装配：iOS 添加到主屏幕引导（延时 1.5s、3 天防骚扰）与离线状态微条。
 */
const { sheetOpen, maybePrompt, snooze } = usePWAInstall();

onMounted(() => {
  maybePrompt();
});
</script>

<template>
  <div class="h-dvh w-full bg-ink">
    <div
      class="relative mx-auto flex h-full w-full max-w-[420px] flex-col overflow-hidden bg-ink sm:border-x sm:border-separator sm:shadow-[0_0_120px_rgba(255,255,255,0.04)]"
    >
      <!-- 离线状态微条（安全区下方，覆盖式不占布局） -->
      <OfflineStatusBar />

      <!-- 内容区：外壳不滚动，页面自行管理滚动容器（如 PullToRefresh），
           从根本上杜绝嵌套滚动冲突与滚动穿透 -->
      <div class="min-h-0 flex-1 overflow-hidden">
        <slot />
      </div>

      <!-- 底部导航（由 App.vue 按路由决定是否挂载） -->
      <slot name="tabbar" />

      <!-- iOS 添加到主屏幕引导 -->
      <AddToHomeScreenSheet :open="sheetOpen" @close="snooze" @snooze="snooze" />
    </div>
  </div>
</template>