// The file name contains a space, so it must be URL-encoded.
const VIDEO_SRC = '/Shay%20demo.mp4';

// Browsers only allow autoplay for muted, inline videos. Users who prefer
// reduced motion get a paused video they can start with the native controls.
const prefersReducedMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function DemoVideo() {
  return (
    <div className='relative w-full'>
      <div
        aria-hidden='true'
        className='absolute -inset-x-6 -inset-y-4 rounded-[3rem] bg-white/10 blur-3xl'
      />

      <div className='relative rounded-2xl bg-white/15 p-px shadow-[0_40px_120px_rgba(0,0,0,0.65)]'>
        <div className='overflow-hidden rounded-[15px] bg-zinc-950'>
          <div className='flex items-center gap-3 border-b border-white/10 px-4 py-3'>
            <div className='flex gap-1.5' aria-hidden='true'>
              <span className='h-2.5 w-2.5 rounded-full bg-white/20' />
              <span className='h-2.5 w-2.5 rounded-full bg-white/20' />
              <span className='h-2.5 w-2.5 rounded-full bg-white/20' />
            </div>
            <div className='mx-auto flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-4 py-1 text-xs text-white/50'>
              <svg
                viewBox='0 0 24 24'
                className='h-3 w-3'
                fill='none'
                stroke='currentColor'
                strokeWidth='2'
                aria-hidden='true'
              >
                <rect x='5' y='11' width='14' height='9' rx='2' />
                <path d='M8 11V8a4 4 0 018 0v3' />
              </svg>
              shay-five.vercel.app
            </div>
            <div className='w-11 shrink-0' aria-hidden='true' />
          </div>

          <video
            src={VIDEO_SRC}
            className='aspect-video w-full bg-black object-cover'
            autoPlay={!prefersReducedMotion}
            muted
            loop
            playsInline
            controls
            preload='auto'
            aria-label='Shay product demo video'
          />
        </div>
      </div>
    </div>
  );
}
