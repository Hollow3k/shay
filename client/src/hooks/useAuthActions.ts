import { supabase } from '../lib/supabaseClient.ts';

export const useAuthActions = () => {
  const signInWithGitHub = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        // This ensures the user lands on the dashboard after success
        redirectTo: `${window.location.origin}/dashboard`,
      },
    });
    if (error) console.error("GitHub Login Error:", error.message);
  };

  const handleEmailSignUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  };

  const handleEmailSignIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return { signInWithGitHub, handleEmailSignUp, handleEmailSignIn, handleSignOut };
};