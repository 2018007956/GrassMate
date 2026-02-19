import { LoginScreen } from './screens/LoginScreen';
import { useAuth } from '../hooks/useAuth';
import { LegacyApp } from './LegacyApp';
import { SettingsWindow } from './components/SettingsWindow';
import { closeCurrentTauriWindow, isSettingsWindowContext } from '../desktop/settingsWindow';

export default function App() {
  const { token } = useAuth();
  const isSettingsWindow = isSettingsWindowContext();

  if (isSettingsWindow) {
    return (
      <SettingsWindow
        standalone
        onClose={() => {
          void closeCurrentTauriWindow();
        }}
      />
    );
  }

  if (!token) {
    return <LoginScreen />;
  }

  return <LegacyApp />;
}
