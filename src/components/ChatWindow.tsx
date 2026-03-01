import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase, Conversation, Message, Profile, MessageType } from '../lib/supabase';
import { Send, Smile, Paperclip, MoreVertical, Phone, Video, ChevronLeft, Check, CheckCheck } from 'lucide-react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import DetailsModal from './DetailsModal';
import CallModal from './CallModal';
import GroupSettingsModal from './GroupSettingsModal';
import { usePresence } from '../lib/usePresence';
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
  const channelRef = useRef<any>(null);
  
  const { isOnline } = usePresence(currentUser.id);

  // Scroll yardımcısı
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior
      });
    }
  }, []);

  // Mesajları çekme (View üzerinden)
  const fetchMessages = useCallback(async (initial = false) => {
    if (!initial && (!hasMore || loadingMore)) return;
    
    if (initial) setLoading(true);
    else setLoadingMore(true);

    try {
      let query = supabase
        .from('v_messages_with_users') // SQL'de oluşturduğun VIEW adı
        .select('*')
        .eq(conversation.is_group ? 'group_id' : 'conversation_id', conversation.id)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (!initial && messages.length > 0) {
        query = query.lt('created_at', messages[0].created_at);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      const newMessages = (data || []).reverse();

      setMessages(prev => initial ? newMessages : [...newMessages, ...prev]);
      setHasMore(newMessages.length === PAGE_SIZE);
      
      if (initial) setTimeout(() => scrollToBottom('auto'), 50);
    } catch (err) {
      console.error('Error fetching messages:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [conversation.id, hasMore, loadingMore, messages, scrollToBottom]);

  // Sohbet değiştiğinde sıfırla
  useEffect(() => {
    setMessages([]);
    setHasMore(true);
    fetchMessages(true);
  }, [conversation.id]);

  // Realtime ve Typing
  useEffect(() => {
    const channelId = conversation.is_group ? `group-${conversation.id}` : `chat-${conversation.id}`;
    
    const channel = supabase
      .channel(channelId)
      .on('postgres_changes', { event: 'INSERT', table: 'messages', schema: 'public' }, async (payload: any) => {
        const msg = payload.new as Message;
        const isRelated = conversation.is_group 
          ? msg.group_id === conversation.id 
          : msg.conversation_id === conversation.id;

        if (!isRelated) return;

        // Gönderen bilgisini ekle (Optimistic değilse)
        if (msg.sender_id !== currentUser.id) {
           const { data: user } = await supabase.from('users').select('id, username, avatar_url').eq('id', msg.sender_id).single();
           msg.sender = user;
        } else {
           msg.sender = currentUser;
        }

        setMessages(prev => {
          if (prev.some(m => m.id === msg.id || (m.client_id && m.client_id === msg.client_id))) return prev;
          return [...prev, msg];
        });

        setTimeout(() => scrollToBottom('smooth'), 50);
      })
      .on('broadcast', { event: 'typing' }, ({ payload }: any) => {
        if (payload.userId !== currentUser.id) {
          setTypingUsers(prev => prev.includes(payload.username) ? prev : [...prev, payload.username]);
          if (typingTimeoutsRef.current[payload.username]) clearTimeout(typingTimeoutsRef.current[payload.username]);
          typingTimeoutsRef.current[payload.username] = setTimeout(() => {
            setTypingUsers(prev => prev.filter(u => u !== payload.username));
          }, 3000);
        }
      })
      .subscribe();
    
    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [conversation.id, currentUser, scrollToBottom]);

  const handleTyping = () => {
    const now = Date.now();
    if (now - lastTypingBroadcastRef.current > 2000 && channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: currentUser.id, username: currentUser.username }
      });
      lastTypingBroadcastRef.current = now;
    }
  };

  const otherParticipant = useMemo(() => {
    return !conversation.is_group ? conversation.participants?.find(p => p.user_id !== currentUser.id)?.profile : null;
  }, [conversation.participants, currentUser.id, conversation.is_group]);

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
    setTimeout(() => scrollToBottom('smooth'), 30);

    try {
      const messageData = conversation.is_group 
        ? { group_id: conversation.id, sender_id: currentUser.id, content, message_type: type, client_id: clientId }
        : { conversation_id: conversation.id, sender_id: currentUser.id, content, message_type: type, client_id: clientId, receiver_id: otherParticipant?.id };

      const { data, error } = await supabase.from('messages').insert([messageData]).select().single();
      if (error) throw error;
      
      setMessages(prev => prev.map(m => m.client_id === clientId ? { ...data, sender: currentUser } : m));
    } catch (err) {
      console.error('Gönderim hatası:', err);
      setMessages(prev => prev.filter(m => m.client_id !== clientId));
    }
  };

  const displayName = conversation.is_group ? conversation.name : otherParticipant?.username;
  const displayAvatar = conversation.is_group 
    ? conversation.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${conversation.name}`
    : otherParticipant?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${otherParticipant?.username}`;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#050505] relative overflow-hidden">
      {/* Header */}
      <div className="h-20 flex-shrink-0 bg-bg-main/40 backdrop-blur-2xl flex items-center justify-between px-6 border-b border-white/5 z-20">
        <div className="flex items-center gap-4 cursor-pointer min-w-0" onClick={() => setShowDetails(true)}>
          {onBack && (
            <button onClick={(e) => { e.stopPropagation(); onBack(); }} className="p-2 -ml-2 hover:bg-white/5 rounded-xl text-text-dim md:hidden"><ChevronLeft size={24} /></button>
          )}
          <div className="relative flex-shrink-0">
            <img src={displayAvatar || ''} className="w-11 h-11 rounded-2xl object-cover border border-white/10" alt="avatar" />
            {!conversation.is_group && otherParticipant && isOnline(otherParticipant.id) && (
              <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-green-500 rounded-full border-[3px] border-[#050505]" />
            )}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-base text-white truncate leading-tight">{displayName}</p>
            <span className="text-[10px] text-brand font-bold uppercase tracking-widest">
              {conversation.is_group ? `${conversation.participants?.length || 0} Üye` : (isOnline(otherParticipant?.id || '') ? 'Aktif' : 'Çevrimdışı')}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-white/5 rounded-2xl p-1 border border-white/5">
            <button className="p-2.5 text-brand hover:bg-brand/20 rounded-xl transition-all" onClick={() => setActiveCall('video')}><Video size={18} /></button>
            <button className="p-2.5 text-brand hover:bg-brand/20 rounded-xl transition-all" onClick={() => setActiveCall('audio')}><Phone size={18} /></button>
          </div>
          <button className="p-2.5 text-text-dim hover:text-white"><MoreVertical size={20} /></button>
        </div>
      </div>

      {/* Mesaj Alanı */}
      <div 
        ref={scrollRef} 
        onScroll={(e) => e.currentTarget.scrollTop === 0 && hasMore && !loadingMore && fetchMessages(false)}
        className="flex-1 overflow-y-scroll overflow-x-hidden p-4 md:p-8 lg:px-20 space-y-4 custom-scrollbar bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-brand/5 via-transparent to-transparent"
      >
        <div className="max-w-4xl mx-auto flex flex-col">
          {messages.map((msg, idx) => {
            const isMe = msg.sender_id === currentUser.id;
            const showSender = conversation.is_group && !isMe && messages[idx-1]?.sender_id !== msg.sender_id;
            
            return (
              <div key={msg.id} className={cn("flex w-full mb-1", isMe ? "justify-end" : "justify-start")}>
                <div className={cn("flex flex-col max-w-[80%]", isMe ? "items-end" : "items-start")}>
                  {showSender && <span className="text-[10px] font-black text-brand uppercase ml-1 mb-1 opacity-60">{msg.sender?.username}</span>}
                  <div className={cn(
                    "px-4 py-2.5 rounded-2xl text-[14px] font-medium relative border transition-all",
                    isMe ? "bg-brand text-white rounded-tr-none border-white/10" : "bg-white/5 text-white/90 rounded-tl-none border-white/5"
                  )}>
                    {msg.content}
                    <div className={cn("flex items-center gap-1 mt-1 opacity-30 text-[9px]", isMe ? "justify-end" : "justify-start")}>
                      {format(new Date(msg.created_at), 'HH:mm')}
                      {isMe && (msg.is_read ? <CheckCheck size={12} className="text-blue-400" /> : <Check size={12} />)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          
          <AnimatePresence>
            {typingUsers.length > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 mt-2 ml-2">
                <div className="flex gap-1"><span className="w-1 h-1 bg-brand rounded-full animate-bounce" /><span className="w-1 h-1 bg-brand rounded-full animate-bounce [animation-delay:0.2s]" /></div>
                <span className="text-[9px] text-brand font-black uppercase tracking-tighter">{typingUsers[0]} yazıyor...</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Input Alanı */}
      <div className="p-6 bg-bg-main/40 backdrop-blur-md flex-shrink-0">
        <div className="max-w-4xl mx-auto flex items-center gap-2 bg-white/[0.03] border border-white/5 rounded-[2rem] p-1.5 focus-within:border-brand/40 transition-all">
          <button className="p-3 text-text-dim hover:text-brand"><Smile size={20} /></button>
          <form onSubmit={handleSendMessage} className="flex-1">
            <input 
              type="text" 
              placeholder="Mesaj gönder..." 
              className="w-full h-10 bg-transparent border-none outline-none text-sm px-2 text-white" 
              value={newMessage} 
              onChange={(e) => { setNewMessage(e.target.value); handleTyping(); }} 
            />
          </form>
          <button 
            onClick={() => handleSendMessage()} 
            disabled={!newMessage.trim()} 
            className={cn("p-3 rounded-full transition-all", newMessage.trim() ? "bg-brand text-white shadow-lg shadow-brand/20" : "bg-white/5 text-white/10")}
          >
            <Send size={18} />
          </button>
        </div>
      </div>

      {/* Modallar */}
      {showDetails && <DetailsModal type={conversation.is_group ? 'group' : 'user'} data={conversation.is_group ? conversation : otherParticipant!} onClose={() => setShowDetails(false)} />}
      {activeCall && <CallModal type={activeCall} targetUserId={otherParticipant?.id || ''} targetName={displayName || ''} targetAvatar={displayAvatar || ''} onClose={() => setActiveCall(null)} currentUser={currentUser} />}
    </div>
  );
}