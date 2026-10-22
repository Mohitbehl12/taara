import React, { useState } from 'react';
import { ActivityIndicator, Alert, Linking, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import Svg, { Path } from 'react-native-svg';
import { useApp } from '@/lib/store';
import { useFetch } from '@/lib/useFetch';
import { capturePalm, uploadPalm, type PalmReading } from '@/lib/palm';
import { space, useTheme } from '@/lib/theme';
import { Button, Row, Screen, Section, Segmented, T } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { LoginGate, useSignedIn } from '@/components/Gates';

type Hand = 'left' | 'right' | 'both';

/** Minimal line drawing of an open palm with the three major lines in gold. */
function PalmMark({ size, line, accent }: { size: number; line: string; accent: string }) {
  return (
    <Svg width={size} height={size * 1.15} viewBox="0 0 100 115" accessibilityElementsHidden>
      <Path d="M30 112 C22 96 18 80 20 62 L14 40 C12 33 22 30 25 37 L32 56 L30 18 C30 10 40 10 40 18 L42 50 L44 10 C44 2 55 2 55 10 L55 50 L59 15 C60 7 70 8 69 16 L66 54 L74 32 C77 25 87 28 84 36 L74 72 C70 90 66 100 66 112"
        fill="none" stroke={line} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M36 64 C44 74 46 92 44 104" fill="none" stroke={accent} strokeWidth={2.2} strokeLinecap="round" />
      <Path d="M30 66 C44 66 56 70 70 72" fill="none" stroke={accent} strokeWidth={2.2} strokeLinecap="round" />
      <Path d="M34 58 C46 54 60 56 76 52" fill="none" stroke={accent} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

function PalmScreenScreen() {
  const { t, i18n } = useTranslation();
  const { c } = useTheme();
  const router = useRouter();
  const meta = useApp((s) => s.meta);
  const history = useFetch<PalmReading[]>('/palm/readings');
  const [hand, setHand] = useState<Hand>('right');
  const [busy, setBusy] = useState<string | null>(null);

  const today = (history.data ?? []).filter((r) => Date.now() - Date.parse(r.createdAt) < 86_400_000).length;
  const freeLeft = Math.max(0, (meta?.pricing.palmFreePerDay ?? 3) - today);

  const readOne = async (h: 'left' | 'right', source: 'camera' | 'library') => {
    const uri = await capturePalm(source);
    if (!uri) return null;
    setBusy(t('palm.reading'));
    return uploadPalm(uri, h, i18n.language);
  };

  const start = async (source: 'camera' | 'library') => {
    try {
      if (hand !== 'both') {
        const r = await readOne(hand, source);
        if (r) router.push({ pathname: '/palm/[id]', params: { id: r.id } });
      } else {
        const right = await readOne('right', source);
        if (!right) return;
        setBusy(null);
        await new Promise<void>((res) => Alert.alert(t('palm.now_left'), '', [{ text: t('common.continue'), onPress: () => res() }]));
        const left = await readOne('left', source);
        router.push({ pathname: '/palm/[id]', params: { id: right.id, other: left?.id ?? '' } });
      }
      history.reload();
    } catch (e: any) {
      if (e.code === 'camera_denied') Alert.alert(t('palm.camera_denied'), '', [{ text: 'Settings', onPress: () => Linking.openSettings() }, { text: t('common.cancel') }]);
      else if (e.code === 'palm_not_clear') Alert.alert(t('palm.not_clear'));
      else if (e.code === 'palm_daily_limit') Alert.alert(t('palm.limit'));
      else Alert.alert(errorMessage(t, e));
    } finally { setBusy(null); }
  };

  return (
    <Screen>
      <T v="h1" style={{ paddingTop: space.l }}>{t('palm.title')}</T>
      <View style={{ marginTop: space.l, backgroundColor: c.sky, borderRadius: 28, padding: space.xl, gap: space.l }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.l }}>
          <PalmMark size={84} line={c.skyInk} accent={c.marigold} />
          <View style={{ flex: 1, gap: space.xs }}>
            <T v="h2" color={c.skyInk}>{t('palm.hero')}</T>
            <T v="small" color="rgba(255,244,220,0.8)">{t('palm.hero_sub')}</T>
          </View>
        </View>
        <View style={{ gap: space.s }}>
          <T v="small" color={c.marigold} style={{ fontWeight: '600' }}>{t('palm.which_hand')}</T>
          <Segmented value={hand} onChange={setHand} options={(['right', 'left', 'both'] as Hand[]).map((h) => ({ value: h, label: t(`palm.${h}`) }))} />
          <T v="tiny" color="rgba(255,244,220,0.7)">{t('palm.hand_hint')}</T>
        </View>
        {busy ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: 52 }}>
            <ActivityIndicator color={c.marigold} /><T color={c.skyInk}>{busy}</T>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: space.s }}>
            <Button title={`📷 ${t('palm.take_photo')}`} style={{ flex: 1 }} onPress={() => start('camera')} disabled={freeLeft <= 0} />
            <Button title={t('palm.upload')} kind="secondary" style={{ flex: 1 }} onPress={() => start('library')} disabled={freeLeft <= 0} />
          </View>
        )}
        <T v="tiny" color={c.marigold}>{freeLeft > 0 ? t('palm.free_left', { count: freeLeft }) : t('palm.limit')}</T>
      </View>

      <Section title={t('palm.tips_title')}>
        {['tip_light', 'tip_flat', 'tip_fingers', 'tip_sharp'].map((k) => (
          <View key={k} style={{ flexDirection: 'row', gap: space.m, paddingVertical: 6 }}>
            <T color={c.primary}>✓</T><T style={{ flex: 1 }}>{t(`palm.${k}`)}</T>
          </View>
        ))}
      </Section>

      {history.data?.length ? (
        <Section title={t('palm.history')}>
          {history.data.map((r, i) => (
            <Row key={r.id} last={i === history.data!.length - 1} title={t(`palm.${r.hand}`)}
              subtitle={`${new Date(r.createdAt).toLocaleDateString(i18n.language, { dateStyle: 'medium' })}${r.detailed ? ` · ${t('palm.detailed_title')}` : ''}`}
              onPress={() => router.push({ pathname: '/palm/[id]', params: { id: r.id } })} />
          ))}
        </Section>
      ) : null}
      <T v="tiny" color={c.inkSoft} style={{ marginTop: space.xl }}>{t('palm.disclaimer')}</T>
    </Screen>
  );
}

/** Needs an account; guests see a short explanation and a login button. */
export default function PalmScreen() {
  return useSignedIn() ? <PalmScreenScreen /> : <LoginGate next="/(tabs)/palm" icon="✋" top />;
}
