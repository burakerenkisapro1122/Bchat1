import React, { useState, useEffect } from 'react';
import { supabase, Conversation, Profile } from '../lib/supabase';
import { X, Camera, Save, Users, UserPlus, Trash2, Lock, Unlock, Search } from 'lucide-react';
import { cn } from '../lib/utils';

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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-6 animate-in fade-in duration-300">
      <div className="bg-bg-card w-full max-w-md rounded-[2.5rem] border border-border-subtle shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300">
        <div className="px-8 py-6 border-b border-border-subtle flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-brand/10 rounded-xl flex items-center justify-center text-brand">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Group Settings</h2>
              <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest opacity-60">Manage Collective</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-xl text-text-dim hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 space-y-8 overflow-y-auto custom-scrollbar">
          <div className="flex flex-col items-center gap-4">
            <div className="relative group">
              <img 
                src={avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${name}`} 
                className="w-32 h-32 rounded-[2.5rem] object-cover border-4 border-white/5 shadow-2xl group-hover:border-brand/30 transition-all duration-500"
              />
              <label className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-[2.5rem] opacity-0 group-hover:opacity-100 cursor-pointer transition-all duration-300 backdrop-blur-[2px]">
                <Camera className="text-white w-8 h-8" />
                <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} />
              </label>
            </div>
            <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest opacity-40">Tap to update group icon</p>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-text-dim uppercase tracking-widest ml-1">Group Name</label>
              <input
                type="text"
                className="w-full bg-white/5 border border-transparent focus:border-brand/30 focus:bg-white/10 rounded-2xl px-5 py-4 text-white outline-none transition-all placeholder:text-text-dim/30 font-medium"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                  isJoinable ? "bg-brand/10 text-brand" : "bg-text-dim/10 text-text-dim"
                )}>
                  {isJoinable ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                </div>
                <div>
                  <p className="text-xs font-bold text-white/90">Public Access</p>
                  <p className="text-[10px] text-text-dim font-medium">Allow others to join via link</p>
                </div>
              </div>
              <button 
                onClick={() => setIsJoinable(!isJoinable)}
                className={cn(
                  "w-12 h-6 rounded-full transition-all relative",
                  isJoinable ? 'bg-brand shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-white/10'
                )}
              >
                <div className={cn(
                  "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                  isJoinable ? 'right-1' : 'left-1'
                )} />
              </button>
            </div>

            <div className="space-y-4">
              <label className="block text-[10px] font-bold text-text-dim uppercase tracking-widest ml-1">Add New Members</label>
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim group-focus-within:text-brand transition-colors" />
                <input
                  type="text"
                  placeholder="Search by username..."
                  className="w-full bg-white/5 border border-transparent focus:border-brand/30 focus:bg-white/10 rounded-2xl pl-12 pr-5 py-3.5 text-sm text-white outline-none transition-all placeholder:text-text-dim/30"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                />
              </div>
              
              {searchResults.length > 0 && (
                <div className="bg-white/5 border border-white/5 rounded-2xl overflow-hidden divide-y divide-white/5">
                  {searchResults.map(user => (
                    <div 
                      key={user.id}
                      className="flex items-center justify-between p-3 hover:bg-white/10 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <img src={user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`} className="w-8 h-8 rounded-lg object-cover" />
                        <span className="text-xs font-semibold text-white/90">{user.username}</span>
                      </div>
                      <button
                        onClick={() => addMember(user)}
                        disabled={addingMember}
                        className="w-8 h-8 bg-brand text-white rounded-lg flex items-center justify-center hover:bg-brand-light transition-all disabled:opacity-50 shadow-lg active:scale-95"
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
            className="w-full bg-brand text-white py-4 rounded-2xl font-bold hover:bg-brand-light transition-all flex items-center justify-center gap-2 shadow-[0_10px_20px_-5px_rgba(16,185,129,0.3)] active:scale-[0.98] mt-4"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>
                <Save className="w-5 h-5" />
                <span>Update Collective</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
