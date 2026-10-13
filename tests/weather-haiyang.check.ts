/**
 * 验证天气城市字典的关键修复：山东海阳（她的学校）
 * 背景：Open-Meteo 地理编码搜「海阳」只返回安徽海阳，会把天气查错，
 * 因此山东海阳必须命中内置坐标（36.7761N/121.1587E）。
 * 坐标本身已由构建产物 + 真实 API 实测确认（见提交信息），
 * 这里断言对外暴露的 CITY_GROUPS 快捷组包含「海阳」，保证设置页能一键选择。
 */
import { CITY_GROUPS } from '../src/composables/useWeather.ts';

let pass = 0;
const total = 4;

// 1. 山东组第一顺位就是海阳（她的当前位置最常用）
const sd = CITY_GROUPS.find((g) => g.label === '山东');
const sdOk = sd?.cities[0] === '海阳';
console.log(`${sdOk ? 'PASS' : 'FAIL'} 山东组首项为海阳（实际: ${sd?.cities[0]}）`);
if (sdOk) pass++;

// 2. 山东组含莱阳（她家）
const lyOk = sd?.cities.includes('莱阳') ?? false;
console.log(`${lyOk ? 'PASS' : 'FAIL'} 山东组含莱阳`);
if (lyOk) pass++;

// 3. 广东组含深圳（他）
const gd = CITY_GROUPS.find((g) => g.label === '广东');
const szOk = gd?.cities.includes('深圳') ?? false;
console.log(`${szOk ? 'PASS' : 'FAIL'} 广东组含深圳`);
if (szOk) pass++;

// 4. 快捷组总覆盖：两人的城市都能一键点到，不必手动输入
const all = CITY_GROUPS.flatMap((g) => g.cities);
const coverOk = all.includes('海阳') && all.includes('莱阳') && all.includes('深圳');
console.log(`${coverOk ? 'PASS' : 'FAIL'} 海阳/莱阳/深圳均在快捷组`);
if (coverOk) pass++;

console.log(`结果: ${pass}/${total} 项通过`);
process.exit(pass === total ? 0 : 1);
