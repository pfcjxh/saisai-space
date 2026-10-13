<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { MailPlus, PenLine, StickyNote } from '@lucide/vue';
import { useAuthStore } from '@/stores/auth';
import { useCoupleStore } from '@/stores/couple';
import AppTabs from '@/components/common/AppTabs.vue';
import CharacterAvatar from '@/components/common/CharacterAvatar.vue';
import DiaryCard from '@/components/diary/DiaryCard.vue';
import DiaryEditorSheet from '@/components/diary/DiaryEditorSheet.vue';
import type { DiaryEditorPayload } from '@/components/diary/DiaryEditorSheet.vue';
import ImageLightbox from '@/components/diary/ImageLightbox.vue';
import StickyNoteCard from '@/components/notes/StickyNoteCard.vue';
import NoteComposerSheet from '@/components/notes/NoteComposerSheet.vue';
import EnvelopeCard from '@/components/letters/EnvelopeCard.vue';
import LetterComposerSheet from '@/components/letters/LetterComposerSheet.vue';
import LetterEnvelopeOverlay from '@/components/letters/LetterEnvelopeOverlay.vue';
import { useDiaries } from '@/composables/useDiaries';
import { useNotes } from '@/composables/useNotes';
import { useLetters } from '@/composables/useLetters';
import { fetchCoupleContext } from '@/services/coupleService';
import { fetchProfile } from '@/services/profileService';
import { compressImage } from '@/utils/imageCompressor';
import { uploadMedia } from '@/services/storageService';
import type { Diary, LoveLetter, Profile, StickyNote as StickyNoteRow } from '@/types/database';

defineOptions({ name: 'DiaryView' });

const auth = useAuthStore();
const coupleStore = useCoupleStore();

const myProfile = ref<Profile | null>(null);

const coupleId = computed(() => coupleStore.coupleId);
const myUserId = computed(() => auth.user?.id ?? null);
const timezone = computed(() => myProfile.value?.timezone ?? 'Asia/Shanghai');

const { diaries, mediaUrls, errorToast, load, create, remove, toggleLike, addComment } =
  useDiaries(coupleId, myUserId);

const {
  notes,
  errorToast: notesToast,
  load: loadNotes,
  create: createNote,
  update: updateNote,
  remove: removeNote,
} = useNotes(coupleId, myUserId);

const {
  letters,
  errorToast: lettersToast,
  load: loadLetters,
  create: createLetter,
  remove: removeLetter,
} = useLetters(coupleId, myUserId);

// ---------------------------------------------------------------- 页签

const topTab = ref<'diary' | 'mail'>('diary');
const topOptions = [
  { value: 'diary', label: '日记' },
  { value: 'mail', label: '信笺' },
];

const statsLine = computed(() =>
  topTab.value === 'diary'
    ? `共 ${diaries.value.length} 篇回忆 · 我们的一点一滴`
    : `便利贴 ${notes.value.length} 张 · 信笺 ${letters.value.length} 封`,
);

/** 温和提示条：日记 / 便利贴 / 情书共享同一出口 */
const toastMessage = computed(() => errorToast.value ?? notesToast.value ?? lettersToast.value);

// ---------------------------------------------------------------- 作者信息

interface AuthorInfo {
  nickname: string;
  avatarUrl: string;
}

function authorOf(diary: Diary): AuthorInfo {
  if (diary.author_id === myUserId.value) {
    return {
      nickname: myProfile.value?.nickname ?? '我',
      avatarUrl: myProfile.value?.avatar_url ?? '/avatars/me.webp',
    };
  }
  const partner = coupleStore.context?.partner;
  if (partner && diary.author_id === partner.id) {
    return {
      nickname: partner.nickname,
      avatarUrl: partner.avatar_url ?? '/avatars/partner.webp',
    };
  }
  // Mock 数据：按 mock id 映射
  if (diary.author_id === 'mock-partner') {
    return { nickname: 'TA', avatarUrl: '/avatars/partner.webp' };
  }
  return { nickname: '我', avatarUrl: '/avatars/me.webp' };
}

