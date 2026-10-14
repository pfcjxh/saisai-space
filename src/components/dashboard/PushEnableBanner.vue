<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Bell, X } from '@lucide/vue';
import AppButton from '@/components/common/AppButton.vue';
import { useAuthStore } from '@/stores/auth';
import { useCoupleStore } from '@/stores/couple';
import { useWebPush } from '@/composables/useWebPush';
import type { PushEnableResult } from '@/composables/useWebPush';

/**
 * PushEnableBanner — 今日页推送一键开启横幅
 *
 * 背景：开启推送的完整逻辑早已实现（useWebPush.enable 订阅 + 落 push_subscriptions），
 * 但入口埋在「设置 → 消息提醒」里，导致这对情侣的 push_subscriptions 始终为空——
 * daily-check-push 每小时巡检、send-push 返回 200，手机却一条都收不到，
 * 全因为没有任何终端注册过。把「开启提醒」提到首页显式引导，是解决"收不到通知"的第一步。
 *
 * 显示条件（全满足才出现，任一不满足即不打扰）：
 *  · 已登录且已配对（真实双人空间，演示态不显示）；
 *  · 安全上下文（HTTPS）——局域网调试禁用通知，不误导；
 *  · 本机尚未订阅；
 *  · 未被用户「稍后」关闭（防骚扰 7 天）。
 * iOS 标签页特例：PushManager 不可用，但点击会返回 needs-install 给出安装引导。
 */

const SNOOZE_KEY = 'saisai:push-banner-snoozed';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

const auth = useAuthStore();
const coupleStore = useCoupleStore();
const myUserId = computed(() => auth.user?.id ?? null);
const push = useWebPush(myUserId);
const isPaired = computed(() => coupleStore.context?.partner != null);

function readSnoozed(): boolean {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY);
    const value = raw ? Number(raw) : 0;
    return Number.isFinite(value) && Date.now() < value;
  } catch {
    return false;
  }
}

const dismissed = ref(readSnoozed());
const feedback = ref<string | null>(null);

/** 可尝试开启：环境支持，或 iOS 标签页（点击后给安装引导而非静默失败） */
const canAttempt = computed(() => push.supported || (push.isIos && !push.isStandalone));

const visible = computed(
  () =>
    auth.isAuthenticated &&
    isPaired.value &&
    push.isSecure &&
    !push.subscribed.value &&
    !dismissed.value &&
    canAttempt.value,
);

function messageFor(result: PushEnableResult): string | null {
  switch (result) {
    case 'needs-install':
      return 'iPhone 请先点浏览器「分享 → 添加到主屏幕」，再从主屏幕打开本应用即可开启';
    case 'denied':
      return '通知权限被拒绝，请到系统设置里允许「赛赛」发送通知';
    case 'unsupported':
      return '当前浏览器不支持通知，换用 Safari / Chrome 再试';
    case 'error':
      return '开启失败，请检查网络后重试';
    default:
      return null;
  }
}

async function onEnable(): Promise<void> {
  const result = await push.enable();
  // 成功订阅后 subscribed 变 true，横幅自动消失，无需额外反馈
  feedback.value = result === 'ok' ? null : messageFor(result);
}

function onDismiss(): void {
  dismissed.value = true;
  feedback.value = null;
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
  } catch {
    // 存储不可用时仅本次收起
  }
}

onMounted(async () => {
  if (push.supported) await push.refresh();
});
</script>

<template>
  <Transition name="banner">
    <div
      v-if="visible"
      class="mt-4 flex items-center gap-3 rounded-2xl border border-serene/25 bg-serene/10 p-3"
    >
      <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-serene/20">
        <Bell :size="17" class="text-serene" :stroke-width="1.8" />
      </span>
      <span class="min-w-0 flex-1">
        <span class="block text-sm font-medium text-fg">开启双人消息提醒</span>
        <span class="mt-0.5 block text-[11px] leading-4 text-fg-soft">
          {{ feedback ?? 'TA 写日记、纪念日与经期关怀，第一时间通知你' }}
        </span>
      </span>
      <AppButton
        v-if="!feedback"
        size="sm"
        :loading="push.busy.value"
        class="shrink-0"
        @click="onEnable"
      >
        开启
      </AppButton>
      <button
        v-else
        type="button"
        class="flex size-7 shrink-0 items-center justify-center rounded-full text-fg-mute transition-colors hover:bg-card-2"
        aria-label="稍后再说"
        @click="onDismiss"
      >
        <X :size="15" />
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.banner-enter-active,
.banner-leave-active {
  transition:
    opacity 250ms ease,
    transform 250ms cubic-bezier(0.25, 1, 0.5, 1);
}
.banner-enter-from,
.banner-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
