-- ============================================================================
-- Migration: 0004_anniversary_category_pinned
-- Phase    : 7 — 纪念日体系支撑字段
-- 说明     : category  分类（birthday 生日 / anniversary 纪念日 / holiday 假期 / life 生活），
--                      驱动卡片图标瓷贴配色；
--            pinned    专属置顶：置顶项优先同步至 Today 首页 UpcomingMilestoneCard。
-- ============================================================================

ALTER TABLE public.anniversaries
    ADD COLUMN category TEXT NOT NULL DEFAULT 'anniversary'
        CHECK (category IN ('birthday', 'anniversary', 'holiday', 'life')),
    ADD COLUMN pinned BOOLEAN NOT NULL DEFAULT false;