/** 便利贴 / 情书署名（轻量场景无需头像） */
function nameOf(authorId: string): string {
  if (authorId === myUserId.value) return '我';
  const partner = coupleStore.context?.partner;
  if (partner && authorId === partner.id) return partner.nickname;
  return 'TA';
}

// ---------------------------------------------------------------- 日记分组

interface DiaryGroup {
  key: string;
  label: string;
  items: Diary[];
}

const groups = computed<DiaryGroup[]>(() => {
  const map = new Map<string, Diary[]>();
  for (const d of diaries.value) {
    const key = d.diary_date.slice(0, 7);
    const list = map.get(key);
    if (list) {
      list.push(d);
    } else {
      map.set(key, [d]);
    }
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, items]) => ({
      key,
      label: `${Number(key.slice(0, 4))}年${Number(key.slice(5, 7))}月`,
      items,
    }));
});

// ---------------------------------------------------------------- 灯箱

const lightboxOpen = ref(false);
const lightboxUrls = ref<string[]>([]);
const lightboxIndex = ref(0);

function openLightbox(urls: string[], index: number): void {
  lightboxUrls.value = urls;
  lightboxIndex.value = index;
  lightboxOpen.value = true;
}

// ---------------------------------------------------------------- 发布日记

const editorOpen = ref(false);

/** 端侧压缩 + 上传，返回存储路径数组；进度回调驱动抽屉进度条 */
async function uploader(
  files: File[],
  onProgress: (done: number, total: number) => void,
): Promise<string[]> {
  const cid = coupleId.value;
  if (!cid || files.length === 0) return [];
  const diaryId = crypto.randomUUID();
  const paths: string[] = [];
  let done = 0;
  for (const file of files) {
    const { blob } = await compressImage(file);
    const path = await uploadMedia(cid, 'diaries', diaryId, blob);
    paths.push(path);
    done += 1;
    onProgress(done, files.length);
  }
  // 预存路径供本端立即展示（签名 URL 在 create 后统一解析）
  return paths;
}

async function onSubmit(payload: DiaryEditorPayload, images: string[]): Promise<void> {
  editorOpen.value = false;
  await create({
    diary_date: payload.diary_date,
    title: payload.title,
    mood: payload.mood,
    content: payload.content,
    images,
  });
}

// ---------------------------------------------------------------- 便利贴

const noteSheetOpen = ref(false);
const editingNote = ref<StickyNoteRow | null>(null);

function openNoteCreate(): void {
  editingNote.value = null;
  noteSheetOpen.value = true;
}

function openNoteEdit(note: StickyNoteRow): void {
  editingNote.value = note;
  noteSheetOpen.value = true;
}

async function onNoteSubmit(payload: {
  color: StickyNoteRow['color'];
  content: string;
  pinned: boolean;
}): Promise<void> {
  noteSheetOpen.value = false;
  if (editingNote.value) {
    await updateNote(editingNote.value, payload);
  } else {
    await createNote(payload);
  }
}

// ---------------------------------------------------------------- 情书

const letterSheetOpen = ref(false);
const openedLetter = ref<LoveLetter | null>(null);
/** 本端已拆阅集合（仅本机状态，不做同步） */
const readIds = ref(new Set<string>());

function openLetter(letter: LoveLetter): void {
  readIds.value.add(letter.id);
  openedLetter.value = letter;
}

async function onLetterSubmit(payload: { title: string; body: string }): Promise<void> {
  letterSheetOpen.value = false;
  const created = await createLetter(payload);
  // 寄出即兴拆阅一遍自己的信，形成"封口 → 拆信"的闭环反馈
  if (created) openLetter(created);
}

function onLetterRemove(letter: LoveLetter): void {
  openedLetter.value = null;
  void removeLetter(letter);
}

// ---------------------------------------------------------------- FAB 分发

const actionOpen = ref(false);

function onFabClick(): void {
  if (topTab.value === 'diary') {
    editorOpen.value = true;
    return;
  }
  actionOpen.value = true;
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
      if (context) coupleStore.setContext(context);
    } catch {
      // 离线保持 Mock
    }
  }
  await Promise.all([load(), loadNotes(), loadLetters()]);
});
</script>

