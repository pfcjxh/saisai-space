<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Check, ChevronLeft, Heart, MapPin, Pencil, Sparkles, User } from '@lucide/vue';
import AppButton from '@/components/common/AppButton.vue';
import AppCard from '@/components/common/AppCard.vue';
import IconTile from '@/components/common/IconTile.vue';
import CharacterAvatar from '@/components/common/CharacterAvatar.vue';
import ThemeSettingSheet from '@/components/settings/ThemeSettingSheet.vue';
import NotificationSettingSheet from '@/components/settings/NotificationSettingSheet.vue';
import { useAuthStore } from '@/stores/auth';
import { useCoupleStore } from '@/stores/couple';
import { fetchProfile, updateProfile } from '@/services/profileService';
import { updateRelationshipStartedAt } from '@/services/coupleService';
import { updateNotifyPrefs } from '@/services/pushService';
import { CITY_GROUPS } from '@/composables/useWeather';
import { buildTodayMock } from '@/mocks/todayMock';
import { DEFAULT_TIMEZONE, daysBetween, formatDateWithWeekday, todayInTimezone } from '@/utils/date';
import type { NotifyPrefsState } from '@/components/settings/NotificationSettingSheet.vue';
import type { Profile } from '@/types/database';

/**
 * SettingsView — 集中式设置页
 *
 * 产品取向：这个空间是两个人私有的，且一方可能长时间无法操作手机，
 * 因此**允许为对方维护资料**（昵称、所在城市）。所有可编辑项都直接落库，
 * 不做「只有本人能改」的限制——RLS 已在数据库层放开这一写权限。
 */

defineOptions({ name: 'SettingsView' });

const router = useRouter();
const auth = useAuthStore();
const coupleStore = useCoupleStore();

// ---------------------------------------------------------------- 状态

const me = ref<Profile | null>(null);
const partner = ref<Profile | null>(null);
const loading = ref(true);
const saving = ref(false);
const toast = ref<string | null>(null);
const toastIsError = ref(false);

/** 在一起的日子（本地编辑态，YYYY-MM-DD） */
const startedAt = ref('');
/** 首页情话（本地编辑态） */
const loveNote = ref('');

const themeOpen = ref(false);
const notifyOpen = ref(false);

/** 哪个城市选择器在展开：'me' | 'partner' | null */
const cityPickerFor = ref<'me' | 'partner' | null>(null);
/** 城市手动输入（支持任意城市名，走地理编码） */
const customCity = ref('');
/** 正在等待确认的昵称编辑：'me' | 'partner' | null */
const nicknameEditingFor = ref<'me' | 'partner' | null>(null);
const nicknameDraft = ref('');

const coupleId = computed(() => coupleStore.coupleId);
const timezone = computed(() => me.value?.timezone ?? DEFAULT_TIMEZONE);
const today = computed(() => todayInTimezone(timezone.value));

/** 在一起多少天（用于即时反馈，不依赖服务端） */
const daysTogether = computed(() => {
  if (!startedAt.value) return 0;
  return daysBetween(startedAt.value, today.value) + 1;
});

/** 在一起日期的可读形式 */
const startedAtLabel = computed(() =>
  startedAt.value ? formatDateWithWeekday(startedAt.value) : '未设置',
);

const notifyPrefs = computed<NotifyPrefsState>(() => ({
  notify_diary: me.value?.notify_diary ?? true,
  notify_anniversary: me.value?.notify_anniversary ?? true,
  notify_period: me.value?.notify_period ?? true,
}));

// ---------------------------------------------------------------- 提示

let toastTimer: number | undefined;
function showToast(message: string, isError = false): void {
  toast.value = message;
  toastIsError.value = isError;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.value = null;
  }, 2400);
}

// ---------------------------------------------------------------- 载入

async function load(): Promise<void> {
  loading.value = true;
  try {
    const uid = auth.user?.id;
    // 未登录：进入演示态。与项目其它页面一致使用 Mock 兜底，
    // 保证设置页在任何情况下都有完整内容可看，而不是空白。
    if (!uid) {
      const mock = buildTodayMock();
      me.value = mock.me;
      partner.value = mock.partner;
      startedAt.value = mock.couple.relationship_started_at;
      loveNote.value = mock.me.love_note ?? '';
      return;
    }

    const self = await fetchProfile(uid);
    me.value = self;
    loveNote.value = self?.love_note ?? '';

    const context = coupleStore.context;
    if (context) {
      partner.value = context.partner;
      startedAt.value = context.couple.relationship_started_at;
    } else if (self) {
      startedAt.value = today.value;
    }
  } catch {
    showToast('资料加载失败，请检查网络', true);
  } finally {
    loading.value = false;
  }
}

