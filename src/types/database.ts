/**
 * ============================================================================
 * database.ts — Supabase 数据库类型定义（与 migration 0001/0002 严格对齐）
 * ----------------------------------------------------------------------------
 * 手写维护，结构兼容 @supabase/supabase-js v2 的生成格式。
 * 任何 schema 变更（新迁移）必须同步更新本文件，禁止绕过类型直接拼字符串。
 *
 * 规约：
 *   - timestamptz -> string (ISO 8601)
 *   - date        -> string ('YYYY-MM-DD')
 *   - uuid        -> string
 *   - numeric     -> number
 *   - jsonb       -> Json（业务字段另有收窄别名，见文末领域类型区）
 * 严禁 any / @ts-ignore。
 * ============================================================================
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ----------------------------------------------------------------------------
// 枚举与字面值联合类型（与 DDL 中的 CHECK 约束一一对应）
// ----------------------------------------------------------------------------

export type MemberRole = 'owner' | 'partner';

export type TodoCategory = 'daily' | 'recharge' | 'bill' | 'date';

/** 待办优先级 */
export type TodoPriority = 'normal' | 'important';

export type RecurrenceRule = 'none' | 'daily' | 'weekly';

export type PeriodVisibility = 'shared' | 'private';

/** 纪念日分类（驱动图标瓷贴配色） */
export type AnniversaryCategory = 'birthday' | 'anniversary' | 'holiday' | 'life';

/** 心愿分类 */
export type WishCategory = 'travel' | 'food' | 'experience' | 'purchase';

/** 便利贴纸张色（与 sticky_notes.color CHECK 约束一致） */
export type StickyNoteColor = 'rose' | 'butter' | 'lavender' | 'mint' | 'sky';

/** 日记追加式评论（存储于 diaries.comments JSONB 数组） */
export interface DiaryComment {
  author_id: string;
  nickname: string;
  content: string;
  created_at: string;
}

/** 经量分级 1~5 */
export type FlowLevel = 1 | 2 | 3 | 4 | 5;

/** 痛感分级 0~5 */
export type PainLevel = 0 | 1 | 2 | 3 | 4 | 5;

/** 心情标记：与 CharacterAvatar 的 AvatarMood 对齐，存于 profiles.mood / diaries.mood */
export type Mood = 'calm' | 'happy' | 'tired' | 'caring' | 'sleepy';

/** 生理性别（决定生理期模块的本人/伴侣关怀视角），存于 profiles.gender */
export type Gender = 'female' | 'male';

/** 生理期症状标签（存储于 period_logs.symptoms JSONB 数组，与打卡抽屉一致） */
export type PeriodSymptom = '腰酸' | '腹胀' | '疲惫' | '嗜睡' | '胸胀' | '情绪低落';

