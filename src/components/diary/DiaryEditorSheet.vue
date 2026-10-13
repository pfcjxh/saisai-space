<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { ImagePlus, X } from '@lucide/vue';
import AppButton from '@/components/common/AppButton.vue';
import type { Mood } from '@/types/database';
import { todayInTimezone } from '@/utils/date';

/**
 * DiaryEditorSheet — 日记发布抽屉
 * 日期 / 标题 / 心情 / 正文 / 最多 9 张照片（选中即预览，提交时端侧压缩上传）。
 * 上传进度由 uploader 回调驱动；键盘避让同其他抽屉。
 */
export interface DiaryEditorPayload {
  diary_date: string;
  title: string | null;
  mood: Mood | null;
  content: string;
  files: File[];
}

const props = defineProps<{
  open: boolean;
  timezone: string;
  /** 上传器：压缩 + 上传，回调进度（已完成数, 总数） */
  uploader: (files: File[], onProgress: (done: number, total: number) => void) => Promise<string[]>;
}>();

const emit = defineEmits<{
  close: [];
  submit: [payload: DiaryEditorPayload, images: string[]];
}>();

const MOODS: { value: Mood; label: string }[] = [
  { value: 'calm', label: '平静' },
  { value: 'happy', label: '开心' },
  { value: 'tired', label: '疲惫' },
  { value: 'caring', label: '关怀' },
  { value: 'sleepy', label: '困倦' },
];

const MAX_PHOTOS = 9;

const dateStr = ref(todayInTimezone(props.timezone));
const title = ref('');
const mood = ref<Mood | null>(null);
const content = ref('');
const files = ref<File[]>([]);
const previews = ref<string[]>([]);
const uploading = ref(false);
const progress = ref({ done: 0, total: 0 });

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    dateStr.value = todayInTimezone(props.timezone);
    title.value = '';
    mood.value = null;
    content.value = '';
    files.value = [];
    previews.value = [];
    uploading.value = false;
  },
);

function onPickPhotos(e: Event): void {
  const input = e.target as HTMLInputElement;
  const picked = Array.from(input.files ?? []);
  const room = MAX_PHOTOS - files.value.length;
  const accepted = picked.slice(0, room);
  files.value = [...files.value, ...accepted];
  previews.value = [
    ...previews.value,
    ...accepted.map((f) => URL.createObjectURL(f)),
  ];
  input.value = '';
}

function removePhoto(index: number): void {
  const url = previews.value[index];
  if (url) URL.revokeObjectURL(url);
  files.value = files.value.filter((_, i) => i !== index);
  previews.value = previews.value.filter((_, i) => i !== index);
}

const canSubmit = computed(() => content.value.trim().length > 0 && !uploading.value);

async function onSubmit(): Promise<void> {
  if (!canSubmit.value) return;
  uploading.value = true;
  progress.value = { done: 0, total: files.value.length };
  try {
    const images = await props.uploader(files.value, (done, total) => {
      progress.value = { done, total };
    });
    emit('submit', {
      diary_date: dateStr.value,
      title: title.value.trim() || null,
      mood: mood.value,
      content: content.value.trim(),
      files: files.value,
    }, images);
  } finally {
    uploading.value = false;
  }
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
  previews.value.forEach((u) => URL.revokeObjectURL(u));
});

function pillClass(active: boolean): string {
  return active
    ? 'border-serene/40 bg-serene/15 text-serene'
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
        @click="!uploading && emit('close')"
      />
    </Transition>

    <Transition name="sheet">
      <div
        v-if="open"
        class="fixed inset-x-0 z-50 mx-auto w-full max-w-[420px]"
        :style="{ bottom: `${keyboardOffset}px` }"
        role="dialog"
        aria-modal="true"
        aria-label="写日记"
      >
        <div
          class="max-h-[88dvh] overflow-y-auto rounded-t-3xl border border-separator bg-card px-5 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))]"
        >
          <div class="mx-auto h-1 w-9 rounded-full bg-neutral-600" />
          <h2 class="mt-4 text-center text-base font-medium">写日记</h2>

          <!-- 日期 -->
          <input
            v-model="dateStr"
            type="date"
            class="mt-4 h-10 w-full rounded-xl border border-separator bg-card-2 px-4 text-sm text-fg outline-none focus:border-serene/50"
          />

          <!-- 标题 -->
          <input
            v-model="title"
            type="text"
            maxlength="40"
            placeholder="标题（可选）"
            class="mt-2 h-10 w-full rounded-xl border border-separator bg-card-2 px-4 text-sm text-fg placeholder-fg-mute outline-none focus:border-serene/50"
          />

          <!-- 心情 -->
          <p class="mt-3 mb-2 text-[11px] text-fg-soft">当日心情</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="m in MOODS"
              :key="m.value"
              type="button"
              class="h-8 rounded-full border px-3 text-xs transition-all duration-200 ease-out-quart active:scale-95"
              :class="pillClass(mood === m.value)"
              @click="mood = mood === m.value ? null : m.value"
            >
              {{ m.label }}
            </button>
          </div>

          <!-- 正文 -->
          <textarea
            v-model="content"
            rows="5"
            maxlength="2000"
            placeholder="今天发生了什么…"
            class="mt-3 w-full resize-none rounded-xl border border-separator bg-card-2 px-4 py-3 text-sm leading-relaxed text-fg placeholder-fg-mute outline-none focus:border-serene/50"
          />

          <!-- 照片 -->
          <p class="mt-3 mb-2 text-[11px] text-fg-soft">
            照片（最多 {{ MAX_PHOTOS }} 张，自动压缩）
          </p>
          <div class="grid grid-cols-3 gap-2">
            <div
              v-for="(preview, i) in previews"
              :key="preview"
              class="relative aspect-square overflow-hidden rounded-xl bg-card-2"
            >
              <img :src="preview" alt="" class="size-full object-cover" />
              <button
                type="button"
                class="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white"
                aria-label="移除照片"
                @click="removePhoto(i)"
              >
                <X :size="11" />
              </button>
            </div>
            <label
              v-if="previews.length < MAX_PHOTOS"
              class="flex aspect-square cursor-pointer items-center justify-center rounded-xl border border-dashed border-separator text-fg-soft"
            >
              <ImagePlus :size="20" :stroke-width="1.6" />
              <input
                type="file"
                accept="image/*"
                multiple
                class="hidden"
                @change="onPickPhotos"
              />
            </label>
          </div>

          <!-- 上传进度 -->
          <div v-if="uploading && progress.total > 0" class="mt-3">
            <div class="h-1.5 w-full overflow-hidden rounded-full bg-card-2">
              <div
                class="h-full rounded-full bg-serene transition-all duration-300"
                :style="{ width: `${(progress.done / progress.total) * 100}%` }"
              />
            </div>
            <p class="mt-1 text-[10px] text-fg-soft tabular-nums">
              压缩上传中 {{ progress.done }} / {{ progress.total }}
            </p>
          </div>

          <AppButton block class="mt-4" :disabled="!canSubmit" :loading="uploading" @click="onSubmit">
            发布
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
