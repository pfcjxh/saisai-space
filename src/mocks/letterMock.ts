import type { LoveLetter } from '@/types/database';

/** 情书演示数据：双方各一封（Mock 模式展示用） */
export function buildLetterMock(): LoveLetter[] {
  return [
    {
      id: 'mock-letter-1',
      couple_id: 'mock-couple',
      author_id: 'mock-me',
      title: '在一起的第一晚',
      body:
        '今天是 2026 年 8 月 16 日。\n' +
        '从今晚开始，"我们"不再是你和我，而是我们。\n' +
        '往后的路还长，我会慢慢走，一直陪着你。',
      created_at: '2026-08-16T21:30:00+08:00',
    },
    {
      id: 'mock-letter-2',
      couple_id: 'mock-couple',
      author_id: 'mock-partner',
      title: '回信',
      body:
        '收到你的信啦。\n' +
        '异地也没关系，这座城市每天都会替我看看你。\n' +
        '晚安，梦里见。',
      created_at: '2026-08-17T09:12:00+08:00',
    },
  ];
}
