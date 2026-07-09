import { onCLS, onINP, onLCP, onFCP, onTTFB } from 'web-vitals';

type ReportHandler = (metric: {
  name: string;
  value: number;
  id?: string;
  delta?: number;
}) => void;

export function reportWebVitals(onReport: ReportHandler) {
  if (onReport && typeof onReport === 'function') {
    onCLS(onReport);
    onINP(onReport);
    onLCP(onReport);
    onFCP(onReport);
    onTTFB(onReport);
  }
}
