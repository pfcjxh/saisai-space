-- ============================================================================
-- Migration: 0006_push_dispatch
-- Phase    : 10 — Web Push 调度层
--
-- 安全说明（v2 修订）：
--   原版本把 webhook 共享密钥与项目 URL 明文写死在本文件中，导致密钥随迁移
--   入库并进入版本历史。v2 起全部改为**运行时从 Supabase Vault 读取**：
--     · 密钥   -> vault.secrets['push_webhook_secret']（本迁移首次执行时随机生成）
--     · 项目URL -> current_setting('app.settings.supabase_url')，可回退 Vault / 本地默认
--   本文件不再包含任何机密字面量，可安全提交到版本库。
--
-- 结构：
--   1. profiles 通知偏好三开关；
--   2. pg_net（出网）+ pg_cron（定时）扩展；
--   3. Vault 密钥与读取辅助函数；
--   4. 日记 INSERT 触发器 -> 即时推送伴侣；
--   5. 每小时巡检任务 -> daily-check-push（函数内部按用户时区换算，
--      仅在当地 09:00 触发，天然避开 23:00-08:00 夜间静默时段）。
--
-- 幂等：ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE / DROP TRIGGER IF EXISTS /
--       cron.unschedule 包裹异常，可重复执行。
-- ============================================================================

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS notify_diary BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS notify_anniversary BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS notify_period BOOLEAN NOT NULL DEFAULT true;

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================================
-- 3. 密钥与配置托管（Vault）
-- ============================================================================

-- 3.0 项目 URL（非机密，但集中托管避免硬编码）。
--     Supabase 托管环境**禁止** ALTER DATABASE ... SET app.settings.*（42501），
--     因此 App 配置统一走 Vault，由 push_functions_base_url() 读取。
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'supabase_project_url') THEN
        PERFORM vault.create_secret(
            'https://whxivdsckeiqraivrodt.supabase.co',
            'supabase_project_url',
            '项目 URL，供 Edge Functions 端点拼接（非机密）'
        );
    END IF;
END;
$$;

-- 3.1 首次执行时生成 32 字节随机密钥；已存在则保持不变（轮换见 0009 迁移）
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'push_webhook_secret') THEN
        PERFORM vault.create_secret(
            encode(extensions.gen_random_bytes(32), 'hex'),
            'push_webhook_secret',
            '赛赛 · pg_net -> Edge Functions 推送调度共享密钥（x-webhook-secret）'
        );
    END IF;
END;
$$;

-- 3.2 读取密钥：SECURITY DEFINER + 仅 service_role/postgres 可执行，
--     前端角色（authenticated/anon）无权调用，避免密钥经由 PostgREST 外泄。
CREATE OR REPLACE FUNCTION public.push_webhook_secret()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
    SELECT decrypted_secret
    FROM vault.decrypted_secrets
    WHERE name = 'push_webhook_secret'
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.push_webhook_secret() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.push_webhook_secret() FROM anon, authenticated;

-- 3.3 解析 Edge Functions 基址，优先级：
--     ① ALTER DATABASE postgres SET app.settings.supabase_url = 'https://<ref>.supabase.co'
--     ② Vault 密钥 supabase_project_url
--     ③ 本地开发默认（supabase start 的 kong 网关）
CREATE OR REPLACE FUNCTION public.push_functions_base_url()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
    SELECT COALESCE(
        NULLIF(current_setting('app.settings.supabase_url', true), ''),
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_project_url' LIMIT 1),
        'http://kong:8000'
    );
$$;

REVOKE ALL ON FUNCTION public.push_functions_base_url() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.push_functions_base_url() FROM anon, authenticated;

-- ============================================================================
-- 4. 日记发布 -> 即时推送伴侣
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_diary_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_partner  UUID;
    v_nickname TEXT;
    v_secret   TEXT := public.push_webhook_secret();
    v_base     TEXT := public.push_functions_base_url();
BEGIN
    -- 密钥缺失（Vault 未初始化）时静默跳过，绝不阻断日记写入主流程
    IF v_secret IS NULL OR v_base IS NULL THEN
        RAISE WARNING 'push dispatch skipped: webhook secret or base url missing';
        RETURN NEW;
    END IF;

    SELECT cm.user_id INTO v_partner
    FROM public.couple_members cm
    WHERE cm.couple_id = NEW.couple_id AND cm.user_id <> NEW.author_id
    LIMIT 1;
    IF v_partner IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT nickname INTO v_nickname FROM public.profiles WHERE id = NEW.author_id;

    PERFORM net.http_post(
        url := v_base || '/functions/v1/send-push',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-webhook-secret', v_secret
        ),
        body := jsonb_build_object(
            'user_ids', jsonb_build_array(v_partner),
            'title', COALESCE(v_nickname, 'TA') || ' 写了新日记',
            'body', COALESCE(NULLIF(NEW.title, ''), LEFT(NEW.content, 40)),
            'url', '/diary',
            'kind', 'diary'
        )
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_diary_created_push ON public.diaries;
CREATE TRIGGER on_diary_created_push
    AFTER INSERT ON public.diaries
    FOR EACH ROW EXECUTE FUNCTION public.notify_diary_push();

-- ============================================================================
-- 5. 每小时巡检（函数内部换算用户时区，当地 09:00 才真正下发）
-- ============================================================================

DO $$
BEGIN
    PERFORM cron.unschedule('daily-check-push');
EXCEPTION WHEN others THEN
    NULL; -- 任务不存在时忽略
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
