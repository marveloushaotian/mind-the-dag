import { lazy, Suspense } from 'react';

const EuropeBackdrop = lazy(() => import('./EuropeBackdrop'));

/** Keep decorative geography out of the editor's initial download. */
export default function CoverBackdrop() {
  return <Suspense fallback={null}><EuropeBackdrop /></Suspense>;
}
