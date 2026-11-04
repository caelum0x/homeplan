// A thin client-only wrapper around the Railyard Insights tag (`s.js`, loaded
// sitewide from app/layout.tsx with this site's own key -- see
// https://pa.ereboslab.com / railyard's apps/insights-edge self-serve signup,
// `s_0GKZt4HKNyUP2axPH6crAjmh`, registered 2026-11-04 for the real paying-customer
// funnel this hosted site runs: plan generated -> Pro checkout started).
// Mirrors bidstage-tenders' web/track.ts pattern exactly (same product, same
// tag, same API) so any future funnel work here can reuse that doc. `window
// .railyard` may not exist yet -- the script is `defer`red, an ad blocker can
// drop it, or this can run during SSR -- so this never throws and never delays
// the real UI action it is attached to.
declare global {
  interface Window {
    railyard?: { track: (name: string, data?: Record<string, unknown>) => void };
  }
}

export function track(name: string, data?: Record<string, unknown>): void {
  try {
    window.railyard?.track(name, data);
  } catch {
    // Analytics must never break the real flow.
  }
}
