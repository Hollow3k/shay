import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthActions } from '../hooks/useAuthActions.ts';
import { DemoVideo } from '../components/DemoVideo.tsx';

type AuthMode = 'signin' | 'signup' | null;

type Feature = {
  title: string;
  description: string;
  icon: ReactNode;
};

// Shared design tokens so spacing, radii and opacities stay consistent.
const CONTAINER = 'mx-auto w-full max-w-6xl px-5 sm:px-8';
const SECTION = 'py-20 sm:py-28';
const PRIMARY_BUTTON =
  'rounded-full bg-white px-8 py-3 font-medium text-black transition hover:bg-zinc-200';

const iconProps = {
  viewBox: '0 0 24 24',
  className: 'h-5 w-5',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const FEATURES: Feature[] = [
  {
    title: 'Visual canvas',
    description: 'Drag tables onto a canvas and link them with foreign keys. Changes save automatically.',
    icon: (
      <svg {...iconProps}>
        <rect x='3' y='3' width='7' height='7' rx='1.5' />
        <rect x='14' y='3' width='7' height='7' rx='1.5' />
        <rect x='8.5' y='14' width='7' height='7' rx='1.5' />
        <path d='M6.5 10v2.5h11V10M12 12.5V14' />
      </svg>
    ),
  },
  {
    title: 'Build with AI',
    description: 'Describe what you need and Shay updates the schema and explains the changes.',
    icon: (
      <svg {...iconProps}>
        <path d='M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z' />
        <path d='M19 16v4M17 18h4' />
      </svg>
    ),
  },
  {
    title: 'Import a database',
    description: 'Connect PostgreSQL, MySQL or SQLite and bring its tables onto the canvas.',
    icon: (
      <svg {...iconProps}>
        <ellipse cx='12' cy='6' rx='8' ry='3' />
        <path d='M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6' />
        <path d='M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6' />
      </svg>
    ),
  },
  {
    title: 'Export SQL',
    description: 'Get ready-to-run CREATE TABLE statements for your database of choice.',
    icon: (
      <svg {...iconProps}>
        <path d='M12 3v12m0 0l-4-4m4 4l4-4' />
        <path d='M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2' />
      </svg>
    ),
  },
];

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className='mb-12 text-center'>
      <p className='text-xs font-medium uppercase tracking-[0.3em] text-white/50'>{eyebrow}</p>
      <h2 className='mt-4 text-3xl font-semibold sm:text-4xl'>{title}</h2>
    </div>
  );
}

