-- ============================================================================
-- Migration: 0008_love_letters_sticky_notes
-- Project  : 双人私密空间 PWA (Couple Space)
-- Phase    : 15 — P1 情感件包：情书 + 便利贴墙
-- 依赖     : 0001_init_schema（public.is_member_of_couple / handle_updated_at）
-- 说明     : 情书无 updated_at——写下一封即"封口寄出"，不提供编辑，
--            保留"信已寄出不可改"的产品语义；便利贴随手可改，带 updated_at。
-- ============================================================================

-- 1. 情书表
CREATE TABLE public.love_letters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    couple_id UUID NOT NULL REFERENCES public.couples(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. 便利贴墙
CREATE TABLE public.sticky_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    couple_id UUID NOT NULL REFERENCES public.couples(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    color TEXT NOT NULL DEFAULT 'lavender'
        CHECK (color IN ('rose', 'butter', 'lavender', 'mint', 'sky')),
    content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 200),
    pinned BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. 查询索引（列表恒按"置顶优先 + 时间倒序"读取）
CREATE INDEX idx_love_letters_couple_date ON public.love_letters(couple_id, created_at DESC);
CREATE INDEX idx_sticky_notes_couple_board
    ON public.sticky_notes(couple_id, pinned DESC, created_at DESC);

-- 4. updated_at 触发器（仅便利贴需要）
CREATE TRIGGER set_sticky_notes_updated_at
    BEFORE UPDATE ON public.sticky_notes
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 5. Row Level Security
ALTER TABLE public.love_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sticky_notes ENABLE ROW LEVEL SECURITY;

-- 5.1 情书：空间成员可读；仅作者可寄出/撤回（信的内容不可被伴侣篡改或代删）
CREATE POLICY "love_letters_select_policy" ON public.love_letters FOR SELECT USING (
    public.is_member_of_couple(couple_id)
);
CREATE POLICY "love_letters_insert_policy" ON public.love_letters FOR INSERT WITH CHECK (
    public.is_member_of_couple(couple_id) AND author_id = auth.uid()
);
CREATE POLICY "love_letters_delete_policy" ON public.love_letters FOR DELETE USING (
    author_id = auth.uid()
);

-- 5.2 便利贴：空间成员可读；仅作者可写/改/删（与日记一致的归属心智）
CREATE POLICY "sticky_notes_select_policy" ON public.sticky_notes FOR SELECT USING (
    public.is_member_of_couple(couple_id)
);
CREATE POLICY "sticky_notes_insert_policy" ON public.sticky_notes FOR INSERT WITH CHECK (
    public.is_member_of_couple(couple_id) AND author_id = auth.uid()
);
CREATE POLICY "sticky_notes_update_policy" ON public.sticky_notes FOR UPDATE
    USING (author_id = auth.uid())
    WITH CHECK (author_id = auth.uid() AND public.is_member_of_couple(couple_id));
CREATE POLICY "sticky_notes_delete_policy" ON public.sticky_notes FOR DELETE USING (
    author_id = auth.uid()
);

-- 6. Realtime 发布：两表进入广播通道（与 0002 同规则，幂等）
DO $$
DECLARE
    t TEXT;
    v_tables TEXT[] := ARRAY['love_letters', 'sticky_notes'];
BEGIN
    FOREACH t IN ARRAY v_tables LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
              AND schemaname = 'public'
              AND tablename = t
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
        END IF;
    END LOOP;
END;
$$;