onMounted(load);

// ---------------------------------------------------------------- 保存：在一起的日子

async function onSaveStartedAt(): Promise<void> {
  const cid = coupleId.value;
  if (!cid) {
    showToast('还没有双人空间，无法设置', true);
    return;
  }
  if (!startedAt.value) {
    showToast('请先选择日期', true);
    return;
  }
  if (startedAt.value > today.value) {
    showToast('在一起的日子不能晚于今天', true);
    return;
  }
  saving.value = true;
  try {
    const updated = await updateRelationshipStartedAt(cid, startedAt.value);
    // 同步 store，避免返回首页后仍显示旧值
    if (coupleStore.context) {
      coupleStore.setContext({ ...coupleStore.context, couple: updated });
    }
    showToast(`已保存 · 在一起第 ${daysTogether.value} 天`);
  } catch {
    showToast('保存失败，请重试', true);
  } finally {
    saving.value = false;
  }
}

// ---------------------------------------------------------------- 保存：昵称

function startEditNickname(who: 'me' | 'partner'): void {
  nicknameEditingFor.value = who;
  nicknameDraft.value = (who === 'me' ? me.value?.nickname : partner.value?.nickname) ?? '';
}

async function onSaveNickname(who: 'me' | 'partner'): Promise<void> {
  const target = who === 'me' ? me.value : partner.value;
  const name = nicknameDraft.value.trim();
  if (!target) return;
  if (!name) {
    showToast('昵称不能为空', true);
    return;
  }
  if (name === target.nickname) {
    nicknameEditingFor.value = null;
    return;
  }
  saving.value = true;
  try {
    const updated = await updateProfile(target.id, { nickname: name });
    if (who === 'me') me.value = updated;
    else {
      partner.value = updated;
      if (coupleStore.context) {
        coupleStore.setContext({ ...coupleStore.context, partner: updated });
      }
    }
    nicknameEditingFor.value = null;
    showToast('昵称已更新');
  } catch {
    showToast('保存失败，请重试', true);
  } finally {
    saving.value = false;
  }
}

// ---------------------------------------------------------------- 保存：城市

async function onPickCity(who: 'me' | 'partner', city: string): Promise<void> {
  const target = who === 'me' ? me.value : partner.value;
  const name = city.trim();
  if (!target || !name) return;
  saving.value = true;
  try {
    // 切换城市时清空旧坐标，让前端按城市名重新解析（含地理编码兜底）
    const updated = await updateProfile(target.id, {
      weather_city: name,
      weather_lat: null,
      weather_lon: null,
    });
    if (who === 'me') me.value = updated;
    else {
      partner.value = updated;
      if (coupleStore.context) {
        coupleStore.setContext({ ...coupleStore.context, partner: updated });
      }
    }
    cityPickerFor.value = null;
    customCity.value = '';
    showToast(`已切换到「${name}」`);
  } catch {
    showToast('保存失败，请重试', true);
  } finally {
    saving.value = false;
  }
}

// ---------------------------------------------------------------- 保存：情话

async function onSaveLoveNote(): Promise<void> {
  const uid = auth.user?.id;
  if (!uid) return;
  const text = loveNote.value.trim();
  saving.value = true;
  try {
    const updated = await updateProfile(uid, { love_note: text || null });
    me.value = updated;
    showToast(text ? '情话已更新' : '已清空，将使用默认文案');
  } catch {
    showToast('保存失败，请重试', true);
  } finally {
    saving.value = false;
  }
}

// ---------------------------------------------------------------- 通知

async function onToggleNotifyPref(key: keyof NotifyPrefsState): Promise<void> {
  const uid = auth.user?.id;
  if (!uid || !me.value) return;
  const next = !notifyPrefs.value[key];
  me.value = { ...me.value, [key]: next };
  try {
    await updateNotifyPrefs(uid, { [key]: next });
  } catch {
    me.value = { ...me.value, [key]: !next };
    showToast('设置同步失败', true);
  }
}

// ---------------------------------------------------------------- 退出

