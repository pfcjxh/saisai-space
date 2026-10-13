/**
 * 在途写入追踪（In-flight write tracking）
 *
 * 解决的问题：乐观更新与 Realtime 回环互相覆盖。
 *
 * 场景：用户勾选待办 → 本地立刻划线（乐观更新）→ 请求飞在路上。此刻
 * Realtime 把「服务端尚未更新的旧值」推回来（这类事件既可能是自己写入的
 * 回环，也可能是伴侣端触发的广播），若直接套用就会把乐观值冲掉，
 * 界面出现「勾上又弹回、再自己变回来」的闪烁。
 *
 * 解法（借鉴 mina-gharzi/kanban-app 的 mutationQueue 思路，按其思想重写）：
 *   · 每次发起写入前登记「哪个作用域下的哪些 id 正在途」，返回一个
 *     **恰好释放一次** 的 release 函数（引用计数，支持嵌套）；
 *   · Realtime 回调进来先问 hasInflight()：有在途写入就丢弃该事件，
 *     以本地乐观值为准；
 *   · 写入落定（成功或失败）后释放，之后的事件正常套用。
 *
 * 注意：Realtime 本身不重放丢失事件，断线期间的改动仍需重新拉取对齐，
 * 本模块只负责「抑制回环覆盖」，不承担最终一致性。
 */

/** scope -> (id -> 引用计数) */
const registry = new Map<string, Map<string, number>>();

/**
 * 作用域级抑制计数。
 * 用于 INSERT 这类「服务端生成 id、客户端事先不知道」的写入：登记空 id 集合时
 * 提升整个作用域的抑制级别，期间该作用域的所有远端事件一律忽略。
 */
const scopeWide = new Map<string, number>();

/** 组装作用域键：同一业务域下不同空间互不干扰 */
export function writeScope(domain: string, coupleId: string | null): string {
  return `${domain}:${coupleId ?? 'mock'}`;
}

/**
 * 登记在途写入，返回释放函数。
 * 释放函数幂等——重复调用只生效一次，避免误减计数导致抑制失效。
 *
 * 传空 id 数组表示「作用域级抑制」（用于事先不知 id 的 INSERT）。
 */
export function trackWrite(scope: string, ids: readonly string[]): () => void {
  if (ids.length === 0) {
    scopeWide.set(scope, (scopeWide.get(scope) ?? 0) + 1);
  } else {
    let bucket = registry.get(scope);
    if (!bucket) {
      bucket = new Map();
      registry.set(scope, bucket);
    }
    for (const id of ids) {
      bucket.set(id, (bucket.get(id) ?? 0) + 1);
    }
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;

    if (ids.length === 0) {
      const count = scopeWide.get(scope);
      if (count === undefined) return;
      if (count <= 1) scopeWide.delete(scope);
      else scopeWide.set(scope, count - 1);
      return;
    }

    const current = registry.get(scope);
    if (!current) return;
    for (const id of ids) {
      const count = current.get(id);
      if (count === undefined) continue;
      if (count <= 1) current.delete(id);
      else current.set(id, count - 1);
    }
    // 作用域空了就删掉，避免长期运行后 Map 无限增长
    if (current.size === 0) registry.delete(scope);
  };
}

/** 指定的 id 中是否有任意一个正在途写入（含作用域级抑制） */
export function hasInflight(scope: string, ids: readonly string[]): boolean {
  if ((scopeWide.get(scope) ?? 0) > 0) return true;
  const bucket = registry.get(scope);
  if (!bucket) return false;
  return ids.some((id) => (bucket.get(id) ?? 0) > 0);
}

/** 当前作用域的在途 id 数量（调试用，不含作用域级抑制） */
export function inflightCount(scope: string): number {
  return registry.get(scope)?.size ?? 0;
}

/** 当前作用域是否处于作用域级抑制中 */
export function isScopeSuppressed(scope: string): boolean {
  return (scopeWide.get(scope) ?? 0) > 0;
}

/** 清空指定作用域（组件卸载 / 切换空间时调用） */
export function clearScope(scope: string): void {
  registry.delete(scope);
  scopeWide.delete(scope);
}

/** 清空全部作用域（登出时调用） */
export function clearAllScopes(): void {
  registry.clear();
  scopeWide.clear();
}
