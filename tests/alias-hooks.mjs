/**
 * Node 模块解析钩子：把 Vite 的 `@/` 别名映射到 `src/`，并补全 .ts 扩展名
 *
 * 背景：`node --experimental-strip-types` 直接跑 .ts 校验脚本时，
 * 应用代码里的 `import ... from '@/utils/date'` 无法解析（那是 Vite 的 alias），
 * 且 Node 的 ESM 解析器不会自动补 `.ts` 扩展名。这里一并处理。
 *
 * 注册方式见 tests/register-hooks.mjs（Node 24 要求用 module.register()）。
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = new URL('../src/', import.meta.url);

const EXTS = ['', '.ts', '.tsx', '/index.ts', '/index.tsx', '.mjs', '.js'];

function firstExisting(baseUrl) {
  for (const ext of EXTS) {
    const candidate = baseUrl.href + ext;
    try {
      if (existsSync(fileURLToPath(candidate))) return candidate;
    } catch {
      // 非法路径继续尝试下一个候选
    }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  // 1) `@/xxx` 别名 -> src/xxx
  if (specifier.startsWith('@/')) {
    const hit = firstExisting(new URL(specifier.slice(2), SRC));
    if (hit) return nextResolve(hit, context);
    return nextResolve(new URL(specifier.slice(2), SRC).href, context);
  }

  // 2) 相对路径且无扩展名 -> 补 .ts（应用源码风格）
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[a-z]+$/i.test(specifier)) {
    const base = new URL(specifier, context.parentURL ?? SRC);
    const hit = firstExisting(base);
    if (hit) return nextResolve(hit, context);
  }

  return nextResolve(specifier, context);
}
