import type { StickyNote } from '@/types/database';

/** 便利贴演示数据：双方随手贴的几张小纸条（Mock 模式展示用） */
export function buildNoteMock(): StickyNote[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'mock-note-1',
      couple_id: 'mock-couple',
      author_id: 'mock-me',
      color: 'sky',
      content: '周五下班视频，给你看深圳的晚霞',
      pinned: true,
      created_at: now,
      updated_at: now,
    },
    {
      id: 'mock-note-2',
      couple_id: 'mock-couple',
      author_id: 'mock-partner',
      color: 'rose',
      content: '冰箱里有给你留的樱桃，记得吃',
      pinned: false,
      created_at: now,
      updated_at: now,
    },
    {
      id: 'mock-note-3',
      couple_id: 'mock-couple',
      author_id: 'mock-me',
      color: 'butter',
      content: '四级单词打卡 day 12，等我考完带你去看海',
      pinned: false,
      created_at: now,
      updated_at: now,
    },
    {
      id: 'mock-note-4',
      couple_id: 'mock-couple',
      author_id: 'mock-partner',
      color: 'mint',
      content: '记住了：你不要熬夜！',
      pinned: false,
      created_at: now,
      updated_at: now,
    },
  ];
}
