import React from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SavedHost, HostStatusUpdate } from '../native/types';
import { colors, strings } from '../theme';

interface Props {
  hosts: SavedHost[];
  activeId: string | null;
  statuses: Record<string, HostStatusUpdate>;
  preferUsb: boolean;
  onSelect: (id: string) => void;
  onWake: (id: string) => void;
  onForget: (id: string) => void;
  onAdd: () => void;
  onToggleUsb: (value: boolean) => void;
}

const statusColor = (status?: string) => {
  switch (status) {
    case 'connected': return colors.accent;
    case 'reconnecting': return colors.warn;
    case 'unverified': return colors.danger;
    default: return '#5B6773';
  }
};

const statusLabel = (status?: string) => {
  switch (status) {
    case 'connected': return strings.connected;
    case 'reconnecting': return strings.reconnecting;
    case 'unverified': return strings.unverified;
    default: return strings.offline;
  }
};

export const HostsScreen: React.FC<Props> = ({
  hosts, activeId, statuses, preferUsb, onSelect, onWake, onForget, onAdd, onToggleUsb,
}) => (
  <ScrollView style={styles.root} contentContainerStyle={styles.content}>
    <Text style={styles.title}>{strings.hostsTitle}</Text>
    <Text style={styles.subtitle}>{strings.hostsSubtitle}</Text>

    {hosts.length === 0 && <Text style={styles.empty}>{strings.noHosts}</Text>}

    {hosts.map((host) => {
      const status = statuses[host.id];
      const isActive = host.id === activeId;
      return (
        <Pressable
          key={host.id}
          onPress={() => onSelect(host.id)}
          onLongPress={() => onForget(host.id)}
          style={[styles.card, isActive && { borderColor: host.color }]}
        >
          <View style={[styles.dot, { backgroundColor: statusColor(status?.status) }]} />
          <View style={styles.cardBody}>
            <Text style={[styles.name, { color: host.color }]}>{host.name}</Text>
            <Text style={styles.meta}>
              {statusLabel(status?.status)}
              {status?.status === 'connected' ? ` · ${status.latencyMs} ms · ${status.transport === 'usb' ? 'USB' : 'WiFi'}` : ''}
            </Text>
          </View>
          {isActive && <Text style={styles.activeTag}>ACTIVA</Text>}
          {!isActive && status?.status !== 'connected' && (
            <Pressable onPress={() => onWake(host.id)} style={styles.wakeButton}>
              <Text style={styles.wakeText}>{strings.wake}</Text>
            </Pressable>
          )}
        </Pressable>
      );
    })}

    <Pressable onPress={onAdd} style={styles.addButton}>
      <Text style={styles.addText}>＋ {strings.addHost}</Text>
    </Pressable>

    <View style={styles.row}>
      <Text style={styles.rowLabel}>Preferir USB cuando el cable está conectado</Text>
      <Switch value={preferUsb} onValueChange={onToggleUsb} trackColor={{ true: colors.accent, false: colors.border }} />
    </View>
    <Text style={styles.hint}>Mantené presionada una PC para olvidarla.</Text>
  </ScrollView>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 10, paddingBottom: 40 },
  title: { color: colors.text, fontSize: 24, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 12, marginBottom: 8 },
  empty: { color: colors.muted, fontSize: 13, paddingVertical: 24, textAlign: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  cardBody: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600' },
  meta: { color: colors.muted, fontSize: 11, marginTop: 2 },
  activeTag: { color: colors.accent, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  wakeButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  wakeText: { color: colors.text, fontSize: 11, fontWeight: '600' },
  addButton: { padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.accent, alignItems: 'center', marginTop: 6 },
  addText: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  rowLabel: { color: colors.muted, fontSize: 12, flex: 1 },
  hint: { color: colors.muted, fontSize: 10, marginTop: 4 },
});
