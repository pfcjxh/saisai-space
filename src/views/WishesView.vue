<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Plus } from '@lucide/vue';
import { useAuthStore } from '@/stores/auth';
import { useCoupleStore } from '@/stores/couple';
import AppTabs from '@/components/common/AppTabs.vue';
import CharacterAvatar from '@/components/common/CharacterAvatar.vue';
import WishCard from '@/components/wishes/WishCard.vue';
import WishCreateSheet from '@/components/wishes/WishCreateSheet.vue';
import type { WishFormPayload } from '@/components/wishes/WishCreateSheet.vue';
import { useWishes } from '@/composables/useWishes';
import { fireCelebration } from '@/components/common/ConfettiTrigger';
import { fetchCoupleContext } from '@/services/coupleService';
import { fetchProfile } from '@/services/profileService';
import { compressImage } from '@/utils/imageCompressor';
import { uploadMedia } from '@/services/storageService';
import type { Profile, Wish } from '@/types/database';

defineOptions({ name: 'WishesView' });

const auth = useAuthStore();
const coupleStore = useCoupleStore();

const myProfile = ref<Profile | null>(null);

const coupleId = computed(() => coupleStore.coupleId);
const myUserId = computed(() => auth.user?.id ?? null);

const {
  pending,
  fulfilled,
  completionRate,
  mediaUrls,
  errorToast,
  load,
  create,
  toggleFulfilled,
  attachImage,
  remove,
} = useWishes(coupleId, myUserId);

// ---------------------------------------------------------------- 视图状态

const tab = ref<'pending' | 'fulfilled'>('pending');
const sheetOpen = ref(false);

const tabOptions = computed(() => [
  { value: 'pending', label: '想做的事', badge: pending.value.length },
  { value: 'fulfilled', label: '已达成', badge: fulfilled.value.length },
]);

// ---------------------------------------------------------------- 创建人信息

interface CreatorInfo {
  nickname: string;
  avatarUrl: string;
}

function creatorOf(wish: Wish): CreatorInfo {
  if (wish.created_by === myUserId.value) {
    return {
      nickname: myProfile.value?.nickname ?? '我',
      avatarUrl: myProfile.value?.avatar_url ?? '/avatars/me.webp',
    };
  }
  const partner = coupleStore.context?.partner;
  if (partner && wish.created_by === partner.id) {
    return {
      nickname: partner.nickname,
      avatarUrl: partner.avatar_url ?? '/avatars/partner.webp',
    };
  }
  if (wish.created_by === 'mock-partner') {
    return { nickname: 'TA', avatarUrl: '/avatars/partner.webp' };
  }
  return { nickname: '我', avatarUrl: '/avatars/me.webp' };
}

// ---------------------------------------------------------------- 达成仪式感

async function onToggle(wish: Wish): Promise<void> {
  const nowFulfilled = await toggleFulfilled(wish);
  if (nowFulfilled) {
    fireCelebration({ origin: { x: 0.5, y: 0.45 } });
    if (tab.value === 'pending') {
      // 留在当前页签展示结算态，用户可补充照片
    }
  }
}

// ---------------------------------------------------------------- 达成照片

const photoTarget = ref<Wish | null>(null);
const photoInput = ref<HTMLInputElement | null>(null);

function openPhotoPicker(wish: Wish): void {
  photoTarget.value = wish;
  photoInput.value?.click();
}

async function onPhotoPicked(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  const wish = photoTarget.value;
  photoTarget.value = null;
  if (!file || !wish) return;
  const cid = coupleId.value;
  if (!cid) return;
  try {
    const { blob } = await compressImage(file);
    const path = await uploadMedia(cid, 'wishes', wish.id, blob);
    await attachImage(wish, path);
  } catch {
    errorToast.value = '照片上传失败，请重试';
  }
}

// ---------------------------------------------------------------- 装载

async function onSubmit(payload: WishFormPayload): Promise<void> {
  sheetOpen.value = false;
  await create(payload);
}

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
      if (context) coupleStore.setContext(context);
    } catch {
      // 离线保持 Mock
    }
  }
  await load();
});
</script>

<template>
  <div class="flex h-full flex-col pt-safe">
    <header class="px-4 pt-4">
      <h1 class="text-2xl font-bold">心愿</h1>
      <p class="mt-0.5 text-xs text-fg-soft tabular-nums">
        已一起实现 {{ fulfilled.length }} 个心愿 · 达成率 {{ completionRate }}%
      </p>
      <AppTabs v-model="tab" class="mt-2" :options="tabOptions" />
    </header>

    <div
      class="scrollbar-none mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(104px+env(safe-area-inset-bottom))]"
    >
      <!-- 想做的事 -->
      <template v-if="tab === 'pending'">
        <div
          v-if="pending.length === 0"
          class="flex flex-col items-center gap-2 py-16 text-center"
        >
          <CharacterAvatar character="miffy" mood="happy" :size="52" />
          <p class="text-xs text-fg-soft">心愿都达成啦，许个新的吧</p>
        </div>
        <ul v-else class="flex flex-col gap-3">
          <li v-for="wish in pending" :key="wish.id">
            <WishCard
              :wish="wish"
              :creator="creatorOf(wish)"
              :image-url="wish.image_path ? (mediaUrls[wish.image_path] ?? wish.image_path) : null"
              @toggle="onToggle(wish)"
              @attach-photo="openPhotoPicker(wish)"
              @remove="remove(wish)"
            />
          </li>
        </ul>
      </template>

      <!-- 已达成足迹墙 -->
      <template v-else>
        <div
          v-if="fulfilled.length === 0"
          class="flex flex-col items-center gap-2 py-16 text-center"
        >
          <CharacterAvatar character="hachi" mood="calm" :size="52" />
          <p class="text-xs text-fg-soft">足迹墙还空着，去勾掉第一个心愿吧</p>
        </div>
        <ul v-else class="flex flex-col gap-3">
          <li v-for="wish in fulfilled" :key="wish.id">
            <WishCard
              :wish="wish"
              :creator="creatorOf(wish)"
              :image-url="wish.image_path ? (mediaUrls[wish.image_path] ?? wish.image_path) : null"
              @toggle="onToggle(wish)"
              @attach-photo="openPhotoPicker(wish)"
              @remove="remove(wish)"
            />
          </li>
        </ul>
      </template>
    </div>

    <!-- 新建 FAB -->
    <button
      type="button"
      class="absolute right-4 bottom-[calc(96px+env(safe-area-inset-bottom))] z-10 flex size-13 items-center justify-center rounded-[18px] bg-lilac text-on-accent shadow-[0_6px_20px_rgba(196,181,253,0.35)] transition-transform duration-200 ease-out-quart active:scale-90"
      aria-label="新建心愿"
      @click="sheetOpen = true"
    >
      <Plus :size="24" :stroke-width="2.2" />
    </button>

    <WishCreateSheet :open="sheetOpen" @close="sheetOpen = false" @submit="onSubmit" />

    <!-- 隐藏的照片选择器 -->
    <input
      ref="photoInput"
      type="file"
      accept="image/*"
      class="hidden"
      @change="onPhotoPicked"
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
