<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useCoupleStore } from '@/stores/couple';
import PullToRefresh from '@/components/layout/PullToRefresh.vue';
import GreetingHeader from '@/components/dashboard/GreetingHeader.vue';
import PeriodCareCard from '@/components/dashboard/PeriodCareCard.vue';
import WeatherCard from '@/components/dashboard/WeatherCard.vue';
import UpcomingMilestoneCard from '@/components/dashboard/UpcomingMilestoneCard.vue';
import MoodPickerSheet from '@/components/dashboard/MoodPickerSheet.vue';
import NotificationSettingSheet from '@/components/settings/NotificationSettingSheet.vue';
import ThemeSettingSheet from '@/components/settings/ThemeSettingSheet.vue';
import ShareCardSheet from '@/components/dashboard/ShareCardSheet.vue';
import type { NotifyPrefsState } from '@/components/settings/NotificationSettingSheet.vue';
import { fetchProfile, updateMood } from '@/services/profileService';
import { updateNotifyPrefs } from '@/services/pushService';
import { fetchCoupleContext } from '@/services/coupleService';
import { listAnniversaries } from '@/services/anniversaryService';
import { listRecentCycles } from '@/services/periodService';
import { usePeriodCalculator } from '@/composables/usePeriodCalculator';
import { readSnapshot, saveSnapshot, withTimeout } from '@/services/offlineStorage';
import { buildTodayMock } from '@/mocks/todayMock';
import {
  daysBetween,
  formatDateWithWeekday,
  hourInTimezone,
  todayInTimezone,
} from '@/utils/date';
import type { Anniversary, Couple, Mood, PeriodCycle, Profile } from '@/types/database';

defineOptions({ name: 'TodayView' });

const router = useRouter();
const auth = useAuthStore();
const coupleStore = useCoupleStore();
const { compute } = usePeriodCalculator();

const me = ref<Profile | null>(null);
const partner = ref<Profile | null>(null);
const couple = ref<Couple | null>(null);
const cycles = ref<PeriodCycle[]>([]);
/** 纪念日：供里程碑倒数卡消费（pinned 置顶项优先） */
const anniversaries = ref<Anniversary[]>([]);
/** true = 未登录/未配对/查询失败时的 Mock 兜底模式 */
const isMock = ref(false);
const moodOpen = ref(false);
const settingsOpen = ref(false);
const themeOpen = ref(false);
const shareOpen = ref(false);
const refreshing = ref(false);
const weatherRef = ref<{ refresh: () => Promise<void> } | null>(null);

const authUserId = computed<string | null>(() => auth.user?.id ?? null);
const timezone = computed(() => me.value?.timezone ?? 'Asia/Shanghai');
const today = computed(() => todayInTimezone(timezone.value));
const hour = computed(() => hourInTimezone(timezone.value));
const dateLabel = computed(() => formatDateWithWeekday(today.value));
const partnerLabel = computed(() => (partner.value?.gender === 'female' ? '她' : '他'));
/** 情话行（后续可接入日记/留言动态内容） */
const loveNote = '老婆，我爱你。';
const insight = computed(() => compute(cycles.value, today.value));
/** 男性伴侣视角：性别为 male 时展示关怀指南 */
const partnerView = computed(() => me.value?.gender === 'male');
const myCharacter = computed<'hachi' | 'miffy'>(() =>
  coupleStore.context?.myRole === 'partner' ? 'miffy' : 'hachi',
);
const myMood = computed<Mood | null>(() => (me.value?.mood as Mood | null) ?? null);
/** 通知偏好（Mock 模式回落全开） */
const notifyPrefs = computed<NotifyPrefsState>(() => ({
  notify_diary: me.value?.notify_diary ?? true,
  notify_anniversary: me.value?.notify_anniversary ?? true,
  notify_period: me.value?.notify_period ?? true,
}));
const partnerMood = computed<Mood | null>(() => (partner.value?.mood as Mood | null) ?? null);
/** 头像：优先 profiles.avatar_url，未设置时回退本地专属形象（小八=我 / 米菲=她） */
const myAvatarUrl = computed(() => me.value?.avatar_url ?? '/avatars/me.webp');
const partnerAvatarUrl = computed(
  () => partner.value?.avatar_url ?? '/avatars/partner.webp',
);
const daysTogether = computed(() =>
  couple.value ? daysBetween(couple.value.relationship_started_at, today.value) + 1 : 0,
);

function applyMock(realProfile?: Profile | null): void {
  const mock = buildTodayMock();
  me.value = realProfile ?? mock.me;
  partner.value = mock.partner;
  couple.value = mock.couple;
  cycles.value = mock.cycles;
  anniversaries.value = mock.anniversaries;
  isMock.value = true;
}

/** 仪表盘聚合快照（离线时整页可读，杜绝白屏） */
interface DashboardSnapshot {
  me: Profile | null;
  partner: Profile | null;
  couple: Couple | null;
  cycles: PeriodCycle[];
  anniversaries?: Anniversary[];
}

