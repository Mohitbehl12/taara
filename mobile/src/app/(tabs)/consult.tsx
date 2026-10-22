import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { rupees } from '@/lib/api';
import { startConsult } from '@/lib/consult';
import { useApp } from '@/lib/store';
import { useFetch } from '@/lib/useFetch';
import { space, useTheme } from '@/lib/theme';
import type { Pandit } from '@/lib/types';
import { LANGUAGES } from '@/i18n/languages';
import { Badge, Button, Chip, ErrorState, Screen, Segmented, Sheet, Skeleton, T } from '@/components/ui';
import { PanditRow } from '@/components/PanditRow';
import { useRequireLogin } from '@/lib/auth';
import { StartPanditSheet } from '@/components/StartPanditSheet';

const TOPICS = ['career', 'marriage', 'love', 'finance', 'family', 'education', 'travel', 'property', 'general', 'planets'];
type Sort = 'recommended' | 'price_low' | 'price_high' | 'rating' | 'experience';

export default function ConsultScreen() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { user, meta, language } = useApp();
  const [tab, setTab] = useState<'ai' | 'pandit'>(params.tab === 'ai' ? 'ai' : 'pandit');
  useEffect(() => { if (params.tab === 'ai' || params.tab === 'pandit') setTab(params.tab); }, [params.tab]);

  const [lang, setLang] = useState<string | null>(language);
  const [online, setOnline] = useState(false);
  const [freeOnly, setFreeOnly] = useState(false);
  const [sort, setSort] = useState<Sort>('recommended');
  const [sortOpen, setSortOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [chosen, setChosen] = useState<Pandit | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const ensure = useRequireLogin();

  const qs = new URLSearchParams({ sort, ...(lang ? { lang } : {}), ...(online ? { online: 'true' } : {}), ...(freeOnly ? { free: 'true' } : {}) }).toString();
  const list = useFetch<Pandit[]>(tab === 'pandit' ? `/pandits?${qs}` : null);
  const freeMin = Math.floor((user?.freeSecondsRemaining ?? 0) / 60);
  const aiPrice = meta ? (meta.pricing.aiBillingMode === 'per_message'
    ? t('common.per_msg', { price: rupees(meta.pricing.aiRatePerMessagePaise) })
    : t('common.per_min', { price: rupees(meta.pricing.aiRatePerMinPaise) })) : '';
  const voicePrice = meta ? t('common.per_min', { price: rupees(meta.pricing.aiRatePerMinPaise) }) : '';

  const ai = async (mode: 'chat' | 'voice', topic?: string) => {
    setStarting(mode + (topic ?? ''));
    await startConsult(router, t, { kind: 'ai', mode, firstMessage: topic ? t(`topic_questions.${topic}`) : undefined });
    setStarting(null);
  };

  return (
    <Screen>
      <T v="h1" style={{ paddingTop: space.l }}>{t('tabs.astrologers')}</T>
      <View style={{ marginTop: space.m }}>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'pandit', label: t('consult.pandit_title') }, { value: 'ai', label: t('consult.ai_title') }]} />
      </View>
      <T v="small" color={c.inkSoft} style={{ marginTop: space.s }}>{t('consult.ai_vs_pandit')}</T>

      {tab === 'ai' ? (
        <View style={{ marginTop: space.l, gap: space.l }}>
          <View style={{ backgroundColor: c.sky, borderRadius: 24, padding: space.l, gap: space.m }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <T v="h2" color={c.skyInk}>Taara AI</T>
              <Badge text={t('common.ai_label')} tone="marigold" />
            </View>
            <T color={c.skyInk} style={{ opacity: 0.9 }}>{t('consult.ai_desc')}</T>
            <View style={{ flexDirection: 'row', gap: space.s }}>
              <Button title={`${t('consult.ai_chat')} · ${aiPrice}`} kind="primary" style={{ flex: 1 }} loading={starting === 'chat'} onPress={() => ai('chat')} />
              {meta?.features.voice !== false ? (
                <Button title={`🎙 ${t('consult.ai_voice')} · ${voicePrice}`} kind="secondary" style={{ flex: 1 }} loading={starting === 'voice'} onPress={() => ai('voice')} />
              ) : null}
            </View>
          </View>
          <View>
            <T v="h2" style={{ marginBottom: space.s }}>{t('session.ai_quick')}</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
              {TOPICS.map((k) => <Chip key={k} label={t(`topics.${k}`)} onPress={() => ai('chat', k)} />)}
            </View>
          </View>
          <T v="tiny" color={c.inkSoft}>{t('common.disclaimer')}</T>
        </View>
      ) : (
        <View style={{ marginTop: space.l }}>
          {freeMin > 0 ? (
            <View style={{ backgroundColor: c.surface, borderLeftWidth: 3, borderLeftColor: c.leaf, padding: space.m, borderRadius: 8, marginBottom: space.m }}>
              <T v="small" style={{ fontWeight: '600' }}>🎁 {t('home.free_badge', { minutes: freeMin })}</T>
            </View>
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s }}>
            <Chip label={`${t('consult.filter_language')}: ${lang ? LANGUAGES.find((l) => l.code === lang)?.native : t('consult.filter_all')}`} selected={!!lang} onPress={() => setLangOpen(true)} />
            <Chip label={t('consult.filter_online')} selected={online} onPress={() => setOnline(!online)} />
            {freeMin > 0 ? <Chip label={t('consult.filter_free')} selected={freeOnly} onPress={() => setFreeOnly(!freeOnly)} /> : null}
            <Chip label={`${t('consult.sort')}: ${t(`consult.sort_${sort}`)}`} onPress={() => setSortOpen(true)} />
          </ScrollView>

          {list.error && !list.data ? <ErrorState message={t('common.network_error')} onRetry={list.reload} /> : null}
          {!list.data ? <View style={{ gap: space.m, marginTop: space.l }}>{[0, 1, 2].map((i) => <Skeleton key={i} h={80} />)}</View>
            : list.data.length === 0 ? <T color={c.inkSoft} style={{ marginTop: space.xl, textAlign: 'center' }}>{t('consult.no_pandits')}</T>
              : list.data.map((p) => (
                <PanditRow key={p.id} p={p} freeMinutes={freeMin}
                  onOpen={() => router.push({ pathname: '/pandit/[id]', params: { id: p.id } })} onChat={() => { if (ensure('/(tabs)/consult?tab=pandit')) setChosen(p); }} />
              ))}
          <T v="tiny" color={c.inkSoft} style={{ marginTop: space.l }}>{t('consult.calls_soon')}</T>
        </View>
      )}

      <Sheet visible={sortOpen} onClose={() => setSortOpen(false)}>
        {(['recommended', 'price_low', 'price_high', 'rating', 'experience'] as Sort[]).map((s) => (
          <Pressable key={s} onPress={() => { setSort(s); setSortOpen(false); }} style={{ minHeight: 48, justifyContent: 'center' }} accessibilityRole="radio" accessibilityState={{ selected: sort === s }}>
            <T style={{ fontWeight: sort === s ? '700' : '400' }}>{sort === s ? '● ' : '○ '}{t(`consult.sort_${s}`)}</T>
          </Pressable>
        ))}
      </Sheet>
      <Sheet visible={langOpen} onClose={() => setLangOpen(false)}>
        <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
          <Chip label={t('consult.filter_all')} selected={!lang} onPress={() => { setLang(null); setLangOpen(false); }} />
          {LANGUAGES.map((l) => <Chip key={l.code} label={l.native} selected={lang === l.code} onPress={() => { setLang(l.code); setLangOpen(false); }} />)}
        </ScrollView>
      </Sheet>
      <StartPanditSheet pandit={chosen} onClose={() => setChosen(null)} />
    </Screen>
  );
}
