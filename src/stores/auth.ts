import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/services/supabase';

/**
 * 鉴权状态层：Supabase Auth 会话的唯一前端镜像。
 * 业务资料（profiles）与空间上下文（couple）分别由对应 store 管理。
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
      const { data } = await supabase.auth.getSession();
      session.value = data.session;
      user.value = data.session?.user ?? null;
      ready.value = true;
    }
    if (!listenerStarted) {
      listenerStarted = true;
      supabase.auth.onAuthStateChange((_event, newSession) => {
        session.value = newSession;
        user.value = newSession?.user ?? null;
      });
    }
  }

  async function signOut(): Promise<void> {
    await supabase.auth.signOut();
    session.value = null;
    user.value = null;
  }

  return { session, user, ready, isAuthenticated, ensureSession, signOut };
});
