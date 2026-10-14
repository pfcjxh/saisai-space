-- ============================================================================
-- Migration: 0013_realtime_and_period_push
-- Project  : 双人私密空间 PWA (Couple Space)
--
-- 背景（审计发现，2026-10-14）：
--   1) supabase_realtime 发布里只有 anniversaries/diaries/love_letters/
--      sticky_notes/todos/wishes —— **period_cycles 不在其中**，
--      他代录她的经期后她的设备不会实时刷新（前端也无对应 composable）。
--   2) 推送链路审计：daily-check-push 每小时正常执行（cron.job_run_details
--      全 succeeded，net._http_response 显示 09:00 批 processed:5），但
--      push_subscriptions 里这对情侣**终端数为 0** —— 且即时推送触发器只
--      覆盖日记 INSERT，经期「开始/结束」这两个最该通知的时刻没有任何即时推送。
--
-- 本迁移做两件事（都幂等）：
--   A. period_cycles 加入 Realtime 发布。
--      **period_logs 有意不加**：Supabase Realtime 的 postgres_changes
--      不逐行执行 RLS（已认证订阅者收到符合 filter 的全部事件），
--      而 logs 承载「她标 private 则伴侣不可见」的隐私边界 —— 进发布即泄漏。
--      周期统计（start/end）本就对伴侣全量可见（select 策略无附加条件），安全。
--   B. 经期「开始 / 结束」即时推送伴侣（kind=period，走 notify_period 偏好过滤）。
--      触发器语义（WHEN 子句 + 函数内判定双保险）：
--        · INSERT 且 end_date 为空  -> 进行中的新经期，推「她的经期来了」；
--          补录历史闭合周期（INSERT 即带 end_date）由 WHEN 挡下，不推；
--        · UPDATE 使 end_date 由空变非空 -> 刚结束，推「她的经期结束了」；
--          若补录的结束日早于本地今天 1 天以上（旧事补记），函数内跳过；
--        · 其余字段修改不推。
--      不通知操作者本人：他代录时不推他（v_partner = v_actor 短路），
--      她自记时推他（关怀文案的正确接收者）。
--      net.http_post 包 EXCEPTION 兜底，推送任何异常绝不阻断周期写入主流程。
--
-- 修订（2026-10-15）：首版把 notify_period_push 写成带 UUID 参数的普通函数，
--   而 Postgres 触发器**不允许**给触发函数传 NEW.id 之类的参数（42601 语法错误，
--   首次应用即失败回滚）。现改为标准 RETURNS TRIGGER 形态，函数内直接读 NEW。
--
-- 幂等：DROP TRIGGER IF EXISTS / CREATE OR REPLACE / publication 判存。
-- ============================================================================

-- ============================================================================
-- A. period_cycles 进 Realtime 发布
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'period_cycles'
    ) THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.period_cycles';
    END IF;
END;
$$;

-- ============================================================================
-- B. 经期开始/结束 -> 即时推送伴侣
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_period_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_partner  UUID;
    v_actor    UUID;
    v_name     TEXT;
    v_secret   TEXT := public.push_webhook_secret();
    v_base     TEXT := public.push_functions_base_url();
    v_title    TEXT;
    v_body     TEXT;
BEGIN
    -- 密钥缺失（Vault 未初始化）时静默跳过，绝不阻断主流程
    IF v_secret IS NULL OR v_base IS NULL THEN
        RAISE WARNING 'period push skipped: webhook secret or base url missing';
        RETURN NULL;
    END IF;

    -- 录入人：set_recorded_by（BEFORE INSERT）已填充；缺省回退当前会话身份
    v_actor := COALESCE(NEW.recorded_by, auth.uid());

    -- NEW.user_id 的伴侣
    SELECT cm2.user_id INTO v_partner
    FROM public.couple_members cm1
    JOIN public.couple_members cm2
      ON cm2.couple_id = cm1.couple_id AND cm2.user_id <> cm1.user_id
    WHERE cm1.user_id = NEW.user_id
    LIMIT 1;

    -- 无伴侣，或操作者本人就是收件人（他代录 -> 不推他；她自记 -> 不推她）：跳过
    IF v_partner IS NULL OR v_partner = v_actor THEN
        RETURN NULL;
    END IF;

    IF NEW.end_date IS NULL THEN
        -- 进行中的新经期（INSERT；WHEN 子句已挡掉带结束日的历史补录）
        v_title := '她的经期来了';
        v_body  := '接下来几天多照顾她：别让她碰凉水，备好暖水袋';
    ELSE
        -- 刚结束。补录的旧事（结束日早于本地今天 1 天以上）不打扰
        IF NEW.end_date < (now() AT TIME ZONE 'Asia/Shanghai')::date - 1 THEN
            RETURN NULL;
        END IF;
        v_title := '她的经期结束了';
        v_body  := '这次辛苦了，记得提醒她好好补补气血';
    END IF;

    SELECT COALESCE(nickname, 'TA') INTO v_name FROM public.profiles WHERE id = NEW.user_id;

    PERFORM net.http_post(
        url := v_base || '/functions/v1/send-push',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-webhook-secret', v_secret
        ),
        body := jsonb_build_object(
            'user_ids', jsonb_build_array(v_partner),
            'title', v_title,
            'body', COALESCE(v_name, 'TA') || '：' || v_body,
            'url', '/cycle',
            'kind', 'period'
        )
    );
    RETURN NULL;
EXCEPTION WHEN OTHERS THEN
    -- 推送异常（pg_net 不可用等）只告警，绝不冒泡阻断周期写入
    RAISE WARNING 'period push failed for cycle %: %', NEW.id, SQLERRM;
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_period_push() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_period_push() FROM anon;
GRANT EXECUTE ON FUNCTION public.notify_period_push() TO authenticated, service_role;

-- INSERT：进行中的新经期才推（带结束日的历史补录由 WHEN 挡下）
DROP TRIGGER IF EXISTS on_period_cycle_created_push ON public.period_cycles;
CREATE TRIGGER on_period_cycle_created_push
    AFTER INSERT ON public.period_cycles
    FOR EACH ROW
    WHEN (NEW.end_date IS NULL)
    EXECUTE FUNCTION public.notify_period_push();

-- UPDATE：end_date 由空变非空才推
DROP TRIGGER IF EXISTS on_period_cycle_ended_push ON public.period_cycles;
CREATE TRIGGER on_period_cycle_ended_push
    AFTER UPDATE OF end_date ON public.period_cycles
    FOR EACH ROW
    WHEN (NEW.end_date IS NOT NULL AND OLD.end_date IS NULL)
    EXECUTE FUNCTION public.notify_period_push();

-- ============================================================================
-- C. 复核
-- ============================================================================

DO $$
DECLARE
    v_pub   INT;
    v_fn    INT;
    v_trg   INT;
BEGIN
    SELECT count(*) INTO v_pub FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'period_cycles';

    SELECT count(*) INTO v_fn FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'notify_period_push';

    SELECT count(*) INTO v_trg FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'period_cycles' AND NOT t.tgisinternal
      AND t.tgname IN ('on_period_cycle_created_push','on_period_cycle_ended_push');

    IF v_pub = 0 THEN
        RAISE EXCEPTION '迁移未完成：period_cycles 未进入 supabase_realtime 发布';
    END IF;
    IF v_fn = 0 OR v_trg < 2 THEN
        RAISE EXCEPTION '迁移未完成：推送函数或触发器缺失 (fn=%, trg=%)', v_fn, v_trg;
    END IF;
    RAISE NOTICE '0013 完成：period_cycles 实时发布 + 经期开始/结束即时推送已就位';
END;
$$;
