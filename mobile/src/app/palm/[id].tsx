import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { api, rupees } from '@/lib/api';
import { startConsult } from '@/lib/consult';
import { useApp } from '@/lib/store';
import { useFetch } from '@/lib/useFetch';
import { LINE_ICON, type PalmFinding, type PalmReading } from '@/lib/palm';
import { space, useTheme } from '@/lib/theme';
import { Badge, Button, Loading, Panel, Screen, Section, T } from '@/components/ui';

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));

function Finding({ title, f, icon }: { title: string; f: PalmFinding | { observation: string; meaning: string; visible?: boolean }; icon?: string }) {
  const { t } = useTranslation();
  const { c } = useTheme();
  const visible = (f as PalmFinding).visible !== false;
  return (
    <View style={{ paddingVertical: space.m, borderBottomWidth: 1, borderBottomColor: c.line, gap: space.xs }}>
      <T style={{ fontWeight: '700' }}>{icon ? `${icon}  ` : ''}{title}</T>
      {visible ? (
        <>
          <T style={{ fontWeight: '600' }}>{f.observation}</T>
          <T v="small" color={c.primary} style={{ fontWeight: '600', marginTop: space.xs }}>{t('palm.traditionally')}</T>
          <T color={c.inkSoft}>{f.meaning}</T>
        </>
      ) : <T color={c.inkSoft}>{t('palm.not_visible')}</T>}
    </View>
  );
}

