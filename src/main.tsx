import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';

import App from './app/App';
import './styles/index.css';
import { AuthProvider } from './context/AuthContext';
import { queryClient, setupQueryPersistence } from './services/query/client';
import { setupTray } from './desktop/tray';

const isTauriRuntime =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

if (isTauriRuntime) {
  document.documentElement.classList.add('tauri-runtime');
  document.body.classList.add('tauri-runtime');
}

setupQueryPersistence();
void setupTray();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
