-- ============================================================================
-- Migration: 0005_diary_likes_comments_wish_category  (v2 修正版，可重复执行)
-- Phase    : 9 — 日记互动与心愿分类支撑字段
--
-- 修正说明：策略的 WITH CHECK 子句中不存在 OLD/NEW 别名（它们只属于触发器），
-- 原 v1 脚本在 WITH CHECK 中引用 OLD.* 导致执行报错并整体回滚。
-- 现改为 SECURITY DEFINER 辅助函数 diary_body_unchanged()：
-- 以"新行正文必须与库中现存正文完全一致"实现伴侣仅可追加互动字段的约束。
--
-- 全部语句幂等：ADD COLUMN IF NOT EXISTS + DROP POLICY IF EXISTS + CREATE OR REPLACE。
-- ============================================================================

ALTER TABLE public.diaries
    ADD COLUMN IF NOT EXISTS liked_by UUID[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS comments JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.wishes
    ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'experience'
        CHECK (category IN ('travel', 'food', 'experience', 'purchase'));

-- ----------------------------------------------------------------------------
-- 辅助函数：校验"正文类字段未被改动"
-- 参数为 UPDATE 提议的新行值；与库中现存行逐字段比对（NULL 安全）。
-- SECURITY DEFINER：以属主身份读 diaries，规避 RLS 自引用递归。
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.diary_body_unchanged(
    p_id UUID,
    p_title TEXT,
    p_content TEXT,
    p_diary_date DATE,
    p_mood TEXT,
    p_images JSONB
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.diaries d
        WHERE d.id = p_id
          AND d.title IS NOT DISTINCT FROM p_title
          AND d.content = p_content
          AND d.diary_date = p_diary_date
          AND d.mood IS NOT DISTINCT FROM p_mood
          AND d.images = p_images
    );
$$;

GRANT EXECUTE ON FUNCTION public.diary_body_unchanged(UUID, TEXT, TEXT, DATE, TEXT, JSONB)
    TO authenticated;

-- ----------------------------------------------------------------------------
-- 重建日记更新策略：作者全权 + 伴侣仅追加互动字段
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "diaries_update_delete_policy" ON public.diaries;
DROP POLICY IF EXISTS "diaries_author_update_delete_policy" ON public.diaries;
DROP POLICY IF EXISTS "diaries_partner_append_policy" ON public.diaries;

CREATE POLICY "diaries_author_update_delete_policy" ON public.diaries FOR ALL
    USING (author_id = auth.uid());

CREATE POLICY "diaries_partner_append_policy" ON public.diaries FOR UPDATE
    USING (author_id <> auth.uid() AND public.is_member_of_couple(couple_id))
    WITH CHECK (
        public.diary_body_unchanged(id, title, content, diary_date, mood, images)
    );
