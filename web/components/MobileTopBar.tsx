/**
 * components/MobileTopBar.tsx
 *
 * Mobile-only top bar (`md:hidden` — Nav's floating pill takes over at
 * `md:` and up) that just shows the brand mark. Without this, mobile had
 * nothing at all at the top (Nav is desktop-only, MobileTabBar lives at
 * the bottom), leaving Hero's own top padding — sized to clear the
 * desktop floating pill — as a large dead gap with nothing in it.
 *
 * Plain presentational component — no client state needed, so unlike
 * SiteHeader this doesn't hide on scroll; at this height it's not worth
 * the complexity.
 */

export default function MobileTopBar() {
  return (
    <div className="fixed inset-x-0 top-0 z-50 flex h-12 items-center border-b border-white/10 bg-black/60 px-4 backdrop-blur-xl md:hidden">
      <span className="flex items-center text-sm font-extrabold text-white">
        % <span className="pl-2 text-red-500">Save</span><span className="text-blue-500">Rate</span>LK
      </span>
    </div>
  );
}
