import React, { useState, useEffect, useMemo } from 'react';
import { supabase, Conversation, Profile } from '../lib/supabase';
import { Search, MoreVertical, MessageSquare, Users, LogOut, User, Settings, Check, CheckCheck } from 'lucide-react';
import { cn, getInitials } from '../lib/utils';
import GroupModal from './GroupModal';
import ProfileModal from './ProfileModal';
import DetailsModal from './DetailsModal';
import { usePresence } from '../lib/usePresence';

interface SidebarProps {
  currentUser: Profile;
  onSelectConversation: (conversation: Conversation) => void;
  onUpdateProfile: (profile: Profile) => void;
  selectedConversationId?: string;
}

export default function Sidebar({ currentUser, onSelectConversation, onUpdateProfile, selectedConversationId }: SidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedUserDetails, setSelectedUserDetails] = useState<Profile | null>(null);
  
  const { isOnline } = usePresence(currentUser.id);

  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => {
      // If it's a DM, check online status
      const otherA = !a.is_group ? a.participants?.find(p => p.user_id !== currentUser.id)?.user_id : null;
      const otherB = !b.is_group ? b.participants?.find(p => p.user_id !== currentUser.id)?.user_id : null;
      
      const onlineA = otherA ? isOnline(otherA) : false;
      const onlineB = otherB ? isOnline(otherB) : false;

      if (onlineA && !onlineB) return -1;
      if (!onlineA && onlineB) return 1;

      const dateA = a.last_message?.created_at || a.created_at;
      const dateB = b.last_message?.created_at || b.created_at;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });
  }, [conversations, isOnline, currentUser.id]);

  useEffect(() => {
    fetchConversations();
    
    const refreshHandler = () => fetchConversations();
    window.addEventListener('refresh-conversations', refreshHandler);

    // Subscribe to new messages to update last message in sidebar
    const channel = supabase
      .channel('sidebar-updates')
      .on('postgres_changes' as any, { event: 'INSERT', table: 'messages', schema: 'public' }, () => {
        fetchConversations();
      })
      .subscribe();

    return () => {
      window.removeEventListener('refresh-conversations', refreshHandler);
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchConversations = async () => {
    try {
      // 1. Fetch DMs
      const { data: dmData, error: dmError } = await supabase
        .from('conversation_participants')
        .select(`
          conversation_id,
          conversations (
            id,
            created_at
          )
        `)
        .eq('user_id', currentUser.id);

      if (dmError) throw dmError;

      const dms = await Promise.all(
        dmData.map(async (item: any) => {
          const conv = item.conversations;
          
          const { data: participants } = await supabase
            .from('conversation_participants')
            .select('user_id, user:users(*)')
            .eq('conversation_id', conv.id);

          const { data: lastMessages } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conv.id)
            .order('created_at', { ascending: false })
            .limit(1);

          return {
            ...conv,
            is_group: false,
            participants: participants?.map(p => ({ ...p, profile: p.user })) || [],
            last_message: lastMessages?.[0]
          };
        })
      );

      // 2. Fetch Groups
      const { data: groupData, error: groupError } = await supabase
        .from('group_members')
        .select(`
          group_id,
          groups (
            id,
            name,
            created_at,
            owner_id
          )
        `)
        .eq('user_id', currentUser.id);

      if (groupError) throw groupError;

      const groups = await Promise.all(
        groupData.map(async (item: any) => {
          const group = item.groups;
          
          const { data: members } = await supabase
            .from('group_members')
            .select('user_id, user:users(*)')
            .eq('group_id', group.id);

          const { data: lastMessages } = await supabase
            .from('messages')
            .select('*')
            .eq('group_id', group.id)
            .order('created_at', { ascending: false })
            .limit(1);

          return {
            ...group,
            is_group: true,
            participants: members?.map(m => ({ ...m, profile: m.user })) || [],
            last_message: lastMessages?.[0]
          };
        })
      );

      const allConvs = [...dms, ...groups];

      setConversations(allConvs.sort((a, b) => {
        const dateA = a.last_message?.created_at || a.created_at;
        const dateB = b.last_message?.created_at || b.created_at;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      }));
    } catch (err) {
      console.error('Error fetching conversations:', err);
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
      .neq('id', currentUser.id)
      .limit(10);

    const sortedResults = (data || []).sort((a, b) => {
      const onlineA = isOnline(a.id);
      const onlineB = isOnline(b.id);
      if (onlineA && !onlineB) return -1;
      if (!onlineA && onlineB) return 1;
      return 0;
    });

    setSearchResults(sortedResults);
  };

  const startDM = async (targetUser: Profile) => {
    // Check if DM already exists
    const { data: existing } = await supabase
      .rpc('get_common_conversation', { user1: currentUser.id, user2: targetUser.id });

    if (existing && existing.length > 0) {
      onSelectConversation({ ...existing[0], is_group: false });
      setSearchQuery('');
      setSearchResults([]);
      return;
    }

    // Create new DM
    const { data: newConv, error: convError } = await supabase
      .from('conversations')
      .insert([{}])
      .select()
      .single();

    if (convError) return;

    await supabase.from('conversation_participants').insert([
      { conversation_id: newConv.id, user_id: currentUser.id },
      { conversation_id: newConv.id, user_id: targetUser.id }
    ]);

    fetchConversations();
    onSelectConversation({ ...newConv, is_group: false });
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  return (
    <div className="w-full md:w-[400px] h-full flex flex-col bg-white border-r border-gray-200">
      {/* Header */}
      <div className="h-[60px] bg-[#f0f2f5] flex items-center justify-between px-4 py-2">
        <div 
          className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => setShowProfileModal(true)}
        >
          <img
            src={currentUser.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser.username}`}
            alt={currentUser.username}
            className="w-10 h-10 rounded-full object-cover"
          />
          <span className="font-medium text-gray-700">{currentUser.username}</span>
        </div>
        <div className="flex items-center gap-4 text-gray-500">
          <Users 
            className="w-6 h-6 cursor-pointer hover:text-gray-700" 
            onClick={() => setShowGroupModal(true)}
            title="Groups" 
          />
          <MessageSquare className="w-6 h-6 cursor-pointer hover:text-gray-700" title="New Chat" />
          <LogOut className="w-6 h-6 cursor-pointer hover:text-gray-700" onClick={handleLogout} title="Logout" />
        </div>
      </div>

      {showGroupModal && (
        <GroupModal 
          currentUser={currentUser}
          onClose={() => setShowGroupModal(false)}
          onSuccess={fetchConversations}
        />
      )}

      {showProfileModal && (
        <ProfileModal 
          currentUser={currentUser}
          onClose={() => setShowProfileModal(false)}
          onUpdate={onUpdateProfile}
        />
      )}

      {selectedUserDetails && (
        <DetailsModal 
          type="user"
          data={selectedUserDetails}
          onClose={() => setSelectedUserDetails(null)}
        />
      )}

      {/* Search */}
      <div className="p-2 bg-white">
        <div className="relative bg-[#f0f2f5] rounded-lg flex items-center px-3 py-1.5">
          <Search className="w-5 h-5 text-gray-500 mr-3" />
          <input
            type="text"
            placeholder="Search or start new chat"
            className="bg-transparent w-full outline-none text-sm py-1"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="absolute top-[110px] left-0 w-[400px] bg-white shadow-lg z-10 border-b border-gray-200">
          <p className="px-4 py-2 text-xs font-bold text-[#00a884] uppercase">Users</p>
          {searchResults.map((user) => (
            <div
              key={user.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-[#f5f6f6] cursor-pointer"
              onClick={() => startDM(user)}
            >
              <div className="relative">
                <img src={user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`} className="w-12 h-12 rounded-full" />
                {isOnline(user.id) && (
                  <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-[#25d366] border-2 border-white rounded-full"></div>
                )}
              </div>
              <div className="flex-1 border-b border-gray-100 pb-3">
                <p className="font-medium">{user.username}</p>
                <p className="text-sm text-gray-500 truncate">{user.bio || 'Hey there! I am using B-Chat.'}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center p-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#25d366]"></div>
          </div>
        ) : sortedConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center text-gray-500">
            <MessageSquare className="w-12 h-12 mb-4 opacity-20" />
            <p>No chats yet. Search for someone to start talking!</p>
          </div>
        ) : (
          sortedConversations.map((conv) => {
            const otherParticipant = !conv.is_group 
              ? conv.participants?.find(p => p.user_id !== currentUser.id)?.profile
              : null;
            
            const displayName = conv.is_group ? conv.name : otherParticipant?.username;
            const displayAvatar = conv.is_group 
              ? conv.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${conv.name}`
              : otherParticipant?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${otherParticipant?.username}`;

            const isOtherOnline = !conv.is_group && otherParticipant ? isOnline(otherParticipant.id) : false;

            return (
              <div
                key={conv.id}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 hover:bg-[#f5f6f6] cursor-pointer transition-colors",
                  selectedConversationId === conv.id && "bg-[#ebebeb]"
                )}
                onClick={() => onSelectConversation(conv)}
              >
                <div className="relative">
                  <img src={displayAvatar || ''} className="w-12 h-12 rounded-full object-cover" />
                  {isOtherOnline && (
                    <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-[#25d366] border-2 border-white rounded-full"></div>
                  )}
                </div>
                <div className="flex-1 border-b border-gray-100 pb-3 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <p className="font-medium truncate">{displayName}</p>
                    {conv.last_message && (
                      <span className="text-xs text-gray-500">
                        {new Date(conv.last_message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {conv.last_message && conv.last_message.sender_id === currentUser.id && (
                      conv.last_message.is_read ? (
                        <CheckCheck className="w-4 h-4 text-[#53bdeb]" />
                      ) : (
                        <Check className="w-4 h-4 text-gray-400" />
                      )
                    )}
                    <p className="text-sm text-gray-500 truncate">
                      {conv.last_message ? conv.last_message.content : 'No messages yet'}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
