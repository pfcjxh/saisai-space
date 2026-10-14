<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Droplets, PenLine, Plus } from '@lucide/vue';
import { useAuthStore } from '@/stores/auth';
import { useCoupleStore } from '@/stores/couple';
import AppButton from '@/components/common/AppButton.vue';
import AppTabs from '@/components/common/AppTabs.vue';
import CharacterAvatar from '@/components/common/CharacterAvatar.vue';
import PeriodStatusCard from '@/components/period/PeriodStatusCard.vue';
import PeriodHistoryCard from '@/components/period/PeriodHistoryCard.vue';
import PeriodCalendarView from '@/components/period/PeriodCalendarView.vue';
import PeriodLogSheet from '@/components/period/PeriodLogSheet.vue';
import type { PeriodLogFormPayload } from '@/components/period/PeriodLogSheet.vue';
import CycleFormSheet from '@/components/period/CycleFormSheet.vue';
import type { CycleFormPayload } from '@/components/period/CycleFormSheet.vue';
import { usePeriod } from '@/composables/usePeriod';
import { usePeriodRealtime } from '@/composables/usePeriodRealtime';
import { fetchCoupleContext } from '@/services/coupleService';
import { fetchProfile } from '@/services/profileService';
import { DEFAULT_TIMEZONE, daysBetween } from '@/utils/date';
import type { PeriodCycle, Profile } from '@/types/database';

defineOptions({ name: 'CycleView' });

const auth = useAuthStore();
const coupleStore = useCoupleStore();

// ---------------------------------------------------------------- 视角判定

const myProfile = ref<Profile | null>(null);
const partnerProfile = ref<Profile | null>(null);

/**
 * 用户时区（决定「今天」与周期推算的基准日）。
 * 修复：本页原先把 'Asia/Shanghai' 写死在 usePeriod 内部，profile.timezone
 * 字段形同虚设，跨时区用户会算错「经期第几天 / 还有几天」。
 */
const timezone = computed(() => myProfile.value?.timezone ?? DEFAULT_TIMEZONE);

/**
 * 伴侣关怀视角：她性别为女、我为男时进入。
 *
 * 修复记录：原实现为 `myProfile?.gender ?? 'male'`，即资料未加载（或未登录）时
 * **默认按男方视角**，女性用户首屏会先看到「伴侣关怀模式」且 owner 短暂指向伴侣。
 * 现改为三态：已明确 female → 本人视角；已明确 male → 伴侣视角；未知 → 本人视角。
 *
 * 代录（v0011 起）：伴侣视角**不再是只读**。她两周才能用一次手机，
 * 需要由他代为记录。RLS 已放开伴侣写入；她主动标记 private 且非他录入的
 * 记录仍不可见，这一隐私边界保留在数据库层。
 */
const isPartnerView = computed(() => myProfile.value?.gender === 'male');

/** 数据归属人：伴侣视角读她的周期统计，本人视角读自己 */
const periodOwnerId = computed(() => {
  if (isPartnerView.value) {
    return coupleStore.context?.partner?.id ?? null;
  }
  return auth.user?.id ?? null;
});

/** 当前登录用户：与 periodOwnerId 不同时即为「代录」，写入时记录 recorded_by */
const myUserId = computed(() => auth.user?.id ?? null);

const {
  cycles,
  logs,
  model,
  ongoingCycle,
  closedCycles,
  errorToast,
  today,
  load,
  startCycleToday,
  endCycleToday,
  saveCycle,
  removeCycle,
  logFor,
  saveLog,
  removeLog,
  applyRemoteCycle,
  removeRemoteCycle,
} = usePeriod(periodOwnerId, isPartnerView, timezone, myUserId);

// 周期实时同步（0013 把 period_cycles 加入 supabase_realtime 后启用）：
// 他代录后她打开 App 立即看到，无需下拉；自己另一台设备的写回环由
// applyRemoteCycle 的按 id 幂等 upsert 天然吸收。
usePeriodRealtime(periodOwnerId, {
  onCycleUpsert: applyRemoteCycle,
  onCycleDelete: removeRemoteCycle,
});

