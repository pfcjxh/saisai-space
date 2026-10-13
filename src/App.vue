<script setup lang="ts">
import { computed } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import AppShell from '@/components/layout/AppShell.vue';
import AppTabBar from '@/components/layout/AppTabBar.vue';

const route = useRoute();

/** 仅全屏流程页（登录/配对，hideTabBar）隐藏底部导航；
 *  公开预览（public）不影响 TabBar 显示，二者语义独立 */
const showTabBar = computed(() => !route.meta.hideTabBar);
</script>

<template>
  <AppShell>
    <RouterView />
    <template #tabbar>
      <AppTabBar v-if="showTabBar" />
    </template>
  </AppShell>
</template>