function Landing() {
  const navigate = useNavigate();
  const { signInWithGitHub, handleEmailSignIn, handleEmailSignUp } = useAuthActions();
  const [authMode, setAuthMode] = useState<AuthMode>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState<'signin' | 'signup' | 'github' | null>(null);

  const handleEmailAuth = async (mode: 'signin' | 'signup') => {
    setMessage('');
    setLoading(mode);

    try {
      if (mode === 'signin') {
        await handleEmailSignIn(email, password);
        navigate('/dashboard', { replace: true });
        return;
      }

      const data = await handleEmailSignUp(email, password);
      if (data.session) {
        navigate('/dashboard', { replace: true });
        return;
      }

      setMessage('Check your email to confirm your account before signing in.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Authentication failed.');
    } finally {
      setLoading(null);
    }
  };

  const handleGitHubAuth = async () => {
    setMessage('');
    setLoading('github');

    try {
      await signInWithGitHub();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'GitHub login failed.');
      setLoading(null);
    }
  };

  const openAuthModal = (mode: Exclude<AuthMode, null>) => {
    setAuthMode(mode);
    setMessage('');
    setEmail('');
    setPassword('');
  };

  return (
    <div className='relative min-h-screen w-full overflow-x-hidden bg-black text-white'>
      <div className='pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.12),transparent_32%),radial-gradient(circle_at_top_right,rgba(255,255,255,0.08),transparent_24%),linear-gradient(135deg,#000000_0%,#0a0a0a_55%,#000000_100%)]' />
      <div className='pointer-events-none absolute -left-32 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl' />
      <div className='pointer-events-none absolute -right-20 top-240 h-80 w-80 rounded-full bg-white/10 blur-3xl' />
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-x-0 top-0 h-192 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-size-[56px_56px] mask-[radial-gradient(ellipse_at_top,black_25%,transparent_70%)]'
      />

      <header className='sticky top-0 z-10 border-b border-white/10 bg-black/40 backdrop-blur-xl'>
        <nav aria-label='Primary' className={`${CONTAINER} flex h-16 items-center justify-between`}>
          <a href='/' className='flex items-center gap-3' aria-label='Shay home'>
            <img src='/sicon.png' alt='' className='h-6 w-6 invert' />
            <span className='text-sm font-semibold tracking-[0.3em]'>SHAY</span>
          </a>
          <div className='flex items-center gap-3'>
            <a
              href='https://github.com/Hollow3k/shay'
              target='_blank'
              rel='noopener noreferrer'
              aria-label='Star Shay on GitHub'
              className='flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2 text-sm text-white transition hover:bg-white/10'
            >
              <svg viewBox='0 0 24 24' className='h-4 w-4 fill-current' aria-hidden='true'>
                <path d='M12 2.5l2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.52l-5.88 3.09 1.12-6.55L2.48 9.42l6.58-.96L12 2.5z' />
              </svg>
              Star
            </a>
            <button
              type='button'
              onClick={() => openAuthModal('signin')}
              className='rounded-full border border-white/15 bg-white/5 px-5 py-2 text-sm text-white transition hover:bg-white/10'
            >
              Sign in
            </button>
          </div>
        </nav>
      </header>

      <main className='relative z-1'>
        <section className={`${CONTAINER} flex flex-col items-center pt-20 text-center sm:pt-28`}>
          <h1 className='motion-safe:animate-fade-up text-6xl font-semibold tracking-[0.28em] sm:text-8xl'>
            SHAY
          </h1>
          <p className='motion-safe:animate-fade-up mt-6 text-xl text-white [animation-delay:120ms] sm:text-2xl'>
            Design schemas with ease.
          </p>
          <button
            type='button'
            onClick={() => openAuthModal('signup')}
            className={`${PRIMARY_BUTTON} motion-safe:animate-fade-up mt-10 [animation-delay:200ms]`}
          >
            Build Now
          </button>

          <div className='motion-safe:animate-fade-up mt-14 w-full [animation-delay:320ms] sm:mt-16'>
            <DemoVideo />
          </div>
        </section>

        <section className={`${CONTAINER} ${SECTION}`}>
          <SectionHeader eyebrow='Features' title='Everything you need to model data' />
          <ul className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
            {FEATURES.map((feature) => (
              <li
                key={feature.title}
                className='rounded-2xl border border-white/10 bg-white/5 p-6 transition duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/10'
              >
                <div className='flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5'>
                  {feature.icon}
                </div>
                <h3 className='mt-5 text-lg font-semibold'>{feature.title}</h3>
                <p className='mt-2 text-sm leading-6 text-white/60'>{feature.description}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className='relative z-1 border-t border-white/10'>
        <div className={`${CONTAINER} flex items-center justify-between py-8 text-sm text-white/50`}>
          <div className='flex items-center gap-3'>
            <img src='/sicon.png' alt='' className='h-5 w-5 invert opacity-60' />
            <span className='tracking-[0.25em]'>SHAY</span>
          </div>
          <p>
            Built by{' '}
            <a
              href='https://angad.social'
              target='_blank'
              rel='noopener noreferrer'
              className='text-white underline-offset-4 transition hover:underline'
            >
              Angad
            </a>
          </p>
        </div>
      </footer>

      {authMode ? (
        <div className='fixed inset-0 z-50 flex items-center justify-center px-4'>
          <button
            type='button'
            aria-label='Close auth dialog'
            className='absolute inset-0 cursor-default bg-black/55 backdrop-blur-sm'
            onClick={() => setAuthMode(null)}
          />

          <div className='relative w-full max-w-lg overflow-hidden rounded-4xl border border-white/18 bg-white/12 p-px shadow-[0_30px_120px_rgba(0,0,0,0.5)] backdrop-blur-3xl'>
            <div className='absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.28),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.18),transparent_35%),linear-gradient(135deg,rgba(255,255,255,0.16),rgba(255,255,255,0.04))]' />
            <div className='relative rounded-[1.95rem] border border-white/10 bg-black/35 p-6 text-white shadow-inner shadow-white/10 backdrop-blur-2xl sm:p-8'>
              <div className='mb-6 flex items-start justify-between gap-4'>
                <div>
                  <h2 className='mt-2 text-2xl font-semibold'>
                    {authMode === 'signin' ? 'Sign in to your account' : 'Create your account'}
                  </h2>
                </div>
                <button
                  type='button'
                  onClick={() => setAuthMode(null)}
                  className='rounded-full border border-white/10 bg-white/10 px-3 py-1 text-sm text-white/70 transition hover:bg-white/15 hover:text-white'
                >
                  Close
                </button>
              </div>

              <div className='space-y-4'>
                <input
                  type='email'
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder='Email'
                  className='w-full rounded-2xl border border-white/12 bg-white/10 px-4 py-3 text-white outline-none ring-0 placeholder:text-white/35 focus:border-white/70'
                />
                <input
                  type='password'
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder='Password'
                  className='w-full rounded-2xl border border-white/12 bg-white/10 px-4 py-3 text-white outline-none ring-0 placeholder:text-white/35 focus:border-white/70'
                />

                <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
                  <button
                    type='button'
                    onClick={() => handleEmailAuth('signin')}
                    disabled={loading !== null}
                    className='rounded-2xl bg-white px-4 py-3 font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60'
                  >
                    {loading === 'signin' ? 'Signing In...' : 'Sign In'}
                  </button>
                  <button
                    type='button'
                    onClick={() => handleEmailAuth('signup')}
                    disabled={loading !== null}
                    className='rounded-2xl border border-white/18 bg-white/10 px-4 py-3 font-medium text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60'
                  >
                    {loading === 'signup' ? 'Signing Up...' : 'Sign Up'}
                  </button>
                </div>

                <button
                  type='button'
                  onClick={handleGitHubAuth}
                  disabled={loading !== null}
                  className='w-full rounded-2xl border border-white/15 bg-black/70 px-4 py-3 font-medium text-white transition hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60'
                >
                  {loading === 'github' ? 'Redirecting...' : 'Continue with GitHub'}
                </button>

                {message ? <p className='text-center text-sm text-white/75'>{message}</p> : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default Landing;
