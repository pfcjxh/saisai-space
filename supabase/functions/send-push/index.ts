// ============================================================================
// send-push — 即时推送服务
//
// 调用方：
//  1. 数据库触发器（日记 INSERT Webhook，携带 x-webhook-secret）；
//  2. 前端"测试通知"按钮（携带 Authorization: Bearer <user JWT>，body.self = true）。
//
// 部署：supabase functions deploy send-push --no-verify-jwt
// （webhook 无 JWT，函数内部以共享密钥校验）
// ============================================================================
import {
  createServiceClient,
  handleCorsPreflight,
  json,
  sendToUsers,
  verifyWebhookSecret,
} from '../_shared/push.ts';
import type { PushKind } from '../_shared/push.ts';

interface SendPushBody {
  user_ids?: string[];
  self?: boolean;
  title?: string;
  body?: string;
  url?: string;
  kind?: PushKind;
}

Deno.serve(async (req) => {
  // 浏览器调用预检直通（CORS）
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const service = createServiceClient();
  const webhookOk = verifyWebhookSecret(req);

  // 非 webhook 调用时，要求合法用户 JWT（仅允许给自己发测试推送）
  let selfUserId: string | null = null;
  if (!webhookOk) {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return json({ error: 'unauthorized' }, 401);
    const { data, error } = await service.auth.getUser(token);
    if (error || !data.user) return json({ error: 'unauthorized' }, 401);
    selfUserId = data.user.id;
  }

  let payload: SendPushBody;
  try {
    payload = (await req.json()) as SendPushBody;
  } catch {
    payload = {};
  }

  const userIds = payload.self
    ? selfUserId
      ? [selfUserId]
      : []
    : (payload.user_ids ?? []);

  if (userIds.length === 0) {
    return json({ error: 'no-targets' }, 400);
  }

  const result = await sendToUsers(service, {
    user_ids: userIds,
    title: payload.title ?? '赛赛',
    body: payload.body ?? '有新的消息',
    url: payload.url ?? '/today',
    kind: payload.kind ?? 'test',
  });

  return json(result);
});