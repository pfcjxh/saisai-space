import { ref } from 'vue';
import type { Ref } from 'vue';
import { buildAnniversaryMock } from '@/mocks/anniversaryMock';
import { buildDiaryMock } from '@/mocks/diaryMock';
import { buildLetterMock } from '@/mocks/letterMock';
import { listAnniversaries } from '@/services/anniversaryService';
import { listDiaries } from '@/services/diaryService';
import { listLetters } from '@/services/letterService';

/**
 * useMemories — 回忆时间轴聚合层
 * 把日记、纪念日、情书三路数据拉平成一条"我们的故事"时间线；
 * 不引入新表，只做已有数据的只读聚合，月份分组交给视图层。
 */

export type MemoryKind = 'diary' | 'anniversary' | 'letter';

export interface MemoryItem {
  key: string;
  kind: MemoryKind;
  /** 排序与分组键：YYYY-MM-DD（情书取 created_at 的本地日期段） */
  date: string;
  title: string;
  excerpt: string | null;
  /** 原始条目 id（情书行点击拆信用） */
  refId: string;
}

export function useMemories(coupleId: Ref<string | null>) {
  const items = ref<MemoryItem[]>([]);
  const loading = ref(false);

  async function load(): Promise<void> {
    loading.value = true;
    try {
      const cid = coupleId.value;
      const [diaries, anniversaries, letters] = cid
        ? await Promise.all([listDiaries(cid), listAnniversaries(cid), listLetters(cid)])
        : [buildDiaryMock(), buildAnniversaryMock(), buildLetterMock()];

      const merged: MemoryItem[] = [
        ...diaries.map<MemoryItem>((d) => ({
          key: `diary-${d.id}`,
          kind: 'diary',
          date: d.diary_date,
          title: d.title ?? '一篇日记',
          excerpt: d.content.slice(0, 48),
          refId: d.id,
        })),
        ...anniversaries.map<MemoryItem>((a) => ({
          key: `ann-${a.id}`,
          kind: 'anniversary',
          date: a.target_date,
          title: a.title,
          excerpt: null,
          refId: a.id,
        })),
        ...letters.map<MemoryItem>((l) => ({
          key: `letter-${l.id}`,
          kind: 'letter',
          date: l.created_at.slice(0, 10),
          title: l.title || '无题信笺',
          excerpt: l.body.slice(0, 48),
          refId: l.id,
        })),
      ];
      merged.sort((a, b) => (a.date < b.date ? 1 : -1));
      items.value = merged;
    } catch {
      // 任一路失败整线降级为演示数据，绝不让时间轴空白
      const fallback: MemoryItem[] = [
        ...buildDiaryMock().map<MemoryItem>((d) => ({
          key: `diary-${d.id}`,
          kind: 'diary',
          date: d.diary_date,
          title: d.title ?? '一篇日记',
          excerpt: d.content.slice(0, 48),
          refId: d.id,
        })),
        ...buildAnniversaryMock().map<MemoryItem>((a) => ({
          key: `ann-${a.id}`,
          kind: 'anniversary',
          date: a.target_date,
          title: a.title,
          excerpt: null,
          refId: a.id,
        })),
        ...buildLetterMock().map<MemoryItem>((l) => ({
          key: `letter-${l.id}`,
          kind: 'letter',
          date: l.created_at.slice(0, 10),
          title: l.title || '无题信笺',
          excerpt: l.body.slice(0, 48),
          refId: l.id,
        })),
      ];
      fallback.sort((a, b) => (a.date < b.date ? 1 : -1));
      items.value = fallback;
    } finally {
      loading.value = false;
    }
  }

  return { items, loading, load };
}
