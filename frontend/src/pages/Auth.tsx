import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { supabase } from '../lib/supabase';
import { LogIn, UserPlus, Mail, Lock, User, AlertCircle, CheckCircle, Shield } from 'lucide-react';

export default function Auth() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Redirect if already logged in
  const from = (location.state as any)?.from?.pathname || '/';
  
  useEffect(() => {
    if (session && !loading) {
      navigate(from, { replace: true });
    }
  }, [session, loading, navigate, from]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email || !password) {
      setError('Please fill in all required fields.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (isSignUp && !displayName) {
      setError('Please provide a display name.');
      return;
    }

    setSubmitting(true);

    try {
      if (isSignUp) {
        // Sign Up
        const { data, error: signUpErr } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: displayName
            }
          }
        });

        if (signUpErr) throw signUpErr;

        // Note: Supabase sign-up behavior depends on whether email confirmation is enabled.
        if (data.session) {
          setSuccess('Account created successfully! Logging you in...');
          // Redirect will be handled by useEffect
        } else {
          setSuccess('Registration successful! Please check your email inbox to confirm your account.');
          // Clear inputs
          setEmail('');
          setPassword('');
          setDisplayName('');
        }
      } else {
        // Sign In
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (signInErr) throw signInErr;

        setSuccess('Logged in successfully!');
        // Redirect will be handled by useEffect
      }
    } catch (err: any) {
      console.error('Authentication error:', err.message);
      setError(err.message || 'An error occurred during authentication.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-card border rounded-2xl max-w-md mx-auto my-12 gap-4">
        <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
        <p className="text-sm font-semibold text-muted-foreground">Checking authentication status...</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto my-12 space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-primary to-amber-600 bg-clip-text text-transparent">
          {isSignUp ? 'Create an Account' : 'Welcome Back'}
        </h1>
        <p className="text-muted-foreground text-sm font-semibold">
          {isSignUp 
            ? 'Join TradieHubAU to post jobs and find trusted trade professionals.' 
            : 'Access your account to manage your listings and quotes.'}
        </p>
      </div>

      <div className="bg-card border border-border rounded-3xl shadow-xl overflow-hidden">
        {/* Tab Selector */}
        <div className="flex border-b bg-muted/20">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(false);
              setError(null);
              setSuccess(null);
            }}
            className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-all ${
              !isSignUp 
                ? 'border-primary text-primary bg-background' 
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <LogIn className="h-4 w-4" />
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setIsSignUp(true);
              setError(null);
              setSuccess(null);
            }}
            className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-all ${
              isSignUp 
                ? 'border-primary text-primary bg-background' 
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <UserPlus className="h-4 w-4" />
            Join Now
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-600 text-xs font-semibold flex items-start gap-2.5">
              <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          {isSignUp && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground uppercase tracking-wider">Display Name</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-background border border-border rounded-xl outline-none focus:border-primary/50 text-sm font-medium transition-all"
                  required={isSignUp}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-bold text-foreground uppercase tracking-wider">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="email"
                placeholder="your.email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-background border border-border rounded-xl outline-none focus:border-primary/50 text-sm font-medium transition-all"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-foreground uppercase tracking-wider">Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-background border border-border rounded-xl outline-none focus:border-primary/50 text-sm font-medium transition-all"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center bg-primary text-primary-foreground text-sm font-bold py-3.5 rounded-xl hover:bg-primary/95 shadow-md active:scale-95 disabled:opacity-50 transition-all"
          >
            {submitting ? (
              <div className="h-5 w-5 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin"></div>
            ) : isSignUp ? (
              'Create Account'
            ) : (
              'Sign In'
            )}
          </button>
        </form>
      </div>

      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground font-semibold">
        <Shield className="h-4 w-4" />
        <span>Secured by Supabase Identity Engine</span>
      </div>
    </div>
  );
}