/** 是否处于代录状态（伴侣视角且有明确归属人） */
const isProxyRecording = computed(() => isPartnerView.value && periodOwnerId.value !== null);

// ---------------------------------------------------------------- 视图状态

const tab = ref<'list' | 'calendar'>('list');
const logSheetOpen = ref(false);
const logDate = ref('');
const cycleSheetOpen = ref(false);
const editingCycle = ref<PeriodCycle | null>(null);

const tabOptions = [
  { value: 'list', label: '清单' },
  { value: 'calendar', label: '日历' },
];

const statsLine = computed(() => {
  const i = model.value.insight;
  const suffix = i.usesDefaultAverages ? '（默认）' : '';
  return `共 ${cycles.value.length} 次记录 · 平均 ${i.avgCycleLength} 天${suffix}`;
});

/** 每条已闭合周期的周期天数（本次开始 → 下次开始） */
function cycleLengthOf(cycle: PeriodCycle): number | null {
  const idx = cycles.value.findIndex((c) => c.id === cycle.id);
  const prev = cycles.value[idx + 1];
  if (!prev) return null;
  return daysBetween(prev.start_date, cycle.start_date);
}

// ---------------------------------------------------------------- 动作

function openLogSheet(date: string): void {
  logDate.value = date;
  logSheetOpen.value = true;
}

async function onLogSave(payload: PeriodLogFormPayload): Promise<void> {
  logSheetOpen.value = false;
  await saveLog({ ...payload, cycle_id: ongoingCycle.value?.id ?? null });
}

async function onLogRemove(): Promise<void> {
  const existing = logFor(logDate.value);
  logSheetOpen.value = false;
  if (existing) await removeLog(existing.id);
}

function openCycleEdit(cycle: PeriodCycle): void {
  editingCycle.value = cycle;
  cycleSheetOpen.value = true;
}

function openCycleCreate(): void {
  editingCycle.value = null;
  cycleSheetOpen.value = true;
}

async function onCycleSubmit(payload: CycleFormPayload): Promise<void> {
  cycleSheetOpen.value = false;
  await saveCycle(editingCycle.value?.id ?? null, payload);
}

// ---------------------------------------------------------------- 装载

onMounted(async () => {
  if (auth.user) {
    try {
      const [profile, context] = await Promise.all([
        fetchProfile(auth.user.id),
        coupleStore.context
          ? Promise.resolve(coupleStore.context)
          : fetchCoupleContext(auth.user.id),
      ]);
      myProfile.value = profile;
      if (context) {
        coupleStore.setContext(context);
        partnerProfile.value = context.partner;
      }
    } catch {
      // 离线保持 Mock
    }
  }
  await load();
});
</script>

