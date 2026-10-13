-- ============================================================================
-- Migration: 0002_storage_and_realtime
-- Project  : 双人私密空间 PWA (Couple Space)
-- Phase    : 1 — Storage 私有桶策略 & Realtime 发布
-- 依赖     : 0001_init_schema（public.is_member_of_couple）
-- ============================================================================

-- ============================================================================
-- 1. Storage：私有存储桶 couples-media
--    规范化对象路径：couples-media/{couple_id}/{diaries|wishes|avatars}/...
--    前端上传前必须完成 Canvas 压缩（宽<=1440px / WebP / q=0.82），
--    桶级 5MB 上限仅作兜底防线。
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'couples-media',
    'couples-media',
    false,                       -- Public Access 关闭，全部走签名 URL
    5242880,                     -- 5MB 兜底上限
    ARRAY['image/webp', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Storage RLS：解析路径首段 (storage.foldername(name))[1] 得到 couple_id，
-- 仅该空间合法成员可读/写/改/删。路径畸形（无首段目录）时结果为 NULL，
-- is_member_of_couple(NULL) 恒为 false，天然拒绝。
-- ----------------------------------------------------------------------------

CREATE POLICY "couples_media_select_policy" ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'couples-media'
    AND public.is_member_of_couple(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "couples_media_insert_policy" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'couples-media'
    AND public.is_member_of_couple(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "couples_media_update_policy" ON storage.objects FOR UPDATE TO authenticated
USING (
    bucket_id = 'couples-media'
    AND public.is_member_of_couple(((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
    bucket_id = 'couples-media'
    AND public.is_member_of_couple(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "couples_media_delete_policy" ON storage.objects FOR DELETE TO authenticated
USING (
    bucket_id = 'couples-media'
    AND public.is_member_of_couple(((storage.foldername(name))[1])::uuid)
);

-- ============================================================================
-- 2. Realtime 发布：仅共享业务表进入广播通道
--    period_logs 明确不接入，杜绝私密生理状态经由实时通道外泄。
--    DO 块保证重复执行幂等。
-- ============================================================================

DO $$
DECLARE
    t TEXT;
    v_tables TEXT[] := ARRAY['todos', 'anniversaries', 'wishes', 'diaries'];
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
