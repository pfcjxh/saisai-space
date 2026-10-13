-- ============================================================================
-- Migration: 0010_rls_performance_select_uid
-- Project  : 双人私密空间 PWA (Couple Space)
-- Phase    : 17 — RLS 性能优化
--
-- 背景：Supabase Performance Advisor 反复提示「RLS policies 中的裸 auth.uid()
-- 调用应改写为 (select auth.uid())」。原因是裸 auth.uid() 在策略里会被
-- Postgres 视为**不可缓存**的 volatile 调用——每评估一行就重新求值一次；
-- 而包一层 SELECT 后，规划器会在整个查询中只求值一次，把结果作为常量下推，
-- 使策略条件能参与索引扫描而非退化为全表过滤。
--
-- 本次范围（**只改策略本身**，不动函数内部）：
--   · pg_policies.qual / .with_check 中直接出现的 auth.uid()
--   · is_member_of_couple() / is_partner_of() 这类 SECURITY DEFINER 辅助函数
--     内部的 auth.uid() **不改**——它们已被标记 STABLE，Postgres 自身会缓存，
--     收益不明确且改动风险高，保持克制。
--
-- 幂等：DROP POLICY IF EXISTS + CREATE POLICY 成对，可重复执行。
-- 语义：**完全等价**，仅变更求值方式，不改变任何权限判定结果。
--       ——因此本迁移不改动谁能看见/写入什么数据，只让它跑得更快。
-- ============================================================================

-- ============================================================================
-- 1. profiles
-- ============================================================================

DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
CREATE POLICY "profiles_select_policy" ON public.profiles FOR SELECT USING (
    id = (select auth.uid()) OR public.is_partner_of(id)
);

DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;
CREATE POLICY "profiles_insert_policy" ON public.profiles FOR INSERT WITH CHECK (
    id = (select auth.uid())
);

DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;
CREATE POLICY "profiles_update_policy" ON public.profiles FOR UPDATE
    USING (id = (select auth.uid()))
    WITH CHECK (id = (select auth.uid()));

-- ============================================================================
-- 2. couples
-- ============================================================================

DROP POLICY IF EXISTS "couples_insert_policy" ON public.couples;
CREATE POLICY "couples_insert_policy" ON public.couples FOR INSERT WITH CHECK (
    created_by = (select auth.uid())
);

-- ============================================================================
-- 3. couple_members
-- ============================================================================

DROP POLICY IF EXISTS "couple_members_insert_policy" ON public.couple_members;
CREATE POLICY "couple_members_insert_policy" ON public.couple_members FOR INSERT WITH CHECK (
    user_id = (select auth.uid())
);

DROP POLICY IF EXISTS "couple_members_delete_policy" ON public.couple_members;
CREATE POLICY "couple_members_delete_policy" ON public.couple_members FOR DELETE USING (
    user_id = (select auth.uid())
);

-- ============================================================================
-- 4. 共享业务表（todos / anniversaries / wishes / diaries 的 INSERT 校验）
-- ============================================================================

DROP POLICY IF EXISTS "todos_insert_policy" ON public.todos;
CREATE POLICY "todos_insert_policy" ON public.todos FOR INSERT WITH CHECK (
    public.is_member_of_couple(couple_id) AND created_by = (select auth.uid())
);

DROP POLICY IF EXISTS "anniversaries_insert_policy" ON public.anniversaries;
CREATE POLICY "anniversaries_insert_policy" ON public.anniversaries FOR INSERT WITH CHECK (
    public.is_member_of_couple(couple_id) AND created_by = (select auth.uid())
);

DROP POLICY IF EXISTS "wishes_insert_policy" ON public.wishes;
CREATE POLICY "wishes_insert_policy" ON public.wishes FOR INSERT WITH CHECK (
    public.is_member_of_couple(couple_id) AND created_by = (select auth.uid())
);

DROP POLICY IF EXISTS "diaries_insert_policy" ON public.diaries;
CREATE POLICY "diaries_insert_policy" ON public.diaries FOR INSERT WITH CHECK (
    public.is_member_of_couple(couple_id) AND author_id = (select auth.uid())
);

-- diaries 的 UPDATE：作者全权（含 0005 的伴侣追加策略均含 auth.uid()）
DROP POLICY IF EXISTS "diaries_update_policy" ON public.diaries;
CREATE POLICY "diaries_update_policy" ON public.diaries FOR UPDATE
    USING (author_id = (select auth.uid()))
    WITH CHECK (author_id = (select auth.uid()) AND public.is_member_of_couple(couple_id));

DROP POLICY IF EXISTS "diaries_author_update_delete_policy" ON public.diaries;
CREATE POLICY "diaries_author_update_delete_policy" ON public.diaries FOR ALL
    USING (author_id = (select auth.uid()));

DROP POLICY IF EXISTS "diaries_partner_append_policy" ON public.diaries;
CREATE POLICY "diaries_partner_append_policy" ON public.diaries FOR UPDATE
    USING (author_id <> (select auth.uid()) AND public.is_member_of_couple(couple_id))
    WITH CHECK (
        public.diary_body_unchanged(id, title, content, diary_date, mood, images)
    );

