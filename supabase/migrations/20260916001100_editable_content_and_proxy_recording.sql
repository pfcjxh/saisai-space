-- ============================================================================
-- Migration: 0011_editable_content_and_proxy_recording
-- Project  : 双人私密空间 PWA (Couple Space)
-- Phase    : 18 — 可编辑能力 + 伴侣代录
--
-- 背景（用户需求）：
--   1. 「在一起的日子」目前只能在创建空间时设定一次，之后无法修改；
--   2. 女方两周才能用一次手机，男方需要**代替她录入与修改生理期数据**，
--      但现有 RLS 规定 period_cycles / period_logs 仅本人可写；
--   3. 双方所在城市会变（他在深圳/可能广州，她在莱阳/在山东上学），
--      需要能互相修改；
--   4. 首页情话等文案写死在代码里，需要可由用户自定义。
--
-- 设计取舍（隐私底线）：
--   代录能力**不取消她的隐私选择权**。period_logs 的可见性规则为：
--     · 本人：全量可见可写；
--     · 伴侣：可写（代录）；可读自己录入的（recorded_by = 自己）
--             或她标记为 shared 的记录；
--             她主动标记 private 且非伴侣录入的内容，仍然不可见。
--   即：他去帮忙记录不受限，但她刻意保留的私密备注仍归她。
--
-- 幂等：ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS。
-- ============================================================================

-- ============================================================================
-- 1. profiles：可自定义文案 + 允许伴侣互相修改资料
-- ============================================================================

-- 1.1 首页情话（可留空，回落到默认文案由前端决定）
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS love_note TEXT;
COMMENT ON COLUMN public.profiles.love_note IS '首页问候语下的自定义文案，为空时由前端使用默认值';

-- 1.2 允许伴侣修改对方资料（用于修改所在城市等）
--     说明：这是双人私密空间，双方本就互见资料；此处放开写权限以支持
--     「一方长时间无法操作时由另一方代为维护」。id 不可篡改由 WITH CHECK 保证。
DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;
CREATE POLICY "profiles_update_policy" ON public.profiles FOR UPDATE
    USING (id = (select auth.uid()) OR public.is_partner_of(id))
    WITH CHECK (id = (select auth.uid()) OR public.is_partner_of(id));

-- ============================================================================
-- 2. 生理期：代录人追踪
-- ============================================================================

ALTER TABLE public.period_cycles
    ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.period_logs
    ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES public.profiles(id);

COMMENT ON COLUMN public.period_cycles.recorded_by IS '实际录入人；与 user_id 不同时表示伴侣代录';
COMMENT ON COLUMN public.period_logs.recorded_by IS '实际录入人；与 user_id 不同时表示伴侣代录';

-- 录入时自动填充 recorded_by（不覆盖显式传入的值）
CREATE OR REPLACE FUNCTION public.set_recorded_by()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.recorded_by IS NULL THEN
        NEW.recorded_by := auth.uid();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_period_cycles_recorded_by ON public.period_cycles;
CREATE TRIGGER set_period_cycles_recorded_by
    BEFORE INSERT ON public.period_cycles
    FOR EACH ROW EXECUTE FUNCTION public.set_recorded_by();

DROP TRIGGER IF EXISTS set_period_logs_recorded_by ON public.period_logs;
CREATE TRIGGER set_period_logs_recorded_by
    BEFORE INSERT ON public.period_logs
    FOR EACH ROW EXECUTE FUNCTION public.set_recorded_by();

-- ============================================================================
-- 3. 生理期 RLS：放开伴侣写入，但保留 private 的可见性边界
-- ============================================================================

-- 3.1 period_cycles：伴侣可读可写可删（周期统计本就不含私密症状）
DROP POLICY IF EXISTS "period_cycles_select_policy" ON public.period_cycles;
CREATE POLICY "period_cycles_select_policy" ON public.period_cycles FOR SELECT USING (
    user_id = (select auth.uid()) OR public.is_partner_of(user_id)
);

