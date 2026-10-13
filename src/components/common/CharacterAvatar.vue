<script setup lang="ts">
import { computed } from 'vue';

/**
 * CharacterAvatar — 小八 / 米菲 抽象情绪化身
 *
 * 纯 SVG 矢量实现，仅使用品牌抽象色（Serene Blue / Warm Amber），
 * 不做具象角色复刻，作为头像、心情标记与空状态点缀。
 * 情绪：calm 平静 / happy 开心 / tired 疲惫 / caring 关怀 / sleepy 困倦
 */
export type CharacterKind = 'hachi' | 'miffy';
export type AvatarMood = 'calm' | 'happy' | 'tired' | 'caring' | 'sleepy';

const props = withDefaults(
  defineProps<{
    character: CharacterKind;
    mood?: AvatarMood;
    /** 边长 px，默认 40 */
    size?: number;
  }>(),
  { mood: 'calm', size: 40 },
);

const STROKE = '#2b2b30';
const BLUSH = { hachi: '#ffd9a0', miffy: '#a9cbe8' } as const;

const faceFill = computed(() => (props.character === 'hachi' ? '#70a5d8' : '#ffae5d'));
const blushFill = computed(() => BLUSH[props.character]);
/** 眼睛基准纵坐标（米菲因长耳朵脸部略下移） */
const eyesY = computed(() => (props.character === 'hachi' ? 24 : 26));
const mouthY = computed(() => eyesY.value + 6);
const ariaLabel = computed(
  () => `${props.character === 'hachi' ? '小八' : '米菲'} · ${props.mood}`,
);
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 48 48"
    fill="none"
    role="img"
    :aria-label="ariaLabel"
  >
    <!-- 小八：三角耳圆脸 -->
    <template v-if="character === 'hachi'">
      <path d="M11 20 L8 7 L21 13 Z" :fill="faceFill" />
      <path d="M37 20 L40 7 L27 13 Z" :fill="faceFill" />
      <circle cx="24" cy="26" r="16" :fill="faceFill" />
    </template>
    <!-- 米菲：长椭圆耳圆脸 -->
    <template v-else>
      <rect x="13" y="2" width="7" height="19" rx="3.5" :fill="faceFill" />
      <rect x="28" y="2" width="7" height="19" rx="3.5" :fill="faceFill" />
      <circle cx="24" cy="28" r="15" :fill="faceFill" />
    </template>

    <!-- 眼睛 -->
    <g :stroke="STROKE" stroke-width="2" stroke-linecap="round">
      <template v-if="mood === 'calm' || mood === 'caring'">
        <circle :cx="17" :cy="eyesY" r="1.7" :fill="STROKE" stroke="none" />
        <circle :cx="31" :cy="eyesY" r="1.7" :fill="STROKE" stroke="none" />
      </template>
      <template v-else-if="mood === 'happy'">
        <path :d="`M14.5 ${eyesY + 1} Q17 ${eyesY - 2.2} 19.5 ${eyesY + 1}`" />
        <path :d="`M28.5 ${eyesY + 1} Q31 ${eyesY - 2.2} 33.5 ${eyesY + 1}`" />
      </template>
      <template v-else-if="mood === 'tired'">
        <path :d="`M14.5 ${eyesY} L19.5 ${eyesY}`" />
        <path :d="`M28.5 ${eyesY} L33.5 ${eyesY}`" />
      </template>
      <template v-else-if="mood === 'sleepy'">
        <path :d="`M14.5 ${eyesY} Q17 ${eyesY + 2.4} 19.5 ${eyesY}`" />
        <path :d="`M28.5 ${eyesY} Q31 ${eyesY + 2.4} 33.5 ${eyesY}`" />
      </template>
    </g>

    <!-- 关怀腮红（交叉点缀对方色系） -->
    <template v-if="mood === 'caring'">
      <ellipse :cx="12" :cy="eyesY + 4.5" rx="2.4" ry="1.4" :fill="blushFill" opacity="0.85" />
      <ellipse :cx="36" :cy="eyesY + 4.5" rx="2.4" ry="1.4" :fill="blushFill" opacity="0.85" />
    </template>

    <!-- 嘴部 -->
    <g :stroke="STROKE" stroke-width="2" stroke-linecap="round">
      <path
        v-if="mood === 'calm' || mood === 'caring'"
        :d="`M21 ${mouthY} Q24 ${mouthY + 2.4} 27 ${mouthY}`"
      />
      <path
        v-else-if="mood === 'happy'"
        :d="`M20.5 ${mouthY} Q24 ${mouthY + 4} 27.5 ${mouthY}`"
      />
      <path v-else-if="mood === 'tired'" :d="`M21.5 ${mouthY + 1} L26.5 ${mouthY + 1}`" />
      <circle v-else :cx="24" :cy="mouthY + 1" r="1.4" :fill="STROKE" stroke="none" />
    </g>
  </svg>
</template>
