import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import AppRouter from './app/AppRouter.tsx';
import PwaRegister from './app/pwa/PwaRegister.tsx';
import { AuthProvider } from './app/auth/AuthProvider.tsx';
import { PlayerProvider } from './app/player/PlayerProvider.tsx';
import { I18nProvider } from './app/i18n/I18nProvider.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <PwaRegister />
      <BrowserRouter>
        <AuthProvider>
          <PlayerProvider>
            <AppRouter />
          </PlayerProvider>
        </AuthProvider>
      </BrowserRouter>
    </I18nProvider>
  </StrictMode>,
);
