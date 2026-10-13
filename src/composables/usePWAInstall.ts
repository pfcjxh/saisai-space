import { onUnmounted, ref } from 'vue';
import type { Ref } from 'vue';

/**
 * usePWAInstall — iOS 添加到主屏幕引导嗅探
 *
 * - 仅 iOS / iPadOS 的普通浏览器标签页触发（独立模式绝对不打扰）；
 * - 延时 1.5s 优雅弹出，避免首屏抢注意力；
 * - 防骚扰：用户关闭后 3 天内不再自动弹出（localStorage 持久化）。
 */

const SNOOZE_KEY = 'saisai:a2hs-snoozed-until';
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;
const PROMPT_DELAY_MS = 1500;

function readSnoozeUntil(): number {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY);
    const value = raw ? Number(raw) : 0;
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

export interface UsePWAInstall {
  isIos: boolean;
  isStandalone: boolean;
  sheetOpen: Ref<boolean>;
  /** AppShell 挂载时调用：满足条件则延时弹出 */
  maybePrompt: () => void;
  /** 用户关闭（稍后再说 / 我知道了）：写入 3 天防骚扰并收起 */
  snooze: () => void;
}

export function usePWAInstall(): UsePWAInstall {
  const ua = navigator.userAgent;
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // iOS 以 navigator.standalone 为准（第三方 WebView 会误报 display-mode）
  const isStandalone = isIos
    ? (navigator as Navigator & { standalone?: boolean }).standalone === true
    : window.matchMedia('(display-mode: standalone)').matches;

  const sheetOpen = ref(false);
  let timer: number | undefined;

  function maybePrompt(): void {
    if (!isIos || isStandalone) return;
    if (Date.now() < readSnoozeUntil()) return;
    timer = window.setTimeout(() => {
      // 二次确认：等待期间用户可能已安装（或已切走）
      if (!isStandalone) sheetOpen.value = true;
    }, PROMPT_DELAY_MS);
  }

  function snooze(): void {
    sheetOpen.value = false;
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    } catch {
      // 存储不可用时仅本次生效
    }
  }

  onUnmounted(() => {
    if (timer !== undefined) window.clearTimeout(timer);
  });

  return { isIos, isStandalone, sheetOpen, maybePrompt, snooze };
}