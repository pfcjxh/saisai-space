-- ============================================================================
-- Migration: 0001_init_schema
-- Project  : 双人私密空间 PWA (Couple Space)
-- Phase    : 1 — Supabase Schema / Trigger / RLS
-- 说明     : 本脚本可在 Supabase SQL Editor 一次性执行，亦可经由
--            `supabase db push` 作为迁移应用。全程幂等性由迁移工具保证，
--            请勿在已应用过的项目上重复手动执行。
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. 基础表结构 (DDL)
-- ============================================================================

-- 1.1 用户业务资料表（id 强绑定 auth.users，级联删除）
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nickname TEXT NOT NULL DEFAULT '伴侣',
    avatar_url TEXT,
    timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    weather_city TEXT NOT NULL DEFAULT '广州',
    weather_lat NUMERIC(8, 4),
    weather_lon NUMERIC(8, 4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.2 情侣空间表
CREATE TABLE public.couples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invite_code VARCHAR(8) UNIQUE NOT NULL,
    relationship_started_at DATE NOT NULL,
    created_by UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.3 情侣空间成员关联表（单用户同时仅属于一个活跃空间）
CREATE TABLE public.couple_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    couple_id UUID NOT NULL REFERENCES public.couples(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    member_role TEXT NOT NULL CHECK (member_role IN ('owner', 'partner')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(couple_id, user_id),
    UNIQUE(user_id)
);

-- 1.4 共享待办事项表
CREATE TABLE public.todos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    couple_id UUID NOT NULL REFERENCES public.couples(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'daily' CHECK (category IN ('daily', 'recharge', 'bill', 'date')),
    assigned_to UUID REFERENCES public.profiles(id),
    is_completed BOOLEAN NOT NULL DEFAULT false,
    recurrence_rule TEXT NOT NULL DEFAULT 'none' CHECK (recurrence_rule IN ('none', 'daily', 'weekly')),
    due_date TIMESTAMPTZ,
    created_by UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.5 纪念日表
CREATE TABLE public.anniversaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    couple_id UUID NOT NULL REFERENCES public.couples(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    target_date DATE NOT NULL,
    is_lunar BOOLEAN NOT NULL DEFAULT false,
    repeat_yearly BOOLEAN NOT NULL DEFAULT true,
    created_by UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.6 生理期周期基础表（非医疗推算参考）
CREATE TABLE public.period_cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE,
    cycle_length_days INT NOT NULL DEFAULT 28 CHECK (cycle_length_days BETWEEN 15 AND 90),
    period_length_days INT NOT NULL DEFAULT 5 CHECK (period_length_days BETWEEN 1 AND 15),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.7 生理期单日明细与症状打卡表（含 visibility 隐私分级）
CREATE TABLE public.period_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id UUID REFERENCES public.period_cycles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    log_date DATE NOT NULL,
    flow_level INT CHECK (flow_level BETWEEN 1 AND 5),
    pain_level INT CHECK (pain_level BETWEEN 0 AND 5),
    mood TEXT,
    symptoms JSONB NOT NULL DEFAULT '[]'::jsonb,
    visibility TEXT NOT NULL DEFAULT 'shared' CHECK (visibility IN ('shared', 'private')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, log_date)
);

-- 1.8 心愿单表
CREATE TABLE public.wishes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    couple_id UUID NOT NULL REFERENCES public.couples(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    is_fulfilled BOOLEAN NOT NULL DEFAULT false,
    fulfilled_at TIMESTAMPTZ,
    image_path TEXT,
    created_by UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.9 共享日记表
CREATE TABLE public.diaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    couple_id UUID NOT NULL REFERENCES public.couples(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    diary_date DATE NOT NULL,
    title TEXT,
    content TEXT NOT NULL,
    mood TEXT,
    images JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.10 Web Push 推送凭据订阅表
CREATE TABLE public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2. 查询性能索引（外键与高频过滤字段）
-- ============================================================================

CREATE INDEX idx_couple_members_couple_id   ON public.couple_members(couple_id);
CREATE INDEX idx_todos_couple_id            ON public.todos(couple_id);
CREATE INDEX idx_todos_couple_pending       ON public.todos(couple_id, is_completed) WHERE is_completed = false;
CREATE INDEX idx_todos_assigned_to          ON public.todos(assigned_to);
CREATE INDEX idx_anniversaries_couple_date  ON public.anniversaries(couple_id, target_date);
CREATE INDEX idx_period_cycles_user_start   ON public.period_cycles(user_id, start_date DESC);
CREATE INDEX idx_period_logs_cycle_id       ON public.period_logs(cycle_id);
CREATE INDEX idx_period_logs_user_date      ON public.period_logs(user_id, log_date DESC);
CREATE INDEX idx_wishes_couple_id           ON public.wishes(couple_id);
CREATE INDEX idx_diaries_couple_date        ON public.diaries(couple_id, diary_date DESC);
CREATE INDEX idx_diaries_author_id          ON public.diaries(author_id);

-- ============================================================================
-- 3. 通用函数
-- ============================================================================

-- 3.1 updated_at 自更新触发器函数
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- 3.2 注册后自动建档（auth.users -> public.profiles）
--     SECURITY DEFINER：以函数属主身份执行，绕过 profiles 的 RLS 插入限制。
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, nickname, avatar_url)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data ->> 'nickname', '伴侣'),
        NEW.raw_user_meta_data ->> 'avatar_url'
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3.3 邀请码生成：6 位字母数字（剔除易混淆字符 0/O/1/I/L），全局唯一
--     SECURITY DEFINER：唯一性检查需扫描全表 couples，不能受 RLS 可见性限制。
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_chars TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    v_code  TEXT;
BEGIN
    LOOP
        v_code := '';
        FOR i IN 1..6 LOOP
            v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
        END LOOP;
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.couples WHERE invite_code = v_code);
    END LOOP;
    RETURN v_code;
END;
$$;

-- 3.4 成员归属判断（RLS 辅助，防递归核心）
--     SECURITY DEFINER + STABLE：策略内调用时以属主身份直读 couple_members，
--     避免"策略查询自身表"导致的无限递归。
CREATE OR REPLACE FUNCTION public.is_member_of_couple(c_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.couple_members
        WHERE couple_id = c_id AND user_id = auth.uid()
    );
$$;

-- 3.5 伴侣关系判断：目标用户是否与当前用户处于同一空间
CREATE OR REPLACE FUNCTION public.is_partner_of(target_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.couple_members m1
        JOIN public.couple_members m2 ON m1.couple_id = m2.couple_id
        WHERE m1.user_id = auth.uid() AND m2.user_id = target_user
    );
$$;

-- ============================================================================
-- 4. 原子化业务流程 RPC（SECURITY DEFINER，供客户端 supabase.rpc() 调用）
-- ============================================================================

-- 4.1 创建双人空间：建空间 + 写入 owner 成员，单事务原子完成。
--     客户端严禁分两步裸写（避免"空间已建但成员未绑定"的孤儿空间）。
CREATE OR REPLACE FUNCTION public.create_couple_with_membership(p_relationship_started_at DATE)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_couple_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;
    IF EXISTS (SELECT 1 FROM public.couple_members WHERE user_id = auth.uid()) THEN
        RAISE EXCEPTION 'already_in_couple';
    END IF;

    INSERT INTO public.couples (invite_code, relationship_started_at, created_by)
    VALUES (public.generate_invite_code(), p_relationship_started_at, auth.uid())
    RETURNING id INTO v_couple_id;

    INSERT INTO public.couple_members (couple_id, user_id, member_role)
    VALUES (v_couple_id, auth.uid(), 'owner');

    RETURN v_couple_id;
END;
$$;

-- 4.2 凭邀请码加入空间：
--     非成员受 RLS 限制无法 SELECT couples，必须由此 RPC 完成
--     "校验邀请码 -> 校验空位(<=2) -> 写入 partner 成员"的原子闭环。
CREATE OR REPLACE FUNCTION public.join_couple_by_invite(p_invite_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_couple_id    UUID;
    v_member_count INT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;
    IF EXISTS (SELECT 1 FROM public.couple_members WHERE user_id = auth.uid()) THEN
        RAISE EXCEPTION 'already_in_couple';
    END IF;

    SELECT id INTO v_couple_id
    FROM public.couples
    WHERE invite_code = upper(trim(p_invite_code));
    IF NOT FOUND THEN
        RAISE EXCEPTION 'invalid_invite_code';
    END IF;

    SELECT count(*) INTO v_member_count
    FROM public.couple_members
    WHERE couple_id = v_couple_id;
    IF v_member_count >= 2 THEN
        RAISE EXCEPTION 'couple_is_full';
    END IF;

    INSERT INTO public.couple_members (couple_id, user_id, member_role)
    VALUES (v_couple_id, auth.uid(), 'partner');

    RETURN v_couple_id;
END;
$$;

-- ============================================================================
-- 5. updated_at 触发器绑定
-- ============================================================================

CREATE TRIGGER set_profiles_updated_at       BEFORE UPDATE ON public.profiles       FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_couples_updated_at        BEFORE UPDATE ON public.couples        FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_todos_updated_at          BEFORE UPDATE ON public.todos          FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_anniversaries_updated_at  BEFORE UPDATE ON public.anniversaries  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_period_cycles_updated_at  BEFORE UPDATE ON public.period_cycles  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_period_logs_updated_at    BEFORE UPDATE ON public.period_logs    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_wishes_updated_at         BEFORE UPDATE ON public.wishes         FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_diaries_updated_at        BEFORE UPDATE ON public.diaries        FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 6. Row Level Security
-- ============================================================================

ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.couples            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.couple_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anniversaries      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.period_cycles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.period_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diaries            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- 6.1 profiles：本人读写；同空间伴侣只读公开资料
CREATE POLICY "profiles_select_policy" ON public.profiles FOR SELECT USING (
    id = auth.uid() OR public.is_partner_of(id)
);
CREATE POLICY "profiles_insert_policy" ON public.profiles FOR INSERT WITH CHECK (
    id = auth.uid()
);
CREATE POLICY "profiles_update_policy" ON public.profiles FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- 6.2 couples：仅成员可见/可改；创建者必须为本人
--     （业务上请优先走 create_couple_with_membership RPC）
CREATE POLICY "couples_select_policy" ON public.couples FOR SELECT USING (
    public.is_member_of_couple(id)
);
CREATE POLICY "couples_insert_policy" ON public.couples FOR INSERT WITH CHECK (
    created_by = auth.uid()
);
CREATE POLICY "couples_update_policy" ON public.couples FOR UPDATE
    USING (public.is_member_of_couple(id))
    WITH CHECK (public.is_member_of_couple(id));

-- 6.3 couple_members：成员可读本空间名单；仅可写入/移除本人成员行
--     SELECT 走 SECURITY DEFINER 辅助函数，规避自引用递归
CREATE POLICY "couple_members_select_policy" ON public.couple_members FOR SELECT USING (
    public.is_member_of_couple(couple_id)
);
CREATE POLICY "couple_members_insert_policy" ON public.couple_members FOR INSERT WITH CHECK (
    user_id = auth.uid()
);
CREATE POLICY "couple_members_delete_policy" ON public.couple_members FOR DELETE USING (
    user_id = auth.uid()
);

-- 6.4 共享业务表（todos / anniversaries / wishes）：
--     空间成员全权读写删；写入时强制 created_by 为本人，防伪造归属
CREATE POLICY "todos_select_policy" ON public.todos FOR SELECT USING (
    public.is_member_of_couple(couple_id)
);
CREATE POLICY "todos_insert_policy" ON public.todos FOR INSERT WITH CHECK (
    public.is_member_of_couple(couple_id) AND created_by = auth.uid()
);
CREATE POLICY "todos_update_policy" ON public.todos FOR UPDATE
    USING (public.is_member_of_couple(couple_id))
    WITH CHECK (public.is_member_of_couple(couple_id));
CREATE POLICY "todos_delete_policy" ON public.todos FOR DELETE USING (
    public.is_member_of_couple(couple_id)
);

CREATE POLICY "anniversaries_select_policy" ON public.anniversaries FOR SELECT USING (
    public.is_member_of_couple(couple_id)
);
CREATE POLICY "anniversaries_insert_policy" ON public.anniversaries FOR INSERT WITH CHECK (
    public.is_member_of_couple(couple_id) AND created_by = auth.uid()
);
CREATE POLICY "anniversaries_update_policy" ON public.anniversaries FOR UPDATE
    USING (public.is_member_of_couple(couple_id))
    WITH CHECK (public.is_member_of_couple(couple_id));
CREATE POLICY "anniversaries_delete_policy" ON public.anniversaries FOR DELETE USING (
    public.is_member_of_couple(couple_id)
);

CREATE POLICY "wishes_select_policy" ON public.wishes FOR SELECT USING (
    public.is_member_of_couple(couple_id)
);
CREATE POLICY "wishes_insert_policy" ON public.wishes FOR INSERT WITH CHECK (
    public.is_member_of_couple(couple_id) AND created_by = auth.uid()
);
CREATE POLICY "wishes_update_policy" ON public.wishes FOR UPDATE
    USING (public.is_member_of_couple(couple_id))
    WITH CHECK (public.is_member_of_couple(couple_id));
CREATE POLICY "wishes_delete_policy" ON public.wishes FOR DELETE USING (
    public.is_member_of_couple(couple_id)
);

-- 6.5 diaries：空间成员可读；仅作者本人可写/删/改
--     UPDATE 的 WITH CHECK 同时锁定 author_id 与 couple_id 不可被篡改转移
CREATE POLICY "diaries_select_policy" ON public.diaries FOR SELECT USING (
    public.is_member_of_couple(couple_id)
);
CREATE POLICY "diaries_insert_policy" ON public.diaries FOR INSERT WITH CHECK (
    public.is_member_of_couple(couple_id) AND author_id = auth.uid()
);
CREATE POLICY "diaries_update_policy" ON public.diaries FOR UPDATE
    USING (author_id = auth.uid())
    WITH CHECK (author_id = auth.uid() AND public.is_member_of_couple(couple_id));
CREATE POLICY "diaries_delete_policy" ON public.diaries FOR DELETE USING (
    author_id = auth.uid()
);

-- 6.6 period_cycles：本人全权；伴侣只读基础周期统计
--     （需求规格原稿为 FOR ALL，会使伴侣获得写权限，此处按权限矩阵拆分为只读）
CREATE POLICY "period_cycles_select_policy" ON public.period_cycles FOR SELECT USING (
    user_id = auth.uid() OR public.is_partner_of(user_id)
);
CREATE POLICY "period_cycles_insert_policy" ON public.period_cycles FOR INSERT WITH CHECK (
    user_id = auth.uid()
);
CREATE POLICY "period_cycles_update_policy" ON public.period_cycles FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
CREATE POLICY "period_cycles_delete_policy" ON public.period_cycles FOR DELETE USING (
    user_id = auth.uid()
);

-- 6.7 period_logs：隐私分级核心
--     SELECT：本人全量可见；伴侣仅可见 visibility = 'shared' 的记录，
--             private 记录在数据库底层即被拦截，前端无法以任何方式获取。
--     写/删：仅本人。
CREATE POLICY "period_logs_select_policy" ON public.period_logs FOR SELECT USING (
    user_id = auth.uid()
    OR (visibility = 'shared' AND public.is_partner_of(user_id))
);
CREATE POLICY "period_logs_insert_policy" ON public.period_logs FOR INSERT WITH CHECK (
    user_id = auth.uid()
);
CREATE POLICY "period_logs_update_policy" ON public.period_logs FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
CREATE POLICY "period_logs_delete_policy" ON public.period_logs FOR DELETE USING (
    user_id = auth.uid()
);

-- 6.8 push_subscriptions：仅本人可管理推送凭据
CREATE POLICY "push_subscriptions_select_policy" ON public.push_subscriptions FOR SELECT USING (
    user_id = auth.uid()
);
CREATE POLICY "push_subscriptions_insert_policy" ON public.push_subscriptions FOR INSERT WITH CHECK (
    user_id = auth.uid()
);
CREATE POLICY "push_subscriptions_update_policy" ON public.push_subscriptions FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
CREATE POLICY "push_subscriptions_delete_policy" ON public.push_subscriptions FOR DELETE USING (
    user_id = auth.uid()
);

-- ============================================================================
-- 7. 函数执行权限收敛
-- ============================================================================

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_invite_code() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_couple_with_membership(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_couple_by_invite(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_member_of_couple(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_partner_of(UUID) TO authenticated;
