<script setup lang="ts">
import { RouterLink } from 'vue-router';
import {
  Sunrise,
  HeartHandshake,
  CalendarDays,
  BookOpen,
  Star,
} from '@lucide/vue';

/**
 * AppTabBar — 底部 5 键原生手感导航
 *
 * 磨砂玻璃底板：backdrop-blur(20px) + 70% 透明黑底 + 8% 白细分隔线；
 * pb-safe 包裹底部安全区，杜绝与 iOS 手势条叠压；
 * 激活态：小八蓝弹性微动效（tab-pop）+ 底部圆点指示；
 * 未激活：低对比灰度。
 */
const tabs = [
  { name: 'today', label: '今日', icon: Sunrise },
  { name: 'together', label: '我们', icon: HeartHandshake },
  { name: 'cycle', label: '生理期', icon: CalendarDays },
  { name: 'diary', label: '日记', icon: BookOpen },
  { name: 'wishes', label: '心愿', icon: Star },
] as const;
</script>

<template>
  <nav
    class="absolute inset-x-0 bottom-0 z-20 border-t border-separator bg-ink/70 pb-safe backdrop-blur-[20px] [-webkit-backdrop-filter:blur(20px)]"
    aria-label="主导航"
  >
    <div class="grid grid-cols-5">
      <RouterLink
        v-for="tab in tabs"
        :key="tab.name"
        v-slot="{ isActive, navigate }"
        :to="{ name: tab.name }"
        custom
      >
        <button
          type="button"
          class="flex flex-col items-center gap-0.5 pt-2 pb-1"
          :aria-current="isActive ? 'page' : undefined"
          :aria-label="tab.label"
          @click="navigate"
        >
          <span
            :class="[
              'transition-colors duration-300',
              isActive ? 'animate-tab-pop text-serene' : 'text-fg-soft',
            ]"
          >
            <component
              :is="tab.icon"
              :size="22"
              :stroke-width="isActive ? 2.2 : 1.6"
            />
          </span>
          <span
            class="text-[10px] leading-4 transition-colors duration-300"
            :class="isActive ? 'text-fg' : 'text-fg-soft'"
          >
            {{ tab.label }}
          </span>
          <span
            class="size-1 rounded-full transition-colors duration-300"
            :class="isActive ? 'bg-serene' : 'bg-transparent'"
          />
        </button>
      </RouterLink>
    </div>
  </nav>
</template>
