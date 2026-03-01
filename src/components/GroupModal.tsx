import React, { useState } from 'react';
import { supabase, Profile } from '../lib/supabase';
import { X, Users, Search } from 'lucide-react';
import { cn } from '../lib/utils';

interface GroupModalProps {
  currentUser: Profile;
  onClose: () => void;
  onSuccess: () => void;
}

export default function GroupModal({ currentUser, onClose, onSuccess }: GroupModalProps) {
  const [name, setName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);

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
      .neq('id', currentUser.id)
      .limit(5);

    setSearchResults(data || []);
  };

  const toggleUser = (user: Profile) => {
    if (selectedUsers.find(u => u.id === user.id)) {
      setSelectedUsers(selectedUsers.filter(u => u.id !== user.id));
    } else {
      setSelectedUsers([...selectedUsers, user]);
    }
  };

  const handleCreateGroup = async () => {
    if (!name.trim() || selectedUsers.length === 0) return;
    setLoading(true);

    try {
      const { data: group, error: groupError } = await supabase
        .from('groups')
        .insert([{ 
          name, 
          owner_id: currentUser.id,
          is_joinable: true
        }])
        .select()
        .single();

      if (groupError) throw groupError;

      const members = [
        { group_id: group.id, user_id: currentUser.id, role: 'owner' },
        ...selectedUsers.map(u => ({ group_id: group.id, user_id: u.id, role: 'member' }))
      ];

      const { error: memberError } = await supabase
        .from('group_members')
        .insert(members);

      if (memberError) throw memberError;

      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error creating group:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-6 animate-in fade-in duration-300">
      <div className="bg-bg-card w-full max-w-md rounded-[2.5rem] border border-border-subtle shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="px-8 py-6 border-b border-border-subtle flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-brand/10 rounded-xl flex items-center justify-center text-brand">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Create Group</h2>
              <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest opacity-60">New Collective Space</p>
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
          <div className="space-y-2">
            <label className="block text-[10px] font-bold text-text-dim uppercase tracking-widest ml-1">Group Identity</label>
            <input
              type="text"
              placeholder="Enter a name for your group"
              className="w-full bg-white/5 border border-transparent focus:border-brand/30 focus:bg-white/10 rounded-2xl px-5 py-4 text-white outline-none transition-all placeholder:text-text-dim/30 font-medium"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-4">
            <label className="block text-[10px] font-bold text-text-dim uppercase tracking-widest ml-1">Invite Members</label>
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

            {/* Selected Users */}
            {selectedUsers.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedUsers.map(user => (
                  <div key={user.id} className="bg-brand/10 border border-brand/20 px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs font-semibold text-brand animate-in zoom-in-90">
                    <span>{user.username}</span>
                    <button onClick={() => toggleUser(user)} className="hover:text-brand-light">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="max-h-[200px] overflow-y-auto space-y-1 pr-2 custom-scrollbar">
                {searchResults.map(user => {
                  const isSelected = !!selectedUsers.find(u => u.id === user.id);
                  return (
                    <div
                      key={user.id}
                      className={cn(
                        "flex items-center gap-4 px-4 py-3 rounded-2xl cursor-pointer transition-all",
                        isSelected ? "bg-brand/10 border border-brand/20" : "hover:bg-white/5 border border-transparent"
                      )}
                      onClick={() => toggleUser(user)}
                    >
                      <div className="relative">
                        <img src={user.avatar_url || ''} className="w-10 h-10 rounded-xl object-cover" />
                        {isSelected && (
                          <div className="absolute -top-1 -right-1 w-4 h-4 bg-brand rounded-full flex items-center justify-center border-2 border-bg-card">
                            <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                          </div>
                        )}
                      </div>
                      <p className="font-semibold text-sm text-white/90">{user.username}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <button
            onClick={handleCreateGroup}
            disabled={loading || !name.trim() || selectedUsers.length === 0}
            className="w-full bg-brand text-white py-4 rounded-2xl font-bold hover:bg-brand-light transition-all disabled:opacity-20 disabled:cursor-not-allowed shadow-[0_10px_20px_-5px_rgba(16,185,129,0.3)] active:scale-[0.98]"
          >
            {loading ? 'Establishing Group...' : 'Create Collective'}
          </button>
        </div>
      </div>
    </div>
  );
}
