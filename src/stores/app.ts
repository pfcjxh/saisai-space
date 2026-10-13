import { ref } from 'vue';
import { defineStore } from 'pinia';

/**
 * 应用级全局状态：在线状态等。
 * IndexedDB 离线快照回退逻辑在 Phase 11 挂载于此。
 */
export const useAppStore = defineStore('app', () => {
  const isOnline = ref<boolean>(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  let bound = false;

  function bindNetworkListeners(): void {
    if (bound) return;
    bound = true;
    window.addEventListener('online', () => {
      isOnline.value = true;
    });
    window.addEventListener('offline', () => {
      isOnline.value = false;
    });
  }

  return { isOnline, bindNetworkListeners };
});
