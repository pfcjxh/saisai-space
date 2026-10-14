/**
 * 注册 tests/alias-hooks.mjs 的模块解析钩子。
 * 用法：node --experimental-strip-types --import ./tests/register-hooks.mjs <测试文件>
 */
import { register } from 'node:module';

register('./alias-hooks.mjs', import.meta.url);
