/**
 * offlineStorage — IndexedDB 本地快照与离线防御引擎
 *
 * - 每次网络请求成功即写入本地快照（IndexedDB，隐私模式下自动降级 localStorage）；
 * - networkFirst()：请求超时（5s）/失败时回退最近快照，保障弱网与离线不白屏；
 * - 快照键与业务域一一对应，见 SnapshotKey。
 *
 * ============================================================================
 * 身份隔离（v2 修复）
 * ----------------------------------------------------------------------------
 * 原实现快照键只有业务域（如 'cached_period_state'），不含身份信息。同一台设备
 * 换账号登录后，readSnapshot() 会把**上一个账号**的日记、待办、尤其是生理期
 * 打卡记录当作"本账号的离线缓存"读出来——这是实打实的隐私泄漏。
 *
 * 现改为所有快照键都前置身份指纹 `${userId}:${coupleId}`：
 *   · 写入/读取都必须显式传入当前身份；
 *   · 身份变化时旧快照自然不可达（键不同），无需依赖清理时机；
 *   · 登出时调用 clearSnapshotsForIdentity() 主动抹除，不留残迹。
 *
 * 约定：身份指纹由调用方通过 setSnapshotIdentity() 设置（auth store 负责）。
 * ============================================================================
 */

const DB_NAME = 'saisai-offline';
const STORE = 'snapshots';
/** v1 -> v2：键空间由「业务域」升级为「身份指纹::业务域」，需要清库重建 */
const DB_VERSION = 2;
const LS_PREFIX = 'saisai:snap:';
const DEFAULT_TIMEOUT_MS = 5000;
/** 未登录/演示模式下的身份指纹（Mock 数据无隐私属性） */
const ANONYMOUS_IDENTITY = 'anonymous';

export type SnapshotKey =
  | 'cached_today_dashboard'
  | 'cached_todos'
  | 'cached_anniversaries'
  | 'cached_period_state'
  | 'cached_recent_diaries';

/** 全部快照键（清理时遍历用，避免手写列表与类型漂移） */
const ALL_SNAPSHOT_KEYS: readonly SnapshotKey[] = [
  'cached_today_dashboard',
  'cached_todos',
  'cached_anniversaries',
  'cached_period_state',
  'cached_recent_diaries',
] as const;

export interface Snapshot<T> {
  data: T;
  savedAt: string;
}

export interface NetworkFirstResult<T> {
  data: T;
  /** true = 网络失败，数据来自本地快照 */
  fromCache: boolean;
}

// ---------------------------------------------------------------- 身份指纹

let currentIdentity: string = ANONYMOUS_IDENTITY;

/**
 * 设置当前身份指纹。应在登录成功、会话恢复、空间上下文加载后调用。
 * 身份变化时不会自动清库——旧身份的键已不可达，残留数据在登出时统一清除。
 */
export function setSnapshotIdentity(userId: string | null, coupleId: string | null): void {
  currentIdentity = userId ? `${userId}:${coupleId ?? 'no-couple'}` : ANONYMOUS_IDENTITY;
}

export function getSnapshotIdentity(): string {
  return currentIdentity;
}

/** 身份指纹 + 业务域 = 实际存储键 */
function scopedKey(key: SnapshotKey): string {
  return `${currentIdentity}::${key}`;
}

// ---------------------------------------------------------------- IndexedDB 基础

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      // v1 的键空间没有身份前缀，其内容无法安全归属到任何身份 → 直接丢弃重建
      if (db.objectStoreNames.contains(STORE)) {
        db.deleteObjectStore(STORE);
      }
      db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 打开失败'));
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB 写入失败'));
  });
  db.close();
}

async function idbGet(key: string): Promise<unknown> {
  const db = await openDb();
  const value = await new Promise<unknown>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 读取失败'));
  });
  db.close();
  return value;
}

