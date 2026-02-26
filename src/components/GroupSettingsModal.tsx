import React, { useState, useEffect } from 'react';
import { supabase, Conversation, Profile } from '../lib/supabase';
import { X, Camera, Save, Users, UserPlus, Trash2, Lock, Unlock, Search } from 'lucide-react';

interface GroupSettingsModalProps {
  group: Conversation;
  currentUser: Profile;
  onClose: () => void;
  onUpdate: () => void;
}

export default function GroupSettingsModal({ group, currentUser, onClose, onUpdate }: GroupSettingsModalProps) {
  const [name, setName] = useState(group.name || '');
  const [avatarUrl, setAvatarUrl] = useState(group.avatar_url || '');
  const [isJoinable, setIsJoinable] = useState(group.is_joinable ?? true);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [addingMember, setAddingMember] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('groups')
        .update({
          name,
          avatar_url: avatarUrl,
          is_joinable: isJoinable
        })
        .eq('id', group.id);

      if (error) throw error;
      onUpdate();
      onClose();
    } catch (err) {
      console.error('Error updating group:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    const { data } = await supabase
      .from('users')
      .select('*')
      .ilike('username', `%${query}%`)
      .eq('is_visible', true)
      .limit(5);

    setSearchResults(data || []);
  };

  const addMember = async (user: Profile) => {
    setAddingMember(true);
    try {
      const { error } = await supabase
        .from('group_members')
        .insert([{
          group_id: group.id,
          user_id: user.id,
          role: 'member'
        }]);

      if (error) {
        if (error.code === '23505') alert('Bu kullanıcı zaten grupta!');
        else throw error;
      } else {
        alert(`${user.username} gruba eklendi.`);
        setSearchQuery('');
        setSearchResults([]);
      }
    } catch (err) {
      console.error('Error adding member:', err);
    } finally {
      setAddingMember(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white w-full max-w-md rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-[#008069] p-4 flex items-center justify-between text-white flex-shrink-0">
          <div className="flex items-center gap-4">
            <X className="w-6 h-6 cursor-pointer" onClick={onClose} />
            <h2 className="text-lg font-medium">Grup Ayarları</h2>
          </div>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          <div className="flex flex-col items-center gap-4">
            <div className="relative group">
              <img 
                src={avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${name}`} 
                className="w-32 h-32 rounded-full object-cover border-4 border-gray-100 shadow-sm"
              />
              <label className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                <Camera className="text-white w-8 h-8" />
                <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} />
              </label>
            </div>
            <p className="text-sm text-gray-500">Grup simgesini değiştir</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Grup Adı</label>
              <input
                type="text"
                className="w-full border-b-2 border-gray-200 focus:border-[#008069] outline-none py-2 transition-colors"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <div className="flex items-center gap-2">
                {isJoinable ? <Unlock className="w-5 h-5 text-[#008069]" /> : <Lock className="w-5 h-5 text-gray-400" />}
                <span className="text-sm font-medium text-gray-700">Grup dışarıdan katılmaya açık</span>
              </div>
              <button 
                onClick={() => setIsJoinable(!isJoinable)}
                className={`w-12 h-6 rounded-full transition-colors relative ${isJoinable ? 'bg-[#008069]' : 'bg-gray-300'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isJoinable ? 'right-1' : 'left-1'}`} />
              </button>
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">Yeni Üye Ekle</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Kullanıcı ara..."
                  className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-lg outline-none text-sm"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                />
              </div>
              
              {searchResults.length > 0 && (
                <div className="bg-white border border-gray-100 rounded-lg shadow-sm overflow-hidden">
                  {searchResults.map(user => (
                    <div 
                      key={user.id}
                      className="flex items-center justify-between p-2 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <img src={user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`} className="w-8 h-8 rounded-full" />
                        <span className="text-sm font-medium">{user.username}</span>
                      </div>
                      <button
                        onClick={() => addMember(user)}
                        disabled={addingMember}
                        className="p-1.5 bg-[#008069] text-white rounded-full hover:bg-[#006b58] transition-colors disabled:opacity-50"
                      >
                        <UserPlus className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={loading}
            className="w-full bg-[#008069] text-white py-3 rounded-lg font-bold hover:bg-[#006b58] transition-colors flex items-center justify-center gap-2 mt-4"
          >
            {loading ? 'Kaydediliyor...' : (
              <>
                <Save className="w-5 h-5" />
                Ayarları Kaydet
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
