// Help & Safety: helplines, report a problem, my reports (with status), blocked Pandits, Grievance Officer (IT Rules 2021).
import React, { useState } from 'react';
import { Alert, Linking, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { COMPANY } from '@/lib/legal';
import { useFetch } from '@/lib/useFetch';
import { space, useTheme } from '@/lib/theme';
import { Badge, Button, Row, Screen, Section, T } from '@/components/ui';
import { CareCard, ReportSheet } from '@/components/Safety';
import { LoginGate, useSignedIn } from '@/components/Gates';

interface Complaint { id: string; category: string; text: string; status: string; resolution: string | null; createdAt: string }
interface Blocked { id: string; displayName: string }

function SafetyScreen() {
  const { t, i18n } = useTranslation();
  const { c } = useTheme();
  const router = useRouter();
  const [report, setReport] = useState(false);
  const complaints = useFetch<Complaint[]>('/complaints');
  const blocks = useFetch<Blocked[]>('/blocks');

  const unblock = (b: Blocked) => Alert.alert(t('safety.unblock_q', { name: b.displayName }), '', [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('safety.unblock'), onPress: async () => { await api(`/blocks/${b.id}`, { method: 'DELETE' }); blocks.reload(); } },
  ]);

  return (
    <Screen edges={[]} style={{ gap: space.l, paddingTop: space.m }}>
      <T v="h1">{t('safety.title')}</T>
      <CareCard />

      <Section title={t('safety.report_title')}>
        <T v="small" color={c.inkSoft}>{t('safety.report_hint')}</T>
        <Button title={t('safety.report_problem')} kind="secondary" onPress={() => setReport(true)} style={{ marginTop: space.s }} />
        {complaints.data?.map((x) => (
          <Row key={x.id} title={`#${x.id.slice(0, 8).toUpperCase()} · ${t(`safety.cat_${x.category}`, { defaultValue: x.category })}`}
            subtitle={`${new Date(x.createdAt).toLocaleDateString(i18n.language)}${x.resolution ? ` · ${x.resolution}` : ''}`}
            right={<Badge text={t(`safety.status_${x.status}`, { defaultValue: x.status })} tone={x.status === 'open' ? 'marigold' : 'leaf'} />} />
        ))}
      </Section>

      <Section title={t('safety.blocked_title')}>
        {blocks.data?.length ? blocks.data.map((b, i) => (
          <Row key={b.id} title={b.displayName} right={<T color={c.primary}>{t('safety.unblock')}</T>} onPress={() => unblock(b)} last={i === blocks.data!.length - 1} />
        )) : <T v="small" color={c.inkSoft}>{t('safety.blocked_none')}</T>}
      </Section>

      <Section title={t('safety.stay_safe')}>
        {(['tip_pay', 'tip_contact', 'tip_otp', 'tip_fear', 'tip_medical'] as const).map((k) => <T key={k} v="small">• {t(`safety.${k}`)}</T>)}
        <Row title={t('safety.conduct')} onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'conduct' } })} last />
      </Section>

      <Section title={t('safety.grievance_title')}>
        <T v="small">{COMPANY.grievanceOfficer}</T>
        <T v="small" color={c.inkSoft}>{COMPANY.name}, {COMPANY.address}</T>
        <T v="small" color={c.inkSoft}>{t('safety.grievance_sla')}</T>
        <View style={{ flexDirection: 'row', gap: space.s, marginTop: space.s, flexWrap: 'wrap' }}>
          <Button small kind="secondary" title={COMPANY.grievanceEmail} onPress={() => Linking.openURL(`mailto:${COMPANY.grievanceEmail}`)} />
          <Button small kind="secondary" title={COMPANY.supportEmail} onPress={() => Linking.openURL(`mailto:${COMPANY.supportEmail}`)} />
        </View>
      </Section>

      <ReportSheet visible={report} onClose={() => { setReport(false); complaints.reload(); }}
        categories={['billing', 'pandit_behaviour', 'ai_answer', 'abusive_message', 'fake_review', 'privacy', 'technical', 'other']} />
    </Screen>
  );
}

/** Needs an account; guests see a short explanation and a login button. */
export default function Safety() {
  return useSignedIn() ? <SafetyScreen /> : <LoginGate next="/safety" icon="🛡️" />;
}
