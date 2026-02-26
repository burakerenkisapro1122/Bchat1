import React, { useState } from 'react';
import { supabase, Profile } from '../lib/supabase';
import { X, Camera, Save, Eye, EyeOff } from 'lucide-react';

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-md rounded-lg shadow-xl overflow-hidden">
        <div className="bg-[#008069] p-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-4">
            <X className="w-6 h-6 cursor-pointer" onClick={onClose} />
            <h2 className="text-lg font-medium">Profil Düzenle</h2>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex flex-col items-center gap-4">
            <div className="relative group">
              <img 
                src={avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`} 
                className="w-32 h-32 rounded-full object-cover border-4 border-gray-100 shadow-sm"
              />
              <label className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                <Camera className="text-white w-8 h-8" />
                <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} />
              </label>
            </div>
            <p className="text-sm text-gray-500">Profil fotoğrafını değiştirmek için tıklayın</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kullanıcı Adı</label>
              <input
                type="text"
                className="w-full border-b-2 border-gray-200 focus:border-[#008069] outline-none py-2 transition-colors"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hakkımda</label>
              <textarea
                className="w-full border-b-2 border-gray-200 focus:border-[#008069] outline-none py-2 transition-colors resize-none"
                rows={2}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Bir şeyler yazın..."
              />
            </div>

            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                {isVisible ? <Eye className="w-5 h-5 text-[#008069]" /> : <EyeOff className="w-5 h-5 text-gray-400" />}
                <span className="text-sm font-medium text-gray-700">Diğer kullanıcılara görünür ol</span>
              </div>
              <button 
                onClick={() => setIsVisible(!isVisible)}
                className={`w-12 h-6 rounded-full transition-colors relative ${isVisible ? 'bg-[#008069]' : 'bg-gray-300'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isVisible ? 'right-1' : 'left-1'}`} />
              </button>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={loading}
            className="w-full bg-[#008069] text-white py-3 rounded-lg font-bold hover:bg-[#006b58] transition-colors flex items-center justify-center gap-2"
          >
            {loading ? 'Kaydediliyor...' : (
              <>
                <Save className="w-5 h-5" />
                Kaydet
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
