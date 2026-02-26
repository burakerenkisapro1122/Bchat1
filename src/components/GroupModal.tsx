import React, { useState } from 'react';
import { supabase, Profile } from '../lib/supabase';
import { X, Users, Search } from 'lucide-react';

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-md rounded-lg shadow-xl overflow-hidden">
        <div className="bg-[#008069] p-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-4">
            <X className="w-6 h-6 cursor-pointer" onClick={onClose} />
            <h2 className="text-lg font-medium">New Group</h2>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Group Name</label>
            <input
              type="text"
              placeholder="Enter group name"
              className="w-full border-b-2 border-gray-200 focus:border-[#008069] outline-none py-2 transition-colors"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Add Members</label>
            <div className="relative bg-[#f0f2f5] rounded-lg flex items-center px-3 py-2 mb-4">
              <Search className="w-5 h-5 text-gray-500 mr-3" />
              <input
                type="text"
                placeholder="Search users"
                className="bg-transparent w-full outline-none text-sm"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
              />
            </div>

            {/* Selected Users */}
            <div className="flex flex-wrap gap-2 mb-4">
              {selectedUsers.map(user => (
                <div key={user.id} className="bg-[#e9edef] px-3 py-1 rounded-full flex items-center gap-2 text-sm">
                  <span>{user.username}</span>
                  <X className="w-3 h-3 cursor-pointer" onClick={() => toggleUser(user)} />
                </div>
              ))}
            </div>

            {/* Search Results */}
            <div className="max-h-[200px] overflow-y-auto border border-gray-100 rounded">
              {searchResults.map(user => (
                <div
                  key={user.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[#f5f6f6] cursor-pointer"
                  onClick={() => toggleUser(user)}
                >
                  <input
                    type="checkbox"
                    checked={!!selectedUsers.find(u => u.id === user.id)}
                    readOnly
                    className="accent-[#008069]"
                  />
                  <img src={user.avatar_url || ''} className="w-10 h-10 rounded-full" />
                  <p className="font-medium">{user.username}</p>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handleCreateGroup}
            disabled={loading || !name.trim() || selectedUsers.length === 0}
            className="w-full bg-[#008069] text-white py-3 rounded-lg font-bold hover:bg-[#006b58] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating...' : 'Create Group'}
          </button>
        </div>
      </div>
    </div>
  );
}