<template>
  <div class="flex h-full flex-col pt-safe">
    <!-- 页头 -->
    <header class="px-4 pt-4">
      <h1 class="text-2xl font-bold">生理期</h1>
      <p class="mt-0.5 text-xs text-fg-soft tabular-nums">{{ statsLine }}</p>
      <AppTabs v-model="tab" class="mt-2" :options="tabOptions" />
    </header>

    <div
      class="scrollbar-none mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(24px+env(safe-area-inset-bottom))]"
    >
      <!-- 核心状态卡 -->
      <PeriodStatusCard :model="model" :today="today" :partner-view="isPartnerView" />

      <!-- 操作区：伴侣视角同样可用（代录）；未登录演示态也展示以便预览 -->
      <div v-if="periodOwnerId || !auth.isAuthenticated" class="mt-3">
        <p
          v-if="isProxyRecording"
          class="mb-2 rounded-xl bg-rose/10 px-3 py-2 text-[11px] leading-4 text-rose"
        >
          正在为 {{ coupleStore.context?.partner?.nickname ?? 'TA' }} 代录，记录会标注由你录入
        </p>
        <div class="flex gap-2">
          <template v-if="ongoingCycle">
            <AppButton class="flex-1" tone="amber" @click="endCycleToday">
              <Droplets :size="15" />
              <span class="ml-1">经期结束</span>
            </AppButton>
            <AppButton class="flex-1" variant="secondary" @click="openLogSheet(today)">
              <PenLine :size="15" />
              <span class="ml-1">今日打卡</span>
            </AppButton>
          </template>
          <template v-else>
            <AppButton class="flex-1" tone="amber" @click="startCycleToday">
              <Droplets :size="15" />
              <span class="ml-1">经期来了</span>
            </AppButton>
            <AppButton class="flex-1" variant="secondary" @click="openLogSheet(today)">
              <PenLine :size="15" />
              <span class="ml-1">今日打卡</span>
            </AppButton>
            <AppButton variant="ghost" class="shrink-0" @click="openCycleCreate">
              <Plus :size="15" />
              <span class="ml-1">补录</span>
            </AppButton>
          </template>
        </div>
      </div>

      <!-- 清单 -->
      <template v-if="tab === 'list'">
        <div class="mt-4 flex flex-col gap-3">
          <PeriodHistoryCard
            v-if="ongoingCycle"
            :cycle="ongoingCycle"
            :cycle-length-days="null"
            :readonly="false"
            @end="endCycleToday"
            @edit="openCycleEdit(ongoingCycle)"
            @remove="removeCycle(ongoingCycle.id)"
          />

          <PeriodHistoryCard
            v-for="cycle in closedCycles"
            :key="cycle.id"
            :cycle="cycle"
            :cycle-length-days="cycleLengthOf(cycle)"
            :readonly="false"
            @edit="openCycleEdit(cycle)"
            @remove="removeCycle(cycle.id)"
          />

          <div
            v-if="cycles.length === 0"
            class="flex flex-col items-center gap-2 py-14 text-center"
          >
            <CharacterAvatar character="miffy" mood="caring" :size="52" />
            <p class="text-xs text-fg-soft">
              {{ isProxyRecording ? '她还没有记录，你可以先帮她补一条' : '还没有经期记录，从第一次打卡开始' }}
            </p>
          </div>
        </div>
      </template>

      <!-- 日历 -->
      <div v-else class="mt-4">
        <PeriodCalendarView
          :model="model"
          :logs="logs"
          :today="today"
          :readonly="false"
          @log="openLogSheet"
        />
      </div>

      <!-- 常驻免责声明 -->
      <p class="mt-6 mb-2 text-center text-[10px] leading-4 text-fg-mute">
        当前周期推算基于历史均值进行日历推演，仅供生活与日程参考，
        不可作为避孕或医学诊疗依据
      </p>
    </div>

    <!-- 打卡抽屉 -->
    <PeriodLogSheet
      :open="logSheetOpen"
      :date="logDate || today"
      :existing="logFor(logDate || today) ?? null"
      @close="logSheetOpen = false"
      @save="onLogSave"
      @remove="onLogRemove"
    />

    <!-- 周期补录 / 编辑抽屉 -->
    <CycleFormSheet
      :open="cycleSheetOpen"
      :editing="editingCycle"
      @close="cycleSheetOpen = false"
      @submit="onCycleSubmit"
    />

    <!-- 温和提示条 -->
    <Transition name="toast">
      <div
        v-if="errorToast"
        class="fixed top-[calc(12px+env(safe-area-inset-top))] left-1/2 z-50 -translate-x-1/2 rounded-full border border-separator bg-card-2 px-4 py-2 text-xs whitespace-nowrap text-fg shadow-lg"
        role="status"
      >
        {{ errorToast }}
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 250ms ease,
    transform 250ms cubic-bezier(0.25, 1, 0.5, 1);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -8px);
}
</style>
