-- ============================================================================
-- Migration: 0003_profile_mood_gender
-- Phase    : 5 — Today Dashboard 支撑字段
-- 说明     : 为 profiles 增补心情打卡与生理性别字段。
--            mood            当前心情标记（前端收敛为 calm/happy/tired/caring/sleepy）
--            mood_updated_at 心情更新时间（伴侣端可据此判断是否过期）
--            gender          生理性别，决定生理期模块的本人/伴侣关怀视角；
--                            允许 NULL，未设置时默认按本人视角展示。
-- ============================================================================

ALTER TABLE public.profiles
    ADD COLUMN mood TEXT,
    ADD COLUMN mood_updated_at TIMESTAMPTZ,
    ADD COLUMN gender TEXT CHECK (gender IN ('female', 'male'));
