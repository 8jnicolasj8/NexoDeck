import React, { useEffect, useState } from 'react';
import { Alert, AppState, BackHandler, Linking, SafeAreaView, StatusBar, StyleSheet, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { ConnectionManager, connections } from './src/native/connection';
import { parsePairLink } from './src/native/protocol';
import { SavedHost, HostStatusUpdate } from './src/native/types';
import { AddHostScreen } from './src/screens/AddHostScreen';
import { HostsScreen } from './src/screens/HostsScreen';
import { ShellScreen } from './src/screens/ShellScreen';
import { colors } from './src/theme';

type Screen = 'hosts' | 'add' | 'shell';

export default function App() {
  const [screen, setScreen] = useState<Screen>('hosts');
  const [hosts, setHosts] = useState<SavedHost[]>([]);
  const [statuses, setStatuses] = useState<Record<string, HostStatusUpdate>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [preferUsb, setPreferUsb] = useState(true);

  // Boot and subscriptions.
  useEffect(() => {
    let mounted = true;

    void (async () => {
      await connections.init();
      if (!mounted) return;
      setHosts(connections.getHosts());
      setActiveId(connections.getActiveId());
      setPreferUsb(connections.isPreferredUsb());
      connections.connectAll();
      if (connections.getHosts().length > 0) setScreen('shell');
    })();

    const unsubscribeHosts = connections.onHosts((list) => {
      if (!mounted) return;
      setHosts([...list]);
      setActiveId(connections.getActiveId());
    });
    const unsubscribeStatus = connections.onStatus((update) => {
      if (!mounted) return;
      setStatuses((previous) => ({ ...previous, [update.host]: update }));
    });

    const network = NetInfo.addEventListener((state) => {
      if (state.isConnected) connections.handleNetworkChange();
    });

    let backgroundTimer: ReturnType<typeof setTimeout> | null = null;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        backgroundTimer = setTimeout(() => connections.shutdown(), 60_000);
      } else {
        if (backgroundTimer) {
          clearTimeout(backgroundTimer);
          backgroundTimer = null;
        }
        connections.handleNetworkChange();
      }
    });

    const confirmPairing = (url: string | null) => {
      if (!url) return;
      const link = parsePairLink(url);
      if (!link) return;
      // A link can be fired by any app: always ask before connecting.
      Alert.alert(
        `¿Emparejar con ${link.name}?`,
        'Solo aceptá si vos generaste este código en esa PC.',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Emparejar',
            onPress: () => {
              void (async () => {
                try {
                  await connections.pair(link);
                  setActiveId(link.serverId);
                  setScreen('shell');
                } catch (error) {
                  Alert.alert('No se pudo emparejar', error instanceof Error ? error.message : 'Intentá de nuevo.');
                }
              })();
            },
          },
        ]
      );
    };

    void Linking.getInitialURL().then(confirmPairing).catch(() => { });
    const linkingSubscription = Linking.addEventListener('url', (event) => confirmPairing(event.url));

    return () => {
      mounted = false;
      unsubscribeHosts();
      unsubscribeStatus();
      network();
      subscription.remove();
      linkingSubscription.remove();
      if (backgroundTimer) clearTimeout(backgroundTimer);
    };
  }, []);

  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'hosts') return false;
      setScreen('hosts');
      return true;
    });
    return () => back.remove();
  }, [screen]);

  const selectHost = (id: string) => {
    connections.setActive(id);
    setActiveId(id);
    setScreen('shell');
  };

  const wake = async (id: string) => {
    const sent = await connections.wake(id);
    if (!sent) {
      Alert.alert(
        'No se pudo encender',
        'Verificá que la PC tenga Wake-on-LAN activado en la BIOS y en el adaptador, y que el celular esté en la misma red WiFi.'
      );
    }
  };

  const forget = (id: string) => {
    Alert.alert('Olvidar esta PC', 'Vas a tener que escanear el QR de nuevo para controlarla.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Olvidar', style: 'destructive', onPress: () => void connections.forget(id) },
    ]);
  };

  if (screen === 'shell') {
    return (
      <View style={styles.root}>
        <StatusBar hidden translucent backgroundColor="transparent" />
        <ShellScreen onOpenAddHost={() => setScreen('add')} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      {screen === 'add' ? (
        <AddHostScreen
          onCancel={() => setScreen('hosts')}
          onPaired={() => setScreen('shell')}
        />
      ) : (
        <HostsScreen
          hosts={hosts}
          activeId={activeId}
          statuses={statuses}
          preferUsb={preferUsb}
          onSelect={selectHost}
          onWake={(id) => void wake(id)}
          onForget={forget}
          onAdd={() => setScreen('add')}
          onToggleUsb={(value) => {
            setPreferUsb(value);
            void connections.setPreferUsb(value);
          }}
        />
      )}
    </SafeAreaView>
  );
}

export const manager: ConnectionManager = connections;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
