import React, { useEffect } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useFetch } from '@/lib/useFetch';
import { space, useTheme } from '@/lib/theme';
import { Button, Loading, Screen, T } from '@/components/ui';

interface Report {
  id: string; kind: string; status: 'generating' | 'ready' | 'failed'; createdAt: string;
  content: null | { title: string; profileName: string; partnerName: string | null; summary: string; sections: { title: string; paragraphs: string[] }[]; disclaimer: string };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));

export default function ReportView() {
  const { t, i18n } = useTranslation();
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const r = useFetch<Report>(`/reports/${id}`);

  useEffect(() => {
    if (r.data?.status !== 'generating') return;
    const h = setTimeout(r.reload, 4000);
    return () => clearTimeout(h);
  }, [r.data, r.reload]);

  const pdf = async () => {
    const d = r.data?.content;
    if (!d) return;
    // Printed with system fonts, so every Indian script renders correctly in the PDF.
    const html = `<html lang="${i18n.language}"><head><meta charset="utf-8"><style>
      body{font-family:-apple-system,Roboto,'Noto Sans',sans-serif;color:#1C1712;padding:32px;line-height:1.6;max-width:720px;margin:auto}
      h1{color:#C2500A;margin-bottom:4px} h2{color:#1C1712;border-bottom:2px solid #F5B700;padding-bottom:4px;margin-top:28px}
      .meta{color:#5E574E} .note{color:#5E574E;font-size:12px;margin-top:32px}</style></head><body>
      <h1>${esc(d.title)}</h1><div class="meta">${esc(d.profileName)}${d.partnerName ? ` &amp; ${esc(d.partnerName)}` : ''} · ${new Date(r.data!.createdAt).toLocaleDateString(i18n.language)}</div>
      <p>${esc(d.summary)}</p>
      ${d.sections.map((s) => `<h2>${esc(s.title)}</h2>${s.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}`).join('')}
      <p class="note">${esc(d.disclaimer)}</p></body></html>`;
    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  };

  if (!r.data) return <Loading />;
  if (r.data.status === 'generating') return <View style={{ flex: 1, padding: space.xl, justifyContent: 'center', gap: space.l }}><Loading /><T style={{ textAlign: 'center' }}>{t('reports.generating')}</T></View>;
  if (r.data.status === 'failed' || !r.data.content) return <T style={{ padding: space.xl }}>{t('reports.failed')}</T>;
  const d = r.data.content;

  return (
    <Screen edges={[]} style={{ paddingTop: space.m, gap: space.m }}>
      <T v="h1">{d.title}</T>
      <T color={c.inkSoft}>{d.profileName}{d.partnerName ? ` & ${d.partnerName}` : ''}</T>
      <Button title={t('reports.download')} kind="secondary" onPress={pdf} />
      <T style={{ fontWeight: '600' }}>{d.summary}</T>
      {d.sections.map((s) => (
        <View key={s.title} style={{ gap: space.s, marginTop: space.m }}>
          <T v="h2" style={{ borderBottomWidth: 2, borderBottomColor: c.marigold, paddingBottom: 4, alignSelf: 'flex-start' }}>{s.title}</T>
          {s.paragraphs.map((p, i) => <T key={i}>{p}</T>)}
        </View>
      ))}
      <T v="tiny" color={c.inkSoft} style={{ marginTop: space.xl }}>{d.disclaimer}</T>
    </Screen>
  );
}
