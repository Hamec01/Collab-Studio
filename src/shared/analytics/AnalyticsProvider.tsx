import React, { createContext, useContext, useCallback } from 'react';

type AnalyticsEvent = {
  name: string;
  properties?: Record<string, unknown>;
};

type MetricEvent = {
  name: string;
  value: number;
  id?: string;
  delta?: number;
};

type AnalyticsContextType = {
  trackEvent: (event: AnalyticsEvent) => void;
  trackPageView: (url: string) => void;
  trackError: (error: Error, context?: Record<string, unknown>) => void;
  trackMetric: (metric: MetricEvent) => void;
};

const AnalyticsContext = createContext<AnalyticsContextType | undefined>(undefined);

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const trackEvent = useCallback((event: AnalyticsEvent) => {
    // Basic console logging for beta phase
    console.debug(`[Analytics] Event: ${event.name}`, event.properties);
  }, []);

  const trackPageView = useCallback((url: string) => {
    console.debug(`[Analytics] PageView: ${url}`);
  }, []);

  const trackError = useCallback((error: Error, context?: Record<string, unknown>) => {
    console.error(`[Analytics] Error:`, error, context);
  }, []);

  const trackMetric = useCallback((metric: MetricEvent) => {
    console.debug(`[Analytics] Web Vitals Metric: ${metric.name}`, metric);
  }, []);

  return (
    <AnalyticsContext.Provider value={{ trackEvent, trackPageView, trackError, trackMetric }}>
      {children}
    </AnalyticsContext.Provider>
  );
}

export function useAnalytics() {
  const context = useContext(AnalyticsContext);
  if (context === undefined) {
    throw new Error('useAnalytics must be used within an AnalyticsProvider');
  }
  return context;
}
