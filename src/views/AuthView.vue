<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Check, Copy, Heart, LogOut, Plus, RefreshCw, Ticket } from '@lucide/vue';
import { useAuthStore } from '@/stores/auth';
import { useCoupleStore } from '@/stores/couple';
import AppButton from '@/components/common/AppButton.vue';
import AppTabs from '@/components/common/AppTabs.vue';
import { signIn, signUp, signOut } from '@/services/authService';
import {
  createCoupleWithMembership,
  fetchCoupleContext,
  joinCoupleByInvite,
  mapCoupleError,
} from '@/services/coupleService';
import { todayInTimezone } from '@/utils/date';
import type { Gender } from '@/types/database';

defineOptions({ name: 'AuthView' });

const router = useRouter();
const auth = useAuthStore();
const coupleStore = useCoupleStore();

// ---------------------------------------------------------------- 状态

type Mode = 'login' | 'register';
const mode = ref<Mode>('login');

const email = ref('');
const password = ref('');
const nickname = ref('');
const gender = ref<Gender | null>(null);

const busy = ref(false);
const feedback = ref<string | null>(null);
const feedbackIsError = ref(false);

/** 注册成功但等待邮箱确认（无会话） */
const pendingConfirmation = ref<string | null>(null);

/**
 * 页面状态机（五态互斥）。
 *
 * 修复记录：原实现用 `needsPairing = context === null` 判定，遗漏了
 * 「已创建空间但 TA 还没加入」这一状态（context 非空、partner 为空）——
 * 该状态下 needsPairing 与 isPaired 同时为 false，页面回落到登录/注册表单，
 * 导致 onCreateCouple 成功后邀请码在界面上完全不可达，主流程被打断。
 * 现改为显式五态：任意时刻必有且仅有一个分支命中。
 */
type AuthStage = 'confirm-email' | 'login' | 'create-couple' | 'await-partner' | 'paired';

const stage = computed<AuthStage>(() => {
  if (pendingConfirmation.value) return 'confirm-email';
  if (!auth.isAuthenticated) return 'login';
  const context = coupleStore.context;
  if (context === null) return 'create-couple';
  // 空间已存在：有伴侣 → 已配对；无伴侣 → 等 TA 凭邀请码加入
  return context.partner !== null ? 'paired' : 'await-partner';
});

const startedAt = ref(todayInTimezone('Asia/Shanghai'));
const inviteCode = ref('');

const modeOptions = [
  { value: 'login', label: '登录' },
  { value: 'register', label: '注册' },
];

// ---------------------------------------------------------------- 提示

function showFeedback(message: string, isError: boolean): void {
  feedback.value = message;
  feedbackIsError.value = isError;
}

// ---------------------------------------------------------------- 登录 / 注册

async function onLogin(): Promise<void> {
  if (!email.value.trim() || !password.value) {
    showFeedback('请填写邮箱与密码', true);
    return;
  }
  busy.value = true;
  feedback.value = null;
  try {
    const result = await signIn(email.value.trim(), password.value);
    if (!result.ok) {
      showFeedback(result.message ?? '登录失败', true);
      return;
    }
    await afterAuth();
  } finally {
    busy.value = false;
  }
}

async function onRegister(): Promise<void> {
  if (!email.value.trim() || password.value.length < 6) {
    showFeedback('请填写邮箱与至少 6 位的密码', true);
    return;
  }
  busy.value = true;
  feedback.value = null;
  try {
    const result = await signUp({
      email: email.value.trim(),
      password: password.value,
      nickname: nickname.value.trim() || '伴侣',
      gender: gender.value,
    });
    if (!result.ok) {
      showFeedback(result.message ?? '注册失败', true);
      return;
    }
    if (result.needsEmailConfirmation) {
      pendingConfirmation.value = email.value.trim();
      return;
    }
    await afterAuth();
  } finally {
    busy.value = false;
  }
}

/**
 * 登录 / 创建空间 / 加入空间成功后：拉取空间上下文并写入 store。
 *
 * 注意：**只有真正配对成功（partner 非空）才自动跳转首页**。
 * 仅创建了空间的用户必须停留在「等待 TA 加入」页，否则邀请码无处可看。
 */
