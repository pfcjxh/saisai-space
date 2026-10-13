/**
 * lunar-javascript 的最小类型声明（库未自带 .d.ts）。
 * 仅声明本项目使用到的 API 面，保持严格模式零 any。
 */
declare module 'lunar-javascript' {
  export class Solar {
    private constructor();
    static fromYmd(year: number, month: number, day: number): Solar;
    getYear(): number;
    getMonth(): number;
    getDay(): number;
    getLunar(): Lunar;
  }

  export class Lunar {
    private constructor();
    /** month 传负值表示闰月 */
    static fromYmd(year: number, month: number, day: number): Lunar;
    getSolar(): Solar;
    getYear(): number;
    /** 返回负值表示闰月 */
    getMonth(): number;
    getDay(): number;
    getMonthInChinese(): string;
    getDayInChinese(): string;
  }
}
