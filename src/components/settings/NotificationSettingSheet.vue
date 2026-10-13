<script setup lang="ts">
import { computed, onUnmounted, ref, toRef, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Bell, BellOff, LogOut, Send, Smartphone } from '@lucide/vue';
import AppBadge from '@/components/common/AppBadge.vue';
import AppButton from '@/components/common/AppButton.vue';
import { useWebPush } from '@/composables/useWebPush';
import { useAuthStore } from '@/stores/auth';
import { useCoupleStore } from '@/stores/couple';
import { signOut } from '@/services/authService';

/**
 * NotificationSettingSheet — 消息提醒设置
 * 权限状态 / 测试通知 / 三类细分开关（日记、纪念日、生理期关怀）。
 */
export interface NotifyPrefsState {
  notify_diary: boolean;
  notify_anniversary: boolean;
  notify_period: boolean;
}

const props = defineProps<{
  open: boolean;
  myUserId: string | null;
  prefs: NotifyPrefsState;
}>();

const emit = defineEmits<{
  close: [];
  togglePref: [key: keyof NotifyPrefsState];
}>();

const myUserIdRef = toRef(props, 'myUserId');

const router = useRouter();
const auth = useAuthStore();
const coupleStore = useCoupleStore();

const isPaired = computed(() => coupleStore.context?.partner != null);

async function onSignOut(): Promise<void> {
  await signOut();
  coupleStore.reset();
  emit('close');
}

function goAuth(): void {
  emit('close');
  router.push({ name: 'auth' });
}

const {
  supported,
  isIos,
  isStandalone,
  isSecure,
  permission,
  subscribed,
  terminalCount,
  busy,
  enable,
  disable,
  sendTest,
  refresh,
} = useWebPush(myUserIdRef);

const feedback = ref<string | null>(null);

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    feedback.value = null;
    if (supported) await refresh();
  },
);

/** 状态徽标（先给环境引导，再判权限状态） */
const statusMeta = computed<{ label: string; tone: 'serene' | 'amber' | 'neutral' }>(() => {
  if (!isSecure) return { label: '需 HTTPS 环境', tone: 'amber' };
  if (isIos && !isStandalone) return { label: '需先添加到主屏幕', tone: 'amber' };
  if (!supported) return { label: '当前环境不支持', tone: 'neutral' };
  if (permission.value === 'denied') return { label: '未授权', tone: 'neutral' };
  if (subscribed.value) return { label: '已开启', tone: 'serene' };
  return { label: '未开启', tone: 'neutral' };
});

/** iOS 标签页仍需保留按钮可点：点击后给出安装引导 */
const canAttempt = computed(() => supported || (isIos && !isStandalone));

const PREF_ITEMS: { key: keyof NotifyPrefsState; label: string; hint: string }[] = [
  { key: 'notify_diary', label: '日记更新提醒', hint: 'TA 发布新日记时通知我' },
  { key: 'notify_anniversary', label: '纪念日提醒', hint: '纪念日当天上午 9 点提醒' },
  { key: 'notify_period', label: '生理期关怀提醒', hint: '经期前 1~2 天的关怀预警' },
];

async function onEnable(): Promise<void> {
  const result = await enable();
  feedback.value =
    result === 'ok'
      ? '已开启，本机将接收双人消息提醒'
      : result === 'needs-install'
        ? 'iOS 需先点「分享 → 添加到主屏幕」，再从主屏幕打开本应用来开启'
        : result === 'denied'
          ? '系统通知权限被拒绝，请到 iOS 设置中允许'
          : result === 'mock'
            ? '本地开发模式：已模拟订阅（未配置 VAPID 公钥）'
            : result === 'unsupported'
              ? '当前浏览器不支持 Web Push'
              : '开启失败，请稍后重试';
}

async function onDisable(): Promise<void> {
  await disable();
  feedback.value = '已关闭本机提醒并清除订阅凭据';
}

async function onTest(): Promise<void> {
  const result = await sendTest();
  feedback.value = result.delivered
    ? `测试通知已下发到 ${Math.max(terminalCount.value, 1)} 个终端`
    : result.detail === 'no-session'
      ? '当前是演示模式：请登录账号后再测试推送'
      : '已模拟接收通知（推送服务未就绪，控制台可见 payload）';
}

