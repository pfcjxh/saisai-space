/**
 * 统一错误处理
 *
 * 设计取向（借鉴 mina-gharzi/kanban-app 的 lib/errors，按其思想重写，未复制代码）：
 *   · 单一入口 normalizeError()：把 Supabase / PostgREST / Auth / fetch / 任意值
 *     统一成 AppError，业务层只面对一种错误形态；
 *   · 技术信息与用户可见文案分离：message 供日志，userMessage 供 UI，
 *     避免把 "PGRST116" 这类字样甩到用户脸上；
 *   · retryable 标记：schema 未就绪（迁移没跑）这类错误**不可重试**，
 *     否则用户会无限重试一件永远不可能成功的事；
 *   · 错误与警告分级：网络抖动/realtime 瞬断属于 warning，不应淹没真实错误。
 *
 * 本项目为双人自用 PWA，不接入第三方监控服务，reportError 只做 console 分级输出，
 * 但保留了 registerErrorMonitor() 接口，日后要接 Sentry 之类只需注册一个函数。
 */

// ---------------------------------------------------------------- 错误分类

export type AppErrorCode =
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'SCHEMA_MISMATCH'
  | 'DATABASE'
  | 'UNKNOWN';

export type ErrorSeverity = 'error' | 'warning';

export interface AppErrorOptions {
  code?: AppErrorCode;
  userMessage?: string;
  status?: number;
  /** 表单字段名，用于把错误定位到具体输入框 */
  field?: string;
  retryable?: boolean;
  severity?: ErrorSeverity;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  /** 面向用户的中文文案 */
  readonly userMessage: string;
  readonly status?: number;
  readonly field?: string;
  readonly retryable: boolean;
  readonly severity: ErrorSeverity;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message);
    this.name = 'AppError';
    this.code = options.code ?? 'UNKNOWN';
    this.userMessage = options.userMessage ?? DEFAULT_USER_MESSAGES[this.code];
    this.status = options.status;
    this.field = options.field;
    this.retryable = options.retryable ?? DEFAULT_RETRYABLE[this.code];
    this.severity = options.severity ?? 'error';
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

const DEFAULT_USER_MESSAGES: Record<AppErrorCode, string> = {
  AUTH_REQUIRED: '登录状态已失效，请重新登录',
  FORBIDDEN: '没有权限执行该操作',
  NOT_FOUND: '内容不存在或已被删除',
  CONFLICT: '该内容已存在',
  VALIDATION: '填写的内容不符合要求',
  NETWORK: '网络连接不稳定，请稍后重试',
  TIMEOUT: '请求超时，请检查网络后重试',
  SCHEMA_MISMATCH: '此功能服务端尚未就绪，请联系维护者',
  DATABASE: '数据操作失败，请稍后重试',
  UNKNOWN: '出了点问题，请稍后重试',
};

const DEFAULT_RETRYABLE: Record<AppErrorCode, boolean> = {
  AUTH_REQUIRED: false,
  FORBIDDEN: false,
  NOT_FOUND: false,
  CONFLICT: false,
  VALIDATION: false,
  NETWORK: true,
  TIMEOUT: true,
  SCHEMA_MISMATCH: false,
  DATABASE: true,
  UNKNOWN: true,
};

// ---------------------------------------------------------------- 错误码映射

/** PostgREST 的 schema 缓存未命中：说明迁移没跑，重试多少次都不会成功 */
const SCHEMA_MISMATCH_CODES = new Set(['PGRST202', 'PGRST204', 'PGRST205']);

function mapPostgresCode(code: string): AppErrorCode | null {
  if (SCHEMA_MISMATCH_CODES.has(code)) return 'SCHEMA_MISMATCH';
  // 类 23：完整性约束
  if (code === '23505') return 'CONFLICT'; // unique_violation
  if (code === '23503') return 'CONFLICT'; // foreign_key_violation
  if (code === '23502' || code === '23514') return 'VALIDATION'; // not_null / check
  if (code.startsWith('23')) return 'DATABASE';
  // 类 22：数据异常（类型/格式）
  if (code.startsWith('22')) return 'VALIDATION';
  // 类 42：权限与语法
  if (code === '42501') return 'FORBIDDEN'; // insufficient_privilege / RLS 拒绝
  if (code.startsWith('42')) return 'DATABASE';
  // 类 08：连接异常
  if (code.startsWith('08')) return 'NETWORK';
  // 类 53/54/55：资源与运维
  if (code.startsWith('53') || code.startsWith('54') || code.startsWith('55')) return 'DATABASE';
  return null;
}

