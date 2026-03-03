import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase, Conversation, Profile, Message } from '../lib/supabase';
import { Search, MessageSquare, Users, LogOut, Check, CheckCheck, Bell } from 'lucide-react';
import { cn } from '../lib/utils';
import GroupModal from './GroupModal';
import ProfileModal from './ProfileModal';
import { usePresence } from '../lib/usePresence';
import { motion, AnimatePresence } from 'framer-motion';

interface SidebarProps {
  currentUser: Profile;
  onSelectConversation: (conversation: Conversation) => void;
  onUpdateProfile: (profile: Profile) => void;
  selectedConversationId?: string;
}

export default function Sidebar({ currentUser, onSelectConversation, onUpdateProfile, selectedConversationId }: SidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<{ [key: string]: number }>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  
  const { isOnline } = usePresence(currentUser.id);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Konuşmaları Getir
  const fetchConversations = async () => {
    try {
      const { data: dmData } = await supabase
        .from('conversation_participants')
        .select(`
          conversation_id,
          conversations:conversations (
            id, created_at,
            participants:conversation_participants (user_id, profile:users (*)),
            messages:messages (id, content, created_at, sender_id, is_read)
          )
        `)
        .eq('user_id', currentUser.id);

      const { data: groupData } = await supabase
        .from('group_members')
        .select(`
          group_id,
          groups:groups (
            id, name, avatar_url,
            members:group_members (user_id, profile:users (*)),
            messages:messages (id, content, created_at, sender_id, is_read)
          )
        `)
        .eq('user_id', currentUser.id);

      const dms = (dmData || []).map((item: any) => ({
        ...item.conversations,
        is_group: false,
        participants: item.conversations.participants || [],
        last_message: (item.conversations.messages || []).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
      }));

      const groups = (groupData || []).map((item: any) => ({
        ...item.groups,
        is_group: true,
        participants: item.groups.members || [],
        last_message: (item.groups.messages || []).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
      }));

      const allConvs = [...dms, ...groups].sort((a, b) => {
        const timeA = a.last_message ? new Date(a.last_message.created_at).getTime() : 0;
        const timeB = b.last_message ? new Date(b.last_message.created_at).getTime() : 0;
        return timeB - timeA;
      });

      setConversations(allConvs);

      const counts: { [key: string]: number } = {};
      allConvs.forEach(conv => {
        const unread = (conv.messages || []).filter((m: any) => !m.is_read && m.sender_id !== currentUser.id).length;
        counts[conv.id] = unread;
      });
      setUnreadCounts(counts);

    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConversations();
    const channel = supabase
      .channel('sidebar-realtime')
      .on('postgres_changes', { event: 'INSERT', table: 'messages', schema: 'public' }, (payload) => {
        const msg = payload.new as Message;
        const convId = msg.conversation_id || msg.group_id;
        if (msg.sender_id !== currentUser.id && convId !== selectedConversationId) {
          setUnreadCounts(prev => ({ ...prev, [convId!]: (prev[convId!] || 0) + 1 }));
        }
        fetchConversations();
      })
      .on('postgres_changes', { event: 'UPDATE', table: 'messages', schema: 'public' }, () => {
        fetchConversations();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedConversationId]);

  // Yeni Fonksiyon: DM Başlat veya Mevcut Olanı Aç
  const startDM = async (targetUser: Profile) => {
    try {
      setSearchResults([]);
      setSearchQuery('');

      // 1. Zaten bir DM var mı kontrol et
      const existingConv = conversations.find(c => 
        !c.is_group && c.participants?.some(p => p.user_id === targetUser.id)
      );

      if (existingConv) {
        onSelectConversation(existingConv);
        return;
      }

      // 2. Yoksa yeni bir konuşma oluştur
      const { data: newConv, error: convError } = await supabase
        .from('conversations')
        .insert({})
        .select()
        .single();

      if (convError) throw convError;

      // 3. Katılımcıları ekle (Ben ve Karşı taraf)
      const participants = [
        { conversation_id: newConv.id, user_id: currentUser.id },
        { conversation_id: newConv.id, user_id: targetUser.id }
      ];

      const { error: partError } = await supabase
        .from('conversation_participants')
        .insert(participants);

      if (partError) throw partError;

      // 4. Listeyi tazele ve yeni konuşmayı seç
      await fetchConversations();
      
      // Yeni oluşan konuşmayı nesne olarak bulup seçelim
      const createdConv: Conversation = {
        ...newConv,
        is_group: false,
        participants: [
            { user_id: currentUser.id, profile: currentUser },
            { user_id: targetUser.id, profile: targetUser }
        ]
      };
      onSelectConversation(createdConv);

    } catch (err) {
      console.error('DM başlatma hatası:', err);
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('users')
        .select('*')
        .ilike('username', `%${query}%`)
        .neq('id', currentUser.id)
        .limit(5);
      setSearchResults(data || []);
    }, 300);
  };

  return (
    <div className="w-full md:w-[400px] h-full flex flex-col bg-[#080808] border-r border-white/5 relative z-30">
      <div className="p-6 flex items-center justify-between">
        <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setShowProfileModal(true)}>
          <div className="relative">
            <img
              src={currentUser.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser.username}`}
              className="w-11 h-11 rounded-2xl object-cover ring-2 ring-white/5 group-hover:ring-brand/50 transition-all duration-500"
            />
            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-brand border-[3px] border-[#080808] rounded-full" />
          </div>
          <div>
            <h2 className="text-sm font-black text-white tracking-tight">{currentUser.username}</h2>
            <p className="text-[10px] text-brand font-bold uppercase tracking-tighter opacity-80">Profilim</p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <button onClick={() => setShowGroupModal(true)} className="p-2.5 bg-white/5 hover:bg-brand/20 text-text-dim hover:text-brand rounded-xl transition-all">
            <Users size={18} />
          </button>
          <button onClick={() => supabase.auth.signOut()} className="p-2.5 bg-white/5 hover:bg-red-500/20 text-text-dim hover:text-red-500 rounded-xl transition-all">
            <LogOut size={18} />
          </button>
        </div>
      </div>

      <div className="px-6 pb-4">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-brand transition-colors" />
          <input
            type="text"
            placeholder="Arkadaşlarını veya grupları ara..."
            className="w-full bg-white/[0.03] border border-white/5 focus:border-brand/30 rounded-2xl pl-11 pr-4 py-3 text-xs outline-none transition-all placeholder:text-white/10"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
      </div>

      <AnimatePresence>
        {searchResults.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0 }}
            className="absolute top-[140px] left-6 right-6 bg-[#121212] border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden"
          >
            {searchResults.map(user => (
              <div 
                key={user.id}
                onClick={() => startDM(user)} // BURADA START DM ÇALIŞIR
                className="flex items-center gap-3 p-4 hover:bg-brand/10 cursor-pointer transition-colors border-b border-white/5 last:border-none"
              >
                <img src={user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`} className="w-9 h-9 rounded-xl object-cover" />
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-white">{user.username}</span>
                  <span className="text-[10px] text-brand/60 font-bold uppercase tracking-widest">Mesaj Gönder</span>
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto px-4 space-y-2 custom-scrollbar">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-40 opacity-20">
            <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mb-2" />
          </div>
        ) : (
          conversations.map((conv) => {
            const isSelected = selectedConversationId === conv.id;
            const otherUser = !conv.is_group ? conv.participants?.find(p => p.user_id !== currentUser.id)?.profile : null;
            const unreadCount = unreadCounts[conv.id] || 0;

            return (
              <motion.div
                key={conv.id}
                whileHover={{ x: 4 }}
                onClick={() => {
                  onSelectConversation(conv);
                  setUnreadCounts(prev => ({ ...prev, [conv.id]: 0 }));
                }}
                className={cn(
                  "group flex items-center gap-4 p-4 rounded-[1.5rem] cursor-pointer transition-all duration-300 relative",
                  isSelected 
                    ? "bg-gradient-to-r from-brand/20 to-transparent border border-brand/20" 
                    : "hover:bg-white/[0.02] border border-transparent"
                )}
              >
                <div className="relative flex-shrink-0">
                  <img 
                    src={conv.is_group ? conv.avatar_url : otherUser?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${otherUser?.username}`} 
                    className={cn("w-12 h-12 rounded-2xl object-cover", isSelected ? "ring-2 ring-brand" : "ring-1 ring-white/10")} 
                  />
                  {!conv.is_group && isOnline(otherUser?.id || '') && (
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-brand border-[3px] border-[#080808] rounded-full" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <h3 className={cn("text-sm font-bold truncate", isSelected ? "text-brand" : "text-white/90")}>
                      {conv.is_group ? conv.name : otherUser?.username}
                    </h3>
                    {conv.last_message && (
                      <span className="text-[10px] font-medium opacity-30">
                        {new Date(conv.last_message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      {conv.last_message?.sender_id === currentUser.id && (
                        conv.last_message.is_read ? <CheckCheck size={14} className="text-brand" /> : <Check size={14} className="opacity-20" />
                      )}
                      <p className={cn("text-xs truncate opacity-40", unreadCount > 0 && "opacity-100 text-white font-bold")}>
                        {conv.last_message?.content || 'Henüz mesaj yok...'}
                      </p>
                    </div>

                    {unreadCount > 0 && (
                      <motion.div 
                        initial={{ scale: 0 }} 
                        animate={{ scale: 1 }} 
                        className="ml-2 px-2 py-0.5 bg-brand text-[#080808] text-[10px] font-black rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                      >
                        {unreadCount}
                      </motion.div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {showGroupModal && <GroupModal currentUser={currentUser} onClose={() => setShowGroupModal(false)} onSuccess={fetchConversations} />}
      {showProfileModal && <ProfileModal currentUser={currentUser} onClose={() => setShowProfileModal(false)} onUpdate={onUpdateProfile} />}
    </div>
  );
}
