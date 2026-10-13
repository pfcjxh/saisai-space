// ============================================================================
// _shared/push.ts — Edge Functions 共用推送底座（Deno）
// VAPID 配置、按偏好过滤、失效终端（404/410）自动剔除。
// ============================================================================
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type PushKind = 'diary' | 'anniversary' | 'period' | 'test';

export interface PushTarget {
  user_ids: string[];
  title: string;
  body: string;
  url?: string;
  kind?: PushKind;
}

export interface PushResult {
  sent: number;
  pruned: number;
  skipped?: string;
}

export function createServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );
}

export function verifyWebhookSecret(req: Request): boolean {
  const secret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  if (!secret) return false;
  return req.headers.get('x-webhook-secret') === secret;
}

/** 浏览器（supabase.functions.invoke）跨域调用所需响应头 */
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

/** 预检请求直通 */
export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  return null;
}

function configureVapid(): boolean {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:saisai@example.com';
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

/** kind -> profiles 偏好列映射 */
const KIND_PREF: Record<PushKind, string | null> = {
  diary: 'notify_diary',
  anniversary: 'notify_anniversary',
  period: 'notify_period',
  test: null,
};

interface SubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function sendToUsers(
  supabase: SupabaseClient,
  target: PushTarget,
): Promise<PushResult> {
  if (!configureVapid()) {
    console.warn('[push] VAPID 未配置，跳过下发:', target.title);
    return { sent: 0, pruned: 0, skipped: 'vapid-not-configured' };
  }
  if (target.user_ids.length === 0) {
    return { sent: 0, pruned: 0, skipped: 'no-targets' };
  }

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .in('user_id', target.user_ids);
  if (error) throw error;

  let targets = (subs ?? []) as SubscriptionRow[];

  // 按用户偏好过滤（test 类型不校验）
  const prefColumn = KIND_PREF[target.kind ?? 'test'];
  if (prefColumn && targets.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select(`id, ${prefColumn}`)
      .in('id', target.user_ids);
    const allowed = new Set(
      (profiles ?? [])
        .filter((p: Record<string, unknown>) => p[prefColumn] !== false)
        .map((p: Record<string, unknown>) => p.id as string),
    );
    targets = targets.filter((s) => allowed.has(s.user_id));
  }

  const payload = JSON.stringify({
    title: target.title,
    body: target.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: target.url ?? '/today' },
  });

  const results = await Promise.allSettled(
    targets.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      ),
    ),
  );

  // 失效终端剔除：404 Not Found / 410 Gone
  const staleIds: string[] = [];
  results.forEach((result, index) => {
    if (result.status !== 'rejected') return;
    const reason = result.reason as { statusCode?: number } | undefined;
    const code = reason?.statusCode;
    if (code === 404 || code === 410) {
      const row = targets[index];
      if (row) staleIds.push(row.id);
    }
  });

  if (staleIds.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', staleIds);
  }

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  return { sent, pruned: staleIds.length };
}