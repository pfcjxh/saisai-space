<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue';
import type { Component } from 'vue';
import { Cake, Coffee, Flag, Heart } from '@lucide/vue';
import AppButton from '@/components/common/AppButton.vue';
import type { Anniversary, AnniversaryCategory } from '@/types/database';
import { lunarToSolar } from '@/utils/lunar';

/**
 * AnniversaryCreateSheet — 纪念日创建/编辑抽屉
 * 支持公历/农历一键切换：农历模式下选择的日期按"农历月日"解释，
 * 提交时换算为公历存储（is_lunar=true 供后续逐年重算）。
 * 键盘避让：visualViewport 监听动态抬高。
 */
export interface AnniversaryFormPayload {
  title: string;
  category: AnniversaryCategory;
  /** 换算后的公历存储日期 */
  targetDateSolar: string;
  isLunar: boolean;
  repeatYearly: boolean;
  pinned: boolean;
}

const props = defineProps<{
  open: boolean;
  editing: Anniversary | null;
}>();

const emit = defineEmits<{
  close: [];
  submit: [payload: AnniversaryFormPayload];
}>();

const CATEGORIES: { value: AnniversaryCategory; label: string; icon: Component }[] = [
  { value: 'birthday', label: '生日', icon: Cake },
  { value: 'anniversary', label: '纪念日', icon: Heart },
  { value: 'holiday', label: '假期', icon: Flag },
  { value: 'life', label: '生活', icon: Coffee },
];

const title = ref('');
const category = ref<AnniversaryCategory>('anniversary');
const calendarType = ref<'solar' | 'lunar'>('solar');
const dateStr = ref('');
const repeatYearly = ref(true);
const pinned = ref(false);

const titleInput = ref<HTMLInputElement | null>(null);

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    title.value = props.editing?.title ?? '';
    category.value = props.editing?.category ?? 'anniversary';
    calendarType.value = props.editing?.is_lunar ? 'lunar' : 'solar';
    dateStr.value = props.editing?.target_date ?? '';
    repeatYearly.value = props.editing?.repeat_yearly ?? true;
    pinned.value = props.editing?.pinned ?? false;
    await nextTick();
    titleInput.value?.focus();
  },
);

function lunarPreview(): string | null {
  if (calendarType.value !== 'lunar' || !dateStr.value) return null;
  const [y, m, d] = dateStr.value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return `对应公历 ${lunarToSolar(y, m, d)}`;
}

function onSubmit(): void {
  const trimmed = title.value.trim();
  if (!trimmed || !dateStr.value) return;
  const [y, m, d] = dateStr.value.split('-').map(Number);
  if (!y || !m || !d) return;
  const isLunar = calendarType.value === 'lunar';
  emit('submit', {
    title: trimmed,
    category: category.value,
    targetDateSolar: isLunar ? lunarToSolar(y, m, d) : dateStr.value,
    isLunar,
    repeatYearly: repeatYearly.value,
    pinned: pinned.value,
  });
}

// ---------------------------------------------------------------- 键盘避让

const keyboardOffset = ref(0);

function onViewportResize(): void {
  const vv = window.visualViewport;
  keyboardOffset.value = vv ? Math.max(0, window.innerHeight - vv.height) : 0;
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      window.visualViewport?.addEventListener('resize', onViewportResize);
    } else {
      window.visualViewport?.removeEventListener('resize', onViewportResize);
      keyboardOffset.value = 0;
    }
  },
);

onUnmounted(() => {
  window.visualViewport?.removeEventListener('resize', onViewportResize);
});