// ----------------------------------------------------------------------------
// Database 主接口（supabase-js v2 泛型参数）
// ----------------------------------------------------------------------------

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          nickname: string;
          avatar_url: string | null;
          timezone: string;
          weather_city: string;
          weather_lat: number | null;
          weather_lon: number | null;
          mood: string | null;
          mood_updated_at: string | null;
          gender: Gender | null;
          /** 首页问候语下的自定义文案；为空时前端使用默认值 */
          love_note: string | null;
          notify_diary: boolean;
          notify_anniversary: boolean;
          notify_period: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          nickname?: string;
          avatar_url?: string | null;
          timezone?: string;
          weather_city?: string;
          weather_lat?: number | null;
          weather_lon?: number | null;
          mood?: string | null;
          mood_updated_at?: string | null;
          gender?: Gender | null;
          love_note?: string | null;
          notify_diary?: boolean;
          notify_anniversary?: boolean;
          notify_period?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          nickname?: string;
          avatar_url?: string | null;
          timezone?: string;
          weather_city?: string;
          weather_lat?: number | null;
          weather_lon?: number | null;
          mood?: string | null;
          mood_updated_at?: string | null;
          gender?: Gender | null;
          love_note?: string | null;
          notify_diary?: boolean;
          notify_anniversary?: boolean;
          notify_period?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_id_fkey';
            columns: ['id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };

      couples: {
        Row: {
          id: string;
          invite_code: string;
          relationship_started_at: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          invite_code: string;
          relationship_started_at: string;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          invite_code?: string;
          relationship_started_at?: string;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'couples_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };

      couple_members: {
        Row: {
          id: string;
          couple_id: string;
          user_id: string;
          member_role: MemberRole;
          joined_at: string;
        };
        Insert: {
          id?: string;
          couple_id: string;
          user_id: string;
          member_role: MemberRole;
          joined_at?: string;
        };
        Update: {
          id?: string;
          couple_id?: string;
          user_id?: string;
          member_role?: MemberRole;
          joined_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'couple_members_couple_id_fkey';
            columns: ['couple_id'];
            isOneToOne: false;
            referencedRelation: 'couples';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'couple_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };

      todos: {
        Row: {
          id: string;
          couple_id: string;
          title: string;
          description: string | null;
          category: TodoCategory;
          priority: TodoPriority;
          assigned_to: string | null;
          is_completed: boolean;
          recurrence_rule: RecurrenceRule;
          due_date: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          couple_id: string;
          title: string;
          description?: string | null;
          category?: TodoCategory;
          priority?: TodoPriority;
          assigned_to?: string | null;
          is_completed?: boolean;
          recurrence_rule?: RecurrenceRule;
          due_date?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          couple_id?: string;
          title?: string;
          description?: string | null;
          category?: TodoCategory;
          priority?: TodoPriority;
          assigned_to?: string | null;
          is_completed?: boolean;
          recurrence_rule?: RecurrenceRule;
          due_date?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'todos_couple_id_fkey';
            columns: ['couple_id'];
            isOneToOne: false;
            referencedRelation: 'couples';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'todos_assigned_to_fkey';
            columns: ['assigned_to'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'todos_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };

      anniversaries: {
        Row: {
          id: string;
          couple_id: string;
          title: string;
          target_date: string;
          is_lunar: boolean;
          repeat_yearly: boolean;
          category: AnniversaryCategory;
          pinned: boolean;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          couple_id: string;
          title: string;
          target_date: string;
          is_lunar?: boolean;
          repeat_yearly?: boolean;
          category?: AnniversaryCategory;
          pinned?: boolean;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          couple_id?: string;
          title?: string;
          target_date?: string;
          is_lunar?: boolean;
          repeat_yearly?: boolean;
          category?: AnniversaryCategory;
          pinned?: boolean;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'anniversaries_couple_id_fkey';
            columns: ['couple_id'];
            isOneToOne: false;
            referencedRelation: 'couples';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'anniversaries_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };

      period_cycles: {
        Row: {
          id: string;
          user_id: string;
          start_date: string;
          end_date: string | null;
          cycle_length_days: number;
          period_length_days: number;
          /** 实际录入人；与 user_id 不同时表示伴侣代录 */
          recorded_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          start_date: string;
          end_date?: string | null;
          cycle_length_days?: number;
          period_length_days?: number;
          recorded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          start_date?: string;
          end_date?: string | null;
          cycle_length_days?: number;
          period_length_days?: number;
          recorded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'period_cycles_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };

      period_logs: {
        Row: {
          id: string;
          cycle_id: string | null;
          user_id: string;
          log_date: string;
          flow_level: FlowLevel | null;
          pain_level: PainLevel | null;
          mood: string | null;
          symptoms: Json;
          visibility: PeriodVisibility;
          notes: string | null;
          /** 实际录入人；与 user_id 不同时表示伴侣代录 */
          recorded_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cycle_id?: string | null;
          user_id: string;
          log_date: string;
          flow_level?: FlowLevel | null;
          pain_level?: PainLevel | null;
          mood?: string | null;
          symptoms?: Json;
          visibility?: PeriodVisibility;
          notes?: string | null;
          recorded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cycle_id?: string | null;
          user_id?: string;
          log_date?: string;
          flow_level?: FlowLevel | null;
          pain_level?: PainLevel | null;
          mood?: string | null;
          symptoms?: Json;
          visibility?: PeriodVisibility;
          notes?: string | null;
          recorded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'period_logs_cycle_id_fkey';
            columns: ['cycle_id'];
            isOneToOne: false;
            referencedRelation: 'period_cycles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'period_logs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };

      wishes: {
        Row: {
          id: string;
          couple_id: string;
          title: string;
          description: string | null;
          is_fulfilled: boolean;
          fulfilled_at: string | null;
          image_path: string | null;
          category: WishCategory;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          couple_id: string;
          title: string;
          description?: string | null;
          is_fulfilled?: boolean;
          fulfilled_at?: string | null;
          image_path?: string | null;
          category?: WishCategory;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          couple_id?: string;
          title?: string;
          description?: string | null;
          is_fulfilled?: boolean;
          fulfilled_at?: string | null;
          image_path?: string | null;
          category?: WishCategory;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'wishes_couple_id_fkey';
            columns: ['couple_id'];
            isOneToOne: false;
            referencedRelation: 'couples';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'wishes_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };

      diaries: {
        Row: {
          id: string;
          couple_id: string;
          author_id: string;
          diary_date: string;
          title: string | null;
          content: string;
          mood: string | null;
          images: Json;
          liked_by: string[];
          comments: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          couple_id: string;
          author_id: string;
          diary_date: string;
          title?: string | null;
          content: string;
          mood?: string | null;
          images?: Json;
          liked_by?: string[];
          comments?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          couple_id?: string;
          author_id?: string;
          diary_date?: string;
          title?: string | null;
          content?: string;
          mood?: string | null;
          images?: Json;
          liked_by?: string[];
          comments?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'diaries_couple_id_fkey';
            columns: ['couple_id'];
            isOneToOne: false;
            referencedRelation: 'couples';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'diaries_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };

      love_letters: {
        Row: {
          id: string;
          couple_id: string;
          author_id: string;
          title: string;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          couple_id: string;
          author_id: string;
          title?: string;
          body: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          couple_id?: string;
          author_id?: string;
          title?: string;
          body?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'love_letters_couple_id_fkey';
            columns: ['couple_id'];
            isOneToOne: false;
            referencedRelation: 'couples';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'love_letters_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };

      sticky_notes: {
        Row: {
          id: string;
          couple_id: string;
          author_id: string;
          color: StickyNoteColor;
          content: string;
          pinned: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          couple_id: string;
          author_id: string;
          color?: StickyNoteColor;
          content: string;
          pinned?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          couple_id?: string;
          author_id?: string;
          color?: StickyNoteColor;
          content?: string;
          pinned?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sticky_notes_couple_id_fkey';
            columns: ['couple_id'];
            isOneToOne: false;
            referencedRelation: 'couples';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sticky_notes_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };

      couple_settings: {
        Row: {
          couple_id: string;
          /** 是否允许伴侣代为录入生理期数据 */
          allow_proxy_period_write: boolean;
          /** 是否允许伴侣修改自己的资料（昵称/城市） */
          allow_proxy_profile_edit: boolean;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          couple_id: string;
          allow_proxy_period_write?: boolean;
          allow_proxy_profile_edit?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          couple_id?: string;
          allow_proxy_period_write?: boolean;
          allow_proxy_profile_edit?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'couple_settings_couple_id_fkey';
            columns: ['couple_id'];
            isOneToOne: true;
            referencedRelation: 'couples';
            referencedColumns: ['id'];
          },
        ];
      };

      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          endpoint?: string;
          p256dh?: string;
          auth?: string;
          user_agent?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'push_subscriptions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };

    Views: Record<never, never>;

    Functions: {
      /** 创建双人空间并写入 owner 成员（原子），返回 couple_id */
      create_couple_with_membership: {
        Args: { p_relationship_started_at: string };
        Returns: string;
      };
      /** 凭 6 位邀请码加入空间，返回 couple_id；异常以 raise exception 抛出 */
      join_couple_by_invite: {
        Args: { p_invite_code: string };
        Returns: string;
      };
      /** 当前用户是否为指定空间成员 */
      is_member_of_couple: {
        Args: { c_id: string };
        Returns: boolean;
      };
      /** 目标用户是否与当前用户处于同一空间 */
      is_partner_of: {
        Args: { target_user: string };
        Returns: boolean;
      };
    };

    Enums: Record<never, never>;

    CompositeTypes: Record<never, never>;
  };
}

// ----------------------------------------------------------------------------
// 便捷提取类型
// ----------------------------------------------------------------------------

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

// ----------------------------------------------------------------------------
// 领域实体别名（services / repositories 层统一引用，禁止页面层重新定义）
// ----------------------------------------------------------------------------

export type Profile = Tables<'profiles'>;
export type Couple = Tables<'couples'>;
export type CoupleMember = Tables<'couple_members'>;
export type Todo = Tables<'todos'>;
export type Anniversary = Tables<'anniversaries'>;
export type PeriodCycle = Tables<'period_cycles'>;
export type PeriodLog = Tables<'period_logs'>;
export type Wish = Tables<'wishes'>;
export type Diary = Tables<'diaries'>;
export type LoveLetter = Tables<'love_letters'>;
export type StickyNote = Tables<'sticky_notes'>;
export type PushSubscription = Tables<'push_subscriptions'>;

// ----------------------------------------------------------------------------
// 业务组合类型（含伴侣信息联查等高频形态）
// ----------------------------------------------------------------------------

/** 携作者公开资料的日记条目 */
export interface DiaryWithAuthor extends Diary {
  author: Pick<Profile, 'id' | 'nickname' | 'avatar_url'>;
}

/** 携指派人公开资料的待办条目 */
export interface TodoWithAssignee extends Todo {
  assignee: Pick<Profile, 'id' | 'nickname' | 'avatar_url'> | null;
}

/** 当前用户的空间上下文：空间 + 本人角色 + 伴侣资料（未配对时为 null） */
export interface CoupleContext {
  couple: Couple;
  myRole: MemberRole;
  partner: Profile | null;
}

/** 症状数组的类型化读取视图（DB 层为 Json，service 层解析后收窄） */
export type PeriodSymptomList = PeriodSymptom[];

/** 日记图片数组的类型化读取视图：Storage 对象路径列表 */
export type DiaryImageList = string[];
