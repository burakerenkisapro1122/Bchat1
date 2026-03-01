import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase, Conversation, Profile, Message } from '../lib/supabase';
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
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => {
      const dateA = a.last_message?.created_at || a.created_at;
      const dateB = b.last_message?.created_at || b.created_at;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });
  }, [conversations]);

  useEffect(() => {
    fetchConversations();
    
    const refreshHandler = () => fetchConversations();
    window.addEventListener('refresh-conversations', refreshHandler);

    const channel = supabase
      .channel('sidebar-updates')
      .on('postgres_changes' as any, { event: 'INSERT', table: 'messages', schema: 'public' }, (payload: any) => {
        const newMessage = payload.new as Message;
        setConversations(prev => {
          return prev.map(conv => {
            const isMatch = conv.is_group 
              ? conv.id === newMessage.group_id 
              : conv.participants?.some(p => p.conversation_id === newMessage.conversation_id);
            
            if (isMatch) {
              return { ...conv, last_message: newMessage };
            }
            return conv;
          }).sort((a, b) => {
            const dateA = a.last_message?.created_at || a.created_at;
            const dateB = b.last_message?.created_at || b.created_at;
            return new Date(dateB).getTime() - new Date(dateA).getTime();
          });
        });
      })
      .on('postgres_changes' as any, { event: '*', table: 'conversation_participants', schema: 'public' }, () => fetchConversations())
      .on('postgres_changes' as any, { event: '*', table: 'groups', schema: 'public' }, () => fetchConversations())
      .on('postgres_changes' as any, { event: '*', table: 'group_members', schema: 'public' }, () => fetchConversations())
      .subscribe();

    return () => {
      window.removeEventListener('refresh-conversations', refreshHandler);
      supabase.removeChannel(channel);
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  const fetchConversations = async () => {
    try {
      // 1. Fetch DMs with participants and last message in one go
      const { data: dmData, error: dmError } = await supabase
        .from('conversation_participants')
        .select(`
          conversation_id,
          conversations:conversations (
            id,
            created_at,
            participants:conversation_participants (
              user_id,
              profile:users (*)
            ),
            messages:messages (
              id,
              content,
              created_at,
              sender_id,
              is_read
            )
          )
        `)
        .eq('user_id', currentUser.id);

      if (dmError) throw dmError;

      const dms = (dmData || []).map((item: any) => {
        const conv = item.conversations;
        // Get the latest message
        const sortedMessages = (conv.messages || []).sort((a: any, b: any) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        
        return {
          ...conv,
          is_group: false,
          participants: conv.participants || [],
          last_message: sortedMessages[0]
        };
      });

      // 2. Fetch Groups with members and last message in one go
      const { data: groupData, error: groupError } = await supabase
        .from('group_members')
        .select(`
          group_id,
          groups:groups (
            id,
            name,
            created_at,
            owner_id,
            avatar_url,
            members:group_members (
              user_id,
              profile:users (*)
            ),
            messages:messages (
              id,
              content,
              created_at,
              sender_id,
              is_read
            )
          )
        `)
        .eq('user_id', currentUser.id);

      if (groupError) throw groupError;

      const groups = (groupData || []).map((item: any) => {
        const group = item.groups;
        const sortedMessages = (group.messages || []).sort((a: any, b: any) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        return {
          ...group,
          is_group: true,
          participants: group.members || [],
          last_message: sortedMessages[0]
        };
      });

      const allConvs = [...dms, ...groups];
      setConversations(allConvs);
    } catch (err) {
      console.error('Error fetching conversations:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (abortControllerRef.current) abortControllerRef.current.abort();

    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .ilike('username', `%${query}%`)
          .eq('is_visible', true)
          .neq('id', currentUser.id)
          .limit(10);

        if (error) throw error;
        if (controller.signal.aborted) return;

        const sortedResults = (data || []).sort((a, b) => {
          const onlineA = isOnline(a.id);
          const onlineB = isOnline(b.id);
          if (onlineA && !onlineB) return -1;
          if (!onlineA && onlineB) return 1;
          return 0;
        });

        setSearchResults(sortedResults);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Search error:', err);
        }
      }
    }, 250);
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
    <div className="w-full md:w-[380px] h-full flex flex-col bg-bg-sidebar border-r border-border-subtle">
      {/* Header */}
      <div className="h-20 flex items-center justify-between px-6 border-b border-border-subtle">
        <div 
          className="flex items-center gap-3 cursor-pointer group"
          onClick={() => setShowProfileModal(true)}
        >
          <div className="relative">
            <img
              src={currentUser.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser.username}`}
              alt={currentUser.username}
              className="w-10 h-10 rounded-xl object-cover ring-2 ring-transparent group-hover:ring-brand/30 transition-all"
            />
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-brand border-2 border-bg-sidebar rounded-full"></div>
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-sm tracking-tight">{currentUser.username}</span>
            <span className="text-[10px] text-brand uppercase font-bold tracking-widest opacity-80">Online</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowGroupModal(true)}
            className="p-2 hover:bg-white/5 rounded-lg text-text-dim hover:text-white transition-colors"
            title="New Group"
          >
            <Users className="w-5 h-5" />
          </button>
          <button 
            onClick={handleLogout}
            className="p-2 hover:bg-white/5 rounded-lg text-text-dim hover:text-red-400 transition-colors"
            title="Logout"
          >
            <LogOut className="w-5 h-5" />
          </button>
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
      <div className="px-6 py-4">
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim group-focus-within:text-brand transition-colors" />
          <input
            type="text"
            placeholder="Search conversations..."
            className="w-full bg-white/5 border border-transparent focus:border-brand/30 focus:bg-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none transition-all placeholder:text-text-dim/50"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="absolute top-[160px] left-0 w-full md:w-[380px] bg-bg-card/95 backdrop-blur-xl shadow-2xl z-20 border-b border-border-subtle premium-shadow">
          <p className="px-6 py-3 text-[10px] font-bold text-brand uppercase tracking-widest border-b border-border-subtle">Global Search</p>
          <div className="max-h-[400px] overflow-y-auto">
            {searchResults.map((user) => (
              <div
                key={user.id}
                className="flex items-center gap-4 px-6 py-4 hover:bg-white/5 cursor-pointer transition-colors"
                onClick={() => startDM(user)}
              >
                <div className="relative">
                  <img src={user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`} className="w-11 h-11 rounded-xl object-cover" />
                  {isOnline(user.id) && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-brand border-2 border-bg-card rounded-full"></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{user.username}</p>
                  <p className="text-xs text-text-dim truncate">{user.bio || 'Available'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto px-3 space-y-1">
        {loading ? (
          <div className="flex justify-center p-8">
            <div className="w-6 h-6 border-2 border-brand/30 border-t-brand rounded-full animate-spin"></div>
          </div>
        ) : sortedConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
              <MessageSquare className="w-8 h-8 text-text-dim opacity-20" />
            </div>
            <p className="text-sm text-text-dim font-medium">No conversations yet</p>
            <p className="text-xs text-text-dim/50 mt-1">Start a new chat to begin</p>
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
            const isSelected = selectedConversationId === conv.id;

            return (
              <div
                key={conv.id}
                className={cn(
                  "group flex items-center gap-4 px-4 py-3.5 rounded-2xl cursor-pointer transition-all relative overflow-hidden",
                  isSelected ? "bg-white/5 active-gradient" : "hover:bg-white/[0.02]"
                )}
                onClick={() => onSelectConversation(conv)}
              >
                {isSelected && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-brand rounded-r-full shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                )}
                
                <div className="relative flex-shrink-0">
                  <img src={displayAvatar || ''} className="w-12 h-12 rounded-xl object-cover ring-1 ring-white/10" />
                  {isOtherOnline && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-brand border-2 border-bg-sidebar rounded-full shadow-lg"></div>
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-1">
                    <p className={cn(
                      "text-sm font-semibold truncate transition-colors",
                      isSelected ? "text-white" : "text-white/90 group-hover:text-white"
                    )}>
                      {displayName}
                    </p>
                    {conv.last_message && (
                      <span className="text-[10px] font-medium text-text-dim/60 tabular-nums">
                        {new Date(conv.last_message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-1.5">
                    {conv.last_message && conv.last_message.sender_id === currentUser.id && (
                      <div className="flex-shrink-0">
                        {conv.last_message.is_read ? (
                          <CheckCheck className="w-3.5 h-3.5 text-brand" />
                        ) : (
                          <Check className="w-3.5 h-3.5 text-text-dim/40" />
                        )}
                      </div>
                    )}
                    <p className="text-xs text-text-dim truncate leading-relaxed">
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