DROP POLICY IF EXISTS "period_cycles_insert_policy" ON public.period_cycles;
CREATE POLICY "period_cycles_insert_policy" ON public.period_cycles FOR INSERT WITH CHECK (
    user_id = (select auth.uid()) OR public.is_partner_of(user_id)
);

DROP POLICY IF EXISTS "period_cycles_update_policy" ON public.period_cycles;
CREATE POLICY "period_cycles_update_policy" ON public.period_cycles FOR UPDATE
    USING (user_id = (select auth.uid()) OR public.is_partner_of(user_id))
    WITH CHECK (user_id = (select auth.uid()) OR public.is_partner_of(user_id));

DROP POLICY IF EXISTS "period_cycles_delete_policy" ON public.period_cycles;
CREATE POLICY "period_cycles_delete_policy" ON public.period_cycles FOR DELETE USING (
    user_id = (select auth.uid()) OR public.is_partner_of(user_id)
);

-- 3.2 period_logs：写入放开，读取保留 private 边界
--     伴侣可见条件 = 她标记为 shared，或该条由伴侣本人录入（代录后仍可维护）
DROP POLICY IF EXISTS "period_logs_select_policy" ON public.period_logs;
CREATE POLICY "period_logs_select_policy" ON public.period_logs FOR SELECT USING (
    user_id = (select auth.uid())
    OR (
        public.is_partner_of(user_id)
        AND (visibility = 'shared' OR recorded_by = (select auth.uid()))
    )
);

DROP POLICY IF EXISTS "period_logs_insert_policy" ON public.period_logs;
CREATE POLICY "period_logs_insert_policy" ON public.period_logs FOR INSERT WITH CHECK (
    user_id = (select auth.uid()) OR public.is_partner_of(user_id)
);

DROP POLICY IF EXISTS "period_logs_update_policy" ON public.period_logs;
CREATE POLICY "period_logs_update_policy" ON public.period_logs FOR UPDATE
    USING (
        user_id = (select auth.uid())
        OR (
            public.is_partner_of(user_id)
            AND (visibility = 'shared' OR recorded_by = (select auth.uid()))
        )
    )
    WITH CHECK (user_id = (select auth.uid()) OR public.is_partner_of(user_id));

DROP POLICY IF EXISTS "period_logs_delete_policy" ON public.period_logs;
CREATE POLICY "period_logs_delete_policy" ON public.period_logs FOR DELETE USING (
    user_id = (select auth.uid())
    OR (
        public.is_partner_of(user_id)
        AND (visibility = 'shared' OR recorded_by = (select auth.uid()))
    )
);

-- ============================================================================
-- 4. couples：确认成员可改「在一起的日子」
--    （既有策略已允许 is_member_of_couple 更新，此处重建以确保与性能写法一致）
-- ============================================================================

DROP POLICY IF EXISTS "couples_update_policy" ON public.couples;
CREATE POLICY "couples_update_policy" ON public.couples FOR UPDATE
    USING (public.is_member_of_couple(id))
    WITH CHECK (public.is_member_of_couple(id));

-- ============================================================================
-- 5. 复核
-- ============================================================================

DO $$
DECLARE
    v_missing TEXT;
BEGIN
    SELECT string_agg(t, ', ') INTO v_missing
    FROM (
        SELECT 'profiles.love_note' AS t
        WHERE NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='profiles' AND column_name='love_note')
        UNION ALL
        SELECT 'period_cycles.recorded_by'
        WHERE NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='period_cycles' AND column_name='recorded_by')
        UNION ALL
        SELECT 'period_logs.recorded_by'
        WHERE NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='period_logs' AND column_name='recorded_by')
    ) missing;

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION '迁移未完成，缺少: %', v_missing;
    END IF;
    RAISE NOTICE '0011 迁移完成：love_note / recorded_by / 伴侣代录策略均已就位';
END;
$$;
