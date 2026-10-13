import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { CoupleContext } from '@/types/database';

/**
 * 双人空间上下文：空间信息 + 本人角色 + 伴侣资料。
 * 具体加载与 Realtime 订阅逻辑在 Phase 4/6 由 services/coupleService 填充。
 */
export const useCoupleStore = defineStore('couple', () => {
  const context = ref<CoupleContext | null>(null);

  const isPaired = computed(() => context.value?.partner != null);
  const coupleId = computed(() => context.value?.couple.id ?? null);

  function setContext(next: CoupleContext | null): void {
    context.value = next;
  }

  function reset(): void {
    context.value = null;
  }

  return { context, isPaired, coupleId, setContext, reset };
});