function mapHttpStatus(status: number): AppErrorCode | null {
  if (status === 401) return 'AUTH_REQUIRED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 422 || status === 400) return 'VALIDATION';
  if (status === 408 || status === 504) return 'TIMEOUT';
  if (status === 429) return 'NETWORK';
  if (status >= 500) return 'DATABASE';
  return null;
}

/** 无错误码时的文本兜底（Supabase Auth 等只给 message） */
const TEXT_PATTERNS: { pattern: RegExp; code: AppErrorCode }[] = [
  { pattern: /row-level security|permission denied/i, code: 'FORBIDDEN' },
  { pattern: /jwt|token|not authenticated|invalid claim/i, code: 'AUTH_REQUIRED' },
  { pattern: /fetch failed|network|failed to fetch|load failed/i, code: 'NETWORK' },
  { pattern: /timeout|timed out/i, code: 'TIMEOUT' },
  { pattern: /duplicate|already exists|unique/i, code: 'CONFLICT' },
  { pattern: /does not exist|not found/i, code: 'NOT_FOUND' },
  { pattern: /invalid|must be|too short|too long/i, code: 'VALIDATION' },
];

interface ErrorLike {
  message?: unknown;
  code?: unknown;
  status?: unknown;
  details?: unknown;
  hint?: unknown;
}

function isErrorLike(value: unknown): value is ErrorLike {
  return typeof value === 'object' && value !== null;
}

/**
 * 唯一错误入口：把任意抛出物归一化为 AppError。
 * 幂等——已是 AppError 时原样返回。
 */
export function normalizeError(raw: unknown, fallbackMessage = '未知错误'): AppError {
  if (raw instanceof AppError) return raw;

  // 超时是我们自己 withTimeout 抛的
  if (raw instanceof Error && raw.message === '请求超时') {
    return new AppError(raw.message, { code: 'TIMEOUT', cause: raw });
  }

  if (isErrorLike(raw)) {
    const code = typeof raw.code === 'string' ? raw.code : null;
    const status = typeof raw.status === 'number' ? raw.status : undefined;
    const message =
      typeof raw.message === 'string' && raw.message ? raw.message : fallbackMessage;

    let resolved: AppErrorCode | null = null;
    if (code) resolved = mapPostgresCode(code);
    if (!resolved && status !== undefined) resolved = mapHttpStatus(status);
    if (!resolved) {
      for (const { pattern, code: c } of TEXT_PATTERNS) {
        if (pattern.test(message)) {
          resolved = c;
          break;
        }
      }
    }

    return new AppError(message, {
      code: resolved ?? 'UNKNOWN',
      status,
      cause: raw,
      // 网络类错误降级为 warning：实时通道瞬断、切后台都会触发，不该当故障
      severity: resolved === 'NETWORK' || resolved === 'TIMEOUT' ? 'warning' : 'error',
    });
  }

  if (typeof raw === 'string') {
    return new AppError(raw, { cause: raw });
  }

  return new AppError(fallbackMessage, { cause: raw });
}

// ---------------------------------------------------------------- 上报

export interface ErrorContext {
  /** 发生位置，如 'vue:render' / 'window.error' / 'router' */
  operation: string;
  /** 附加信息（会被脱敏后输出） */
  extra?: Record<string, unknown>;
}

export type ErrorMonitor = (error: AppError, context: ErrorContext) => void;

const monitors = new Set<ErrorMonitor>();

/** 注册监控器，返回注销函数 */
export function registerErrorMonitor(monitor: ErrorMonitor): () => void {
  monitors.add(monitor);
  return () => monitors.delete(monitor);
}

/** 敏感键名：出站前一律替换，避免把令牌/正文写进日志 */
const SENSITIVE_KEYS = /token|password|secret|key|authorization|content|body|notes/i;

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 3) return '[deep]';
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => sanitize(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.test(k) ? '[redacted]' : sanitize(v, depth + 1);
  }
  return out;
}

/**
 * 统一上报出口。注意每个 monitor 单独 try/catch——
 * 监控器自己崩掉不能把业务错误一起吃掉。
 */
export function reportError(raw: unknown, context: ErrorContext): AppError {
  const error = normalizeError(raw);
  const extra = context.extra ? (sanitize(context.extra) as Record<string, unknown>) : undefined;

  const log = error.severity === 'warning' ? console.warn : console.error;
  log(`[${context.operation}] ${error.code}: ${error.message}`, extra ?? '');

  for (const monitor of monitors) {
    try {
      monitor(error, context);
    } catch (monitorErr) {
      console.error('[errorMonitor] 监控器自身抛出异常', monitorErr);
    }
  }
  return error;
}

/** 从任意错误中取用户可见文案 */
export function userMessageOf(raw: unknown): string {
  return normalizeError(raw).userMessage;
}
