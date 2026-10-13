import confetti from 'canvas-confetti';

/**
 * ConfettiTrigger — 心愿达成/打卡庆祝微粒子动效
 *
 * 仅使用品牌三色（小八蓝 / 米菲橙 / 淡奶白），总时长严格 1.2s。
 * 遵循 prefers-reduced-motion：用户系统开启减弱动态效果时静默跳过。
 */

const BRAND_COLORS = ['#70a5d8', '#ffae5d', '#f5f1e8'] as const;

const DURATION_MS = 1200;

export interface CelebrationOptions {
  /** 归一化触发点（0~1），默认画面下方居中 */
  origin?: { x: number; y: number };
  /** 初始爆发粒子数，默认 60 */
  particleCount?: number;
}

export function fireCelebration(options: CelebrationOptions = {}): void {
  if (typeof window === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const origin = options.origin ?? { x: 0.5, y: 0.6 };
  const colors = [...BRAND_COLORS];
  const end = Date.now() + DURATION_MS;

  // 初始爆发
  confetti({
    particleCount: options.particleCount ?? 60,
    spread: 75,
    startVelocity: 42,
    origin,
    colors,
    scalar: 0.95,
    ticks: 200,
    zIndex: 1000,
    disableForReducedMotion: true,
  });

  // 1.2s 内双侧余韵喷流
  const frame = (): void => {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 60,
      startVelocity: 45,
      origin: { x: Math.max(0, origin.x - 0.12), y: origin.y },
      colors,
      scalar: 0.9,
      ticks: 180,
      zIndex: 1000,
      disableForReducedMotion: true,
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 60,
      startVelocity: 45,
      origin: { x: Math.min(1, origin.x + 0.12), y: origin.y },
      colors,
      scalar: 0.9,
      ticks: 180,
      zIndex: 1000,
      disableForReducedMotion: true,
    });
    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  };
  requestAnimationFrame(frame);
}
