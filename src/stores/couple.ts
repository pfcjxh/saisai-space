import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { CoupleContext } from '@/types/database';
import { useAuthStore } from '@/stores/auth';

/**
 * 双人空间上下文：空间信息 + 本人角色 + 伴侣资料。
 *
 * 空间上下文到位后必须同步离线快照的身份指纹（user + couple），
 * 否则离线缓存会跨空间串数据。
 */
export const useCoupleStore = defineStore('couple', () => {
  const context = ref<CoupleContext | null>(null);

  const isPaired = computed(() => context.value?.partner != null);
  const coupleId = computed(() => context.value?.couple.id ?? null);

  function setContext(next: CoupleContext | null): void {
    context.value = next;
    // 空间 id 变化 → 快照命名空间随之切换
    useAuthStore().syncSnapshotIdentity(next?.couple.id ?? null);
  }

  function reset(): void {
    context.value = null;
    useAuthStore().syncSnapshotIdentity(null);
  }

  return { context, isPaired, coupleId, setContext, reset };
});
