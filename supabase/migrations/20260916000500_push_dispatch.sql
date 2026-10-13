-- ============================================================================
-- Migration: 0006_push_dispatch
-- Phase    : 10 — Web Push 调度层
--
-- 本文件已填写完成：项目地址 whxivdsckeiqraivrodt 与 webhook 共享密钥均已就位，
-- 密钥需与 Edge Function Secrets 中的 PUSH_WEBHOOK_SECRET 完全一致。
--
-- 结构：
--   1. profiles 通知偏好三开关；
--   2. pg_net（出网）+ pg_cron（定时）扩展；
--   3. 日记 INSERT 触发器 -> 即时推送伴侣；
--   4. 每小时巡检任务 -> daily-check-push（函数内部按用户时区换算，
--      仅在当地 09:00 触发，天然避开 23:00-08:00 夜间静默时段）。
-- ============================================================================

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS notify_diary BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS notify_anniversary BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS notify_period BOOLEAN NOT NULL DEFAULT true;

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ----------------------------------------------------------------------------
-- 日记发布 -> 即时推送伴侣
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_diary_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_partner  UUID;
    v_nickname TEXT;
BEGIN
    SELECT cm.user_id INTO v_partner
    FROM public.couple_members cm
    WHERE cm.couple_id = NEW.couple_id AND cm.user_id <> NEW.author_id
    LIMIT 1;
    IF v_partner IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT nickname INTO v_nickname FROM public.profiles WHERE id = NEW.author_id;

    PERFORM net.http_post(
        url := 'https://whxivdsckeiqraivrodt.supabase.co/functions/v1/send-push',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-webhook-secret', 'aassddffgghhjjkkllqqwweerrttyy'
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

-- ----------------------------------------------------------------------------
-- 每小时巡检（函数内部换算用户时区，当地 09:00 才真正下发）
-- ----------------------------------------------------------------------------
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
        url := 'https://whxivdsckeiqraivrodt.supabase.co/functions/v1/daily-check-push',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-webhook-secret', 'aassddffgghhjjkkllqqwweerrttyy'
        ),
        body := '{}'::jsonb
    );
    $job$
);