async function onSignOut(): Promise<void> {
  await auth.signOut();
  coupleStore.reset();
  router.replace({ name: 'auth' });
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- 页头 -->
    <header class="flex items-center gap-2 px-3 pt-safe">
      <button
        type="button"
        class="mt-3 flex size-9 shrink-0 items-center justify-center rounded-full bg-card text-fg transition-transform duration-200 ease-out-quart active:scale-90"
        aria-label="返回"
        @click="router.back()"
      >
        <ChevronLeft :size="18" />
      </button>
      <div class="mt-3 min-w-0 flex-1">
        <h1 class="text-lg font-bold">设置</h1>
        <p class="text-[11px] text-fg-soft">这里的内容都可以直接改</p>
      </div>
    </header>

    <div
      class="scrollbar-none mt-3 min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 pb-[calc(32px+env(safe-area-inset-bottom))]"
    >
      <p v-if="loading" class="py-10 text-center text-xs text-fg-soft">加载中…</p>

      <template v-else>
        <!-- ============ 我们的空间 ============ -->
        <section>
          <p class="mb-2 px-1 text-[11px] text-fg-soft">我们的空间</p>

          <AppCard accent="amber">
            <div class="flex items-center gap-3">
              <IconTile tone="amber">
                <Heart :size="20" :stroke-width="1.8" fill="currentColor" />
              </IconTile>
              <div class="min-w-0 flex-1">
                <p class="text-[11px] text-fg-soft">在一起的日子</p>
                <p class="text-base font-semibold tabular-nums">{{ startedAtLabel }}</p>
                <p v-if="daysTogether > 0" class="mt-0.5 text-[11px] text-amber-warm tabular-nums">
                  已经一起走过 {{ daysTogether }} 天
                </p>
              </div>
            </div>

            <input
              v-model="startedAt"
              type="date"
              :max="today"
              class="mt-3 h-11 w-full rounded-xl border border-separator bg-card-2 px-3 text-sm text-fg outline-none focus:border-amber-warm/50"
            />
            <AppButton
              block
              tone="amber"
              class="mt-2"
              :loading="saving"
              :disabled="!coupleId"
              @click="onSaveStartedAt"
            >
              {{ coupleId ? '保存日期' : '尚未配对空间' }}
            </AppButton>
            <p v-if="!coupleId" class="mt-2 text-center text-[10px] text-fg-soft">
              先到「登录」页创建或加入双人空间
            </p>
          </AppCard>

          <!-- 邀请码 -->
          <div
            v-if="coupleStore.context"
            class="mt-2 flex items-center justify-between rounded-2xl bg-card-2 px-4 py-3"
          >
            <span class="text-xs text-fg-soft">空间邀请码</span>
            <span class="text-sm font-semibold tracking-[0.2em] text-amber-warm tabular-nums">
              {{ coupleStore.context.couple.invite_code }}
            </span>
          </div>
        </section>

        <!-- ============ 我 ============ -->
        <section>
          <p class="mb-2 px-1 text-[11px] text-fg-soft">我</p>
          <AppCard accent="serene">
            <!-- 昵称 -->
            <div class="flex items-center gap-3">
              <CharacterAvatar
                :character="coupleStore.context?.myRole === 'partner' ? 'miffy' : 'hachi'"
                :mood="(me?.mood as never) ?? 'calm'"
                :size="40"
              />
              <div class="min-w-0 flex-1">
                <p class="text-[11px] text-fg-soft">昵称</p>
                <template v-if="nicknameEditingFor === 'me'">
                  <input
                    v-model="nicknameDraft"
                    type="text"
                    maxlength="12"
                    class="mt-1 h-9 w-full rounded-lg border border-separator bg-card-2 px-2 text-sm text-fg outline-none focus:border-serene/50"
                    @keyup.enter="onSaveNickname('me')"
                  />
                </template>
                <p v-else class="truncate text-base font-semibold">{{ me?.nickname ?? '—' }}</p>
              </div>
              <button
                v-if="nicknameEditingFor === 'me'"
                type="button"
                class="flex size-8 shrink-0 items-center justify-center rounded-full bg-serene text-on-accent"
                aria-label="保存昵称"
                @click="onSaveNickname('me')"
              >
                <Check :size="15" :stroke-width="3" />
              </button>
              <button
                v-else
                type="button"
                class="flex size-8 shrink-0 items-center justify-center rounded-full bg-card-2 text-fg-soft"
                aria-label="修改昵称"
                @click="startEditNickname('me')"
              >
                <Pencil :size="14" />
              </button>
            </div>

            <!-- 我的城市 -->
            <div class="mt-3 border-t border-separator pt-3">
              <button
                type="button"
                class="flex w-full items-center gap-3 text-left"
                @click="cityPickerFor = cityPickerFor === 'me' ? null : 'me'"
              >
                <IconTile tone="serene" :size="36">
                  <MapPin :size="17" :stroke-width="1.8" />
                </IconTile>
                <span class="min-w-0 flex-1">
                  <span class="block text-[11px] text-fg-soft">我所在的城市（天气）</span>
                  <span class="block truncate text-sm font-medium">{{ me?.weather_city ?? '—' }}</span>
                </span>
                <span class="shrink-0 text-[11px] text-serene">
                  {{ cityPickerFor === 'me' ? '收起' : '修改' }}
                </span>
              </button>

              <div v-if="cityPickerFor === 'me'" class="mt-3 space-y-2">
                <div class="flex gap-2">
                  <input
                    v-model="customCity"
                    type="text"
                    placeholder="直接输入城市名，如 青岛"
                    class="h-9 min-w-0 flex-1 rounded-lg border border-separator bg-card-2 px-3 text-xs text-fg outline-none focus:border-serene/50"
                    @keyup.enter="onPickCity('me', customCity)"
                  />
                  <AppButton size="sm" :disabled="!customCity.trim()" @click="onPickCity('me', customCity)">
                    确定
                  </AppButton>
                </div>
                <div v-for="group in CITY_GROUPS" :key="group.label">
                  <p class="mb-1 mt-2 text-[10px] text-fg-mute">{{ group.label }}</p>
                  <div class="flex flex-wrap gap-1.5">
                    <button
                      v-for="c in group.cities"
                      :key="c"
                      type="button"
                      class="rounded-full px-2.5 py-1 text-[11px] transition-colors"
                      :class="
                        me?.weather_city === c
                          ? 'bg-serene text-on-accent'
                          : 'bg-card-2 text-fg-soft'
                      "
                      @click="onPickCity('me', c)"
                    >
                      {{ c }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </AppCard>
        </section>

        <!-- ============ TA ============ -->
        <section v-if="partner">
          <p class="mb-2 px-1 text-[11px] text-fg-soft">
            TA（你随时可以帮 TA 维护）
          </p>
          <AppCard accent="rose">
            <!-- 昵称 -->
            <div class="flex items-center gap-3">
              <CharacterAvatar
                :character="coupleStore.context?.myRole === 'partner' ? 'hachi' : 'miffy'"
                :mood="(partner.mood as never) ?? 'calm'"
                :size="40"
              />
              <div class="min-w-0 flex-1">
                <p class="text-[11px] text-fg-soft">昵称</p>
                <template v-if="nicknameEditingFor === 'partner'">
                  <input
                    v-model="nicknameDraft"
                    type="text"
                    maxlength="12"
                    class="mt-1 h-9 w-full rounded-lg border border-separator bg-card-2 px-2 text-sm text-fg outline-none focus:border-rose/50"
                    @keyup.enter="onSaveNickname('partner')"
                  />
                </template>
                <p v-else class="truncate text-base font-semibold">{{ partner.nickname }}</p>
              </div>
              <button
                v-if="nicknameEditingFor === 'partner'"
                type="button"
                class="flex size-8 shrink-0 items-center justify-center rounded-full bg-rose text-on-accent"
                aria-label="保存昵称"
                @click="onSaveNickname('partner')"
              >
                <Check :size="15" :stroke-width="3" />
              </button>
              <button
                v-else
                type="button"
                class="flex size-8 shrink-0 items-center justify-center rounded-full bg-card-2 text-fg-soft"
                aria-label="修改 TA 的昵称"
                @click="startEditNickname('partner')"
              >
                <Pencil :size="14" />
              </button>
            </div>

            <!-- TA 的城市 -->
            <div class="mt-3 border-t border-separator pt-3">
              <button
                type="button"
                class="flex w-full items-center gap-3 text-left"
                @click="cityPickerFor = cityPickerFor === 'partner' ? null : 'partner'"
              >
                <IconTile tone="rose" :size="36">
                  <MapPin :size="17" :stroke-width="1.8" />
                </IconTile>
                <span class="min-w-0 flex-1">
                  <span class="block text-[11px] text-fg-soft">TA 所在的城市（天气）</span>
                  <span class="block truncate text-sm font-medium">{{ partner.weather_city }}</span>
                </span>
                <span class="shrink-0 text-[11px] text-rose">
                  {{ cityPickerFor === 'partner' ? '收起' : '修改' }}
                </span>
              </button>

              <div v-if="cityPickerFor === 'partner'" class="mt-3 space-y-2">
                <div class="flex gap-2">
                  <input
                    v-model="customCity"
                    type="text"
                    placeholder="直接输入城市名，如 莱阳"
                    class="h-9 min-w-0 flex-1 rounded-lg border border-separator bg-card-2 px-3 text-xs text-fg outline-none focus:border-rose/50"
                    @keyup.enter="onPickCity('partner', customCity)"
                  />
                  <AppButton size="sm" tone="amber" :disabled="!customCity.trim()" @click="onPickCity('partner', customCity)">
                    确定
                  </AppButton>
                </div>
                <div v-for="group in CITY_GROUPS" :key="group.label">
                  <p class="mb-1 mt-2 text-[10px] text-fg-mute">{{ group.label }}</p>
                  <div class="flex flex-wrap gap-1.5">
                    <button
                      v-for="c in group.cities"
                      :key="c"
                      type="button"
                      class="rounded-full px-2.5 py-1 text-[11px] transition-colors"
                      :class="
                        partner.weather_city === c
                          ? 'bg-rose text-on-accent'
                          : 'bg-card-2 text-fg-soft'
                      "
                      @click="onPickCity('partner', c)"
                    >
                      {{ c }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </AppCard>
        </section>

        <!-- ============ 首页文案 ============ -->
        <section>
          <p class="mb-2 px-1 text-[11px] text-fg-soft">首页文案</p>
          <AppCard accent="lilac">
            <div class="flex items-center gap-3">
              <IconTile tone="lilac">
                <Sparkles :size="20" :stroke-width="1.8" />
              </IconTile>
              <div class="min-w-0 flex-1">
                <p class="text-[11px] text-fg-soft">问候语下面那句话</p>
                <p class="mt-0.5 text-xs text-fg-mute">留空则显示默认文案</p>
              </div>
            </div>
            <input
              v-model="loveNote"
              type="text"
              maxlength="30"
              placeholder="老婆，我爱你。"
              class="mt-3 h-11 w-full rounded-xl border border-separator bg-card-2 px-3 text-sm text-fg placeholder-fg-mute outline-none focus:border-lilac/50"
              @keyup.enter="onSaveLoveNote"
            />
            <AppButton block class="mt-2" :loading="saving" @click="onSaveLoveNote">
              保存文案
            </AppButton>
          </AppCard>
        </section>

        <!-- ============ 通知 / 主题 ============ -->
        <section>
          <p class="mb-2 px-1 text-[11px] text-fg-soft">提醒与外观</p>
          <div class="space-y-2">
            <button
              type="button"
              class="flex w-full items-center justify-between rounded-2xl bg-card px-4 py-3.5 active:scale-[0.99]"
              @click="notifyOpen = true"
            >
              <span class="text-sm">消息提醒</span>
              <span class="text-[11px] text-fg-soft">
                {{ notifyPrefs.notify_diary ? '日记开' : '日记关' }} ·
                {{ notifyPrefs.notify_anniversary ? '纪念日开' : '纪念日关' }} ·
                {{ notifyPrefs.notify_period ? '经期开' : '经期关' }}
              </span>
            </button>
            <button
              type="button"
              class="flex w-full items-center justify-between rounded-2xl bg-card px-4 py-3.5 active:scale-[0.99]"
              @click="themeOpen = true"
            >
              <span class="text-sm">主题外观</span>
              <span class="text-[11px] text-fg-soft">按你的喜好切换</span>
            </button>
          </div>
        </section>

        <!-- ============ 账号 ============ -->
        <section>
          <p class="mb-2 px-1 text-[11px] text-fg-soft">账号</p>
          <div class="rounded-2xl bg-card px-4 py-3.5">
            <div class="flex items-center gap-2">
              <User :size="14" class="text-fg-soft" />
              <span class="min-w-0 flex-1 truncate text-xs text-fg-soft">
                {{ auth.user?.email ?? '演示模式（未登录）' }}
              </span>
            </div>
            <AppButton
              v-if="auth.isAuthenticated"
              block
              variant="secondary"
              class="mt-3"
              @click="onSignOut"
            >
              退出登录
            </AppButton>
          </div>
        </section>
      </template>
    </div>

    <!-- 提示条 -->
    <Transition name="toast">
      <p
        v-if="toast"
        class="pointer-events-none absolute inset-x-0 top-16 z-40 mx-auto w-fit max-w-[80%] rounded-full px-4 py-2 text-xs shadow-lg backdrop-blur"
        :class="toastIsError ? 'bg-red-500/90 text-white' : 'bg-card-2/95 text-fg'"
      >
        {{ toast }}
      </p>
    </Transition>

    <NotificationSettingSheet
      :open="notifyOpen"
      :my-user-id="auth.user?.id ?? null"
      :prefs="notifyPrefs"
      @close="notifyOpen = false"
      @toggle-pref="onToggleNotifyPref"
    />
    <ThemeSettingSheet :open="themeOpen" @close="themeOpen = false" />
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 200ms cubic-bezier(0.25, 1, 0.5, 1),
    transform 200ms cubic-bezier(0.25, 1, 0.5, 1);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