async function onToggle(key: keyof NotifyPrefsState): Promise<void> {
  emit('togglePref', key);
}

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
        aria-label="消息提醒设置"
      >
        <div
          class="max-h-[85dvh] overflow-y-auto rounded-t-3xl border border-separator bg-card px-5 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))]"
        >
          <div class="mx-auto h-1 w-9 rounded-full bg-neutral-600" />
          <h2 class="mt-4 text-center text-base font-medium">消息提醒</h2>

          <!-- 权限状态 -->
          <div class="mt-4 flex items-center justify-between rounded-2xl bg-card-2 p-3">
            <div class="flex items-center gap-2.5">
              <component
                :is="subscribed ? Bell : BellOff"
                :size="17"
                :class="subscribed ? 'text-serene' : 'text-fg-soft'"
              />
              <div>
                <p class="text-sm text-fg">系统通知权限</p>
                <p class="mt-0.5 text-[10px] text-fg-soft">
                  {{ terminalCount > 0 ? `已绑定 ${terminalCount} 个终端` : '尚未绑定终端' }}
                </p>
              </div>
            </div>
            <AppBadge :tone="statusMeta.tone">{{ statusMeta.label }}</AppBadge>
          </div>

<!-- 非 HTTPS 环境提示（局域网调试场景） -->
      <div
        v-if="!isSecure"
        class="mt-2 flex items-start gap-2 rounded-2xl border border-amber-warm/20 bg-amber-warm/10 p-3"
      >
        <Smartphone :size="15" class="mt-0.5 shrink-0 text-amber-warm" />
        <p class="text-[11px] leading-5 text-amber-warm">
          当前通过局域网地址访问，浏览器禁止非 HTTPS 页面启用通知。
          正式部署（HTTPS）后即可开启推送，本地调试期间属正常现象
        </p>
      </div>

      <!-- iOS 安装指引（标签页内一律展示） -->
      <div
        v-else-if="isIos && !isStandalone"
        class="mt-2 flex items-start gap-2 rounded-2xl border border-amber-warm/20 bg-amber-warm/10 p-3"
      >
            <Smartphone :size="15" class="mt-0.5 shrink-0 text-amber-warm" />
            <p class="text-[11px] leading-5 text-amber-warm">
              点击底部工具栏的「分享」按钮 → 选择「添加到主屏幕」，
              再从主屏幕打开本应用即可开启通知（iOS 16.4+）
            </p>
          </div>

          <!-- 开启 / 关闭 / 测试 -->
          <div class="mt-3 flex gap-2">
            <AppButton
              v-if="!subscribed"
              block
              :loading="busy"
              :disabled="!canAttempt"
              @click="onEnable"
            >
              开启双人消息提醒
            </AppButton>
            <AppButton v-else block variant="secondary" :loading="busy" @click="onDisable">
              关闭本机提醒
            </AppButton>
            <AppButton
              variant="ghost"
              class="shrink-0"
              :disabled="busy"
              @click="onTest"
            >
              <Send :size="15" />
              测试
            </AppButton>
          </div>

          <p v-if="feedback" class="mt-2 text-[11px] text-fg-soft">{{ feedback }}</p>

          <!-- 细分开关 -->
          <p class="mt-5 mb-2 text-[11px] text-fg-soft">提醒类型</p>
          <div class="flex flex-col gap-2">
            <div
              v-for="item in PREF_ITEMS"
              :key="item.key"
              class="flex items-center justify-between rounded-2xl bg-card-2 p-3"
            >
              <div>
                <p class="text-sm text-fg">{{ item.label }}</p>
                <p class="mt-0.5 text-[10px] text-fg-soft">{{ item.hint }}</p>
              </div>
              <button
                type="button"
                role="switch"
                :aria-checked="prefs[item.key]"
                class="flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors duration-200"
                :class="prefs[item.key] ? 'justify-end bg-serene' : 'justify-start bg-neutral-600'"
                @click="onToggle(item.key)"
              >
                <span class="block size-5 rounded-full bg-white shadow" />
              </button>
            </div>
          </div>

          <!-- 账号 -->
          <p class="mt-5 mb-2 text-[11px] text-fg-soft">账号</p>
          <div class="flex items-center justify-between gap-3 rounded-2xl bg-card-2 p-3">
            <div class="min-w-0">
              <p class="truncate text-sm text-fg">
                {{ auth.isAuthenticated ? (auth.user?.email ?? '已登录') : '演示模式（未登录）' }}
              </p>
              <p class="mt-0.5 text-[10px] text-fg-soft">
                {{
                  isPaired
                    ? '已与 TA 配对'
                    : auth.isAuthenticated
                      ? '尚未配对，去 /auth 完成配对'
                      : '登录后可开启真实数据与消息推送'
                }}
              </p>
            </div>
            <AppButton
              v-if="auth.isAuthenticated"
              size="sm"
              variant="secondary"
              class="shrink-0"
              @click="onSignOut"
            >
              <LogOut :size="13" />
              退出
            </AppButton>
            <AppButton v-else size="sm" class="shrink-0" @click="goAuth">去登录</AppButton>
          </div>

          <p class="mt-4 text-center text-[10px] leading-4 text-fg-mute">
            夜间 23:00 - 08:00 强制静默，不会打扰休息
          </p>

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