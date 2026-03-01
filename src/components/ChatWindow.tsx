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
  const [showMediaMenu, setShowMediaMenu] = useState(false);
  
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

      if (!initial && messages.length > 0) {
        query = query.lt('created_at', messages[0].created_at);
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
    }
  };

  useEffect(() => {
    const channelId = conversation.is_group ? `group:${conversation.id}` : `chat:${conversation.id}`;
    if (channelRef.current) supabase.removeChannel(channelRef.current);

    const channel = supabase
      .channel(channelId)
      .on('postgres_changes' as any, { 
        event: '*', 
        table: 'messages', 
        schema: 'public',
        filter: conversation.is_group ? `group_id=eq.${conversation.id}` : `conversation_id=eq.${conversation.id}` 
      }, (payload: any) => {
        if ((payload.new?.conversation_id || payload.new?.group_id) !== activeChatIdRef.current) return;

        if (payload.eventType === 'INSERT') {
          const msg = payload.new as Message;
          setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev;
            const optIdx = msg.client_id ? prev.findIndex(m => m.client_id === msg.client_id) : -1;
            if (optIdx !== -1) {
              const next = [...prev];
              next[optIdx] = { ...next[optIdx], ...msg };
              return next;
            }
            if (!msg.sender) fetchSenderProfile(msg.id, msg.sender_id);
            return [...prev, msg];
          });
          if (msg.sender_id !== currentUser.id) markMessagesAsRead();
        } else if (payload.eventType === 'UPDATE') {
          const updated = payload.new as Message;
          setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
        } else if (payload.eventType === 'DELETE') {
          setMessages(prev => prev.filter(m => m.id !== payload.old.id));
        }
      })
      .on('broadcast' as any, { event: 'typing' }, ({ payload }: any) => {
        if (payload.userId !== currentUser.id) {
          setTypingUsers(prev => prev.includes(payload.username) ? prev : [...prev, payload.username]);
          if (typingTimeoutsRef.current[payload.username]) clearTimeout(typingTimeoutsRef.current[payload.username]);
          typingTimeoutsRef.current[payload.username] = setTimeout(() => {
            setTypingUsers(prev => prev.filter(u => u !== payload.username));
          }, 4000);
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          fetchMessages(true);
          markMessagesAsRead();
        }
      });
    
    channelRef.current = channel;
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [conversation.id]);

  const fetchSenderProfile = async (messageId: string, senderId: string) => {
    const { data: profile } = await supabase.from('users').select('*').eq('id', senderId).single();
    if (profile) setMessages(prev => prev.map(m => m.id === messageId ? { ...m, sender: profile } : m));
  };

  const handleSendMessage = async (e?: React.FormEvent, mediaUrl?: string, type: MessageType = 'text') => {
    if (e) e.preventDefault();
    if (!newMessage.trim() && !mediaUrl && type !== 'call') return;

    const content = type === 'call' ? `Started a call` : newMessage;
    if (type !== 'call') setNewMessage('');
    setShowMediaMenu(false);

    const clientId = crypto.randomUUID();
    const optimisticMsg: Message = {
      id: `temp-${clientId}`,
      client_id: clientId,
      content,
      sender_id: currentUser.id,
      created_at: new Date().toISOString(),
      message_type: type,
      media_url: mediaUrl,
      is_read: false,
      sender: currentUser,
      conversation_id: !conversation.is_group ? conversation.id : null,
      group_id: conversation.is_group ? conversation.id : null
    };
    
    setMessages(prev => [...prev, optimisticMsg]);

    try {
      const messageData = conversation.is_group 
        ? { group_id: conversation.id, sender_id: currentUser.id, content, message_type: type, media_url: mediaUrl, client_id: clientId }
        : { conversation_id: conversation.id, sender_id: currentUser.id, content, message_type: type, media_url: mediaUrl, client_id: clientId };

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

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop === 0 && hasMore && !loadingMore) fetchMessages();
  };

  useEffect(() => { if (!loadingMore) scrollToBottom(); }, [messages.length]);
  const scrollToBottom = () => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; };

  const otherParticipant = useMemo(() => {
    return !conversation.is_group ? conversation.participants?.find(p => p.user_id !== currentUser.id)?.profile : null;
  }, [conversation.participants, currentUser.id, conversation.is_group]);

  const displayName = conversation.is_group ? conversation.name : otherParticipant?.username;
  const displayAvatar = conversation.is_group 
    ? conversation.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${conversation.name}`
    : otherParticipant?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${otherParticipant?.username}`;

  const messageRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      const visibleIds = entries.filter(e => e.isIntersecting).map(e => e.target.getAttribute('data-message-id')).filter((id): id is string => id !== null);
      if (visibleIds.length > 0) markMessagesAsReadBatch(visibleIds);
    }, { threshold: 0.5 });
    Object.values(messageRefs.current).forEach(ref => { if (ref) observer.observe(ref); });
    return () => observer.disconnect();
  }, [messages]);

  const markMessagesAsReadBatch = async (messageIds: string[]) => {
    const unreadIds = messagesRef.current.filter(m => messageIds.includes(m.id) && !m.is_read && m.sender_id !== currentUser.id).map(m => m.id);
    if (unreadIds.length === 0) return;
    try {
      await supabase.from('messages').update({ is_read: true }).in('id', unreadIds);
      setMessages(prev => prev.map(m => unreadIds.includes(m.id) ? { ...m, is_read: true } : m));
    } catch (err) { console.error(err); }
  };

  const MessageBubble = React.memo(({ msg, isMe, showSender }: { msg: Message, isMe: boolean, showSender: boolean }) => (
    <div ref={el => { messageRefs.current[msg.id] = el; }} data-message-id={msg.id} className={cn("flex w-full group animate-in fade-in slide-in-from-bottom-2", isMe ? "justify-end" : "justify-start")}>
      <div className={cn("flex flex-col max-w-[85%] md:max-w-[70%]", isMe ? "items-end" : "items-start")}>
        {showSender && <span className="text-[10px] font-bold text-brand uppercase tracking-widest mb-1.5 ml-1">{msg.sender?.username}</span>}
        <div className={cn("px-3 py-2 md:px-4 md:py-3 rounded-2xl shadow-sm relative", isMe ? "bg-brand text-white rounded-tr-none" : "bg-bg-card text-white/90 rounded-tl-none border border-border-subtle")}>
          {msg.message_type === 'call' ? (
            <div className="flex items-center gap-2 md:gap-3 py-1">
              <Phone className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <p className="text-[12px] md:text-[13px] font-bold italic">{msg.content}</p>
            </div>
          ) : (
            <p className="text-[13px] md:text-[14px] break-words font-medium">{msg.content}</p>
          )}
          <div className={cn("flex items-center gap-1.5 mt-1.5 md:mt-2 opacity-60", isMe ? "justify-end" : "justify-start")}>
            <span className="text-[8px] md:text-[9px] font-bold">{format(new Date(msg.created_at), 'HH:mm')}</span>
            {isMe && (msg.is_read ? <CheckCheck className="w-3 h-3 text-white" /> : <Check className="w-3 h-3 text-white/50" />)}
          </div>
        </div>
      </div>
    </div>
  ));

  return (
    <div className="flex-1 flex flex-col h-full bg-bg-main relative overflow-hidden overflow-x-hidden">
      {/* Header */}
      <div className="h-16 md:h-20 bg-bg-main/80 backdrop-blur-xl flex items-center justify-between px-4 md:px-6 border-b border-border-subtle z-20">
        <div className="flex items-center gap-2 md:gap-4 cursor-pointer min-w-0">
          {onBack && (
            <button 
              onClick={(e) => { e.stopPropagation(); onBack(); }}
              className="p-1.5 -ml-1 hover:bg-white/5 rounded-lg text-text-dim md:hidden"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          <div className="flex items-center gap-2 md:gap-4 min-w-0" onClick={() => setShowDetails(true)}>
            <img src={displayAvatar || ''} className="w-9 h-9 md:w-11 md:h-11 rounded-xl object-cover flex-shrink-0" />
            <div className="min-w-0">
              <p className="font-bold text-sm text-white truncate max-w-[100px] sm:max-w-[150px] md:max-w-none">{displayName}</p>
              <span className="text-[10px] text-text-dim font-semibold uppercase tracking-widest block truncate">
                {!conversation.is_group && otherParticipant && isOnline(otherParticipant.id) ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>
        </div>
        
        {/* 🔥 DÜZELTİLEN CALL BUTONLARI */}
        <div className="flex items-center gap-1.5 md:gap-3">
          <div className="flex items-center bg-white/5 rounded-xl p-0.5 md:p-1 border border-white/5">
            <button 
              className="p-1.5 md:p-2 rounded-lg transition-all text-brand hover:bg-brand/10 hover:text-brand-light active:scale-95"
              onClick={() => { setActiveCall('video'); handleSendMessage(undefined, undefined, 'call'); }}
            >
              <Video className="w-4 h-4 md:w-5 md:h-5" />
            </button>
            <button 
              className="p-1.5 md:p-2 rounded-lg transition-all text-brand hover:bg-brand/10 hover:text-brand-light active:scale-95"
              onClick={() => { setActiveCall('audio'); handleSendMessage(undefined, undefined, 'call'); }}
            >
              <Phone className="w-4 h-4 md:w-5 md:h-5" />
            </button>
          </div>
          <div className="w-px h-5 md:h-6 bg-border-subtle mx-0.5 md:mx-1" />
          <div className="flex items-center gap-0.5 md:gap-1">
            <button className="p-1.5 md:p-2 hover:bg-white/5 rounded-lg text-text-dim hover:text-white"><Search className="w-4 h-4 md:w-5 md:h-5" /></button>
            {conversation.is_group && <button className="p-1.5 md:p-2 hover:bg-white/5 rounded-lg text-text-dim hover:text-white" onClick={() => setShowGroupSettings(true)}><Settings className="w-4 h-4 md:w-5 md:h-5" /></button>}
            <button className="p-1.5 md:p-2 hover:bg-white/5 rounded-lg text-text-dim hover:text-white"><MoreVertical className="w-4 h-4 md:w-5 md:h-5" /></button>
          </div>
        </div>
      </div>

      {showDetails && <DetailsModal type={conversation.is_group ? 'group' : 'user'} data={conversation.is_group ? (conversation as any) : otherParticipant!} onClose={() => setShowDetails(false)} />}
      {showGroupSettings && <GroupSettingsModal group={conversation} currentUser={currentUser} onClose={() => setShowGroupSettings(false)} onUpdate={() => onUpdateConversation?.()} />}
      {activeCall && <CallModal type={activeCall} targetUserId={otherParticipant?.id || ''} targetName={displayName || ''} targetAvatar={displayAvatar || ''} onClose={() => setActiveCall(null)} currentUser={currentUser} />}

      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 md:p-6 lg:px-12 scroll-smooth">
        {loading ? <div className="flex justify-center items-center h-full">Yükleniyor...</div> : (
          <div className="max-w-4xl mx-auto space-y-3 md:space-y-4">
            {messages.map(msg => <MessageBubble key={msg.id} msg={msg} isMe={msg.sender_id === currentUser.id} showSender={conversation.is_group && msg.sender_id !== currentUser.id} />)}
            {typingUsers.length > 0 && <div className="text-[10px] text-brand animate-pulse uppercase font-bold tracking-widest">{typingUsers[0]} yazıyor...</div>}
          </div>
        )}
      </div>

      <div className="px-4 py-4 md:px-6 md:py-6 bg-bg-main">
        <div className="max-w-4xl mx-auto flex items-end gap-2 md:gap-3 bg-bg-card border border-border-subtle rounded-2xl p-1.5 md:p-2 premium-shadow">
          <button className="p-1.5 md:p-2 text-text-dim hover:text-brand"><Smile className="w-5 h-5" /></button>
          <form onSubmit={handleSendMessage} className="flex-1 mb-1">
            <input type="text" placeholder="Type your message..." className="w-full bg-transparent border-none outline-none text-xs md:text-sm py-2 px-1 md:px-2 text-white placeholder:text-text-dim/40" value={newMessage} onChange={(e) => { setNewMessage(e.target.value); handleTyping(); }} />
          </form>
          <button onClick={() => handleSendMessage()} disabled={!newMessage.trim()} className={cn("p-2.5 md:p-3 rounded-xl transition-all", newMessage.trim() ? "bg-brand text-white shadow-lg active:scale-95" : "bg-white/5 text-text-dim/30")}>
            <Send className="w-4 h-4 md:w-5 md:h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}