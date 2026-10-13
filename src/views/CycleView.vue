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
import { fetchCoupleContext } from '@/services/coupleService';
import { fetchProfile } from '@/services/profileService';
import { daysBetween } from '@/utils/date';
import type { Gender, PeriodCycle, Profile } from '@/types/database';

defineOptions({ name: 'CycleView' });

const auth = useAuthStore();
const coupleStore = useCoupleStore();

// ---------------------------------------------------------------- 视角判定

const myProfile = ref<Profile | null>(null);
const partnerProfile = ref<Profile | null>(null);

/** 男性伴侣视角：仅阶段估算 + 关怀提示，无任何打卡入口 */
const isPartnerView = computed(() => {
  const gender: Gender | null = myProfile.value?.gender ?? 'male'; // Mock 默认男方视角
  return gender === 'male';
});

/** 数据归属人：伴侣视角读她的周期统计，本人视角读自己 */
const periodOwnerId = computed(() => {
  if (isPartnerView.value) {
    return coupleStore.context?.partner?.id ?? null;
  }
  return auth.user?.id ?? null;
});

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
} = usePeriod(periodOwnerId, isPartnerView);

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

      <!-- 操作区（仅本人视角） -->
      <div v-if="!isPartnerView" class="mt-3 flex gap-2">
        <template v-if="ongoingCycle">
          <AppButton class="flex-1" tone="amber" @click="endCycleToday">
            <Droplets :size="15" />
          </AppButton>
          <AppButton class="flex-1" variant="secondary" @click="openLogSheet(today)">
            <PenLine :size="15" />
            今日打卡
          </AppButton>
        </template>
        <template v-else>
          <AppButton class="flex-1" tone="amber" @click="startCycleToday">
            <Droplets :size="15" />
            经期来了
          </AppButton>
          <AppButton class="flex-1" variant="secondary" @click="openLogSheet(today)">
            <PenLine :size="15" />
            今日打卡
          </AppButton>
          <AppButton variant="ghost" class="shrink-0" @click="openCycleCreate">
            <Plus :size="15" />
            补录
          </AppButton>
        </template>
      </div>

      <!-- 清单 -->
      <template v-if="tab === 'list'">
        <div class="mt-4 flex flex-col gap-3">
          <PeriodHistoryCard
            v-if="ongoingCycle"
            :cycle="ongoingCycle"
            :cycle-length-days="null"
            :readonly="isPartnerView"
            @end="endCycleToday"
            @edit="openCycleEdit(ongoingCycle)"
            @remove="removeCycle(ongoingCycle.id)"
          />

          <PeriodHistoryCard
            v-for="cycle in closedCycles"
            :key="cycle.id"
            :cycle="cycle"
            :cycle-length-days="cycleLengthOf(cycle)"
            :readonly="isPartnerView"
            @edit="openCycleEdit(cycle)"
            @remove="removeCycle(cycle.id)"
          />

          <div
            v-if="cycles.length === 0"
            class="flex flex-col items-center gap-2 py-14 text-center"
          >
            <CharacterAvatar character="miffy" mood="caring" :size="52" />
            <p class="text-xs text-fg-soft">还没有经期记录，从第一次打卡开始</p>
          </div>
        </div>
      </template>

      <!-- 日历 -->
      <div v-else class="mt-4">
        <PeriodCalendarView
          :model="model"
          :logs="logs"
          :today="today"
          :readonly="isPartnerView"
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
