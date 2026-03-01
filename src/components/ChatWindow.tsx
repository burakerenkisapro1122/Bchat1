import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase, Conversation, Message, Profile, MessageType } from '../lib/supabase';
import { Send, Smile, Paperclip, MoreVertical, Phone, Video, Search, Image as ImageIcon, Film, X, Settings, ChevronLeft } from 'lucide-react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import DetailsModal from './DetailsModal';
import CallModal from './CallModal';
import GroupSettingsModal from './GroupSettingsModal';
import { usePresence } from '../lib/usePresence';
import { Check, CheckCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ChatWindowProps {
  conversation: Conversation;
  currentUser: Profile;
  onUpdateConversation?: () => void;
  onBack?: () => void;
}

const PAGE_SIZE = 30;

export default function ChatWindow({ conversation, currentUser, onUpdateConversation, onBack }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [activeCall, setActiveCall] = useState<'audio' | 'video' | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastTypingBroadcastRef = useRef<number>(0);
  const typingTimeoutsRef = useRef<{ [key: string]: NodeJS.Timeout }>({});
  const activeChatIdRef = useRef<string>(conversation.id);
  const channelRef = useRef<any>(null);
  const messagesRef = useRef<Message[]>([]);
  
  const { isOnline } = usePresence(currentUser.id);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    activeChatIdRef.current = conversation.id;
    setMessages([]);
    setHasMore(true);
    setLoading(true);
    fetchMessages(true); // ID değişince direkt çek
  }, [conversation.id]);

  const markMessagesAsRead = async () => {
    try {
      await supabase
        .from('messages')
        .update({ is_read: true })
        .eq(conversation.is_group ? 'group_id' : 'conversation_id', conversation.id)
        .neq('sender_id', currentUser.id)
        .eq('is_read', false);
    } catch (err) {
      console.error('Error marking messages as read:', err);
    }
  };

  const fetchMessages = async (initial = false) => {
    const currentChatId = conversation.id;
    if (!initial && (!hasMore || loadingMore)) return;
    if (initial) setLoading(true);
    else setLoadingMore(true);

    try {
      let query = supabase
        .from('messages')
        .select('*, sender:users(*)')
        .eq(conversation.is_group ? 'group_id' : 'conversation_id', conversation.id)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (!initial && messagesRef.current.length > 0) {
        query = query.lt('created_at', messagesRef.current[0].created_at);
      }

      const { data, error } = await query;
      if (error) throw error;
      const newMessages = (data || []).reverse();

      if (activeChatIdRef.current !== currentChatId) return;

      if (initial) setMessages(newMessages);
      else setMessages(prev => [...newMessages, ...prev]);
      
      setHasMore(newMessages.length === PAGE_SIZE);
    } catch (err) {
      console.error('Error fetching messages:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      if (initial) setTimeout(scrollToBottom, 100);
    }
  };

  // 🔥 REALTIME ENTEGRASYONU: Her yerden gelen mesajı dinler
  useEffect(() => {
    const channelId = conversation.is_group ? `group-${conversation.id}` : `chat-${conversation.id}`;
    
    const channel = supabase
      .channel(channelId)
      .on('postgres_changes', { 
        event: 'INSERT', 
        table: 'messages', 
        schema: 'public',
        // Hem grup hem DM mesajlarını yakalamak için esnek filtre
      }, async (payload: any) => {
        const msg = payload.new as Message;
        
        // Bu sohbetle alakalı bir mesaj mı?
        const isRelated = conversation.is_group 
          ? msg.group_id === conversation.id 
          : msg.conversation_id === conversation.id || (msg.sender_id === otherParticipant?.id && msg.receiver_id === currentUser.id);

        if (!isRelated) return;

        // Mesaj zaten listede yoksa ekle (Duplicate önlemi)
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id || (m.client_id && m.client_id === msg.client_id))) return prev;
          
          // Gönderen profilini getir
          if (!msg.sender) {
             fetchSenderProfile(msg.id, msg.sender_id);
          }
          return [...prev, msg];
        });

        if (msg.sender_id !== currentUser.id) markMessagesAsRead();
        setTimeout(scrollToBottom, 50);
      })
      .on('broadcast', { event: 'typing' }, ({ payload }: any) => {
        if (payload.userId !== currentUser.id) {
          setTypingUsers(prev => prev.includes(payload.username) ? prev : [...prev, payload.username]);
          if (typingTimeoutsRef.current[payload.username]) clearTimeout(typingTimeoutsRef.current[payload.username]);
          typingTimeoutsRef.current[payload.username] = setTimeout(() => {
            setTypingUsers(prev => prev.filter(u => u !== payload.username));
          }, 4000);
        }
      })
      .subscribe();
    
    channelRef.current = channel;
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [conversation.id]);

  const fetchSenderProfile = async (messageId: string, senderId: string) => {
    const { data: profile } = await supabase.from('users').select('*').eq('id', senderId).single();
    if (profile) setMessages(prev => prev.map(m => m.id === messageId ? { ...m, sender: profile } : m));
  };

  const handleSendMessage = async (e?: React.FormEvent, type: MessageType = 'text') => {
    if (e) e.preventDefault();
    if (!newMessage.trim() && type !== 'call') return;

    const content = type === 'call' ? `Arama başlatıldı` : newMessage;
    if (type !== 'call') setNewMessage('');

    const clientId = crypto.randomUUID();
    const optimisticMsg: Message = {
      id: `temp-${clientId}`,
      client_id: clientId,
      content,
      sender_id: currentUser.id,
      created_at: new Date().toISOString(),
      message_type: type,
      is_read: false,
      sender: currentUser,
      conversation_id: !conversation.is_group ? conversation.id : null,
      group_id: conversation.is_group ? conversation.id : null
    };
    
    setMessages(prev => [...prev, optimisticMsg]);
    setTimeout(scrollToBottom, 50);

    try {
      const messageData = conversation.is_group 
        ? { group_id: conversation.id, sender_id: currentUser.id, content, message_type: type, client_id: clientId }
        : { conversation_id: conversation.id, sender_id: currentUser.id, content, message_type: type, client_id: clientId, receiver_id: otherParticipant?.id };

      const { data, error } = await supabase.from('messages').insert([messageData]).select().single();
      if (error) throw error;
      setMessages(prev => prev.map(m => m.client_id === clientId ? { ...data, sender: currentUser } : m));
    } catch (err) {
      console.error('Error sending message:', err);
      setMessages(prev => prev.filter(m => m.client_id !== clientId));
    }
  };

  const handleTyping = () => {
    const now = Date.now();
    if (now - lastTypingBroadcastRef.current > 2000 && channelRef.current) {
      channelRef.current.send({ type: 'broadcast', event: 'typing', payload: { userId: currentUser.id, username: currentUser.username } });
      lastTypingBroadcastRef.current = now;
    }
  };

  const scrollToBottom = () => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; };

  const otherParticipant = useMemo(() => {
    return !conversation.is_group ? conversation.participants?.find(p => p.user_id !== currentUser.id)?.profile : null;
  }, [conversation.participants, currentUser.id, conversation.is_group]);

  const displayName = conversation.is_group ? conversation.name : otherParticipant?.username;
  const displayAvatar = conversation.is_group 
    ? conversation.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${conversation.name}`
    : otherParticipant?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${otherParticipant?.username}`;

  const MessageBubble = React.memo(({ msg, isMe, showSender }: { msg: Message, isMe: boolean, showSender: boolean }) => (
    <motion.div 
      initial={{ opacity: 0, y: 10, scale: 0.95 }} 
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={cn("flex w-full group mb-2", isMe ? "justify-end" : "justify-start")}
    >
      <div className={cn("flex flex-col max-w-[85%] md:max-w-[70%]", isMe ? "items-end" : "items-start")}>
        {showSender && <span className="text-[10px] font-bold text-brand uppercase tracking-widest mb-1 ml-1 opacity-70">{msg.sender?.username}</span>}
        <div className={cn(
          "px-4 py-2.5 rounded-2xl shadow-sm relative border transition-all hover:shadow-md", 
          isMe 
            ? "bg-gradient-to-br from-brand to-brand-dark text-white rounded-tr-none border-white/10" 
            : "bg-bg-card text-white/90 rounded-tl-none border-border-subtle backdrop-blur-sm"
        )}>
          {msg.message_type === 'call' ? (
            <div className="flex items-center gap-2 py-1 opacity-90">
              <Phone className="w-4 h-4" />
              <p className="text-[13px] font-bold italic">Arama Kaydı: {msg.content}</p>
            </div>
          ) : (
            <p className="text-[14px] break-words font-medium">{msg.content}</p>
          )}
          <div className={cn("flex items-center gap-1.5 mt-1.5 opacity-40", isMe ? "justify-end" : "justify-start")}>
            <span className="text-[9px] font-bold">{format(new Date(msg.created_at), 'HH:mm')}</span>
            {isMe && (msg.is_read ? <CheckCheck className="w-3.5 h-3.5 text-blue-400" /> : <Check className="w-3.5 h-3.5" />)}
          </div>
        </div>
      </div>
    </motion.div>
  ));

  return (
    <div className="flex-1 flex flex-col h-full bg-[#050505] relative overflow-hidden">
      {/* Header */}
      <div className="h-20 bg-bg-main/40 backdrop-blur-2xl flex items-center justify-between px-6 border-b border-white/5 z-20">
        <div className="flex items-center gap-4 cursor-pointer min-w-0" onClick={() => setShowDetails(true)}>
          {onBack && (
            <button onClick={(e) => { e.stopPropagation(); onBack(); }} className="p-2 -ml-2 hover:bg-white/5 rounded-xl text-text-dim md:hidden"><ChevronLeft size={24} /></button>
          )}
          <div className="relative">
            <img src={displayAvatar || ''} className="w-11 h-11 rounded-2xl object-cover border border-white/10" />
            {!conversation.is_group && otherParticipant && isOnline(otherParticipant.id) && (
              <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-green-500 rounded-full border-[3px] border-[#050505]" />
            )}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-base text-white truncate">{displayName}</p>
            <div className="flex items-center gap-1.5">
               <span className="text-[10px] text-text-dim font-bold uppercase tracking-widest">
                 {conversation.is_group ? `${conversation.participants?.length || 0} Üye` : (isOnline(otherParticipant?.id || '') ? 'Aktif' : 'Çevrimdışı')}
               </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-white/5 rounded-2xl p-1 border border-white/5 shadow-inner">
            <button 
              className="p-2.5 rounded-xl transition-all text-brand hover:bg-brand/20 hover:scale-105 active:scale-95"
              onClick={() => { setActiveCall('video'); handleSendMessage(undefined, 'call'); }}
            >
              <Video size={20} />
            </button>
            <button 
              className="p-2.5 rounded-xl transition-all text-brand hover:bg-brand/20 hover:scale-105 active:scale-95"
              onClick={() => { setActiveCall('audio'); handleSendMessage(undefined, 'call'); }}
            >
              <Phone size={20} />
            </button>
          </div>
          <div className="w-px h-6 bg-white/10 mx-1" />
          <button className="p-2.5 hover:bg-white/5 rounded-xl text-text-dim hover:text-white transition-colors"><MoreVertical size={20} /></button>
        </div>
      </div>

      {showDetails && <DetailsModal type={conversation.is_group ? 'group' : 'user'} data={conversation.is_group ? (conversation as any) : otherParticipant!} onClose={() => setShowDetails(false)} />}
      {showGroupSettings && <GroupSettingsModal group={conversation} currentUser={currentUser} onClose={() => setShowGroupSettings(false)} onUpdate={() => onUpdateConversation?.()} />}
      {activeCall && <CallModal type={activeCall} targetUserId={otherParticipant?.id || ''} targetName={displayName || ''} targetAvatar={displayAvatar || ''} onClose={() => setActiveCall(null)} currentUser={currentUser} groupId={conversation.is_group ? conversation.id : undefined} />}

      {/* Mesaj Alanı */}
      <div 
        ref={scrollRef} 
        onScroll={(e) => e.currentTarget.scrollTop === 0 && hasMore && !loadingMore && fetchMessages()}
        className="flex-1 overflow-y-auto p-4 md:p-8 lg:px-20 space-y-2 custom-scrollbar bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-brand/5 via-transparent to-transparent"
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-bold text-text-dim uppercase tracking-widest">Bchat Yükleniyor</p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto">
            {messages.map((msg, idx) => (
              <MessageBubble 
                key={msg.id} 
                msg={msg} 
                isMe={msg.sender_id === currentUser.id} 
                showSender={conversation.is_group && msg.sender_id !== currentUser.id && messages[idx-1]?.sender_id !== msg.sender_id} 
              />
            ))}
            <AnimatePresence>
              {typingUsers.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 mt-4 ml-2">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-brand rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-brand rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-brand rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-[10px] text-brand uppercase font-black tracking-tighter">{typingUsers[0]} yazıyor</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Input Alanı */}
      <div className="px-6 py-6 bg-bg-main/40 backdrop-blur-md">
        <div className="max-w-4xl mx-auto flex items-center gap-3 bg-white/[0.03] border border-white/5 rounded-[2rem] p-2 pr-3 shadow-2xl focus-within:border-brand/30 transition-all">
          <button className="p-3 text-text-dim hover:text-brand transition-colors"><Smile size={22} /></button>
          <button className="p-3 text-text-dim hover:text-brand transition-colors"><Paperclip size={22} /></button>
          <form onSubmit={(e) => handleSendMessage(e)} className="flex-1">
            <input 
              type="text" 
              placeholder="Bir şeyler yaz..." 
              className="w-full bg-transparent border-none outline-none text-sm py-2 px-2 text-white placeholder:text-white/20" 
              value={newMessage} 
              onChange={(e) => { setNewMessage(e.target.value); handleTyping(); }} 
            />
          </form>
          <button 
            onClick={() => handleSendMessage()} 
            disabled={!newMessage.trim()} 
            className={cn(
              "p-3.5 rounded-2xl transition-all flex items-center justify-center", 
              newMessage.trim() ? "bg-brand text-white shadow-lg shadow-brand/20 active:scale-90" : "bg-white/5 text-white/10"
            )}
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}