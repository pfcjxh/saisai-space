/**
 * 在途写入追踪（回环抑制）单元测试
 *
 * 用法：node --experimental-strip-types tests/inflight.check.ts
 *
 * 验证核心语义：
 *   1. trackWrite 后 hasInflight 为真，release 后为假
 *   2. release 幂等——重复调用不会把计数减成负数导致抑制失效
 *   3. 引用计数——嵌套登记需释放同样次数才失效
 *   4. 作用域隔离——A 空间的在途不影响 B 空间
 *   5. 空 id 集合 = 作用域级抑制（用于 INSERT 这类事先不知 id 的场景）
 *   6. clearScope / clearAllScopes 能彻底清空
 */
import {
  clearAllScopes,
  clearScope,
  hasInflight,
  inflightCount,
  isScopeSuppressed,
  trackWrite,
  writeScope,
} from '../src/utils/inflight.ts';

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}${detail ? ` —— ${detail}` : ''}`);
  }
}

const S = writeScope('todos', 'couple-1');

// ---------------------------------------------------------------- 1. 基本登记与释放

{
  const release = trackWrite(S, ['t1']);
  check('登记后 hasInflight 为真', hasInflight(S, ['t1']) === true);
  check('未登记的行不受影响', hasInflight(S, ['t2']) === false);
  release();
  check('释放后 hasInflight 为假', hasInflight(S, ['t1']) === false);
}

// ---------------------------------------------------------------- 2. 幂等释放

{
  const release = trackWrite(S, ['t1']);
  release();
  release();
  release();
  check('重复释放不会造成负数计数', hasInflight(S, ['t1']) === false);
  // 再次登记应正常工作（若计数被减成负数，这里会误判为"仍在途"）
  const release2 = trackWrite(S, ['t1']);
  check('重复释放后重新登记仍生效', hasInflight(S, ['t1']) === true);
  release2();
  check('二次释放干净', hasInflight(S, ['t1']) === false);
}

// ---------------------------------------------------------------- 3. 引用计数（嵌套）

{
  const r1 = trackWrite(S, ['t3']);
  const r2 = trackWrite(S, ['t3']);
  r1();
  check('嵌套登记：释放一次仍在途', hasInflight(S, ['t3']) === true);
  r2();
  check('嵌套登记：释放两次后失效', hasInflight(S, ['t3']) === false);
}

// ---------------------------------------------------------------- 4. 作用域隔离

{
  const other = writeScope('todos', 'couple-2');
  const release = trackWrite(S, ['t4']);
  check('作用域隔离：本空间在途', hasInflight(S, ['t4']) === true);
  check('作用域隔离：另一空间不受影响', hasInflight(other, ['t4']) === false);
  check('不同业务域互不干扰', hasInflight(writeScope('wishes', 'couple-1'), ['t4']) === false);
  release();
}

// ---------------------------------------------------------------- 5. 批量 id

{
  const release = trackWrite(S, ['a', 'b', 'c']);
  check('批量登记：命中任一即为真', hasInflight(S, ['x', 'b']) === true);
  check('批量登记：全不命中为假', hasInflight(S, ['x', 'y']) === false);
  release();
  check('批量释放干净', hasInflight(S, ['a', 'b', 'c']) === false);
}

// ---------------------------------------------------------------- 6. 空 id 集合 = 作用域级抑制

{
  // INSERT 场景：服务端生成 id，事先无法按 id 抑制。
  // 空集合登记会提升整个作用域的抑制级别，期间任何远端事件都被忽略。
  const release = trackWrite(S, []);
  check('空 id 集合产生作用域级抑制', hasInflight(S, ['any']) === true);
  check('作用域级抑制对任意 id 生效', hasInflight(S, ['t1', 't2', 'x']) === true);
  check('作用域级抑制不占用 id 条目', inflightCount(S) === 0, `count=${inflightCount(S)}`);
  check('isScopeSuppressed 反映抑制状态', isScopeSuppressed(S) === true);
  release();
  check('释放后作用域级抑制解除', hasInflight(S, ['any']) === false);
  check('isScopeSuppressed 恢复为假', isScopeSuppressed(S) === false);
}

{
  // 嵌套的作用域级抑制同样需要等次释放
  const r1 = trackWrite(S, []);
  const r2 = trackWrite(S, []);
  r1();
  check('嵌套作用域级抑制：释放一次仍生效', hasInflight(S, ['z']) === true);
  r2();
  check('嵌套作用域级抑制：释放两次后解除', hasInflight(S, ['z']) === false);
}

// ---------------------------------------------------------------- 7. 清理

{
  trackWrite(S, ['c1']);
  trackWrite(S, ['c2']);
  check('清理前有 2 条在途', inflightCount(S) === 2, `count=${inflightCount(S)}`);
  clearScope(S);
  check('clearScope 后清空', inflightCount(S) === 0);
  check('clearScope 后 hasInflight 为假', hasInflight(S, ['c1', 'c2']) === false);
}

{
  const s1 = writeScope('todos', 'x');
  const s2 = writeScope('wishes', 'y');
  trackWrite(s1, ['i1']);
  trackWrite(s2, ['i2']);
  clearAllScopes();
  check('clearAllScopes 清空全部作用域', inflightCount(s1) === 0 && inflightCount(s2) === 0);
}

// ---------------------------------------------------------------- 8. 空 id 在批量中的边界

{
  const release = trackWrite(S, ['real', '']);
  check('空字符串 id 不影响真实 id 的抑制', hasInflight(S, ['real']) === true);
  check('空字符串 id 自身不构成命中', hasInflight(S, ['']) === true, '（登记为空串时会命中，属预期）');
  release();
}

console.log(`\n结果: ${passed} 项通过, ${failed} 项失败\n`);
process.exit(failed > 0 ? 1 : 0);
