import { LoginScreen } from './screens/LoginScreen';
import { useAuth } from '../hooks/useAuth';
import { LegacyApp } from './LegacyApp';

export default function App() {
  const { token } = useAuth();

  if (!token) {
    return <LoginScreen />;
  }

  return <LegacyApp />;
}
