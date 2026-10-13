<script setup lang="ts">
import { computed } from 'vue';
import { Flag } from '@lucide/vue';
import AppCard from '@/components/common/AppCard.vue';
import IconTile from '@/components/common/IconTile.vue';
import type { Anniversary } from '@/types/database';
import { daysBetween, formatMonthDay, weekdayLabel } from '@/utils/date';
import { listFestivalsForYear, nextOccurrence } from '@/utils/lunar';

/**
 * 最近里程碑倒数卡（参考设计：琥珀左色条 + 旗帜瓷贴 + 右侧大数字）。
 * 候选池 = 空间纪念日（农历逐年换算）+ 公历/农历节日；
 * 置顶纪念日拥有最高优先级，其次取距今最近者。
 */
const props = defineProps<{
  anniversaries: Anniversary[];
  /** 用户时区下的今天 YYYY-MM-DD */
  today: string;
}>();

interface Milestone {
  title: string;
  date: string;
  daysLeft: number;
  pinned: boolean;
  source: 'holiday' | 'anniversary';
}

const next = computed<Milestone | null>(() => {
  const year = Number(props.today.slice(0, 4));
  const candidates: Milestone[] = [];

  for (const y of [year, year + 1]) {
    for (const f of listFestivalsForYear(y)) {
      const daysLeft = daysBetween(props.today, f.date);
      if (daysLeft >= 0) {
        candidates.push({ title: f.title, date: f.date, daysLeft, pinned: false, source: 'holiday' });
      }
    }
  }

  for (const a of props.anniversaries) {
    const occ = nextOccurrence(a, props.today);
    if (occ && occ.daysLeft >= 0) {
      candidates.push({
        title: a.title,
        date: occ.date,
        daysLeft: occ.daysLeft,
        pinned: a.pinned,
        source: 'anniversary',
      });
    }
  }

  if (candidates.length === 0) return null;
  // 置顶纪念日优先于一切候选
  const pinned = candidates.filter((c) => c.pinned);
  const pool = pinned.length > 0 ? pinned : candidates;
  return pool.reduce((min, c) => (c.daysLeft < min.daysLeft ? c : min));
});
</script>

<template>
  <AppCard v-if="next" accent="amber">
    <div class="flex items-center gap-3">
      <IconTile tone="amber">
        <Flag :size="20" :stroke-width="1.8" />
      </IconTile>
      <div class="min-w-0 flex-1">
        <p class="text-[11px] text-fg-soft">
          下一个{{ next.source === 'holiday' ? '假期' : '纪念日' }}
        </p>
        <p class="truncate text-base font-semibold">{{ next.title }}</p>
        <p class="mt-0.5 text-xs text-fg-soft tabular-nums">
          {{ formatMonthDay(next.date) }} {{ weekdayLabel(next.date) }}
        </p>
      </div>
      <div class="shrink-0 text-right">
        <p v-if="next.daysLeft === 0" class="text-base font-semibold text-amber-warm">
          就是今天
        </p>
        <template v-else>
          <p class="text-2xl leading-none font-semibold text-amber-warm tabular-nums">
            {{ next.daysLeft }}
          </p>
          <p class="mt-1 text-[10px] text-fg-soft">天后</p>
        </template>
      </div>
    </div>
  </AppCard>
</template>
