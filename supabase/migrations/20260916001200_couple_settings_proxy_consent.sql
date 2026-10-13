-- ============================================================================
-- Migration: 0012_couple_settings_proxy_consent
-- Project  : 双人私密空间 PWA (Couple Space)
-- Phase    : 19 — 代录授权开关（显式、可见、可撤销）
--
-- 背景：
--   迁移 0011 放开了伴侣对生理期数据的写入权限，用于支持「她两周才能用一次
--   手机，由他代为记录」。但调研同类开源项目（grovely 等自托管家庭 App）后
--   发现，业界共识是「经期数据默认对伴侣只读，且私密可见性由数据主人单方面
--   控制」。因此单纯放开 RLS 不够，需要补一层**显式授权**：
--     · 授权状态可见（设置页能看到「允许 TA 代为记录」是开是关）
--     · 授权可撤销（她随时能关掉，关掉后他立即失去写权限）
--
-- 默认值取舍：
--   本应用是两人私密空间，且女方长期无法操作手机 —— 若默认关闭，她不在时
--   功能完全不可用，与用户明确需求相悖。故 `allow_proxy_period_write`
--   **默认 TRUE**，但完整暴露在设置页，双方均可查看与更改。
--   安全边界不变：她标记 private 且非伴侣录入的记录，伴侣始终不可见。
--
-- 幂等：CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS。
-- ============================================================================

-- ============================================================================
-- 1. 空间级设置表
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.couple_settings (
    couple_id                UUID PRIMARY KEY REFERENCES public.couples(id) ON DELETE CASCADE,
    /** 是否允许伴侣代为录入生理期数据 */
    allow_proxy_period_write BOOLEAN NOT NULL DEFAULT true,
    /** 是否允许伴侣修改自己的资料（昵称/城市） */
    allow_proxy_profile_edit BOOLEAN NOT NULL DEFAULT true,
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by               UUID REFERENCES public.profiles(id)
);

COMMENT ON TABLE public.couple_settings IS '双人空间的共享设置（代录授权等），双方可读可改';

-- 既有空间补一行，保证设置页有值可显示
INSERT INTO public.couple_settings (couple_id)
SELECT id FROM public.couples
ON CONFLICT (couple_id) DO NOTHING;

-- updated_at 自动维护
DROP TRIGGER IF EXISTS set_couple_settings_updated_at ON public.couple_settings;
CREATE TRIGGER set_couple_settings_updated_at
    BEFORE UPDATE ON public.couple_settings
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 2. RLS：仅本空间成员可读，任一方可改（她不在时他能帮忙调，她回来也能收回）
-- ============================================================================

ALTER TABLE public.couple_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "couple_settings_select_policy" ON public.couple_settings;
CREATE POLICY "couple_settings_select_policy" ON public.couple_settings FOR SELECT USING (
    public.is_member_of_couple(couple_id)
);

DROP POLICY IF EXISTS "couple_settings_insert_policy" ON public.couple_settings;
CREATE POLICY "couple_settings_insert_policy" ON public.couple_settings FOR INSERT WITH CHECK (
    public.is_member_of_couple(couple_id)
);

DROP POLICY IF EXISTS "couple_settings_update_policy" ON public.couple_settings;
CREATE POLICY "couple_settings_update_policy" ON public.couple_settings FOR UPDATE
    USING (public.is_member_of_couple(couple_id))
    WITH CHECK (public.is_member_of_couple(couple_id));

-- ============================================================================
-- 3. 授权判定函数
--    SECURITY DEFINER：策略内需要跨表读取（couple_members + couple_settings），
--    若以调用者身份读取会在 couple_settings 上再次触发 RLS 造成递归。
-- ============================================================================

CREATE OR REPLACE FUNCTION public.couple_allows_proxy(p_owner_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE((
        SELECT s.allow_proxy_period_write
        FROM public.couple_members me
        JOIN public.couple_members other
          ON other.couple_id = me.couple_id AND other.user_id = p_owner_id
        LEFT JOIN public.couple_settings s ON s.couple_id = me.couple_id
        WHERE me.user_id = auth.uid()
        LIMIT 1
    ), true);  -- 无设置行时默认允许（见文件头「默认值取舍」）
$$;

REVOKE ALL ON FUNCTION public.couple_allows_proxy(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.couple_allows_proxy(UUID) TO authenticated;

-- ============================================================================
-- 4. 生理期 RLS：伴侣写入需授权开启
--    读取规则不变（她的 private 且非他录入的内容始终不可见）
-- ============================================================================

-- 4.1 period_cycles
DROP POLICY IF EXISTS "period_cycles_insert_policy" ON public.period_cycles;
CREATE POLICY "period_cycles_insert_policy" ON public.period_cycles FOR INSERT WITH CHECK (
    user_id = (select auth.uid())
    OR (public.is_partner_of(user_id) AND public.couple_allows_proxy(user_id))
);

DROP POLICY IF EXISTS "period_cycles_update_policy" ON public.period_cycles;
CREATE POLICY "period_cycles_update_policy" ON public.period_cycles FOR UPDATE
    USING (
        user_id = (select auth.uid())
        OR (public.is_partner_of(user_id) AND public.couple_allows_proxy(user_id))
    )
    WITH CHECK (
        user_id = (select auth.uid())
        OR (public.is_partner_of(user_id) AND public.couple_allows_proxy(user_id))
    );

DROP POLICY IF EXISTS "period_cycles_delete_policy" ON public.period_cycles;
CREATE POLICY "period_cycles_delete_policy" ON public.period_cycles FOR DELETE USING (
    user_id = (select auth.uid())
    OR (public.is_partner_of(user_id) AND public.couple_allows_proxy(user_id))
);

-- 4.2 period_logs
DROP POLICY IF EXISTS "period_logs_insert_policy" ON public.period_logs;
CREATE POLICY "period_logs_insert_policy" ON public.period_logs FOR INSERT WITH CHECK (
    user_id = (select auth.uid())
    OR (public.is_partner_of(user_id) AND public.couple_allows_proxy(user_id))
);

DROP POLICY IF EXISTS "period_logs_update_policy" ON public.period_logs;
CREATE POLICY "period_logs_update_policy" ON public.period_logs FOR UPDATE
    USING (
        user_id = (select auth.uid())
        OR (
            public.is_partner_of(user_id)
            AND public.couple_allows_proxy(user_id)
            AND (visibility = 'shared' OR recorded_by = (select auth.uid()))
        )
    )
    WITH CHECK (
        user_id = (select auth.uid())
        OR (public.is_partner_of(user_id) AND public.couple_allows_proxy(user_id))
    );

DROP POLICY IF EXISTS "period_logs_delete_policy" ON public.period_logs;
CREATE POLICY "period_logs_delete_policy" ON public.period_logs FOR DELETE USING (
    user_id = (select auth.uid())
    OR (
        public.is_partner_of(user_id)
        AND public.couple_allows_proxy(user_id)
        AND (visibility = 'shared' OR recorded_by = (select auth.uid()))
    )
);

-- ============================================================================
-- 5. 复核
-- ============================================================================

DO $$
DECLARE
    v_rows INT;
    v_fn   INT;
BEGIN
    SELECT count(*) INTO v_rows FROM public.couple_settings;
    SELECT count(*) INTO v_fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'couple_allows_proxy';

    IF v_fn = 0 THEN
        RAISE EXCEPTION '迁移未完成：couple_allows_proxy 未创建';
    END IF;
    RAISE NOTICE '0012 完成：couple_settings 有 % 行，授权判定函数已就位', v_rows;
END;
$$;
