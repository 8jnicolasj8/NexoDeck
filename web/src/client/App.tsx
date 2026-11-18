import React, { useState, useEffect } from 'react';
import { useDeckStore } from './store/useDeckStore';
import { deckSocket } from './ws/deckSocket';
import { TopBar } from './components/TopBar';
import { BottomNav } from './components/BottomNav';
import { OfflineBanner } from './components/OfflineBanner';
import { BootAnimation } from './components/BootAnimation';
import { InactivityDimmer } from './components/InactivityDimmer';
import { HostsSheet } from './components/HostsSheet';
import { HostAlertBanner, SwitchToast } from './components/HostOverlays';
import { DeckView } from './views/DeckView';
import { UtilsView } from './views/UtilsView';
import { ProfilesView } from './views/ProfilesView';
import { SettingsView } from './views/SettingsView';

export const App: React.FC = () => {
  const [isLandscape, setIsLandscape] = useState(
    window.innerWidth > window.innerHeight
  );
  const [showBoot, setShowBoot] = useState(() => {
    return (
      localStorage.getItem('nexodeck_boot_anim') !== 'false' &&
      !sessionStorage.getItem('nexodeck_booted')
    );
  });

  const { activeTab, getActiveProfile, isOled } = useDeckStore();
  const profile = getActiveProfile();

  const handleBootComplete = () => {
    sessionStorage.setItem('nexodeck_booted', 'true');
    setShowBoot(false);
  };

  // Listen to orientation / window resize
  useEffect(() => {
    const checkOrientation = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
    };

    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  // Update dynamic CSS variable for accent color
  useEffect(() => {
    const accent = profile?.accent || '#00FF9C';
    document.documentElement.style.setProperty('--accent', accent);
  }, [profile?.accent]);

  // Set OLED mode on body if enabled
  useEffect(() => {
    if (isOled) {
      document.body.classList.add('oled');
    } else {
      document.body.classList.remove('oled');
    }
  }, [isOled]);

  // Connect WebSocket on mount
  useEffect(() => {
    deckSocket.connect();
    return () => {
      deckSocket.disconnect();
    };
  }, []);

  return (
    <div className="flex flex-col h-full w-full bg-bg text-text overflow-hidden select-none safe-top safe-left safe-right">
      {/* Boot Animation if enabled */}
      {showBoot && <BootAnimation onComplete={handleBootComplete} />}

      {/* Inactivity Dimmer overlay */}
      <InactivityDimmer />

      {/* Top Bar (40px) */}
      <TopBar isLandscape={isLandscape} />

      <HostAlertBanner />
      <SwitchToast />
      <HostsSheet />

      {/* Offline banner notification if disconnected */}
      <OfflineBanner />

      {/* Main View Area */}
      <main className="flex-1 w-full overflow-hidden relative">
        {activeTab === 'deck' && <DeckView isLandscape={isLandscape} />}
        {activeTab === 'utils' && <UtilsView />}
        {activeTab === 'profiles' && <ProfilesView />}
        {activeTab === 'settings' && <SettingsView />}
      </main>

      {/* Bottom Nav Bar (Portrait only) */}
      {!isLandscape && <BottomNav />}
    </div>
  );
};
