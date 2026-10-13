import type { Diary } from '@/types/database';

/** 日记演示数据：未登录/未配对/离线时注入（外链治愈系摄影图） */
export function buildDiaryMock(): Diary[] {
  const now = new Date().toISOString();
  const base = {
    couple_id: 'mock-couple',
    created_at: now,
    updated_at: now,
  };

  return [
    {
      ...base,
      id: 'mock-diary-1',
      author_id: 'mock-me',
      diary_date: '2026-09-12',
      title: '海边的风',
      content:
        '今天终于一起看到了海。\n风把她的头发吹得乱七八糟，她笑着让我别拍，\n但我还是偷偷按下了快门。\n异地第三百天，想把这一刻永远留下。',
      mood: 'happy',
      images: ['https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=900&q=80'],
      liked_by: ['mock-partner'],
      comments: [
        {
          author_id: 'mock-partner',
          nickname: 'TA',
          content: '下次还要一起来！',
          created_at: now,
        },
      ],
    },
    {
      ...base,
      id: 'mock-diary-2',
      author_id: 'mock-partner',
      diary_date: '2026-09-05',
      title: null,
      content: '第一次一起做饭，寿喜烧糊了一半，但还是很开心。\n你洗碗的样子也很可爱。',
      mood: 'caring',
      images: [
        'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=900&q=80',
        'https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?w=900&q=80',
      ],
      liked_by: ['mock-me'],
      comments: [],
    },
  ];
}