async function loadDashboard(): Promise<void> {
  const user = auth.user;
  if (!auth.isAuthenticated || !user) {
    applyMock();
    return;
  }
  try {
    // 5s 超时防御：弱网悬挂时快速降级而非无限等待
    const [profile, context] = await withTimeout(
      Promise.all([fetchProfile(user.id), fetchCoupleContext(user.id)]),
    );
    // 未创建/未配对空间：保留真实本人资料，其余注入 Mock
    if (!context || !context.partner) {
      applyMock(profile);
      return;
    }
    me.value = profile;
    partner.value = context.partner;
    couple.value = context.couple;
    coupleStore.setContext(context);
    isMock.value = false;

    // 生理期数据归属：男性视角读伴侣（RLS 仅放行基础周期统计），否则读本人
    const periodOwnerId = profile?.gender === 'male' ? context.partner.id : user.id;
    const [cycleList, anniversaryList] = await withTimeout(
      Promise.all([listRecentCycles(periodOwnerId), listAnniversaries(context.couple.id)]),
    );
    cycles.value = cycleList;
    anniversaries.value = anniversaryList;

    // 成功即写入本地快照，供离线/弱网回退
    void saveSnapshot<DashboardSnapshot>('cached_today_dashboard', {
      me: me.value,
      partner: partner.value,
      couple: couple.value,
      cycles: cycleList,
      anniversaries: anniversaryList,
    }).catch(() => undefined);
  } catch {
    // 优先回退本地快照；无快照才降级 Mock，绝不让仪表盘白屏
    const snapshot = await readSnapshot<DashboardSnapshot>('cached_today_dashboard').catch(
      () => null,
    );
    if (snapshot) {
      me.value = snapshot.data.me;
      partner.value = snapshot.data.partner;
      couple.value = snapshot.data.couple;
      cycles.value = snapshot.data.cycles;
      anniversaries.value = snapshot.data.anniversaries ?? [];
      isMock.value = false;
      return;
    }
    applyMock();
  }
}

async function onSelectMood(mood: Mood): Promise<void> {
  moodOpen.value = false;
  if (me.value) {
    me.value = { ...me.value, mood, mood_updated_at: new Date().toISOString() };
  }
  if (isMock.value || !auth.user) return;
  try {
    await updateMood(auth.user.id, mood);
  } catch {
    // 心情同步失败不打断用户，本地乐观状态已生效
  }
}

async function onToggleNotifyPref(key: keyof NotifyPrefsState): Promise<void> {
  const next = !notifyPrefs.value[key];
  if (me.value) {
    me.value = { ...me.value, [key]: next };
  }
  if (isMock.value || !auth.user) return;
  try {
    await updateNotifyPrefs(auth.user.id, { [key]: next });
  } catch {
    // 同步失败不打断操作，本地乐观状态已生效
  }
}

async function handleRefresh(): Promise<void> {
  refreshing.value = true;
  try {
    await Promise.allSettled([loadDashboard(), weatherRef.value?.refresh()]);
  } finally {
    refreshing.value = false;
  }
}

onMounted(loadDashboard);
</script>

<template>
  <PullToRefresh :loading="refreshing" class="h-full" @refresh="handleRefresh">
    <div
      class="flex flex-col gap-4 px-4 pt-safe pb-[calc(88px+env(safe-area-inset-bottom))]"
    >
      <!-- 演示模式登录引导（未登录时显示） -->
      <button
        v-if="!auth.isAuthenticated"
        type="button"
        class="mt-4 flex items-center gap-2.5 rounded-2xl border border-serene/25 bg-serene/10 p-3 text-left transition-transform duration-200 ease-out-quart active:scale-[0.98]"
        @click="router.push({ name: 'auth' })"
      >
        <img src="/avatars/me.webp" alt="" class="size-8 rounded-full bg-white object-cover" />
        <span class="min-w-0 flex-1">
          <span class="block text-xs font-medium text-serene">当前为演示模式</span>
          <span class="mt-0.5 block text-[10px] text-fg-soft">
            登录并配对，开启只属于你们的真实空间
          </span>
        </span>
        <span class="shrink-0 text-[10px] text-serene">去登录 →</span>
      </button>

      <!-- Tier 1：问候与相恋看板 -->
      <GreetingHeader
        class="mt-4"
        :hour="hour"
        :date-label="dateLabel"
        :partner-label="partnerLabel"
        :love-note="loveNote"
        :days-together="daysTogether"
        :my-mood="myMood"
        :partner-mood="partnerMood"
        :my-avatar-url="myAvatarUrl"
        :partner-avatar-url="partnerAvatarUrl"
        :partner-nickname="partner?.nickname ?? 'TA'"
        @open-mood-picker="moodOpen = true"
        @open-settings="settingsOpen = true"
        @open-theme="themeOpen = true"
        @open-share-card="shareOpen = true"
      />

      <!-- 聚焦卡片流：天气 → 里程碑 → 生理期 -->
      <WeatherCard
        ref="weatherRef"
        :my-city="me?.weather_city ?? '深圳'"
        :partner-city="partner?.weather_city ?? '莱阳'"
        :my-lat="me?.weather_lat ?? null"
        :my-lon="me?.weather_lon ?? null"
        :partner-lat="partner?.weather_lat ?? null"
        :partner-lon="partner?.weather_lon ?? null"
      />
      <!-- 最近里程碑倒数：消费纪念日的 pinned 字段（置顶项优先） -->
      <UpcomingMilestoneCard :anniversaries="anniversaries" :today="today" />
      <PeriodCareCard
        :insight="insight"
        :partner-view="partnerView"
        @record="router.push({ name: 'cycle' })"
      />
    </div>
  </PullToRefresh>

  <MoodPickerSheet
    :open="moodOpen"
    :character="myCharacter"
    :current="myMood"
    @close="moodOpen = false"
    @select="onSelectMood"
  />

  <NotificationSettingSheet
    :open="settingsOpen"
    :my-user-id="authUserId"
    :prefs="notifyPrefs"
    @close="settingsOpen = false"
    @toggle-pref="onToggleNotifyPref"
  />

  <ThemeSettingSheet :open="themeOpen" @close="themeOpen = false" />

  <ShareCardSheet
    :open="shareOpen"
    :days-together="daysTogether"
    :started-at="couple?.relationship_started_at ?? null"
    :my-avatar-url="myAvatarUrl"
    :partner-avatar-url="partnerAvatarUrl"
    @close="shareOpen = false"
  />
</template>
