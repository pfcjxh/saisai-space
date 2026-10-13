<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import { renderShareCard, shareOrDownload } from '@/utils/shareCard';

/**
 * ShareCardSheet — 恋爱时长分享卡片
 * 打开即渲染 1080×1440 品牌卡片预览；导出走系统分享面板，
 * 不支持时降级下载；预览以图片元素呈现，长按也可直接保存。
 */
const props = defineProps<{
  open: boolean;
  daysTogether: number;
  startedAt: string | null;
  myAvatarUrl: string;
  partnerAvatarUrl: string;
}>();

const emit = defineEmits<{ close: [] }>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const previewUrl = ref<string | null>(null);
const busy = ref(false);
const feedback = ref<string | null>(null);

const canRender = () => props.startedAt != null && props.daysTogether > 0;

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    feedback.value = null;
    previewUrl.value = null;
    if (!canRender()) return;
    await nextTick();
    const canvas = canvasRef.value;
    if (!canvas) return;
    try {
      await renderShareCard(canvas, {
        daysTogether: props.daysTogether,
        startedAt: props.startedAt as string,
        myAvatarUrl: props.myAvatarUrl,
        partnerAvatarUrl: props.partnerAvatarUrl,
      });
      // 画布转 img 预览：长按可直接保存（toDataURL 失败说明画布被污染，回退 canvas 展示）
      previewUrl.value = canvas.toDataURL('image/png');
    } catch {
      feedback.value = '卡片生成失败，请稍后重试';
    }
  },
);

async function onShare(): Promise<void> {
  const canvas = canvasRef.value;
  if (!canvas || busy.value) return;
  busy.value = true;
  try {
    const result = await shareOrDownload(canvas);
    feedback.value =
      result === 'shared'
        ? '已唤起系统分享'
        : result === 'downloaded'
          ? '图片已保存，去发给 TA 吧'
          : '导出失败，请重试';
  } finally {
    busy.value = false;
  }
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
        class="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[420px]"
        role="dialog"
        aria-modal="true"
        aria-label="恋爱时长分享卡片"
      >
        <div
          class="max-h-[88dvh] overflow-y-auto rounded-t-3xl border border-separator bg-card px-5 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))]"
        >
          <div class="mx-auto h-1 w-9 rounded-full bg-neutral-600" />
          <h2 class="mt-4 text-center text-base font-medium">在一起的日子</h2>

          <template v-if="canRender()">
            <!-- 预览：1080×1440 卡片等比缩放展示 -->
            <div class="mx-auto mt-4 w-full max-w-[300px] overflow-hidden rounded-2xl border border-separator shadow-lg">
              <canvas
                v-show="!previewUrl"
                ref="canvasRef"
                width="1080"
                height="1440"
                class="block h-auto w-full"
                aria-label="恋爱时长卡片预览"
              />
              <img
                v-if="previewUrl"
                :src="previewUrl"
                alt="恋爱时长卡片预览，长按可保存"
                class="block h-auto w-full"
              />
            </div>

            <p v-if="feedback" class="mt-2 text-center text-[11px] text-fg-soft">{{ feedback }}</p>

            <div class="mt-4 flex gap-2">
              <AppButton block :loading="busy" @click="onShare">分享 / 保存图片</AppButton>
              <AppButton variant="ghost" class="shrink-0" @click="emit('close')">关闭</AppButton>
            </div>
            <p class="mt-3 text-center text-[10px] leading-4 text-fg-mute">
              卡片为品牌深色样式，不随主题变化；支持长按图片直接保存
            </p>
          </template>

          <template v-else>
            <p class="py-10 text-center text-xs text-fg-soft">
              登录并创建你们的空间后，就能生成属于你们的在一起天数卡片
            </p>
            <AppButton block variant="secondary" @click="emit('close')">知道了</AppButton>
          </template>
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
