import { ref } from 'vue';
import type { Ref } from 'vue';

/**
 * useSwipeActions — 列表项左滑呼出操作区
 *
 * 抽取自 4 处逐行重复的实现（TodoItemCard / PeriodHistoryCard / WishCard /
 * AnniversaryCard），它们此前各自维护一份完全相同的常量与手势状态机。
 *
 * 手势语义（与既有行为保持一致，避免回归）：
 *   · 8px 方向锁：超过 8px 才判定横/纵，防止纵向滚动被误判为横滑；
 *   · 判定为横向后 preventDefault，阻止页面跟随滚动；
 *   · 位移钳制在 [-actionWidth, 0]；
 *   · 松手时超过 snapThreshold 吸附到展开态，否则回弹收起。
 *
 * 用 Pointer Events 而非 Touch Events：一套代码同时覆盖触摸、鼠标与触控笔，
 * 桌面端调试时也能直接拖动（此前只能用触摸事件，桌面无法验证手势）。
 */
export interface SwipeActionsOptions {
  /** 操作区宽度（px），需与模板中操作区实际宽度一致 */
  actionWidth?: number;
  /** 松手后吸附到展开态的位移阈值（px，取绝对值） */
  snapThreshold?: number;
  /** 方向锁阈值（px） */
  directionLock?: number;
  /** 展开 / 收起时回调，便于父级做互斥（同一时刻只允许一项展开） */
  onOpenChange?: (open: boolean) => void;
}

export interface SwipeActionsReturn {
  /** 内容层当前横向位移（负值向左），绑定到 transform: translateX() */
  offsetX: Ref<number>;
  /** 是否处于吸附动画中（true 时挂 transition 类） */
  settling: Ref<boolean>;
  /** 当前是否展开 */
  isOpen: Ref<boolean>;
  /** 手动收起（点击操作按钮后调用） */
  close: () => void;
  /** 手动展开 */
  open: () => void;
  /** 手势事件绑定（v-on 展开使用） */
  handlers: {
    onPointerdown: (e: PointerEvent) => void;
    onPointermove: (e: PointerEvent) => void;
    onPointerup: (e: PointerEvent) => void;
    onPointercancel: (e: PointerEvent) => void;
  };
}

export function useSwipeActions(options: SwipeActionsOptions = {}): SwipeActionsReturn {
  const actionWidth = options.actionWidth ?? 144;
  const snapThreshold = options.snapThreshold ?? 70;
  const directionLock = options.directionLock ?? 8;

  const offsetX = ref(0);
  const settling = ref(false);
  const isOpen = ref(false);

  let startX = 0;
  let startY = 0;
  let baseOffset = 0;
  let direction: 'unknown' | 'horizontal' | 'vertical' = 'unknown';
  let active = false;

  function setOpen(next: boolean): void {
    if (isOpen.value === next) return;
    isOpen.value = next;
    options.onOpenChange?.(next);
  }

  function onPointerdown(e: PointerEvent): void {
    // 仅响应主键（鼠标左键 / 触摸 / 笔尖），忽略右键与多指
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    active = true;
    startX = e.clientX;
    startY = e.clientY;
    baseOffset = offsetX.value;
    direction = 'unknown';
    settling.value = false;
  }

  function onPointermove(e: PointerEvent): void {
    if (!active) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (direction === 'unknown') {
      if (Math.abs(dx) > directionLock || Math.abs(dy) > directionLock) {
        direction = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
      }
      return;
    }
    if (direction !== 'horizontal') return;
    // 阻止页面跟随横滑（被动监听无法阻止，故模板中不可加 .passive）
    if (e.cancelable) e.preventDefault();
    offsetX.value = Math.min(0, Math.max(-actionWidth, baseOffset + dx));
  }

  function onPointerup(): void {
    if (!active) return;
    active = false;
    if (direction !== 'horizontal') return;
    settling.value = true;
    const shouldOpen = offsetX.value < -snapThreshold;
    offsetX.value = shouldOpen ? -actionWidth : 0;
    setOpen(shouldOpen);
  }

  function onPointercancel(): void {
    // 指针被系统取消（来电、手势冲突）时回到收起态，避免卡在中间位置
    if (!active) return;
    active = false;
    if (direction !== 'horizontal') return;
    settling.value = true;
    offsetX.value = 0;
    setOpen(false);
  }

  function close(): void {
    settling.value = true;
    offsetX.value = 0;
    setOpen(false);
  }

  function open(): void {
    settling.value = true;
    offsetX.value = -actionWidth;
    setOpen(true);
  }

  return {
    offsetX,
    settling,
    isOpen,
    close,
    open,
    handlers: { onPointerdown, onPointermove, onPointerup, onPointercancel },
  };
}