export default function PalmResult() {
  const { t, i18n } = useTranslation();
  const { c } = useTheme();
  const router = useRouter();
  const { id, other } = useLocalSearchParams<{ id: string; other?: string }>();
  const { meta, user, refreshUser } = useApp();
  const r = useFetch<PalmReading>(`/palm/readings/${id}`);
  const [buying, setBuying] = useState(false);
  const price = meta?.pricing.palmDetailedPricePaise ?? 9900;
  const aiPrice = rupees(meta?.pricing.aiRatePerMinPaise ?? 500);
  const d = r.data;
  if (!d) return <Loading />;
  const q = d.quick;
  const otherHand = d.hand === 'right' ? 'left' : 'right';

  const buy = async () => {
    if ((user?.balancePaise ?? 0) < price) { router.push('/topup'); return; }
    setBuying(true);
    try { r.setData(await api<PalmReading>(`/palm/readings/${id}/detailed`, { body: {} })); await refreshUser(); }
    catch { Alert.alert(t('common.error_generic')); await refreshUser(); }
    finally { setBuying(false); }
  };

  const ask = () => startConsultWithPalm();
  const startConsultWithPalm = async () => {
    // AI chat with this palm reading as context, billed at the AI rate.
    try {
      const s = await api<{ id: string }>('/sessions', { body: { kind: 'ai', mode: 'chat', palmReadingId: id } });
      router.push({ pathname: '/chat/[id]', params: { id: s.id, first: '' } });
    } catch (e: any) {
      if (e.code === 'insufficient_balance') router.push('/topup');
      else await startConsult(router, t, { kind: 'ai', mode: 'chat' });
    }
  };

  const pdf = async () => {
    const block = (title: string, f: { observation: string; meaning: string; visible?: boolean }) =>
      `<h3>${esc(title)}</h3>${f.visible === false ? `<p>${esc(t('palm.not_visible'))}</p>` : `<p><b>${esc(f.observation)}</b></p><p>${esc(f.meaning)}</p>`}`;
    const html = `<html lang="${i18n.language}"><head><meta charset="utf-8"><style>
      body{font-family:-apple-system,Roboto,'Noto Sans',sans-serif;color:#1C1712;padding:32px;line-height:1.6;max-width:720px;margin:auto}
      h1{color:#C2500A} h2{border-bottom:2px solid #F5B700;padding-bottom:4px;margin-top:28px} h3{margin-bottom:2px} .note{color:#5E574E;font-size:12px}</style></head><body>
      <h1>${esc(t('palm.title'))} — ${esc(t(`palm.${d.hand}`))}</h1><p>${esc(q.summary)}</p>
      <h2>${esc(t('palm.hand_shape'))}</h2>${block(t(`palm.shape_${q.handShape.type}`), q.handShape)}
      <h2>${esc(t('palm.lines'))}</h2>${q.lines.map((l) => block(t(`palm.line_${l.key}`), l)).join('')}
      ${d.detailed ? `<h2>${esc(t('palm.mounts'))}</h2>${d.detailed.mounts.map((m) => block(t(`palm.mount_${m.key}`, { defaultValue: m.key }), m)).join('')}
        <h2>${esc(t('palm.fingers'))}</h2>${block('', d.detailed.fingers)}
        ${d.detailed.sections.map((s) => `<h2>${esc(s.title)}</h2>${s.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}`).join('')}` : ''}
      <p class="note">${esc(t('palm.disclaimer'))}</p></body></html>`;
    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  };

  return (
    <Screen edges={[]} style={{ paddingTop: space.m }}>
      <View style={{ backgroundColor: c.sky, borderRadius: 24, padding: space.xl, gap: space.s }}>
        <T v="small" color={c.marigold} style={{ fontWeight: '600' }}>{t(`palm.${d.hand}`)} · {t(`palm.shape_${q.handShape.type}`)}</T>
        <T color={c.skyInk} style={{ fontSize: 18, lineHeight: 28 }}>{q.summary}</T>
      </View>
      {other ? <Button title={t('palm.other_hand', { hand: t(`palm.${otherHand}`) })} kind="secondary" style={{ marginTop: space.m }}
        onPress={() => router.replace({ pathname: '/palm/[id]', params: { id: other, other: id } })} /> : null}

      <Section title={t('palm.hand_shape')}><Finding title={t(`palm.shape_${q.handShape.type}`)} f={q.handShape} /></Section>
      <Section title={t('palm.lines')}>
        {q.lines.map((l) => <Finding key={l.key} title={t(`palm.line_${l.key}`)} f={l} icon={LINE_ICON[l.key]} />)}
      </Section>

      {d.detailed ? (
        <>
          <Section title={t('palm.mounts')}>{d.detailed.mounts.map((m) => <Finding key={m.key} title={t(`palm.mount_${m.key}`, { defaultValue: m.key })} f={m} />)}</Section>
          <Section title={t('palm.fingers')}><Finding title="" f={d.detailed.fingers} /></Section>
          {d.detailed.markings.length ? <Section title={t('palm.markings')}>{d.detailed.markings.map((m, i) => <Finding key={i} title={m.key} f={m} />)}</Section> : null}
          {d.detailed.sections.map((s) => (
            <Section key={s.key} title={s.title}>{s.paragraphs.map((p, i) => <T key={i} style={{ marginBottom: space.s }}>{p}</T>)}</Section>
          ))}
        </>
      ) : (
        <Panel style={{ marginTop: space.xl, gap: space.s, borderColor: c.marigold, borderWidth: 1.5 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <T v="h2">{t('palm.detailed_title')}</T><Badge text={rupees(price)} tone="marigold" />
          </View>
          <T color={c.inkSoft}>{t('palm.detailed_desc')}</T>
          {d.status === 'detailed_generating' || buying
            ? <T color={c.primary}>{t('palm.detailed_generating')}</T>
            : <Button title={t('palm.buy_detailed', { price: rupees(price) })} onPress={buy} />}
        </Panel>
      )}

      <Panel style={{ marginTop: space.l, gap: space.s, backgroundColor: c.sky, borderColor: c.sky }}>
        <T v="h2" color={c.skyInk}>🤖 {t('palm.ask_expert', { price: t('common.per_min', { price: aiPrice }) })}</T>
        <T v="small" color="rgba(255,244,220,0.8)">{t('palm.ask_expert_hint')}</T>
        <Button title={t('consult.ai_chat')} onPress={ask} />
      </Panel>
      <Button title={t('palm.download')} kind="secondary" onPress={pdf} style={{ marginTop: space.l }} />
      <T v="tiny" color={c.inkSoft} style={{ marginTop: space.xl }}>{t('palm.disclaimer')}</T>
    </Screen>
  );
}
