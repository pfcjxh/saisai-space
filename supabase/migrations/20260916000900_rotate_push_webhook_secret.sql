-- ============================================================================
-- Migration: 0009_rotate_push_webhook_secret
-- Project  : 双人私密空间 PWA (Couple Space)
-- Phase    : 16 — 安全整改（密钥外泄处置）
--
-- 背景：
--   迁移 0006 的初版把 webhook 共享密钥（明文，32 位字母串 aassddff…rtyy）
--   写死在 SQL 中并随迁移入库，该密钥视为**已泄露**，必须作废。
--
-- 本迁移做三件事：
--   1. 把库内 Vault 的 push_webhook_secret 轮换为新的 32 字节随机值；
--   2. 让触发器与 cron 任务改读 Vault（函数已在 0006 v2 中改为读取式）；
--   3. 打印新密钥的 SHA-256 指纹，供与 Edge Function Secret 比对。
--
-- ⚠️ 执行后必须同步更新 Edge Function 环境变量，否则推送会 401：
--      supabase secrets set PUSH_WEBHOOK_SECRET="$(本迁移输出的新密钥)"
--   新密钥的明文可用以下 SQL 取回（仅 dashboard / service_role 可执行）：
--      SELECT decrypted_secret FROM vault.decrypted_secrets
--       WHERE name = 'push_webhook_secret';
--
-- 幂等：重复执行会再次轮换密钥（每次都需重新同步 Edge Secret）。
-- ============================================================================

-- 1. 轮换密钥（存在则更新，不存在则创建）
DO $$
DECLARE
    v_new TEXT := encode(extensions.gen_random_bytes(32), 'hex');
BEGIN
    IF EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'push_webhook_secret') THEN
        PERFORM vault.update_secret(
            (SELECT id FROM vault.secrets WHERE name = 'push_webhook_secret'),
            v_new,
            'push_webhook_secret',
            '赛赛 · 推送调度共享密钥（0009 轮换后，旧密钥已作废）'
        );
    ELSE
        PERFORM vault.create_secret(
            v_new,
            'push_webhook_secret',
            '赛赛 · 推送调度共享密钥（0009 轮换后）'
        );
    END IF;
END;
$$;

-- 2. 确认触发器与 cron 均走读取式函数（0006 v2 已定义，此处重建以防旧版本残留）
DROP TRIGGER IF EXISTS on_diary_created_push ON public.diaries;
CREATE TRIGGER on_diary_created_push
    AFTER INSERT ON public.diaries
    FOR EACH ROW EXECUTE FUNCTION public.notify_diary_push();

DO $$
BEGIN
    PERFORM cron.unschedule('daily-check-push');
EXCEPTION WHEN others THEN
    NULL;
END;
$$;

SELECT cron.schedule(
    'daily-check-push',
    '0 * * * *',
    $job$
    SELECT net.http_post(
        url := public.push_functions_base_url() || '/functions/v1/daily-check-push',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-webhook-secret', public.push_webhook_secret()
        ),
        body := '{}'::jsonb
    );
    $job$
);

-- 3. 输出轮换结果指纹（不回显明文，避免再次进入日志/版本库）
DO $$
DECLARE
    v_secret TEXT := public.push_webhook_secret();
BEGIN
    RAISE NOTICE 'push_webhook_secret 已轮换，SHA-256 = %',
        encode(extensions.digest(v_secret, 'sha256'), 'hex');
    RAISE NOTICE '请执行：supabase secrets set PUSH_WEBHOOK_SECRET="<新密钥>"';
    RAISE NOTICE '新密钥明文查询：SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = ''push_webhook_secret'';';
END;
$$;
