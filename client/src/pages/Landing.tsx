import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthActions } from '../hooks/useAuthActions.ts';

type AuthMode = 'signin' | 'signup' | null;

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
    <div className='relative flex min-h-screen w-screen items-center justify-center overflow-hidden bg-black px-4 text-white'>
      <div className='absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.12),transparent_32%),radial-gradient(circle_at_top_right,rgba(255,255,255,0.08),transparent_24%),linear-gradient(135deg,#000000_0%,#0a0a0a_55%,#000000_100%)]' />
      <div className='absolute -left-32 -top-24 h-72 w-72 rounded-full bg-white/12 blur-3xl' />
      <div className='absolute -bottom-28 -right-20 h-80 w-80 rounded-full bg-white/8 blur-3xl' />

      <div className='relative z-10 flex max-w-2xl flex-col items-center text-center'>
        
        <h1 className='mt-6 text-5xl font-semibold tracking-[0.28em] sm:text-6xl'>SHAY</h1>
        <p className='mt-4 max-w-lg text-sm leading-6 text-white/70 sm:text-base'>
          Design schemas with ease.
        </p>

        <div className='mt-10'>
          <button
            type='button'
            onClick={() => openAuthModal('signup')}
            className='rounded-full bg-white/50  px-8 py-3 font-medium text-black transition hover:bg-zinc-200'
          >
            Build Now
          </button>
        </div>
      </div>

      {authMode ? (
        <div className='fixed inset-0 z-20 flex items-center justify-center px-4'>
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