async function afterAuth(): Promise<void> {
  const uid = auth.user?.id;
  if (!uid) return;
  try {
    const context = await fetchCoupleContext(uid);
    coupleStore.setContext(context);
    if (context?.partner) {
      await router.replace({ name: 'today' });
    }
  } catch {
    showFeedback('网络异常，请稍后重试', true);
  }
}

/** 等待配对页：手动刷新伴侣状态（TA 可能刚用邀请码加入） */
const refreshing = ref(false);

async function onRefreshPairing(): Promise<void> {
  refreshing.value = true;
  feedback.value = null;
  try {
    await afterAuth();
    if (stage.value === 'paired') showFeedback('配对成功！', false);
    else showFeedback('TA 还没加入，稍后再试试', false);
  } finally {
    refreshing.value = false;
  }
}

// ---------------------------------------------------------------- 邀请码

const copied = ref(false);
let copiedTimer: number | undefined;

async function onCopyInviteCode(): Promise<void> {
  const code = coupleStore.context?.couple.invite_code;
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    copied.value = true;
    window.clearTimeout(copiedTimer);
    copiedTimer = window.setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch {
    // 非安全上下文或用户拒绝授权：邀请码已在页面上明文展示，无需报错
    showFeedback('复制失败，请手动长按邀请码', true);
  }
}

onUnmounted(() => {
  window.clearTimeout(copiedTimer);
});

// ---------------------------------------------------------------- 配对

async function onCreateCouple(): Promise<void> {
  busy.value = true;
  feedback.value = null;
  try {
    await createCoupleWithMembership(startedAt.value);
    await afterAuth();
    // afterAuth 内部仅在「已配对」时跳转；此处为「空间刚建好，等 TA 加入」
    if (stage.value === 'await-partner') {
      showFeedback('空间创建成功，把邀请码发给 TA 吧', false);
    }
  } catch (err) {
    showFeedback(mapCoupleError(err instanceof Error ? err.message : '创建失败'), true);
  } finally {
    busy.value = false;
  }
}

async function onJoinCouple(): Promise<void> {
  const code = inviteCode.value.trim().toUpperCase();
  if (code.length < 6) {
    showFeedback('请输入 6 位邀请码', true);
    return;
  }
  busy.value = true;
  feedback.value = null;
  try {
    await joinCoupleByInvite(code);
    showFeedback('配对成功！', false);
    await afterAuth();
  } catch (err) {
    showFeedback(mapCoupleError(err instanceof Error ? err.message : '加入失败'), true);
  } finally {
    busy.value = false;
  }
}

// ---------------------------------------------------------------- 退出

async function onSignOut(): Promise<void> {
  await signOut();
  coupleStore.reset();
  feedback.value = null;
  pendingConfirmation.value = null;
  mode.value = 'login';
  password.value = '';
}

// ---------------------------------------------------------------- 初始化

onMounted(async () => {
  if (!auth.isAuthenticated) return;
  await afterAuth();
});

const inviteCodeOf = computed(() => coupleStore.context?.couple.invite_code ?? null);
</script>