<template>
  <div class="flex h-full flex-col pt-safe">
    <header class="px-4 pt-4">
      <h1 class="text-2xl font-bold">日记</h1>
      <p class="mt-0.5 text-xs text-fg-soft tabular-nums">{{ statsLine }}</p>
      <AppTabs v-model="topTab" class="mt-2" :options="topOptions" />
    </header>

    <!-- 日记子视图 -->
    <div
      v-if="topTab === 'diary'"
      class="scrollbar-none mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(104px+env(safe-area-inset-bottom))]"
    >
      <div
        v-if="diaries.length === 0"
        class="flex flex-col items-center gap-2 py-16 text-center"
      >
        <CharacterAvatar character="hachi" mood="caring" :size="52" />
        <p class="text-xs text-fg-soft">还没有回忆，写下第一篇吧</p>
      </div>

      <!-- 时间轴流 -->
      <div v-for="group in groups" :key="group.key" class="relative pl-5">
        <!-- 左侧虚线时间轴 -->
        <span
          class="absolute top-1 bottom-0 left-1 w-px border-l border-dashed border-separator"
          aria-hidden="true"
        />
        <span
          class="absolute top-1.5 left-0 size-2 rounded-full bg-lilac shadow-[0_0_6px_rgba(196,181,253,0.6)]"
          aria-hidden="true"
        />
        <p class="py-2 text-xs font-medium text-fg-soft tabular-nums">{{ group.label }}</p>

        <div class="flex flex-col gap-3 pb-4">
          <DiaryCard
            v-for="diary in group.items"
            :key="diary.id"
            :diary="diary"
            :author="authorOf(diary)"
            :media-urls="mediaUrls"
            :my-id="myUserId"
            :timezone="timezone"
            :is-author="diary.author_id === myUserId"
            @like="toggleLike(diary)"
            @comment="(text: string) => addComment(diary, text, myProfile?.nickname ?? '我')"
            @remove="remove(diary)"
            @open-image="openLightbox"
          />
        </div>
      </div>
    </div>

    <!-- 信笺子视图：便利贴墙 + 信笺盒 -->
    <div
      v-else
      class="scrollbar-none mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(104px+env(safe-area-inset-bottom))]"
    >
      <p class="pt-1 pb-2 text-xs font-medium text-fg-soft">便利贴墙 · {{ notes.length }}</p>
      <div
        v-if="notes.length === 0"
        class="flex flex-col items-center gap-2 py-8 text-center"
      >
        <CharacterAvatar character="miffy" mood="happy" :size="44" />
        <p class="text-xs text-fg-soft">墙上还是空的，贴第一张便签吧</p>
      </div>
      <div v-else class="columns-2 gap-3">
        <StickyNoteCard
          v-for="note in notes"
          :key="note.id"
          class="mb-3"
          :note="note"
          :is-author="note.author_id === myUserId"
          :author-name="nameOf(note.author_id)"
          @edit="openNoteEdit(note)"
          @remove="removeNote(note)"
        />
      </div>

      <p class="mt-4 pb-2 text-xs font-medium text-fg-soft">信笺盒 · {{ letters.length }}</p>
      <div
        v-if="letters.length === 0"
        class="flex flex-col items-center gap-2 py-8 text-center"
      >
        <CharacterAvatar character="hachi" mood="caring" :size="44" />
        <p class="text-xs text-fg-soft">还没有信，写一封慢慢说的话</p>
      </div>
      <ul v-else class="flex flex-col gap-3">
        <li v-for="letter in letters" :key="letter.id">
          <EnvelopeCard
            :letter="letter"
            :author-name="nameOf(letter.author_id)"
            :is-read="readIds.has(letter.id)"
            @open="openLetter(letter)"
          />
        </li>
      </ul>
    </div>

    <!-- 发布 FAB（淡紫圆角方形，随页签切换目标） -->
    <button
      type="button"
      class="absolute right-4 bottom-[calc(96px+env(safe-area-inset-bottom))] z-10 flex size-13 items-center justify-center rounded-[18px] bg-lilac text-on-accent shadow-[0_6px_20px_rgba(196,181,253,0.35)] transition-transform duration-200 ease-out-quart active:scale-90"
      :aria-label="topTab === 'diary' ? '写日记' : '写便利贴或情书'"
      @click="onFabClick"
    >
      <PenLine v-if="topTab === 'diary'" :size="22" :stroke-width="2.2" />
      <StickyNote v-else :size="22" :stroke-width="2.2" />
    </button>

    <DiaryEditorSheet
      :open="editorOpen"
      :timezone="timezone"
      :uploader="uploader"
      @close="editorOpen = false"
      @submit="onSubmit"
    />

    <NoteComposerSheet
      :open="noteSheetOpen"
      :editing="editingNote"
      @close="noteSheetOpen = false"
      @submit="onNoteSubmit"
    />

    <LetterComposerSheet
      :open="letterSheetOpen"
      :partner-name="coupleStore.context?.partner?.nickname ?? 'TA'"
      @close="letterSheetOpen = false"
      @submit="onLetterSubmit"
    />

    <LetterEnvelopeOverlay
      :open="openedLetter !== null"
      :letter="openedLetter"
      :is-author="openedLetter?.author_id === myUserId"
      :author-name="openedLetter ? nameOf(openedLetter.author_id) : ''"
      @close="openedLetter = null"
      @remove="onLetterRemove"
    />

    <!-- 信笺页 FAB 二选一 -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="actionOpen"
          class="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          aria-hidden="true"
          @click="actionOpen = false"
        />
      </Transition>
      <Transition name="sheet">
        <div
          v-if="actionOpen"
          class="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[420px]"
          role="dialog"
          aria-modal="true"
          aria-label="选择要写的内容"
        >
          <div
            class="rounded-t-3xl border border-separator bg-card px-5 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))]"
          >
            <div class="mx-auto h-1 w-9 rounded-full bg-neutral-600" />
            <h2 class="mt-4 text-center text-base font-medium">写点什么</h2>
            <div class="mt-4 flex flex-col gap-2">
              <button
                type="button"
                class="flex items-center gap-3 rounded-2xl bg-card-2 p-4 text-left transition-transform duration-200 ease-out-quart active:scale-[0.98]"
                @click="actionOpen = false; openNoteCreate()"
              >
                <StickyNote :size="18" class="shrink-0 text-serene" />
                <span class="flex-1">
                  <span class="block text-sm text-fg">写便利贴</span>
                  <span class="mt-0.5 block text-[10px] text-fg-soft">一句话贴在墙上</span>
                </span>
              </button>
              <button
                type="button"
                class="flex items-center gap-3 rounded-2xl bg-card-2 p-4 text-left transition-transform duration-200 ease-out-quart active:scale-[0.98]"
                @click="actionOpen = false; letterSheetOpen = true"
              >
                <MailPlus :size="18" class="shrink-0 text-lilac" />
                <span class="flex-1">
                  <span class="block text-sm text-fg">写一封情书</span>
                  <span class="mt-0.5 block text-[10px] text-fg-soft">封口寄出，不可修改</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <ImageLightbox
      :open="lightboxOpen"
      :urls="lightboxUrls"
      :start-index="lightboxIndex"
      @close="lightboxOpen = false"
    />

    <!-- 温和提示条 -->
    <Transition name="toast">
      <div
        v-if="toastMessage"
        class="fixed top-[calc(12px+env(safe-area-inset-top))] left-1/2 z-50 -translate-x-1/2 rounded-full border border-separator bg-card-2 px-4 py-2 text-xs whitespace-nowrap text-fg shadow-lg"
        role="status"
      >
        {{ toastMessage }}
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
.fade-enter-active,
.fade-leave-active {
  transition: opacity 250ms ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.sheet-enter-active,
.sheet-leave-active {
  transition: transform 300ms cubic-bezier(0.25, 1, 0.5, 1);
}
.sheet-enter-from,
.sheet-leave-to {
  transform: translateY(100%);
}
</style>
