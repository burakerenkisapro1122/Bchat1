import React, { useState } from 'react';
import { supabase, Profile } from '../lib/supabase';
import { X, Camera, Save, Eye, EyeOff } from 'lucide-react';
import { cn } from '../lib/utils';

interface ProfileModalProps {
  currentUser: Profile;
  onClose: () => void;
  onUpdate: (updatedProfile: Profile) => void;
}

export default function ProfileModal({ currentUser, onClose, onUpdate }: ProfileModalProps) {
  const [username, setUsername] = useState(currentUser.username);
  const [bio, setBio] = useState(currentUser.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatar_url || '');
  const [isVisible, setIsVisible] = useState(currentUser.is_visible);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .update({
          username,
          bio,
          avatar_url: avatarUrl,
          is_visible: isVisible,
          updated_at: new Date().toISOString()
        })
        .eq('id', currentUser.id)
        .select()
        .single();

      if (error) throw error;
      onUpdate(data);
      onClose();
    } catch (err) {
      console.error('Error updating profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // In a real app, we would upload to Supabase Storage
    // For now, we'll use a data URL as a placeholder
    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-6 animate-in fade-in duration-300">
      <div className="bg-bg-card w-full max-w-md rounded-[2.5rem] border border-border-subtle shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="px-8 py-6 border-b border-border-subtle flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-brand/10 rounded-xl flex items-center justify-center text-brand">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Edit Profile</h2>
              <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest opacity-60">Personal Identity</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-xl text-text-dim hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 space-y-8">
          <div className="flex flex-col items-center gap-4">
            <div className="relative group">
              <img 
                src={avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`} 
                className="w-32 h-32 rounded-[2.5rem] object-cover border-4 border-white/5 shadow-2xl group-hover:border-brand/30 transition-all duration-500"
              />
              <label className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-[2.5rem] opacity-0 group-hover:opacity-100 cursor-pointer transition-all duration-300 backdrop-blur-[2px]">
                <Camera className="text-white w-8 h-8" />
                <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} />
              </label>
            </div>
            <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest opacity-40">Tap to update avatar</p>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-text-dim uppercase tracking-widest ml-1">Username</label>
              <input
                type="text"
                className="w-full bg-white/5 border border-transparent focus:border-brand/30 focus:bg-white/10 rounded-2xl px-5 py-4 text-white outline-none transition-all placeholder:text-text-dim/30 font-medium"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-text-dim uppercase tracking-widest ml-1">Bio</label>
              <textarea
                className="w-full bg-white/5 border border-transparent focus:border-brand/30 focus:bg-white/10 rounded-2xl px-5 py-4 text-white outline-none transition-all placeholder:text-text-dim/30 font-medium resize-none"
                rows={2}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell us about yourself..."
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                  isVisible ? "bg-brand/10 text-brand" : "bg-text-dim/10 text-text-dim"
                )}>
                  {isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </div>
                <div>
                  <p className="text-xs font-bold text-white/90">Public Visibility</p>
                  <p className="text-[10px] text-text-dim font-medium">Allow others to find you</p>
                </div>
              </div>
              <button 
                onClick={() => setIsVisible(!isVisible)}
                className={cn(
                  "w-12 h-6 rounded-full transition-all relative",
                  isVisible ? 'bg-brand shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-white/10'
                )}
              >
                <div className={cn(
                  "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                  isVisible ? 'right-1' : 'left-1'
                )} />
              </button>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={loading}
            className="w-full bg-brand text-white py-4 rounded-2xl font-bold hover:bg-brand-light transition-all flex items-center justify-center gap-2 shadow-[0_10px_20px_-5px_rgba(16,185,129,0.3)] active:scale-[0.98]"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>
                <Save className="w-5 h-5" />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
