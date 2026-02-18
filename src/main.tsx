import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';

import App from './app/App';
import './styles/index.css';
import { AuthProvider } from './context/AuthContext';
import { queryClient, setupQueryPersistence } from './services/query/client';

setupQueryPersistence();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
