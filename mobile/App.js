// WebView wrapper for Niyoq with safely-loaded push notifications + safe area.
// Every native module call is wrapped so a load/permission/registration
// failure cannot crash the app.

import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  BackHandler,
  Platform,
  StatusBar as RNStatusBar,
  SafeAreaView,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';
import { registerRootComponent } from 'expo';

const APP_URL = 'https://airanva.com';
const EAS_PROJECT_ID = '08eaff49-210a-49f2-a42b-129a7f485d85';

// Lazy-require so a module load failure can't break the JS bundle
let Notifications = null;
let Device = null;
try { Notifications = require('expo-notifications'); } catch (e) { console.warn('expo-notifications load failed:', e?.message); }
try { Device = require('expo-device'); } catch (e) { console.warn('expo-device load failed:', e?.message); }

try {
  if (Notifications?.setNotificationHandler) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  }
} catch (e) { console.warn('setNotificationHandler failed:', e?.message); }

async function getExpoPushTokenSafe() {
  try {
    if (!Notifications) return { token: null, error: 'expo-notifications not available' };
    if (Device && !Device.isDevice) return { token: null, error: 'simulator' };
    const existing = await Notifications.getPermissionsAsync();
    let status = existing?.status;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req?.status;
    }
    if (status !== 'granted') return { token: null, error: 'permission ' + status };

    if (Platform.OS === 'android' && Notifications.setNotificationChannelAsync) {
      try {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance?.MAX || 5,
          lightColor: '#6366F1',
        });
      } catch (e) { console.warn('setChannel failed:', e?.message); }
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID });
    return { token: tokenData?.data || null, error: null };
  } catch (e) {
    console.warn('getExpoPushToken failed:', e?.message);
    return { token: null, error: e?.message || 'unknown' };
  }
}

function App() {
  const webViewRef = useRef(null);
  const [pushToken, setPushToken] = useState(null);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      try {
        if (webViewRef.current) { webViewRef.current.goBack(); return true; }
      } catch (_) {}
      return false;
    });
    // Fetch token after a short delay so app boot isn't blocked
    const t = setTimeout(async () => {
      const { token } = await getExpoPushTokenSafe();
      setPushToken(token);
    }, 1500);
    return () => { sub.remove(); clearTimeout(t); };
  }, []);

  // Re-inject the token whenever it changes
  useEffect(() => {
    if (pushToken && webViewRef.current) {
      injectToken(pushToken);
    }
  }, [pushToken]);

  const injectToken = (token) => {
    const js = `(function(){
      try {
        window.__EXPO_PUSH_TOKEN__ = ${JSON.stringify(token)};
        window.dispatchEvent(new Event('expo-token-ready'));
      } catch (e) {}
    })(); true;`;
    try { webViewRef.current && webViewRef.current.injectJavaScript(js); } catch (_) {}
  };

  const initialInjected = pushToken
    ? `window.__EXPO_PUSH_TOKEN__ = ${JSON.stringify(pushToken)};`
    : '';

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" backgroundColor="#0B0F19" />
      <View style={styles.container}>
        <WebView
          ref={webViewRef}
          source={{ uri: APP_URL }}
          style={styles.webview}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          allowsBackForwardNavigationGestures
          // Geolocation — required for attendance auto-mark inside the WebView
          geolocationEnabled
          // iOS: read system permissions; Android handled via manifest perms
          allowsAirPlayForMediaPlayback={false}
          mediaPlaybackRequiresUserAction={false}
          // Forward Android geolocation permission requests to the OS
          onPermissionRequest={(event) => { try { event.grant(event.resources); } catch (_) {} }}
          injectedJavaScriptBeforeContentLoaded={initialInjected}
          onLoadEnd={() => { if (pushToken) injectToken(pushToken); }}
          // Re-inject on every URL change inside the SPA so the post-login
          // AppLayout always has the token
          onNavigationStateChange={() => { if (pushToken) injectToken(pushToken); }}
          renderLoading={() => (
            <View style={styles.loading}>
              <View style={styles.dot} />
            </View>
          )}
        />
      </View>
    </SafeAreaView>
  );
}

registerRootComponent(App);
export default App;

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0B0F19',
    paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight : 0,
  },
  container: { flex: 1, backgroundColor: '#0B0F19' },
  webview: { flex: 1, backgroundColor: '#0B0F19' },
  loading: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#0B0F19',
    justifyContent: 'center', alignItems: 'center',
  },
  dot: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#6366F1', opacity: 0.5,
  },
});
