// Penny — app shell: navigation, FAB ➝ chat, screens
import { useEffect } from 'react';
import { setupIonicReact } from '@ionic/react';
import { App as CapApp } from '@capacitor/app';
import { flushExport } from './lib/diag';
import { AgentAvatar } from './components/Avatar';
import { Icons } from './components/Icons';
import type { IconName } from './components/Icons';
import { AppProvider, useApp } from './state/AppContext';
import { HomeScreen } from './screens/Home';
import { AccountsScreen } from './screens/Accounts';
import { TrackScreen } from './screens/Track';
import { CoachScreen } from './screens/Coach';
import { Ledger } from './screens/Ledger';
import { MoneyMap } from './screens/MoneyMap';
import { AccountView } from './screens/AccountView';
import { Settings } from './screens/Settings';
import { Setup } from './screens/Setup';
import { ProfilePanel } from './screens/ProfilePanel';
import { TxnEditSheet } from './screens/TxnEditSheet';
import { ManualEntry } from './screens/ManualEntry';
import { MenuPanel } from './screens/MenuPanel';
import { Notifications } from './screens/Notifications';
import { Onboarding } from './screens/Onboarding';
import { BiometricGate } from './screens/LockScreen';
import { CameraCapture } from './components/CameraCapture';
import { ChatView } from './chat/ChatView';

setupIonicReact({ mode: 'ios' });

// Primary nav: Home · Coach · Chat (center) · Add · Menu. Everything else lives in the Menu.
type NavId = 'home' | 'coach' | 'chat' | 'add' | 'menu';
const TABS: { id: NavId; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'coach', label: 'Coach', icon: 'leaf' },
  { id: 'chat', label: 'Chat', icon: 'message' },
  { id: 'add', label: 'Add', icon: 'plus' },
  { id: 'menu', label: 'Menu', icon: 'menu' },
];

function Shell() {
  const app = useApp();
  const { tab } = app;

  // Flush the diagnostics/export file whenever the app is backgrounded.
  useEffect(() => {
    const sub = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) void flushExport();
    });
    return () => {
      void sub.then((h) => h.remove());
    };
  }, []);

  return (
    <div className="penny-app">
      {tab === 'home' && <HomeScreen key="home" />}
      {tab === 'accounts' && <AccountsScreen key="accounts" />}
      {tab === 'track' && <TrackScreen key="track" />}
      {tab === 'coach' && <CoachScreen key="coach" />}

      <div className="tabbar">
        {TABS.map((tb) => {
          if (tb.id === 'chat') {
            // Chat keeps the signature raised Penny avatar.
            return (
              <button key="chat" className="fab" onClick={app.openChat} aria-label="Chat with Penny">
                <span className="fab-ring" />
                <AgentAvatar size={36} onDark />
              </button>
            );
          }
          const Ico = Icons[tb.icon];
          const active = (tb.id === 'home' || tb.id === 'coach') && tab === tb.id;
          const onClick =
            tb.id === 'home' ? () => app.go('home')
            : tb.id === 'coach' ? () => app.go('coach')
            : tb.id === 'add' ? app.openManual
            : app.openMenu;
          return (
            <button
              key={tb.id}
              className={`tab-item${active ? ' active' : ''}`}
              onClick={onClick}
            >
              <Ico size={21} sw={active ? 2 : 1.7} />
              {tb.label}
            </button>
          );
        })}
      </div>

      <Ledger />
      <MoneyMap />
      <AccountView />
      <Settings />
      <Setup />
      <ProfilePanel />
      <TxnEditSheet />
      <ManualEntry />
      <MenuPanel />
      <Notifications />
      <ChatView />
      <CameraCapture />
      <Onboarding />
      <BiometricGate />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
