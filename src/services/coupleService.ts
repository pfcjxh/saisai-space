import { supabase } from './supabase';
import type { Couple, CoupleContext, Profile } from '@/types/database';

/** 创建双人空间并写入 owner 成员（RPC 原子事务），返回 couple_id */
export async function createCoupleWithMembership(startedAt: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_couple_with_membership', {
    p_relationship_started_at: startedAt,
  });
  if (error) throw error;
  return data;
}

/** 凭邀请码加入空间（RPC 原子事务），返回 couple_id */
export async function joinCoupleByInvite(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_couple_by_invite', {
    p_invite_code: code.trim().toUpperCase(),
  });
  if (error) throw error;
  return data;
}

/** 配对流程错误文案本地化（RPC 以 raise exception 文本回传） */
export function mapCoupleError(message: string): string {
  if (message.includes('already_in_couple')) return '你已经在一个双人空间里了';
  if (message.includes('invalid_invite_code')) return '邀请码不正确，请核对后重试';
  if (message.includes('couple_is_full')) return '这个空间已经满员了';
  if (message.includes('not_authenticated')) return '登录状态失效，请重新登录';
  return message;
}

/**
 * 更新「在一起的日子」。
 *
 * 原实现只允许在创建空间时设定一次，之后无法修改，导致填错就永久将错就错。
 * RLS 侧 `couples_update_policy` 已允许任一成员更新，此处只补业务封装。
 */
export async function updateRelationshipStartedAt(
  coupleId: string,
  startedAt: string,
): Promise<Couple> {
  const { data, error } = await supabase
    .from('couples')
    .update({ relationship_started_at: startedAt })
    .eq('id', coupleId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * 读取当前用户的情侣空间上下文：空间信息 + 本人角色 + 伴侣资料。
 * 未加入任何空间时返回 null。
 * 查询收敛为三次并行/串行请求，无 N+1。
 */
export async function fetchCoupleContext(userId: string): Promise<CoupleContext | null> {
  const { data: membership, error } = await supabase
    .from('couple_members')
    .select('couple_id, member_role')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!membership) return null;

  const [coupleResult, membersResult] = await Promise.all([
    supabase.from('couples').select('*').eq('id', membership.couple_id).single(),
    supabase.from('couple_members').select('user_id').eq('couple_id', membership.couple_id),
  ]);
  if (coupleResult.error) throw coupleResult.error;
  if (membersResult.error) throw membersResult.error;

  const partnerId =
    (membersResult.data ?? []).find((m) => m.user_id !== userId)?.user_id ?? null;

  let partner: Profile | null = null;
  if (partnerId) {
    const { data, error: partnerError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', partnerId)
      .maybeSingle();
    if (partnerError) throw partnerError;
    partner = data;
  }

  return { couple: coupleResult.data, myRole: membership.member_role, partner };
}
