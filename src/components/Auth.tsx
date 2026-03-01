import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { LogIn } from 'lucide-react';

export default function Auth({ onAuthSuccess }: { onAuthSuccess: () => void }) {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = username.trim();
    if (!cleanUsername) return;
    
    setLoading(true);
    setError(null);

    try {
      // 1. Adım: Supabase üzerinden anonim oturum aç (Email/Şifre gerekmez)
      const { data: authData, error: authError } = await supabase.auth.signInAnonymously();

      if (authError) throw authError;

      if (authData.user) {
        // 2. Adım: Kullanıcının ismini 'users' tablosuna kaydet
        // upsert kullanarak aynı kullanıcı tekrar girerse ismini güncellemesini sağlarız
        const { error: profileError } = await supabase.from('users').upsert([
          { 
            id: authData.user.id, 
            username: cleanUsername, 
            avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(cleanUsername)}` 
          }
        ]);
        
        if (profileError) throw profileError;
      }
      
      // Giriş başarılı, ana sayfaya yönlendir
      onAuthSuccess();
    } catch (err: any) {
      // Hata mesajını daha anlaşılır hale getir
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-main p-6 relative overflow-hidden">
      {/* Decorative Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-brand/5 rounded-full blur-[120px]"></div>
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="bg-bg-card border border-border-subtle p-10 rounded-[2.5rem] premium-shadow backdrop-blur-xl">
          <div className="flex flex-col items-center mb-10">
            <div className="w-20 h-20 bg-brand rounded-3xl flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.3)] mb-6 rotate-6 hover:rotate-0 transition-transform duration-500">
              <LogIn className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-4xl font-bold text-white mb-2 tracking-tight">
              Welcome
            </h2>
            <p className="text-text-dim text-xs font-bold uppercase tracking-[0.3em] opacity-60">Secure Communication</p>
          </div>
          
          <form onSubmit={handleAuth} className="space-y-6">
            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-text-dim uppercase tracking-widest ml-1">
                Enter your username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. alex_smith"
                className="w-full bg-white/5 border border-transparent focus:border-brand/30 focus:bg-white/10 rounded-2xl px-5 py-4 text-white outline-none transition-all placeholder:text-text-dim/30 text-lg font-medium"
                required
                autoFocus
              />
            </div>
            
            {error && (
              <div className="text-red-400 text-xs font-medium bg-red-400/10 p-4 rounded-2xl border border-red-400/20 animate-in shake duration-300">
                {error}
              </div>
            )}
            
            <button
              type="submit"
              disabled={loading || !username.trim()}
              className="w-full bg-brand text-white py-4 rounded-2xl font-bold hover:bg-brand-light transition-all disabled:opacity-50 text-lg shadow-[0_10px_20px_-5px_rgba(16,185,129,0.4)] active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  <span>Connecting...</span>
                </>
              ) : (
                <span>Start Messaging</span>
              )}
            </button>
          </form>
          
          <div className="mt-10 text-center">
            <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest opacity-40">
              Anonymous Session Enabled
            </p>
          </div>
        </div>
        
        <div className="mt-8 text-center flex items-center justify-center gap-2 text-text-dim/40 text-[10px] font-bold uppercase tracking-[0.2em]">
          <span>End-to-End Encrypted</span>
          <div className="w-1 h-1 bg-brand rounded-full"></div>
          <span>P2P Ready</span>
        </div>
      </div>
    </div>
  );
}