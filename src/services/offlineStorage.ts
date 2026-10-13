/**
 * offlineStorage — IndexedDB 本地快照与离线防御引擎
 *
 * - 每次网络请求成功即写入本地快照（IndexedDB，隐私模式下自动降级 localStorage）；
 * - networkFirst()：请求超时（5s）/失败时回退最近快照，保障弱网与离线不白屏；
 * - 快照键与业务域一一对应，见 SnapshotKey。
 */

const DB_NAME = 'saisai-offline';
const STORE = 'snapshots';
const DB_VERSION = 1;
const LS_PREFIX = 'saisai:snap:';
const DEFAULT_TIMEOUT_MS = 5000;

export type SnapshotKey =
  | 'cached_today_dashboard'
  | 'cached_todos'
  | 'cached_anniversaries'
  | 'cached_period_state'
  | 'cached_recent_diaries';

export interface Snapshot<T> {
  data: T;
  savedAt: string;
}

export interface NetworkFirstResult<T> {
  data: T;
  /** true = 网络失败，数据来自本地快照 */
  fromCache: boolean;
}

// ---------------------------------------------------------------- IndexedDB 基础

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
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

// ---------------------------------------------------------------- 快照读写

export async function saveSnapshot<T>(key: SnapshotKey, data: T): Promise<void> {
  const snapshot: Snapshot<T> = { data, savedAt: new Date().toISOString() };
  try {
    await idbSet(key, snapshot);
    return;
  } catch {
    // iOS 隐私模式等 IndexedDB 不可用场景：降级 localStorage
  }
  try {
    localStorage.setItem(`${LS_PREFIX}${key}`, JSON.stringify(snapshot));
  } catch {
    // 存储全部不可用：静默跳过，不影响主流程
  }
}

export async function readSnapshot<T>(key: SnapshotKey): Promise<Snapshot<T> | null> {
  try {
    const value = await idbGet(key);
    if (value) return value as Snapshot<T>;
  } catch {
    // 继续尝试 localStorage 降级路径
  }
  try {
    const raw = localStorage.getItem(`${LS_PREFIX}${key}`);
    if (raw) return JSON.parse(raw) as Snapshot<T>;
  } catch {
    // 解析失败视为无快照
  }
  return null;
}

export async function clearSnapshots(): Promise<void> {
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
  for (const key of [
    'cached_today_dashboard',
    'cached_todos',
    'cached_anniversaries',
    'cached_period_state',
    'cached_recent_diaries',
  ] satisfies SnapshotKey[]) {
    try {
      localStorage.removeItem(`${LS_PREFIX}${key}`);
    } catch {
      // 忽略
    }
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
 * 2. 超时/失败 → 回退最近快照；
 * 3. 无快照 → 抛出原始错误（由调用方决定 Mock 兜底）。
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