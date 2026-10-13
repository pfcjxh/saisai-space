import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/services/supabase';
import { clearSnapshots, setSnapshotIdentity } from '@/services/offlineStorage';

/**
 * 鉴权状态层：Supabase Auth 会话的唯一前端镜像。
 * 业务资料（profiles）与空间上下文（couple）分别由对应 store 管理。
 *
 * 同时负责**离线快照的身份指纹**：任何登录态变化都必须同步
 * offlineStorage 的当前身份，否则会读到上一位使用者的本地缓存。
 */
export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null);
  const user = ref<User | null>(null);
  /** 首次会话恢复是否完成（路由守卫据此等待） */
  const ready = ref(false);

  const isAuthenticated = computed(() => session.value !== null);

  let listenerStarted = false;

  async function ensureSession(): Promise<void> {
    if (!ready.value) {
      try {
        const { data } = await supabase.auth.getSession();
        session.value = data.session;
        user.value = data.session?.user ?? null;
      } catch {
        // getSession 失败（存储不可用 / 网络异常）不能让 ready 永远为 false，
        // 否则路由守卫会永久挂起。按未登录处理，用户仍可手动登录。
        session.value = null;
        user.value = null;
      } finally {
        ready.value = true;
        syncSnapshotIdentity();
      }
    }
    if (!listenerStarted) {
      listenerStarted = true;
      supabase.auth.onAuthStateChange((event, newSession) => {
        // 登出：先抹除当前身份的本地快照，再切换身份指纹。
        // 顺序不能反——clearSnapshots 依赖"当前身份"来定位要删的键。
        if (event === 'SIGNED_OUT') {
          void clearSnapshots();
        }
        session.value = newSession;
        user.value = newSession?.user ?? null;
        if (event !== 'SIGNED_OUT') syncSnapshotIdentity();
      });
    }
  }

  /**
   * 同步快照身份指纹。coupleId 可能晚于 user 到位（需先拉 couple_members），
   * 因此空间上下文变化时也应再调用一次——由 couple store 触发。
   */
  function syncSnapshotIdentity(coupleId: string | null = null): void {
    setSnapshotIdentity(user.value?.id ?? null, coupleId);
  }

  async function signOut(): Promise<void> {
    // 必须在 supabase.signOut 之前清理：signOut 会触发 SIGNED_OUT 事件，
    // 而快照定位依赖"登出前"的身份指纹。
    await clearSnapshots();
    await supabase.auth.signOut();
    session.value = null;
    user.value = null;
    setSnapshotIdentity(null, null);
  }

  return { session, user, ready, isAuthenticated, ensureSession, signOut, syncSnapshotIdentity };
});
