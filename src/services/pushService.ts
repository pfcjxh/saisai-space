import { supabase } from './supabase';

/**
 * pushService — Web Push 订阅凭据与触发接口收敛层
 * RLS：push_subscriptions 仅本人可读写；Mock 降级保障本地开发不被阻塞。
 */

export interface PushSubscriptionPayload {
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string;
}

export interface NotifyPrefs {
  notify_diary?: boolean;
  notify_anniversary?: boolean;
  notify_period?: boolean;
}

/** 订阅凭据落库（endpoint 全局唯一，重复订阅即覆盖） */
export async function saveSubscription(
  userId: string,
  sub: PushSubscriptionPayload,
): Promise<void> {
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      user_agent: sub.user_agent,
    },
    { onConflict: 'endpoint' },
  );
  if (error) throw error;
}

export async function removeSubscription(endpoint: string): Promise<void> {
  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint);
  if (error) throw error;
}

/** 当前用户已注册终端数 */
export async function countMySubscriptions(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('push_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) throw error;
  return count ?? 0;
}

export async function updateNotifyPrefs(userId: string, prefs: NotifyPrefs): Promise<void> {
  const { error } = await supabase.from('profiles').update(prefs).eq('id', userId);
  if (error) throw error;
}

export interface TestPushResult {
  /** true = Edge Function 已受理；false = 降级为 Mock */
  delivered: boolean;
  mock: boolean;
  detail?: string;
}

/**
 * 测试推送：调用 Edge Function send-push（self 模式，向本机终端下发）。
 * 未部署函数 / 未配置 VAPID 时降级为 Mock：控制台打印 payload，UI 提示已模拟。
 */
export async function sendTestPush(): Promise<TestPushResult> {
  const mockPayload = {
    title: '赛赛',
    body: '已成功连接到我们的私密频道 ♡',
    data: { url: '/today' },
  };
  // 未登录（Mock 演示模式）：函数侧需要 JWT 校验，直接走模拟分支
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    console.info('[Mock Push] 未登录，模拟下发 payload：', mockPayload);
    return { delivered: false, mock: true, detail: 'no-session' };
  }
  try {
    const { data, error } = await supabase.functions.invoke('send-push', {
      body: {
        self: true,
        title: '赛赛',
        body: '已成功连接到我们的私密频道 ♡',
        url: '/today',
      },
    });
    if (error) throw error;
    const detail =
      typeof data === 'object' && data !== null ? JSON.stringify(data) : undefined;
    return { delivered: true, mock: false, detail };
  } catch (err) {
    console.info('[Mock Push] 推送服务未就绪，模拟下发 payload：', mockPayload);
    return {
      delivered: false,
      mock: true,
      detail: err instanceof Error ? err.message : undefined,
    };
  }
}