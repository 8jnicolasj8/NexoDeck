import React, { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as KeepAwake from 'expo-keep-awake';
import * as NavigationBar from 'expo-navigation-bar';
import { connections } from '../native/connection';
import { colors } from '../theme';

const ASSET_URL = 'file:///android_asset/web/index.html?native=1';

interface Props {
  onOpenAddHost: () => void;
}

/**
 * The WebView only loads the packaged client. It never opens sockets: every
 * message goes through the bridge, which the Kotlin side validates.
 */
export const ShellScreen: React.FC<Props> = ({ onOpenAddHost }) => {
  const web = useRef<WebView>(null);

  const send = (payload: unknown) => {
    const json = JSON.stringify(JSON.stringify(payload));
    web.current?.injectJavaScript(`window.__nexodeckReceive && window.__nexodeckReceive(${json}); true;`);
  };

  const sendHosts = () => {
    send({
      k: 'hosts',
      list: connections.getHosts().map((host) => ({
        id: host.id,
        name: host.name,
        color: host.color,
        icon: host.icon,
        status: connections.getStatus(host.id),
        transport: 'lan',
        mac: host.mac,
        addresses: host.addresses,
      })),
      activeId: connections.getActiveId(),
    });
  };

  useEffect(() => {
    void KeepAwake.activateKeepAwakeAsync();
    if (Platform.OS === 'android') {
      NavigationBar.setVisibilityAsync('hidden').catch(() => { });
      NavigationBar.setBehaviorAsync('overlay-swipe').catch(() => { });
    }

    const unsubscribeMessage = connections.onMessage((host, msg) => send({ k: 'rx', host, msg }));
    const unsubscribeStatus = connections.onStatus((update) =>
      send({ k: 'hostStatus', host: update.host, status: update.status, transport: update.transport, latencyMs: update.latencyMs })
    );
    const unsubscribeHosts = connections.onHosts(() => sendHosts());

    return () => {
      unsubscribeMessage();
      unsubscribeStatus();
      unsubscribeHosts();
      KeepAwake.deactivateKeepAwake();
    };
  }, []);

  const handleWebMessage = async (raw: string) => {
    let data: any;
    try { data = JSON.parse(raw); } catch { return; }

    switch (data.k) {
      case 'ready':
      case 'hosts.request':
        sendHosts();
        break;
      case 'tx':
        connections.send(data.host, data.msg);
        break;
      case 'switchHost':
        connections.setActive(data.host);
        sendHosts();
        break;
      case 'haptic':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
        break;
      case 'hapticPattern':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => { });
        break;
      case 'wake':
        await connections.wake(data.host);
        break;
      case 'openAddHost':
        onOpenAddHost();
        break;
      case 'clipboard.write':
        await Clipboard.setStringAsync(String(data.text ?? ''));
        break;
      case 'clipboard.read':
        send({ k: 'clipboard.value', text: await Clipboard.getStringAsync() });
        break;
    }
  };

  return (
    <View style={styles.root}>
      <WebView
        ref={web}
        source={{ uri: ASSET_URL }}
        originWhitelist={['file://']}
        allowFileAccess
        allowFileAccessFromFileURLs
        allowingReadAccessToURL={ASSET_URL}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        setBuiltInZoomControls={false}
        mediaPlaybackRequiresUserAction={false}
        onMessage={(event) => { void handleWebMessage(event.nativeEvent.data); }}
        onLoadEnd={sendHosts}
        onShouldStartLoadWithRequest={(request) => request.url.startsWith('file://') || request.url === 'about:blank'}
        style={styles.web}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  web: { flex: 1, backgroundColor: colors.bg },
});
