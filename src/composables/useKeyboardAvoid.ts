import { onUnmounted, ref, watch } from 'vue';
import type { Ref } from 'vue';

/**
 * useKeyboardAvoid — 移动端虚拟键盘避让
 *
 * 抽取自 6 处逐行重复的实现（TodoCreateSheet / PeriodLogSheet / WishCreateSheet /
 * AnniversaryCreateSheet / DiaryEditorSheet / NotificationSettingSheet）。
 * NoteComposerSheet 与 LetterComposerSheet 此前**完全没有**该逻辑，而它们恰是
 * 输入内容最长的两个抽屉——现已一并接入。
 *
 * 原理：iOS Safari 弹出虚拟键盘时 `window.visualViewport.height` 会收缩，而
 * `window.innerHeight` 基本不变，两者之差即键盘占位高度。把它作为 bottom 偏移
 * 抬高抽屉，避免输入框被键盘遮挡。
 * （index.html 已声明 `interactive-widget=resizes-content`，本逻辑是双保险。）
 *
 * @param isOpen 抽屉开关的响应式来源；打开时挂监听，关闭时摘除并归零
 */
export function useKeyboardAvoid(isOpen: Ref<boolean> | (() => boolean)): Ref<number> {
  const keyboardOffset = ref(0);

  function onViewportResize(): void {
    const vv = window.visualViewport;
    keyboardOffset.value = vv ? Math.max(0, window.innerHeight - vv.height) : 0;
  }

  function attach(): void {
    window.visualViewport?.addEventListener('resize', onViewportResize);
  }

  function detach(): void {
    window.visualViewport?.removeEventListener('resize', onViewportResize);
    keyboardOffset.value = 0;
  }

  watch(
    isOpen,
    (open) => {
      if (open) attach();
      else detach();
    },
    { immediate: true },
  );

  onUnmounted(detach);

  return keyboardOffset;
}
