/**
 * 头像处理：将用户提供的小八（图一，手机截图带黑边）与米菲（图二，白底图）
 * 统一处理为 160x160 WebP 头像，输出到 public/avatars/。
 * 用法：node scripts/process-avatars.mjs
 */
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

const SRC_ME = 'C:/Users/pf310/Pictures/cndn/微信图片_20260916235430_224_5.jpg';
const SRC_PARTNER = 'C:/Users/pf310/Pictures/cndn/微信图片_20260916235451_225_5.jpg';

mkdirSync('public/avatars', { recursive: true });

// 图一（小八）：截图为横向播放器画面，中央为方形白底内容区。
// 取中央方形（90% 短边）并微向下偏移，避开顶部播放器控件与黑边。
const img1 = sharp(SRC_ME);
const meta1 = await img1.metadata();
const w1 = meta1.width ?? 0;
const h1 = meta1.height ?? 0;
const side = Math.round(Math.min(w1, h1) * 0.9);
await img1
  .extract({
    left: Math.round((w1 - side) / 2),
    top: Math.round((h1 - side) / 2 + h1 * 0.02),
    width: side,
    height: side,
  })
  .resize(160, 160)
  .webp({ quality: 85 })
  .toFile('public/avatars/me.webp');
console.log('me.webp <-', SRC_ME, `${side}x${side} crop`);

// 图二（米菲）：白底竖图，contain 完整保留长耳与全身，白底与圆形头像自然融合。
await sharp(SRC_PARTNER)
  .resize(160, 160, { fit: 'contain', background: '#ffffff' })
  .webp({ quality: 85 })
  .toFile('public/avatars/partner.webp');
console.log('partner.webp <-', SRC_PARTNER, 'contain');
