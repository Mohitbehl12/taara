// Shared safety UI: consent checkbox, crisis help card, and the report form used across chat, reviews and help.
import React, { useState } from 'react';
import { Alert, Linking, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { HELPLINES } from '@/lib/legal';
import { space, useTheme } from '@/lib/theme';
import { Button, Chip, Field, Panel, Sheet, T } from '@/components/ui';

export function Checkbox({ checked, onChange, children, label }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; label: string }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={() => onChange(!checked)} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={label}
      style={{ flexDirection: 'row', gap: space.m, alignItems: 'flex-start', paddingVertical: space.s, minHeight: 44 }}>
      <View style={{
        width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: checked ? c.primary : c.inkSoft,
        backgroundColor: checked ? c.primary : 'transparent', alignItems: 'center', justifyContent: 'center', marginTop: 1,
      }}>
        {checked ? <T style={{ color: c.onPrimary, fontWeight: '800', lineHeight: 18 }}>✓</T> : null}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </Pressable>
  );
}

/** Shown when the AI senses distress. Calls are one tap away; the conversation is free from this point. */
export function CareCard({ compact }: { compact?: boolean }) {
  const { t } = useTranslation();
  const { c } = useTheme();
  const lines = compact ? HELPLINES.slice(0, 2) : HELPLINES;
  return (
    <Panel style={{ gap: space.s, borderWidth: 1, borderColor: c.primary }}>
      <T v="h2">{t('safety.care_title')}</T>
      <T v="small" color={c.inkSoft}>{t('safety.care_body')}</T>
      {lines.map((h) => (
        <Pressable key={h.key} onPress={() => Linking.openURL(`tel:${h.number}`)} accessibilityRole="button" accessibilityLabel={`${t(`safety.line_${h.key}`)} ${h.number}`}
          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.s, minHeight: 44 }}>
          <T style={{ flex: 1 }}>{t(`safety.line_${h.key}`)}</T>
          <T style={{ fontWeight: '800', color: c.primary }}>📞 {h.number}</T>
        </Pressable>
      ))}
    </Panel>
  );
}

type Category = 'billing' | 'pandit_behaviour' | 'ai_answer' | 'technical' | 'abusive_message' | 'fake_review' | 'privacy' | 'other';

/** Bottom sheet to report a problem. Context (session, message, review, Pandit) is attached automatically. */
export function ReportSheet({ visible, onClose, context, categories }: {
  visible: boolean; onClose: () => void; categories: Category[];
  context?: { sessionId?: string; messageId?: string; reviewId?: string; panditId?: string };
}) {
  const { t } = useTranslation();
  const [category, setCategory] = useState<Category>(categories[0]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await api<{ reference: string }>('/complaints', { body: { ...context, category, text: text.trim() } });
      setText('');
      onClose();
      Alert.alert(t('safety.report_sent'), t('safety.report_sent_body', { ref: r.reference }));
    } catch { Alert.alert(t('common.error_generic')); } finally { setBusy(false); }
  };
  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={{ gap: space.m }}>
        <T v="h2">{t('safety.report_title')}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
          {categories.map((k) => <Chip key={k} label={t(`safety.cat_${k}`)} selected={category === k} onPress={() => setCategory(k)} />)}
        </View>
        <Field label={t('safety.report_details')} value={text} onChangeText={setText} multiline maxLength={2000} style={{ minHeight: 100, textAlignVertical: 'top' }} />
        <Button title={t('safety.report_submit')} onPress={submit} loading={busy} disabled={text.trim().length < 5} />
      </View>
    </Sheet>
  );
}
