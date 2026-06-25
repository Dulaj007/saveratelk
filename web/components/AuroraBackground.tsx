/**
 * components/AuroraBackground.tsx
 *
 * Ambient depth cue behind every page, replacing the old drifting-dots
 * canvas with a few large, soft-edged color blobs (blue/violet/cyan)
 * blurred heavily and drifting slowly: the "bubble lighting" glow effect
 * common to modern dark fintech/SaaS UIs. Pure CSS (no canvas, no
 * per-frame JS): each blob is a plain absolutely-positioned div with an
 * animated transform, defined in globals.css so the keyframes can also
 * respect prefers-reduced-motion via a plain media query.
 *
 * Server Component, since nothing here needs the browser.
 */

export default function AuroraBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="animate-float-a absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-blue-600/30 blur-[120px]" />
      <div className="animate-float-b absolute -right-40 top-1/4 h-[30rem] w-[30rem] rounded-full bg-violet-600/25 blur-[120px]" />
      <div className="animate-float-c absolute -bottom-40 left-1/4 h-[32rem] w-[32rem] rounded-full bg-cyan-500/20 blur-[130px]" />
    </div>
  );
}
