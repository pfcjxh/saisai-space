import { ref } from 'vue';
import type { Ref } from 'vue';

/**
 * useTheme — 外观主题（纯黑 OLED / 米白 / 雾蓝 / 樱粉 / 跟随系统）
 *
 * - 颜色本体在 main.css 的 html[data-theme] 语义 token 覆盖里，
 *   本模块只负责写属性、持久化与「跟随系统」监听，不持有任何真实配色；
 * - 按设备本地存储（saisai:theme），双人各自独立，不进数据库；
 * - index.html 头部有一段同规则内联脚本负责首帧防闪烁，
 *   main.ts 在挂载前调 initTheme 重放一次并接管后续切换。
 */

export type ThemeMode = 'default' | 'cream' | 'mist' | 'sakura' | 'auto';
/** auto 解析后的实际主题（default=纯黑，系统浅色回落米白） */
export type ResolvedTheme = Exclude<ThemeMode, 'auto'>;

const THEME_KEY = 'saisai:theme';

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode !== 'auto') return mode;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'cream' : 'default';
}

/** 写 html[data-theme]，并让浏览器原生表面（地址栏/状态栏底色）跟随主题 */
function applyTheme(mode: ThemeMode): ResolvedTheme {
  const resolved = resolveTheme(mode);
  const root = document.documentElement;
  if (resolved === 'default') {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = resolved;
  }
  // theme-color 取当前生效的 --color-ink 计算值，避免 JS 里再维护一份色表
  const ink = getComputedStyle(root).getPropertyValue('--color-ink').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', ink || '#000000');
  return resolved;
}

/** 模块级单例：main.ts、设置面板共享同一份状态 */
const mode = ref<ThemeMode>('default');
const resolved = ref<ResolvedTheme>('default');

let mediaQuery: MediaQueryList | null = null;

function onSystemSchemeChange(): void {
  if (mode.value === 'auto') resolved.value = applyTheme('auto');
}

/** 仅「跟随系统」时监听系统深浅切换，其余模式解除监听 */
function syncSystemListener(): void {
  if (mode.value === 'auto' && mediaQuery === null) {
    mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    mediaQuery.addEventListener('change', onSystemSchemeChange);
  } else if (mode.value !== 'auto' && mediaQuery !== null) {
    mediaQuery.removeEventListener('change', onSystemSchemeChange);
    mediaQuery = null;
  }
}

function readStoredMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    return raw === 'cream' || raw === 'mist' || raw === 'sakura' || raw === 'auto'
      ? raw
      : 'default';
  } catch {
    return 'default';
  }
}

/** main.ts 挂载前调用：重放持久化主题（与 index.html 内联脚本同规则） */
export function initTheme(): void {
  mode.value = readStoredMode();
  resolved.value = applyTheme(mode.value);
  syncSystemListener();
}

export interface ThemeOptionMeta {
  mode: ThemeMode;
  label: string;
  hint: string;
  /** 面板预览色板（与 main.css 各主题取值一致，改动需两处同步；auto 用双色渐变示意） */
  swatch: { bg: string; card: string; fg: string };
}

export const THEME_OPTIONS: ThemeOptionMeta[] = [
  {
    mode: 'default',
    label: '纯黑',
    hint: 'OLED 省电 · 默认',
    swatch: { bg: '#000000', card: '#1c1c1e', fg: '#f5f5f5' },
  },
  {
    mode: 'cream',
    label: '米白',
    hint: '暖纸质感',
    swatch: { bg: '#f6f1e7', card: '#fdfaf3', fg: '#3b3228' },
  },
  {
    mode: 'mist',
    label: '雾蓝',
    hint: '清晨与平静',
    swatch: { bg: '#edf2f8', card: '#ffffff', fg: '#24313d' },
  },
  {
    mode: 'sakura',
    label: '樱粉',
    hint: '春日与温柔',
    swatch: { bg: '#fbf1f2', card: '#ffffff', fg: '#402f31' },
  },
  {
    mode: 'auto',
    label: '跟随系统',
    hint: '浅色 → 米白 · 深色 → 纯黑',
    swatch: {
      bg: 'linear-gradient(135deg, #000000 50%, #f6f1e7 50%)',
      card: '#1c1c1e',
      fg: '#3b3228',
    },
  },
];

export interface UseTheme {
  mode: Ref<ThemeMode>;
  resolved: Ref<ResolvedTheme>;
  options: ThemeOptionMeta[];
  /** 切换并持久化；即时生效，抽屉背后可实时预览 */
  setTheme: (next: ThemeMode) => void;
}

export function useTheme(): UseTheme {
  function setTheme(next: ThemeMode): void {
    mode.value = next;
    resolved.value = applyTheme(next);
    syncSystemListener();
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // 存储不可用时仅本次会话生效
    }
  }

  return { mode, resolved, options: THEME_OPTIONS, setTheme };
}
