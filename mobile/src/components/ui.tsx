import React from 'react';
import {
  ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type PressableProps, type ScrollViewProps, type StyleProp, type TextInputProps, type TextProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { space, type, useTheme } from '@/lib/theme';

type Variant = keyof typeof type;

export function T({ v = 'body', color, style, ...rest }: TextProps & { v?: Variant; color?: string }) {
  const { c } = useTheme();
  return <Text {...rest} style={[type[v], { color: color ?? c.ink }, style]} />;
}

export function Screen({ children, scroll = true, padded = true, edges = ['top'], style, ...rest }:
  ScrollViewProps & { scroll?: boolean; padded?: boolean; edges?: ('top' | 'bottom')[] }) {
  const { c } = useTheme();
  const pad = padded ? { paddingHorizontal: space.l } : null;
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: c.bg }}>
      {scroll
        ? <ScrollView contentContainerStyle={[pad, { paddingBottom: space.xxl }, style]} keyboardShouldPersistTaps="handled" {...rest}>{children}</ScrollView>
        : <View style={[{ flex: 1 }, pad, style as ViewStyle]}>{children}</View>}
    </SafeAreaView>
  );
}

export function Button({ title, onPress, kind = 'primary', loading, disabled, icon, style, small }: {
  title: string; onPress?: () => void; kind?: 'primary' | 'secondary' | 'ghost' | 'marigold' | 'danger'; loading?: boolean;
  disabled?: boolean; icon?: React.ReactNode; style?: StyleProp<ViewStyle>; small?: boolean;
}) {
  const { c } = useTheme();
  // primary = yellow CTA; marigold = kesari accent (names kept for call sites).
  const bg = { primary: c.marigold, secondary: c.surfaceAlt, ghost: 'transparent', marigold: c.primary, danger: 'transparent' }[kind];
  const fg = { primary: c.marigoldInk, secondary: c.ink, ghost: c.primary, marigold: c.onPrimary, danger: c.danger }[kind];
  return (
    <Pressable
      accessibilityRole="button" accessibilityState={{ disabled: !!disabled || !!loading }}
      disabled={disabled || loading}
      onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress?.(); }}
      style={({ pressed }) => [{
        backgroundColor: bg, minHeight: small ? 40 : 52, borderRadius: 14, paddingHorizontal: small ? space.m : space.l,
        alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: space.s,
        opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
      }, style]}>
      {loading ? <ActivityIndicator color={fg} /> : <>{icon}<Text style={[small ? type.small : type.body, { color: fg, fontWeight: '600' }]}>{title}</Text></>}
    </Pressable>
  );
}

export function Field({ label, error, style, ...rest }: TextInputProps & { label?: string; error?: string | null }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: space.xs }}>
      {label ? <T v="small" color={c.inkSoft}>{label}</T> : null}
      <TextInput
        placeholderTextColor={c.inkSoft}
        {...rest}
        style={[type.body, {
          color: c.ink, backgroundColor: c.surface, borderWidth: 1, borderColor: error ? c.danger : c.line,
          borderRadius: 12, paddingHorizontal: space.m, minHeight: 52, paddingVertical: space.s,
        }, style]}
      />
      {error ? <T v="small" color={c.danger}>{error}</T> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress, tone }: { label: string; selected?: boolean; onPress?: () => void; tone?: 'leaf' | 'marigold' }) {
  const { c } = useTheme();
  const toneBg = tone === 'leaf' ? c.leaf : tone === 'marigold' ? c.marigold : null;
  return (
    <Pressable onPress={onPress} accessibilityRole={onPress ? 'button' : 'text'} accessibilityState={{ selected }}
      style={{
        paddingHorizontal: space.m, minHeight: 36, borderRadius: 18, justifyContent: 'center',
        backgroundColor: toneBg ?? (selected ? c.primary : c.surface), borderWidth: toneBg || selected ? 0 : 1, borderColor: c.line,
      }}>
      <Text style={[type.small, { color: toneBg ? (tone === 'marigold' ? c.marigoldInk : c.onLeaf) : selected ? c.onPrimary : c.ink, fontWeight: selected || toneBg ? '600' : '400' }]}>{label}</Text>
    </Pressable>
  );
}

/** Flat list row with a divider — used instead of stacking identical cards. */
export function Row({ title, subtitle, right, onPress, icon, last }: {
  title: string; subtitle?: string | null; right?: React.ReactNode; onPress?: () => void; icon?: React.ReactNode; last?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m, minHeight: 56,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: c.line, opacity: pressed ? 0.6 : 1,
      })}>
      {icon}
      <View style={{ flex: 1 }}>
        <T>{title}</T>
        {subtitle ? <T v="small" color={c.inkSoft}>{subtitle}</T> : null}
      </View>
      {right ?? (onPress ? <T color={c.inkSoft}>›</T> : null)}
    </Pressable>
  );
}

export function Section({ title, action, children, style }: { title?: string; action?: React.ReactNode; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ marginTop: space.xl }, style]}>
      {title ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.s }}>
          <T v="h2" accessibilityRole="header">{title}</T>
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Panel({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[{ backgroundColor: c.surface, borderRadius: 18, padding: space.l, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line }, style]}>{children}</View>;
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: 12, padding: 3 }} accessibilityRole="tablist">
      {options.map((o) => (
        <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="tab" accessibilityState={{ selected: o.value === value }}
          style={{ flex: 1, minHeight: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: o.value === value ? c.surface : 'transparent' }}>
          <Text style={[type.small, { color: o.value === value ? c.ink : c.inkSoft, fontWeight: o.value === value ? '600' : '400' }]} numberOfLines={1}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(12,9,5,0.55)' }} onPress={onClose} accessibilityLabel="Close" />
      <View style={{ backgroundColor: c.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: space.xl, paddingBottom: space.xxl + 8, gap: space.m }}>
        <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.line, marginBottom: space.s }} />
        {children}
      </View>
    </Modal>
  );
}

export function Loading() {
  const { c } = useTheme();
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl }}><ActivityIndicator color={c.primary} size="large" /></View>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { c } = useTheme();
  return (
    <View style={{ padding: space.xl, alignItems: 'center', gap: space.m }}>
      <T color={c.inkSoft} style={{ textAlign: 'center' }}>{message}</T>
      {onRetry ? <Button title="↻" kind="secondary" small onPress={onRetry} /> : null}
    </View>
  );
}

/** Skeleton block for loading states. */
export function Skeleton({ h = 16, w = '100%', r = 8, style }: { h?: number; w?: number | `${number}%`; r?: number; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[{ height: h, width: w, borderRadius: r, backgroundColor: c.surfaceAlt }, style]} />;
}

export function Badge({ text, tone = 'leaf' }: { text: string; tone?: 'leaf' | 'marigold' | 'muted' }) {
  const { c } = useTheme();
  const bg = tone === 'leaf' ? c.leaf : tone === 'marigold' ? c.marigold : c.surfaceAlt;
  const fg = tone === 'leaf' ? c.onLeaf : tone === 'marigold' ? c.marigoldInk : c.inkSoft;
  return <View style={{ backgroundColor: bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' }}><Text style={[type.tiny, { color: fg, fontWeight: '600' }]}>{text}</Text></View>;
}

export const rtlText = (rtl: boolean): TextStyle => (rtl ? { writingDirection: 'rtl', textAlign: 'right' } : {});