<template>
  <main class="flex min-h-full flex-col items-center justify-center gap-6 px-6 pt-safe pb-safe">
    <!-- 头部 -->
    <div class="flex flex-col items-center gap-3">
      <div class="flex items-center -space-x-3">
        <img
          src="/avatars/me.webp"
          alt=""
          class="size-14 rounded-full bg-white object-cover ring-2 ring-ink"
        />
        <img
          src="/avatars/partner.webp"
          alt=""
          class="size-14 rounded-full bg-white object-cover ring-2 ring-ink"
        />
      </div>
      <div class="text-center">
        <h1 class="text-xl font-bold">赛赛 · 双人空间</h1>
        <p class="mt-1 text-xs text-fg-soft">只属于你们两个人的私密小宇宙</p>
      </div>
    </div>

    <!-- 注册后等待邮箱确认 -->
    <div
      v-if="stage === 'confirm-email'"
      class="w-full max-w-[340px] rounded-3xl border border-separator bg-card p-5 text-center"
    >
      <p class="text-sm font-medium">确认邮件已发送</p>
      <p class="mt-2 text-xs leading-5 text-fg-soft">
        请到 {{ pendingConfirmation }} 的邮箱点击确认链接，
        然后回到这里登录
      </p>
      <AppButton
        block
        variant="secondary"
        class="mt-4"
        @click="
          () => {
            pendingConfirmation = null;
            mode = 'login';
          }
        "
      >
        去登录
      </AppButton>
    </div>

    <!-- 已登录未配对：创建空间 / 凭邀请码加入 -->
    <template v-else-if="stage === 'create-couple'">
      <div class="w-full max-w-[340px] rounded-3xl border border-separator bg-card p-5">
        <p class="text-center text-sm font-medium">
          {{ auth.user?.email }} · 开始你们的空间
        </p>

        <!-- 创建空间 -->
        <div class="mt-4 rounded-2xl bg-card-2 p-4">
          <p class="flex items-center gap-1.5 text-sm text-fg">
            <Plus :size="14" class="text-serene" />
            创建双人空间
          </p>
          <p class="mt-1 text-[10px] text-fg-soft">生成邀请码，等 TA 来加入</p>
          <label class="mt-3 mb-1.5 block text-[10px] text-fg-soft">在一起的日子</label>
          <input
            v-model="startedAt"
            type="date"
            class="h-10 w-full rounded-xl border border-separator bg-card px-3 text-sm text-fg outline-none focus:border-serene/50"
          />
          <AppButton block class="mt-3" :loading="busy" @click="onCreateCouple">
            创建空间
          </AppButton>
        </div>

        <!-- 加入空间 -->
        <div class="mt-3 rounded-2xl bg-card-2 p-4">
          <p class="flex items-center gap-1.5 text-sm text-fg">
            <Ticket :size="14" class="text-lilac" />
            加入 TA 的空间
          </p>
          <p class="mt-1 text-[10px] text-fg-soft">输入 TA 发来的 6 位邀请码</p>
          <input
            v-model="inviteCode"
            type="text"
            maxlength="6"
            placeholder="例如 QGWYVQ"
            autocapitalize="characters"
            autocomplete="off"
            spellcheck="false"
            class="mt-3 h-10 w-full rounded-xl border border-separator bg-card px-3 text-center text-sm tracking-[0.3em] text-fg uppercase placeholder-fg-mute outline-none focus:border-lilac/50"
          />
          <AppButton block tone="amber" class="mt-3" :loading="busy" @click="onJoinCouple">
            加入
          </AppButton>
        </div>

        <p
          v-if="feedback"
          class="mt-3 text-center text-[11px]"
          :class="feedbackIsError ? 'text-red-400' : 'text-serene'"
        >
          {{ feedback }}
        </p>

        <button
          type="button"
          class="mt-4 flex w-full items-center justify-center gap-1 text-[11px] text-fg-soft"
          @click="onSignOut"
        >
          <LogOut :size="11" />
          退出登录
        </button>
      </div>
    </template>

    <!-- 空间已创建、TA 还没加入：邀请码的主展示位 -->
    <template v-else-if="stage === 'await-partner'">
      <div class="w-full max-w-[340px] rounded-3xl border border-separator bg-card p-5 text-center">
        <p class="text-sm font-medium">空间已创建，等 TA 加入</p>
        <p class="mt-1 text-[11px] leading-5 text-fg-soft">
          把下面的邀请码发给 TA，TA 在自己的手机上注册后填入即可
        </p>

        <div class="mt-4 rounded-2xl bg-card-2 px-4 py-3">
          <p class="text-[10px] text-fg-soft">你们的空间邀请码</p>
          <p class="mt-1 text-2xl font-bold tracking-[0.25em] text-amber-warm tabular-nums">
            {{ inviteCodeOf ?? '······' }}
          </p>
        </div>

        <AppButton
          block
          variant="secondary"
          class="mt-3"
          :disabled="!inviteCodeOf"
          @click="onCopyInviteCode"
        >
          <span class="flex items-center justify-center gap-1.5">
            <component :is="copied ? Check : Copy" :size="14" />
            {{ copied ? '已复制' : '复制邀请码' }}
          </span>
        </AppButton>

        <AppButton block class="mt-2" :loading="refreshing" @click="onRefreshPairing">
          <span class="flex items-center justify-center gap-1.5">
            <RefreshCw :size="14" />
            刷新配对状态
          </span>
        </AppButton>

        <p
          v-if="feedback"
          class="mt-3 text-center text-[11px]"
          :class="feedbackIsError ? 'text-red-400' : 'text-serene'"
        >
          {{ feedback }}
        </p>

        <button
          type="button"
          class="mt-4 flex w-full items-center justify-center gap-1 text-[11px] text-fg-soft"
          @click="onSignOut"
        >
          <LogOut :size="11" />
          退出登录
        </button>
      </div>
    </template>

    <!-- 已配对：进应用 -->
    <template v-else-if="stage === 'paired'">
      <div class="w-full max-w-[340px] rounded-3xl border border-separator bg-card p-5 text-center">
        <Heart :size="20" class="mx-auto text-amber-warm" fill="currentColor" />
        <p class="mt-3 text-sm font-medium">配对成功</p>
        <p v-if="inviteCodeOf" class="mt-1 text-[11px] text-fg-soft tabular-nums">
          你们的空间邀请码：{{ inviteCodeOf }}
        </p>
        <AppButton block class="mt-4" @click="router.replace({ name: 'today' })">
          进入我们的空间
        </AppButton>
      </div>
    </template>

    <!-- 登录 / 注册 -->
    <template v-else>
      <div class="w-full max-w-[340px] rounded-3xl border border-separator bg-card p-5">
        <AppTabs v-model="mode" :options="modeOptions" />

        <input
          v-model="email"
          type="email"
          inputmode="email"
          autocomplete="email"
          placeholder="邮箱"
          class="mt-4 h-11 w-full rounded-xl border border-separator bg-card-2 px-4 text-sm text-fg placeholder-fg-mute outline-none focus:border-serene/50"
        />
        <input
          v-model="password"
          type="password"
          :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
          placeholder="密码（至少 6 位）"
          class="mt-2 h-11 w-full rounded-xl border border-separator bg-card-2 px-4 text-sm text-fg placeholder-fg-mute outline-none focus:border-serene/50"
          @keyup.enter="mode === 'login' ? onLogin() : onRegister()"
        />

        <template v-if="mode === 'register'">
          <input
            v-model="nickname"
            type="text"
            maxlength="12"
            placeholder="昵称（TA 看到的名字）"
            class="mt-2 h-11 w-full rounded-xl border border-separator bg-card-2 px-4 text-sm text-fg placeholder-fg-mute outline-none focus:border-serene/50"
          />
          <div class="mt-2 flex items-center gap-2">
            <span class="text-[11px] text-fg-soft">我是</span>
            <button
              type="button"
              class="h-8 flex-1 rounded-full border text-xs transition-all duration-200 ease-out-quart active:scale-95"
              :class="
                gender === 'male'
                  ? 'border-serene/40 bg-serene/15 text-serene'
                  : 'border-transparent bg-card-2 text-fg-soft'
              "
              @click="gender = gender === 'male' ? null : 'male'"
            >
              男生
            </button>
            <button
              type="button"
              class="h-8 flex-1 rounded-full border text-xs transition-all duration-200 ease-out-quart active:scale-95"
              :class="
                gender === 'female'
                  ? 'border-rose/40 bg-rose/15 text-rose'
                  : 'border-transparent bg-card-2 text-fg-soft'
              "
              @click="gender = gender === 'female' ? null : 'female'"
            >
              女生
            </button>
          </div>
        </template>

        <AppButton
          block
          class="mt-4"
          :loading="busy"
          @click="mode === 'login' ? onLogin() : onRegister()"
        >
          {{ mode === 'login' ? '登录' : '注册并开始' }}
        </AppButton>

        <p
          v-if="feedback"
          class="mt-3 text-center text-[11px]"
          :class="feedbackIsError ? 'text-red-400' : 'text-serene'"
        >
          {{ feedback }}
        </p>
      </div>

      <p class="text-center text-[10px] leading-4 text-fg-mute">
        注册后创建空间或凭邀请码配对<br />你们的日记、心愿与经期记录只有彼此可见
      </p>
    </template>
  </main>
</template>