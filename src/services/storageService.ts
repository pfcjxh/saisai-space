import { supabase } from './supabase';

/**
 * storageService — 私有桶 couples-media 适配层
 *
 * 路径规范：couples-media/{couple_id}/{category}/{entity_id}/{timestamp}.webp
 * 桶为私有：读取一律走签名 URL（1 小时有效），非空间成员无法盗链
 * （Storage RLS 以路径首段 couple_id 校验成员归属）。
 */

const BUCKET = 'couples-media';

export type MediaCategory = 'diaries' | 'wishes' | 'avatars';

/** 上传并返回规范化存储路径 */
export async function uploadMedia(
  coupleId: string,
  category: MediaCategory,
  entityId: string,
  blob: Blob,
): Promise<string> {
  const path = `${coupleId}/${category}/${entityId}/${Date.now()}.webp`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/webp', upsert: false });
  if (error) throw error;
  return path;
}

/**
 * 批量解析展示 URL：
 * - http(s) 开头（如 Mock 的外链图）直接透传；
 * - 存储路径换 1 小时签名 URL。
 */
export async function resolveMediaUrls(paths: string[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  const remote: string[] = [];
  for (const p of paths) {
    if (p.startsWith('http')) {
      map[p] = p;
    } else if (!remote.includes(p)) {
      remote.push(p);
    }
  }
  if (remote.length === 0) return map;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(remote, 3600);
  if (error) throw error;
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) {
      map[item.path] = item.signedUrl;
    }
  }
  return map;
}

export async function removeMedia(path: string): Promise<void> {
  if (path.startsWith('http')) return;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}
