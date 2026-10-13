// ============================================================================
// daily-check-push — 定时巡检引擎（由 pg_cron 每小时调用）
//
// 巡检逻辑按 profiles.timezone 逐用户换算：
//  - 仅当地 09:00 的用户参与本次下发；
//  - 夜间静默：当地 23:00 - 08:00 一律跳过（双重保险）；
//  - 纪念日当天提醒（公历/农历双轨，农历经 lunar-javascript 换算）；
//  - 生理期关怀：距预测经期 1~2 天时，向双方分别推送；
//  - 偏好开关：notify_anniversary / notify_period 在 _shared 层过滤。
//
// 部署：supabase functions deploy daily-check-push --no-verify-jwt
// ============================================================================
import { Lunar, Solar } from 'npm:lunar-javascript';
import { createServiceClient, json, sendToUsers, verifyWebhookSecret } from '../_shared/push.ts';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 指定时区的当前日期与小时 */
function localNow(timezone: string): { date: string; hour: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  });
  const map: Record<string, string> = {};
  for (const part of fmt.formatToParts(new Date())) {
    map[part.type] = part.value;
  }
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    hour: Number(map.hour ?? '0') % 24,
  };
}

function daysBetween(from: string, to: string): number {
  const parse = (s: string): number => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((parse(to) - parse(from)) / 86_400_000);
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) + days * 86_400_000);
  return t.toISOString().slice(0, 10);
}

/** 纪念日在指定年份的对应公历日期（农历负月自动处理） */
function occurrenceInYear(
  anniversary: { target_date: string; is_lunar: boolean; repeat_yearly: boolean },
  year: number,
): string | null {
  if (!anniversary.repeat_yearly) {
    return Number(anniversary.target_date.slice(0, 4)) === year
      ? anniversary.target_date
      : null;
  }
  if (anniversary.is_lunar) {
    const [sy, sm, sd] = anniversary.target_date.split('-').map(Number);
    const lunar = Solar.fromYmd(sy ?? 1970, sm ?? 1, sd ?? 1).getLunar();
    const solar = Lunar.fromYmd(year, lunar.getMonth(), lunar.getDay()).getSolar();
    return `${solar.getYear()}-${pad2(solar.getMonth())}-${pad2(solar.getDay())}`;
  }
  const [, m, d] = anniversary.target_date.split('-');
  return `${year}-${m ?? '01'}-${d ?? '01'}`;
}

interface ProfileRow {
  id: string;
  timezone: string;
  gender: string | null;
}

interface CycleRow {
  user_id: string;
  start_date: string;
  end_date: string | null;
}

Deno.serve(async (req) => {
  if (!verifyWebhookSecret(req)) {
    return json({ error: 'unauthorized' }, 401);
  }
  const service = createServiceClient();
  const now = new Date();
  void now;

  const { data: profiles, error } = await service
    .from('profiles')
    .select('id, timezone, gender')
    .returns<ProfileRow[]>();
  if (error) return json({ error: error.message }, 500);

  const summary = { processed: 0, anniversaries: 0, periods: 0 };

  for (const profile of profiles ?? []) {
    const local = localNow(profile.timezone || 'Asia/Shanghai');
    // 夜间静默（23:00 - 08:00）
    if (local.hour >= 23 || local.hour < 8) continue;
    // 仅当地 09:00 参与下发
    if (local.hour !== 9) continue;
    summary.processed += 1;

    // 空间成员
    const { data: membership } = await service
      .from('couple_members')
      .select('couple_id')
      .eq('user_id', profile.id)
      .maybeSingle();
    if (!membership) continue;

    const { data: members } = await service
      .from('couple_members')
      .select('user_id')
      .eq('couple_id', membership.couple_id);
    const memberIds = (members ?? []).map((m) => m.user_id as string);

    // ---------------------------------------------------------- 纪念日
    const year = Number(local.date.slice(0, 4));
    const { data: anniversaries } = await service
      .from('anniversaries')
      .select('title, target_date, is_lunar, repeat_yearly')
      .eq('couple_id', membership.couple_id);

    for (const a of anniversaries ?? []) {
      const occurrence =
        occurrenceInYear(
          a as { target_date: string; is_lunar: boolean; repeat_yearly: boolean },
          year,
        ) ?? '';
      if (occurrence !== local.date) continue;
      await sendToUsers(service, {
        user_ids: memberIds,
        title: '今天是特别的日子',
        body: `今天是【${a.title}】哦，别忘了给 TA 一个惊喜！`,
        url: '/together',
        kind: 'anniversary',
      });
      summary.anniversaries += 1;
    }

    // ---------------------------------------------------------- 生理期关怀
    if (profile.gender !== 'female') continue;
    const { data: cycles } = await service
      .from('period_cycles')
      .select('user_id, start_date, end_date')
      .eq('user_id', profile.id)
      .order('start_date', { ascending: false })
      .limit(6)
      .returns<CycleRow[]>();
    if (!cycles || cycles.length === 0) continue;

    const latest = cycles[0];
    if (!latest) continue;
    // 进行中的经期不预警
    if (!latest.end_date) continue;

    // 加权均值（与前端同构）：相邻开始日间隔，最近权重最高
    const intervals: number[] = [];
    for (let i = 0; i < cycles.length - 1 && intervals.length < 5; i++) {
      const curr = cycles[i];
      const prev = cycles[i + 1];
      if (!curr || !prev) continue;
      const gap = daysBetween(prev.start_date, curr.start_date);
      if (gap >= 15 && gap <= 90) intervals.push(gap);
    }
    let avgCycle = 28;
    if (intervals.length > 0) {
      let sum = 0;
      let wsum = 0;
      intervals.forEach((v, i) => {
        const w = intervals.length - i;
        sum += v * w;
        wsum += w;
      });
      avgCycle = Math.min(90, Math.max(15, Math.round(sum / wsum)));
    }

    const predictedNext = addDays(latest.start_date, avgCycle);
    const daysUntil = daysBetween(local.date, predictedNext);
    if (daysUntil !== 1 && daysUntil !== 2) continue;

    const partnerId =
      memberIds.find((id) => id !== profile.id) ?? null;
    // 向她推送
    await sendToUsers(service, {
      user_ids: [profile.id],
      title: '照顾好自己',
      body: `预计还有 ${daysUntil} 天经期来临，记得提前备好用品，注意保暖`,
      url: '/cycle',
      kind: 'period',
    });
    // 向他推送关怀指引
    if (partnerId) {
      await sendToUsers(service, {
        user_ids: [partnerId],
        title: '贴心提醒',
        body: `她的经期预计还有 ${daysUntil} 天来临，记得提前备好暖水与热敷`,
        url: '/cycle',
        kind: 'period',
      });
    }
    summary.periods += 1;
  }

  return json(summary);
});