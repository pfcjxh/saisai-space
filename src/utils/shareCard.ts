/**
 * shareCard — 恋爱时长分享卡片（Canvas 绘制 + 导出/分享）
 * 卡片为固定品牌视觉（OLED 底 + 暖金强调），不随主题变化，
 * 保存 / 分享到外部时保持一致识别度。尺寸 1080×1440（3:4 竖版）。
 */

export interface ShareCardInput {
  daysTogether: number;
  /** YYYY-MM-DD */
  startedAt: string;
  myAvatarUrl: string;
  partnerAvatarUrl: string;
}

const W = 1080;
const H = 1440;
const FONT_STACK = '"PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif';

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    // 跨域头像（Supabase Storage 签名 URL）需带 CORS 标记，保证画布不被污染；
    // 加载失败（对方无 CORS 头 / 断网）时由调用方回退本地默认头像
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function loadAvatar(primary: string, fallback: string): Promise<HTMLImageElement | null> {
  if (primary === fallback) return loadImage(fallback);
  return (await loadImage(primary)) ?? (await loadImage(fallback));
}

/** 圆形裁切绘制头像 + 奶白描边（cover 填充，不变形） */
function drawAvatar(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  cx: number,
  cy: number,
  r: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = '#1c1c1e';
  ctx.fill();
  ctx.clip();
  if (img) {
    const scale = Math.max((r * 2) / img.width, (r * 2) / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
  ctx.strokeStyle = '#f5f1e8';
  ctx.lineWidth = 9;
  ctx.stroke();
}

/** 贝塞尔手绘爱心（避免字形/emoji 跨设备渲染差异） */
function drawHeart(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  const s = size / 16;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(0, 5);
  ctx.bezierCurveTo(-9, -4, -16, 2, 0, 14);
  ctx.bezierCurveTo(16, 2, 9, -4, 0, 5);
  ctx.closePath();
  ctx.fillStyle = '#fb7185';
  ctx.fill();
  ctx.restore();
}

export async function renderShareCard(
  canvas: HTMLCanvasElement,
  input: ShareCardInput,
): Promise<void> {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas-unavailable');

  // 底色 + 顶部暖金环境光晕
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 420, 60, W / 2, 420, 780);
  glow.addColorStop(0, 'rgba(255, 174, 93, 0.13)');
  glow.addColorStop(1, 'rgba(255, 174, 93, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const myImg = await loadAvatar(input.myAvatarUrl, '/avatars/me.webp');
  const partnerImg = await loadAvatar(input.partnerAvatarUrl, '/avatars/partner.webp');
  drawAvatar(ctx, myImg, W / 2 - 178, 470, 132);
  drawAvatar(ctx, partnerImg, W / 2 + 178, 470, 132);
  drawHeart(ctx, W / 2, 470, 52);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = '#a3a3a3';
  ctx.font = `500 58px ${FONT_STACK}`;
  ctx.fillText('在 一 起', W / 2, 756);

  // 数字 + 单位整体居中：先测量再落笔
  const days = String(input.daysTogether);
  ctx.font = `700 272px ${FONT_STACK}`;
  const daysWidth = ctx.measureText(days).width;
  ctx.font = `600 92px ${FONT_STACK}`;
  const unitWidth = ctx.measureText('天').width;
  const startX = W / 2 - (daysWidth + unitWidth + 18) / 2;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffae5d';
  ctx.font = `700 272px ${FONT_STACK}`;
  ctx.fillText(days, startX, 1044);
  ctx.fillStyle = '#f5f1e8';
  ctx.font = `600 92px ${FONT_STACK}`;
  ctx.fillText('天', startX + daysWidth + 18, 1044);
  ctx.textAlign = 'center';

  ctx.fillStyle = '#a3a3a3';
  ctx.font = `400 46px ${FONT_STACK}`;
  ctx.fillText(`自 ${input.startedAt.replaceAll('-', '.')} 起`, W / 2, 1160);

  ctx.fillStyle = '#77716b';
  ctx.font = `400 40px ${FONT_STACK}`;
  ctx.fillText('赛赛 · 双人空间', W / 2, 1316);
}

export type ShareResult = 'shared' | 'downloaded' | 'failed';

/** 优先系统分享面板（iOS 主屏 PWA 唯一可靠导出路径），降级为下载 */
export async function shareOrDownload(canvas: HTMLCanvasElement): Promise<ShareResult> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  );
  if (!blob) return 'failed';
  const file = new File([blob], 'saisai-days.png', { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
  try {
    if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file] });
      return 'shared';
    }
  } catch (e) {
    // 用户取消分享面板不属于失败
    if (e instanceof DOMException && e.name === 'AbortError') return 'shared';
    return 'failed';
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'saisai-days.png';
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}
