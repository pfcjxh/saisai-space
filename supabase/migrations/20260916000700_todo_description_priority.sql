-- ============================================================================
-- Migration: 0008_todo_description_priority
-- 说明：待办增强字段——
--   description  备注/细节说明（可空）
--   priority     优先级（normal 普通 / important 重要），驱动列表徽标
-- 幂等：ADD COLUMN IF NOT EXISTS，可重复执行。
-- ============================================================================

ALTER TABLE public.todos
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal'
        CHECK (priority IN ('normal', 'important'));