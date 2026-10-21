import React from 'react';
import { Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { rupees } from '@/lib/api';
import { useApp } from '@/lib/store';
import { space, useTheme } from '@/lib/theme';
import { LANGUAGES } from '@/i18n/languages';
import { Chip, Field, Section, T } from './ui';

export const SPECIALTIES = ['vedic', 'kundli', 'marriage', 'career', 'finance', 'love', 'health', 'vastu', 'numerology', 'tarot', 'palmistry', 'prashna', 'muhurat', 'remedies'];

export interface PanditValues {
  displayName: string; bio: string; experienceYears: string; languages: string[]; replyLanguage: string; specializations: string[];
  chat: string; voice: string; video: string; participatesInFree: boolean;
}

const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

/** Shared profile + pricing fields for applying and for editing later. Prices are entered in rupees. */
export function PanditFields({ v, set, showName = true }: { v: PanditValues; set: (v: PanditValues) => void; showName?: boolean }) {
  const { t } = useTranslation();
  const { c } = useTheme();
  const p = useApp((s) => s.meta?.pricing);
  const min = (p?.panditMinRatePaise ?? 500) / 100, max = (p?.panditMaxRatePaise ?? 20000) / 100;
  const bad = (s: string) => { const n = Number(s); return !(n >= min && n <= max) ? `${rupees(min * 100)} – ${rupees(max * 100)}` : null; };

  return (
    <View style={{ gap: space.m }}>
      {showName ? <Field label={t('pandit.display_name')} value={v.displayName} onChangeText={(displayName) => set({ ...v, displayName })} /> : null}
      <Field label={t('pandit.bio')} value={v.bio} onChangeText={(bio) => set({ ...v, bio })} multiline style={{ minHeight: 100, textAlignVertical: 'top' }} />
      <Field label={t('pandit.experience')} value={v.experienceYears} onChangeText={(experienceYears) => set({ ...v, experienceYears: experienceYears.replace(/\D/g, '') })} keyboardType="number-pad" />

      <Section title={t('pandit.languages')} style={{ marginTop: space.s }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
          {LANGUAGES.map((l) => <Chip key={l.code} label={l.native} selected={v.languages.includes(l.code)} onPress={() => set({ ...v, languages: toggle(v.languages, l.code) })} />)}
        </View>
      </Section>
      {v.languages.length ? (
        <Section title={t('pandit.reply_language')} style={{ marginTop: space.s }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
            {v.languages.map((code) => <Chip key={code} label={LANGUAGES.find((l) => l.code === code)?.native ?? code} selected={v.replyLanguage === code} onPress={() => set({ ...v, replyLanguage: code })} />)}
          </View>
        </Section>
      ) : null}
      <Section title={t('pandit.specialties')} style={{ marginTop: space.s }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
          {SPECIALTIES.map((s) => <Chip key={s} label={t(`spec.${s}`)} selected={v.specializations.includes(s)} onPress={() => set({ ...v, specializations: toggle(v.specializations, s) })} />)}
        </View>
      </Section>

      <Section title={t('pandit.rates')} style={{ marginTop: space.s }}>
        <T v="small" color={c.inkSoft} style={{ marginBottom: space.s }}>{t('pandit.rate_range', { min: rupees(min * 100), max: rupees(max * 100), pct: p?.commissionPct ?? 30 })}</T>
        <View style={{ flexDirection: 'row', gap: space.s }}>
          {(['chat', 'voice', 'video'] as const).map((k) => (
            <View key={k} style={{ flex: 1 }}>
              <Field label={`${t(`pandit.rate_${k}`)} (₹)`} value={v[k]} onChangeText={(s) => set({ ...v, [k]: s.replace(/[^\d]/g, '') })} keyboardType="number-pad" error={v[k] ? bad(v[k]) : null} />
            </View>
          ))}
        </View>
      </Section>
      <View style={{ flexDirection: 'row', gap: space.m, alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <T>{t('pandit.free_participate')}</T>
          <T v="small" color={c.inkSoft}>{t('pandit.free_participate_hint', { rate: rupees(300) })}</T>
        </View>
        <Switch value={v.participatesInFree} onValueChange={(participatesInFree) => set({ ...v, participatesInFree })} trackColor={{ true: c.primary, false: c.line }} thumbColor={c.surface} ios_backgroundColor={c.line} />
      </View>
    </View>
  );
}

export const panditValid = (v: PanditValues, min: number, max: number) =>
  v.displayName.trim().length >= 2 && v.languages.length > 0 && !!v.replyLanguage && v.specializations.length > 0 &&
  [v.chat, v.voice, v.video].every((s) => Number(s) >= min && Number(s) <= max);

export const toRates = (v: PanditValues) => ({
  chatRatePaise: Number(v.chat) * 100, voiceRatePaise: Number(v.voice) * 100, videoRatePaise: Number(v.video) * 100,
});