/** 删除所有以指定身份指纹开头的键 */
async function idbDeleteByIdentity(identity: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const request = store.openKeyCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if (String(cursor.key).startsWith(`${identity}::`)) {
        store.delete(cursor.key);
      }
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB 删除失败'));
  });
  db.close();
}

// ---------------------------------------------------------------- 快照读写

export async function saveSnapshot<T>(key: SnapshotKey, data: T): Promise<void> {
  const snapshot: Snapshot<T> = { data, savedAt: new Date().toISOString() };
  const storageKey = scopedKey(key);
  try {
    await idbSet(storageKey, snapshot);
    return;
  } catch {
    // iOS 隐私模式等 IndexedDB 不可用场景：降级 localStorage
  }
  try {
    localStorage.setItem(`${LS_PREFIX}${storageKey}`, JSON.stringify(snapshot));
  } catch {
    // 存储全部不可用：静默跳过，不影响主流程
  }
}

export async function readSnapshot<T>(key: SnapshotKey): Promise<Snapshot<T> | null> {
  const storageKey = scopedKey(key);
  try {
    const value = await idbGet(storageKey);
    if (value) return value as Snapshot<T>;
  } catch {
    // 继续尝试 localStorage 降级路径
  }
  try {
    const raw = localStorage.getItem(`${LS_PREFIX}${storageKey}`);
    if (raw) return JSON.parse(raw) as Snapshot<T>;
  } catch {
    // 解析失败视为无快照
  }
  return null;
}

/** 清除**指定身份**的全部快照（登出 / 切换账号时调用） */
export async function clearSnapshotsForIdentity(identity: string): Promise<void> {
  try {
    await idbDeleteByIdentity(identity);
  } catch {
    // 忽略：IndexedDB 不可用时下面还有 localStorage 兜底
  }
  for (const key of ALL_SNAPSHOT_KEYS) {
    try {
      localStorage.removeItem(`${LS_PREFIX}${identity}::${key}`);
    } catch {
      // 忽略
    }
  }
}

/**
 * 清除当前身份的快照。登出流程应调用它，避免下一位使用者读到上一身份的
 * 日记/生理期数据。注意必须在 setSnapshotIdentity(null, null) **之前**调用。
 */
export async function clearSnapshots(): Promise<void> {
  await clearSnapshotsForIdentity(currentIdentity);
}

/** 清除全部身份的快照（"清除本地数据"类操作使用） */
export async function clearAllSnapshots(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB 清空失败'));
    });
    db.close();
  } catch {
    // 忽略
  }
  try {
    // 只删本应用前缀的键，不动同源下其它应用的数据
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LS_PREFIX)) doomed.push(k);
    }
    for (const k of doomed) localStorage.removeItem(k);
  } catch {
    // 忽略
  }
}

// ---------------------------------------------------------------- 超时与降级

export function withTimeout<T>(promise: Promise<T>, ms: number = DEFAULT_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error('请求超时'));
    }, ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        window.clearTimeout(timer);
        reject(err instanceof Error ? err : new Error('请求失败'));
      },
    );
  });
}

/**
 * Network-First 自动降级：
 * 1. 网络成功（5s 内）→ 返回并异步写入快照；
 * 2. 超时/失败 → 回退**当前身份**的最近快照；
 * 3. 无快照 → 抛出原始错误（由调用方决定 Mock 兜底）。
 *
 * 注意：快照按身份隔离，因此回退数据必定属于当前登录用户，
 * 不会出现"换账号读到上一位使用者数据"的情况。
 */
export async function networkFirst<T>(
  key: SnapshotKey,
  fetcher: () => Promise<T>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<NetworkFirstResult<T>> {
  try {
    const data = await withTimeout(fetcher(), timeoutMs);
    void saveSnapshot(key, data).catch(() => undefined);
    return { data, fromCache: false };
  } catch (err) {
    const snapshot = await readSnapshot<T>(key);
    if (snapshot) {
      return { data: snapshot.data, fromCache: true };
    }
    throw err instanceof Error ? err : new Error('网络请求失败');
  }
}
