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
    <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5] p-4">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <div className="flex justify-center mb-6">
          <div className="w-24 h-24 bg-white rounded-2xl flex items-center justify-center shadow-sm overflow-hidden border border-gray-100">
            <img src="/unnamed.jpg" alt="B-Chat Logo" className="w-full h-full object-cover" />
          </div>
        </div>
        <h2 className="text-3xl font-bold text-center mb-2 text-[#0b141a]">
          B-Chat
        </h2>
        <p className="text-center text-gray-500 mb-8 text-sm">Hızlı, Güvenli, Özgür</p>
        
        <form onSubmit={handleAuth} className="space-y-4 flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Başlamak için isminizi girin
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Örn: Ahmet Yılmaz"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#25d366] outline-none text-lg"
              required
              autoFocus
            />
          </div>
          
          {error && (
            <div className="text-red-500 text-sm bg-red-50 p-2 rounded border border-red-100">
              {error}
            </div>
          )}
          
          <button
            type="submit"
            disabled={loading || !username.trim()}
            className="w-full bg-[#25d366] text-white py-3 rounded-lg font-bold hover:bg-[#128c7e] transition-colors disabled:opacity-50 text-lg shadow-sm"
          >
            {loading ? 'Giriş yapılıyor...' : 'Sohbete Başla'}
          </button>
        </form>
        
        <div className="mt-8 text-center text-xs text-gray-400">
          <p>Anonim giriş sistemi aktiftir.</p>
        </div>
      </div>
    </div>
  );
}