function pillClass(active: boolean): string {
  return active
    ? 'border-lilac/40 bg-lilac/15 text-lilac'
    : 'border-transparent bg-card-2 text-fg-soft';
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        aria-hidden="true"
        @click="emit('close')"
      />
    </Transition>

    <Transition name="sheet">
      <div
        v-if="open"
        class="fixed inset-x-0 z-50 mx-auto w-full max-w-[420px]"
        :style="{ bottom: `${keyboardOffset}px` }"
        role="dialog"
        aria-modal="true"
        :aria-label="editing ? '编辑纪念日' : '新建纪念日'"
      >
        <div
          class="rounded-t-3xl border border-separator bg-card px-5 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))]"
        >
          <div class="mx-auto h-1 w-9 rounded-full bg-neutral-600" />
          <h2 class="mt-4 text-center text-base font-medium">
            {{ editing ? '编辑纪念日' : '新建纪念日' }}
          </h2>

          <!-- 标题 -->
          <input
            ref="titleInput"
            v-model="title"
            type="text"
            maxlength="30"
            placeholder="如：老婆生日 / 在一起"
            class="mt-4 h-11 w-full rounded-xl border border-separator bg-card-2 px-4 text-sm text-fg placeholder-fg-mute outline-none focus:border-lilac/50"
          />

          <!-- 分类 -->
          <p class="mt-4 mb-2 text-[11px] text-fg-soft">分类</p>
          <div class="flex gap-2">
            <button
              v-for="c in CATEGORIES"
              :key="c.value"
              type="button"
              class="flex h-8 items-center gap-1 rounded-full border px-3 text-xs transition-all duration-200 ease-out-quart active:scale-95"
              :class="pillClass(category === c.value)"
              @click="category = c.value"
            >
              <component :is="c.icon" :size="12" :stroke-width="2" />
              {{ c.label }}
            </button>
          </div>

          <!-- 公历 / 农历 + 日期 -->
          <div class="mt-4 mb-2 flex items-center justify-between">
            <p class="text-[11px] text-fg-soft">日期</p>
            <div class="flex gap-1.5">
              <button
                type="button"
                class="h-7 rounded-full border px-3 text-[11px] transition-all duration-200 ease-out-quart active:scale-95"
                :class="pillClass(calendarType === 'solar')"
                @click="calendarType = 'solar'"
              >
                公历
              </button>
              <button
                type="button"
                class="h-7 rounded-full border px-3 text-[11px] transition-all duration-200 ease-out-quart active:scale-95"
                :class="pillClass(calendarType === 'lunar')"
                @click="calendarType = 'lunar'"
              >
                农历
              </button>
            </div>
          </div>
          <input
            v-model="dateStr"
            type="date"
            class="h-11 w-full rounded-xl border border-separator bg-card-2 px-4 text-sm text-fg outline-none focus:border-lilac/50"
          />
          <p v-if="calendarType === 'lunar'" class="mt-1.5 text-[10px] text-fg-soft">
            按农历月日选择，每年自动换算公历
            <span v-if="lunarPreview()" class="text-lilac">　{{ lunarPreview() }}</span>
          </p>

          <!-- 开关行 -->
          <div class="mt-4 flex flex-col gap-3">
            <div class="flex items-center justify-between">
              <p class="text-sm text-fg">每年重复</p>
              <button
                type="button"
                role="switch"
                :aria-checked="repeatYearly"
                class="flex h-6 w-11 items-center rounded-full px-0.5 transition-colors duration-200"
                :class="repeatYearly ? 'justify-end bg-lilac' : 'justify-start bg-card-2'"
                @click="repeatYearly = !repeatYearly"
              >
                <span class="block size-5 rounded-full bg-white shadow" />
              </button>
            </div>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-fg">置顶到首页</p>
                <p class="mt-0.5 text-[10px] text-fg-soft">在「今日」页的倒数卡优先展示</p>
              </div>
              <button
                type="button"
                role="switch"
                :aria-checked="pinned"
                class="flex h-6 w-11 items-center rounded-full px-0.5 transition-colors duration-200"
                :class="pinned ? 'justify-end bg-lilac' : 'justify-start bg-card-2'"
                @click="pinned = !pinned"
              >
                <span class="block size-5 rounded-full bg-white shadow" />
              </button>
            </div>
          </div>

          <AppButton
            block
            tone="amber"
            class="mt-5"
            :disabled="!title.trim() || !dateStr"
            @click="onSubmit"
          >
            {{ editing ? '保存' : '添加' }}
          </AppButton>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 250ms ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.sheet-enter-active,
.sheet-leave-active {
  transition: transform 300ms cubic-bezier(0.25, 1, 0.5, 1);
}
.sheet-enter-from,
.sheet-leave-to {
  transform: translateY(100%);
}
</style>
