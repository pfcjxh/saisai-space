<script setup lang="ts">
import { computed, ref } from 'vue';
import { Check, MoreVertical, Pencil, Trash2 } from '@lucide/vue';
import type { Wish, WishCategory } from '@/types/database';
import InlineConfirm from '@/components/common/InlineConfirm.vue';
import { useSwipeActions } from '@/composables/useSwipeActions';
import { formatMonthDay } from '@/utils/date';

/**
 * WishCard — 心愿卡片
 * 未完成：圆圈勾选 + 标题 + 创建人小化身 + 备忘；勾选触发达成仪式感（视图层彩屑）。
 * 已达成：宝丽来相框纪念照 + 达成日期；左滑编辑/删除。
 */
const props = defineProps<{
  wish: Wish;
  creator: { nickname: string; avatarUrl: string };
  imageUrl: string | null;
  mediaUploading?: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
  attachPhoto: [];
  remove: [];
}>();

const CATEGORY_LABELS: Record<WishCategory, string> = {
  travel: '旅行',
  food: '美食',
  experience: '体验',
  purchase: '大件',
};

const fulfilledDate = computed(() =>
  props.wish.fulfilled_at
    ? formatMonthDay(props.wish.fulfilled_at.slice(0, 10))
    : null,
);

// ---------------------------------------------------------------- 左滑操作
// 手势逻辑统一由 useSwipeActions 提供（原为 4 处逐行重复的实现）

const {
  offsetX,
  settling,
  isOpen,
  close: closeActions,
  open: openActions,
  handlers: swipeHandlers,
} = useSwipeActions({ actionWidth: 144, snapThreshold: 70 });

/** 常显「⋮」：展开/收起同一操作层（电脑端鼠标点得到，手机端也省一次左滑） */
function toggleActions(): void {
  if (isOpen.value) closeActions();
  else openActions();
}

function onAttachPhoto(): void {
  closeActions();
  emit('attachPhoto');
}

// 删除二次确认：此前点下去即真删，误触无挽回余地
const confirmingRemove = ref(false);

function requestRemove(): void {
  closeActions();
  confirmingRemove.value = true;
}

function cancelRemove(): void {
  confirmingRemove.value = false;
}

function confirmRemove(): void {
  confirmingRemove.value = false;
  emit('remove');
}
</script>

<template>
  <div class="relative overflow-hidden rounded-2xl">
    <!-- 滑出操作区 -->
    <div class="absolute inset-y-0 right-0 flex w-36">
      <button
        type="button"
        class="flex flex-1 items-center justify-center bg-serene/15 text-serene"
        aria-label="补充照片"
        @click="onAttachPhoto"
      >
        <Pencil :size="17" :stroke-width="2" />
      </button>
      <button
        type="button"
        class="flex flex-1 items-center justify-center bg-red-500/15 text-red-400"
        aria-label="删除"
        @click="requestRemove"
      >
        <Trash2 :size="17" :stroke-width="2" />
      </button>
    </div>

    <div
      class="relative touch-pan-y rounded-2xl border border-separator bg-card-2 p-3.5 card-glow"
      :class="settling ? 'transition-transform duration-300 ease-out-quart' : ''"
      :style="{ transform: `translateX(${offsetX}px)` }"
      v-on="swipeHandlers"
    >
      <!-- 已达成：宝丽来足迹 -->
      <template v-if="wish.is_fulfilled">
        <div class="flex items-start gap-3">
          <div
            v-if="imageUrl"
            class="-rotate-1 shrink-0 rounded-sm bg-white p-1.5 pb-4 shadow-md"
          >
            <img :src="imageUrl" alt="" class="size-20 rounded-[2px] object-cover" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-[15px] font-medium text-fg-soft line-through decoration-neutral-600">
              {{ wish.title }}
            </p>
            <p class="mt-1 text-[11px] text-amber-warm tabular-nums">
              {{ fulfilledDate }} 达成 · {{ CATEGORY_LABELS[wish.category] }}
            </p>
            <p v-if="wish.description" class="mt-1 truncate text-xs text-fg-soft">
              {{ wish.description }}
            </p>
          </div>
          <img
            :src="creator.avatarUrl"
            :alt="creator.nickname"
            class="size-6 shrink-0 rounded-full bg-white object-cover ring-1 ring-separator"
          />
          <!-- 常显操作入口：不依赖左滑，桌面与手机都能直接点开 -->
          <button
            type="button"
            class="flex size-8 shrink-0 items-center justify-center rounded-full bg-card text-fg-soft transition-colors active:bg-card-2"
            :aria-label="isOpen ? '收起操作' : '更多操作'"
            :aria-expanded="isOpen"
            @click.stop="toggleActions"
          >
            <MoreVertical :size="15" />
          </button>
        </div>
      </template>

      <!-- 未完成 -->
      <template v-else>
        <div class="flex items-start gap-3">
          <button
            type="button"
            class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-[1.5px] border-neutral-500 transition-all duration-200 ease-out-quart active:scale-90"
            :aria-label="`达成「${wish.title}」`"
            @click="emit('toggle')"
          >
            <Check v-if="mediaUploading" :size="14" class="text-lilac" :stroke-width="3" />
          </button>
          <div class="min-w-0 flex-1">
            <p class="text-[15px] font-medium">{{ wish.title }}</p>
            <p v-if="wish.description" class="mt-0.5 truncate text-xs text-fg-soft">
              {{ wish.description }}
            </p>
            <div class="mt-1.5 flex items-center gap-2">
              <span class="rounded-md bg-lilac/15 px-1.5 py-px text-[10px] text-lilac">
                {{ CATEGORY_LABELS[wish.category] }}
              </span>
              <img
                :src="creator.avatarUrl"
                :alt="creator.nickname"
                class="size-5 rounded-full bg-white object-cover ring-1 ring-separator"
              />
              <span class="text-[10px] text-fg-soft">{{ creator.nickname }}</span>
            </div>
          </div>

          <!-- 常显操作入口：不依赖左滑，桌面与手机都能直接点开 -->
          <button
            type="button"
            class="flex size-8 shrink-0 items-center justify-center rounded-full bg-card text-fg-soft transition-colors active:bg-card-2"
            :aria-label="isOpen ? '收起操作' : '更多操作'"
            :aria-expanded="isOpen"
            @click.stop="toggleActions"
          >
            <MoreVertical :size="15" />
          </button>
        </div>
      </template>
    </div>

    <InlineConfirm
      v-if="confirmingRemove"
      message="删除这个心愿？"
      @cancel="cancelRemove"
      @confirm="confirmRemove"
    />
  </div>
</template>