DROP POLICY IF EXISTS "diaries_delete_policy" ON public.diaries;
CREATE POLICY "diaries_delete_policy" ON public.diaries FOR DELETE USING (
    author_id = (select auth.uid())
);

-- love_letters（无 updated_at，仅 INSERT/DELETE）
DROP POLICY IF EXISTS "love_letters_insert_policy" ON public.love_letters;
CREATE POLICY "love_letters_insert_policy" ON public.love_letters FOR INSERT WITH CHECK (
    public.is_member_of_couple(couple_id) AND author_id = (select auth.uid())
);

DROP POLICY IF EXISTS "love_letters_delete_policy" ON public.love_letters;
CREATE POLICY "love_letters_delete_policy" ON public.love_letters FOR DELETE USING (
    author_id = (select auth.uid())
);

-- ============================================================================
-- 5. 生理期（隐私分级核心，逐条等价改写）
-- ============================================================================

DROP POLICY IF EXISTS "period_cycles_select_policy" ON public.period_cycles;
CREATE POLICY "period_cycles_select_policy" ON public.period_cycles FOR SELECT USING (
    user_id = (select auth.uid()) OR public.is_partner_of(user_id)
);

DROP POLICY IF EXISTS "period_cycles_insert_policy" ON public.period_cycles;
CREATE POLICY "period_cycles_insert_policy" ON public.period_cycles FOR INSERT WITH CHECK (
    user_id = (select auth.uid())
);

DROP POLICY IF EXISTS "period_cycles_update_policy" ON public.period_cycles;
CREATE POLICY "period_cycles_update_policy" ON public.period_cycles FOR UPDATE
    USING (user_id = (select auth.uid()))
    WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "period_cycles_delete_policy" ON public.period_cycles;
CREATE POLICY "period_cycles_delete_policy" ON public.period_cycles FOR DELETE USING (
    user_id = (select auth.uid())
);

DROP POLICY IF EXISTS "period_logs_select_policy" ON public.period_logs;
CREATE POLICY "period_logs_select_policy" ON public.period_logs FOR SELECT USING (
    user_id = (select auth.uid())
    OR (visibility = 'shared' AND public.is_partner_of(user_id))
);

DROP POLICY IF EXISTS "period_logs_insert_policy" ON public.period_logs;
CREATE POLICY "period_logs_insert_policy" ON public.period_logs FOR INSERT WITH CHECK (
    user_id = (select auth.uid())
);

DROP POLICY IF EXISTS "period_logs_update_policy" ON public.period_logs;
CREATE POLICY "period_logs_update_policy" ON public.period_logs FOR UPDATE
    USING (user_id = (select auth.uid()))
    WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "period_logs_delete_policy" ON public.period_logs;
CREATE POLICY "period_logs_delete_policy" ON public.period_logs FOR DELETE USING (
    user_id = (select auth.uid())
);

-- ============================================================================
-- 6. sticky_notes / push_subscriptions
-- ============================================================================

DROP POLICY IF EXISTS "sticky_notes_insert_policy" ON public.sticky_notes;
CREATE POLICY "sticky_notes_insert_policy" ON public.sticky_notes FOR INSERT WITH CHECK (
    public.is_member_of_couple(couple_id) AND author_id = (select auth.uid())
);

DROP POLICY IF EXISTS "sticky_notes_update_policy" ON public.sticky_notes;
CREATE POLICY "sticky_notes_update_policy" ON public.sticky_notes FOR UPDATE
    USING (author_id = (select auth.uid()))
    WITH CHECK (author_id = (select auth.uid()) AND public.is_member_of_couple(couple_id));

DROP POLICY IF EXISTS "sticky_notes_delete_policy" ON public.sticky_notes;
CREATE POLICY "sticky_notes_delete_policy" ON public.sticky_notes FOR DELETE USING (
    author_id = (select auth.uid())
);

DROP POLICY IF EXISTS "push_subscriptions_select_policy" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_select_policy" ON public.push_subscriptions FOR SELECT USING (
    user_id = (select auth.uid())
);

DROP POLICY IF EXISTS "push_subscriptions_insert_policy" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_insert_policy" ON public.push_subscriptions FOR INSERT WITH CHECK (
    user_id = (select auth.uid())
);

DROP POLICY IF EXISTS "push_subscriptions_update_policy" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_update_policy" ON public.push_subscriptions FOR UPDATE
    USING (user_id = (select auth.uid()))
    WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "push_subscriptions_delete_policy" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_delete_policy" ON public.push_subscriptions FOR DELETE USING (
    user_id = (select auth.uid())
);

-- ============================================================================
-- 7. 复核：改写后应无残留的裸 auth.uid()
-- ============================================================================

DO $$
DECLARE
    v_remaining INT;
BEGIN
    SELECT count(*) INTO v_remaining
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
          -- 裸调用（前面没有紧跟 "(select "）
          qual ~ 'auth\.uid\(\)' AND qual NOT LIKE '%(select auth.uid())%'
          OR with_check ~ 'auth\.uid\(\)' AND with_check NOT LIKE '%(select auth.uid())%'
      );
    RAISE NOTICE 'RLS 性能改写后仍含裸 auth.uid() 的策略数: %', v_remaining;
END;
$$;
