import { ref } from 'vue';
import type { Ref } from 'vue';
import {
  countMySubscriptions,
  removeSubscription,
  saveSubscription,
  sendTestPush,
} from '@/services/pushService';
import type { TestPushResult } from '@/services/pushService';

/**
 * useWebPush — 前端推送订阅生命周期
 *
 * iOS 严苛约束：必须运行于"添加到主屏幕"的独立 PWA（standalone）模式，
 * 且经显式用户手势授权。普通 Safari 标签页内直接提示先安装。
 * 未配置 VAPID 公钥（本地开发）时不阻塞：进入 Mock 模式仅打印 payload。
 */

export type PushEnableResult =
  | 'ok'
  | 'unsupported'
  | 'needs-install'
  | 'denied'
  | 'mock'
  | 'error';

export interface UseWebPush {
  supported: boolean;
  isIos: boolean;
  isStandalone: boolean;
  /** 安全上下文（HTTPS 或 localhost）；局域网 HTTP 下为 false，浏览器禁止 SW/Push */
  isSecure: boolean;
  permission: Ref<NotificationPermission>;
  subscribed: Ref<boolean>;
  terminalCount: Ref<number>;
  busy: Ref<boolean>;
  enable: () => Promise<PushEnableResult>;
  disable: () => Promise<void>;
  sendTest: () => Promise<TestPushResult>;
  refresh: () => Promise<void>;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export function useWebPush(myUserId: Ref<string | null>): UseWebPush {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window;

  const ua = navigator.userAgent;
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // iOS 下以 navigator.standalone 为准：部分内置浏览器（微信/UC 等）的
  // WebView 会把 display-mode 误报为 standalone，导致误判
  const isStandalone = isIos
    ? (navigator as Navigator & { standalone?: boolean }).standalone === true
    : window.matchMedia('(display-mode: standalone)').matches;

  const permission = ref<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied',
  );
  const subscribed = ref(false);
  const terminalCount = ref(0);
  const busy = ref(false);

  async function currentSubscription(): Promise<PushSubscription | null> {
    if (!supported) return null;
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return null;
    return registration.pushManager.getSubscription();
  }

  async function refresh(): Promise<void> {
    const sub = await currentSubscription();
    subscribed.value = sub !== null;
    const uid = myUserId.value;
    if (uid) {
      try {
        terminalCount.value = await countMySubscriptions(uid);
      } catch {
        terminalCount.value = 0;
      }
    }
  }

  async function enable(): Promise<PushEnableResult> {
    // iOS 优先判定：普通标签页里系统不暴露 PushManager，
    // 必须先引导"添加到主屏幕"，而不是笼统提示不支持
    if (isIos && !isStandalone) return 'needs-install';
    if (!supported) return 'unsupported';

    busy.value = true;
    try {
      const result = await Notification.requestPermission();
      permission.value = result;
      if (result !== 'granted') return 'denied';

      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        // Mock 模式：无 VAPID 公钥时仅打印，供本地开发联调
        console.info('[Mock Push] 未配置 VITE_VAPID_PUBLIC_KEY，跳过真实订阅');
        return 'mock';
      }

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const sub =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
        }));

      const uid = myUserId.value;
      const json = sub.toJSON();
      if (uid && json.endpoint && json.keys?.p256dh && json.keys.auth) {
        await saveSubscription(uid, {
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
          user_agent: ua,
        });
      }

      subscribed.value = true;
      await refresh();
      return 'ok';
    } catch {
      return 'error';
    } finally {
      busy.value = false;
    }
  }

  async function disable(): Promise<void> {
    busy.value = true;
    try {
      const sub = await currentSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        try {
          await removeSubscription(endpoint);
        } catch {
          // 远端清理失败不阻塞本地退订
        }
      }
      subscribed.value = false;
      await refresh();
    } finally {
      busy.value = false;
    }
  }

  async function sendTest(): Promise<TestPushResult> {
    return sendTestPush();
  }

  const api: UseWebPush = {
    supported,
    isIos,
    isStandalone,
    isSecure: window.isSecureContext,
    permission,
    subscribed,
    terminalCount,
    busy,
    enable,
    disable,
    sendTest,
    refresh,
  };
  return api;
}