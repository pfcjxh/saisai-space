/**
 * imageCompressor — 端侧无感图片压缩（纯原生 Canvas API）
 *
 * 规范：最长边 1440px 等比缩放；输出 image/webp，质量 0.82；
 * 数 MB 的手机实拍通常可压至 150~300KB，严禁原图直传云端。
 */

export interface CompressResult {
  blob: Blob;
  width: number;
  height: number;
}

const MAX_SIDE = 1440;
const QUALITY = 0.82;

export async function compressImage(
  file: File,
  maxSide: number = MAX_SIDE,
  quality: number = QUALITY,
): Promise<CompressResult> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D 上下文不可用');
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', quality),
    );
    if (!blob) throw new Error('WebP 编码失败');
    return { blob, width, height };
  } finally {
    // 释放位图内存，避免移动端连拍多选时内存堆积
    bitmap.close();
  }
}
