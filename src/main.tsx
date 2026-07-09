import {StrictMode, useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import AppRouter from './app/AppRouter.tsx';
import PwaRegister from './app/pwa/PwaRegister.tsx';
import { AuthProvider } from './app/auth/AuthProvider.tsx';
import { PlayerProvider } from './app/player/PlayerProvider.tsx';
import { I18nProvider } from './app/i18n/I18nProvider.tsx';
import { AnalyticsProvider, useAnalytics } from './shared/analytics/AnalyticsProvider.tsx';
import { reportWebVitals } from './shared/analytics/webVitals.ts';
import './index.css';

function WebVitalsReporter() {
  const { trackMetric } = useAnalytics();
  useEffect(() => {
    reportWebVitals(trackMetric);
  }, [trackMetric]);
  return null;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AnalyticsProvider>
      <WebVitalsReporter />
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
    </AnalyticsProvider>
  </StrictMode>,
);

