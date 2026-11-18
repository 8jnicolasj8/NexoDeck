import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { connections } from '../native/connection';
import { discoverHosts, IdentInfo, scanLan } from '../native/discovery';
import { parsePairLink } from '../native/protocol';
import { colors, strings } from '../theme';

interface Props {
  onCancel: () => void;
  onPaired: () => void;
}

export const AddHostScreen: React.FC<Props> = ({ onCancel, onPaired }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<'qr' | 'link' | 'discover'>('qr');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [found, setFound] = useState<IdentInfo[]>([]);

  useEffect(() => {
    if (mode === 'qr' && permission && !permission.granted) void requestPermission();
  }, [mode, permission, requestPermission]);

  const applyLink = async (value: string) => {
    setError('');
    const parsed = parsePairLink(value);
    if (!parsed) {
      setError('Ese enlace no es válido o es de una versión anterior de NexoDeck.');
      return;
    }
    setBusy(true);
    try {
      await connections.pair(parsed);
      onPaired();
    } catch (pairError) {
      setError(pairError instanceof Error ? pairError.message : 'No se pudo emparejar.');
    } finally {
      setBusy(false);
    }
  };

  const search = async (scanSubnets: boolean) => {
    setBusy(true);
    setFound([]);
    try {
      const mdns = await discoverHosts(4000);
      const merged = new Map(mdns.map((item) => [item.serverId, item]));
      if (scanSubnets) {
        const scanned = await scanLan();
        for (const item of scanned) merged.set(item.serverId, item);
      }
      setFound([...merged.values()]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={onCancel} style={styles.back}><Text style={styles.backText}>‹ Volver</Text></Pressable>
        <Text style={styles.title}>Agregar PC</Text>
      </View>

      <View style={styles.tabs}>
        {(['qr', 'link', 'discover'] as const).map((item) => (
          <Pressable key={item} onPress={() => setMode(item)} style={[styles.tab, mode === item && styles.tabActive]}>
            <Text style={[styles.tabText, mode === item && styles.tabTextActive]}>
              {item === 'qr' ? 'QR' : item === 'link' ? 'Enlace' : 'Buscar'}
            </Text>
          </Pressable>
        ))}
      </View>

      {error.length > 0 && <Text style={styles.error}>{error}</Text>}
      {busy && <ActivityIndicator color={colors.accent} style={{ marginVertical: 20 }} />}

      {!busy && mode === 'qr' && (
        <View style={styles.cameraBox}>
          {permission?.granted ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => {
                if (data.startsWith('nexodeck://')) void applyLink(data);
              }}
            />
          ) : (
            <View style={styles.cameraPlaceholder}>
              <Text style={styles.helper}>Necesitamos la cámara para escanear el QR.</Text>
              <Pressable onPress={requestPermission} style={styles.primary}><Text style={styles.primaryText}>Permitir cámara</Text></Pressable>
            </View>
          )}
        </View>
      )}

      {!busy && mode === 'link' && (
        <View style={styles.panel}>
          <Text style={styles.helper}>Pegá el enlace que copiaste desde el panel de la PC.</Text>
          <TextInput
            value={link}
            onChangeText={setLink}
            placeholder="nexodeck://pair?v=2&…"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            style={styles.input}
            multiline
          />
          <Pressable onPress={() => applyLink(link)} style={styles.primary} disabled={!link.trim()}>
            <Text style={styles.primaryText}>Emparejar</Text>
          </Pressable>
        </View>
      )}

      {!busy && mode === 'discover' && (
        <View style={styles.panel}>
          <Text style={styles.helper}>{strings.pairHint}</Text>
          <Pressable onPress={() => search(false)} style={styles.primary}>
            <Text style={styles.primaryText}>Buscar por mDNS</Text>
          </Pressable>
          <Pressable onPress={() => search(true)} style={styles.secondary}>
            <Text style={styles.secondaryText}>Buscar en toda la red (60 s)</Text>
          </Pressable>
          {found.map((item) => (
            <View key={item.serverId} style={styles.foundRow}>
              <View style={[styles.dot, { backgroundColor: item.pcColor || colors.accent }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.foundName}>{item.pcName}</Text>
                <Text style={styles.foundMeta}>{(item.addresses || []).join(' · ') || 'sin IP'} · v{item.version}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.footer}>El secreto de emparejamiento viaja solo por el QR o por el cable USB.</Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 14, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { paddingVertical: 4 },
  backText: { color: colors.muted, fontSize: 12 },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  tabs: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 12, padding: 4, gap: 4 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  tabActive: { backgroundColor: colors.surface2 },
  tabText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  tabTextActive: { color: colors.text },
  cameraBox: { height: 320, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  cameraPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20 },
  panel: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10 },
  helper: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  input: {
    backgroundColor: colors.surface2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    padding: 12,
    fontSize: 11,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  primary: { backgroundColor: '#00FF9C22', borderWidth: 1, borderColor: colors.accent, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  primaryText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  secondary: { borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  secondaryText: { color: colors.muted, fontSize: 11 },
  error: { color: colors.danger, fontSize: 12 },
  foundRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  dot: { width: 8, height: 8, borderRadius: 4 },
  foundName: { color: colors.text, fontSize: 13, fontWeight: '600' },
  foundMeta: { color: colors.muted, fontSize: 10 },
  footer: { color: colors.muted, fontSize: 10, textAlign: 'center', marginTop: 10 },
});
