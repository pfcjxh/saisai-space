-- ============================================================================
-- Migration: 0007_profile_gender_trigger
-- 说明：注册时前端通过 user_metadata 传入 nickname 与 gender；
--       原 handle_new_user 仅落昵称，性别丢失（导致生理期模块视角默认错误）。
--       本迁移扩展触发器同步写入合法性别值（非法/缺省回落 NULL）。
-- 幂等：CREATE OR REPLACE，可重复执行。
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, nickname, avatar_url, gender)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data ->> 'nickname', '伴侣'),
        NEW.raw_user_meta_data ->> 'avatar_url',
        CASE
            WHEN NEW.raw_user_meta_data ->> 'gender' IN ('female', 'male')
            THEN NEW.raw_user_meta_data ->> 'gender'
            ELSE NULL
        END
    );
    RETURN NEW;
END;
$$;