import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase, Conversation, Message, Profile, MessageType } from '../lib/supabase';
import { Send, Smile, Paperclip, MoreVertical, Phone, Video, Search, Image as ImageIcon, Film, X, Settings } from 'lucide-react';
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
}

const PAGE_SIZE = 30;

export default function ChatWindow({ conversation, currentUser, onUpdateConversation }: ChatWindowProps) {
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
  const listRef = useRef<any>(null);
  const lastTypingBroadcastRef = useRef<number>(0);
  const typingTimeoutsRef = useRef<{ [key: string]: NodeJS.Timeout }>({});
  const activeChatIdRef = useRef<string>(conversation.id);
  const channelRef = useRef<any>(null);
  const messagesRef = useRef<Message[]>([]);
  
  const { isOnline } = usePresence(currentUser.id);

  // Sync messagesRef with messages state
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Update ref when conversation changes
  useEffect(() => {
  activeChatIdRef.current = conversation.id;
  setMessages([]);
  setHasMore(true);
  setLoading(true);
}, [conversation.id]);

  const markMessagesAsRead = async () => {
    try {
      const { error } = await supabase
        .from('messages')
        .update({ is_read: true })
        .eq(conversation.is_group ? 'group_id' : 'conversation_id', conversation.id)
        .neq('sender_id', currentUser.id)
        .eq('is_read', false);

      if (error) throw error;
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
        const oldestMessage = messages[0];
        query = query.lt('created_at', oldestMessage.created_at);
      }

      const { data, error } = await query;

      if (error) throw error;

      const newMessages = (data || []).reverse();

if (activeChatIdRef.current !== currentChatId) return;

if (initial) {
  setMessages(newMessages);
} else {
  setMessages(prev => [...newMessages, ...prev]);
}
      
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
    
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(channelId)
      .on('postgres_changes' as any, { 
        event: '*', 
        table: 'messages', 
        schema: 'public',
        filter: conversation.is_group 
          ? `group_id=eq.${conversation.id}` 
          : `conversation_id=eq.${conversation.id}` 
      }, (payload: any) => {
        const msgChatId = payload.new?.conversation_id || payload.new?.group_id || payload.old?.conversation_id || payload.old?.group_id;
        if (msgChatId !== activeChatIdRef.current) return;

        if (payload.eventType === 'INSERT') {
          const msg = payload.new as Message;
          
          setMessages(prev => {
            // 1. Check for duplicate by ID
            if (prev.some(m => m.id === msg.id)) return prev;
            
            // 2. Check for optimistic match by client_id
            const optimisticIdx = msg.client_id ? prev.findIndex(m => m.client_id === msg.client_id) : -1;
            
            if (optimisticIdx !== -1) {
              const newMessages = [...prev];
              newMessages[optimisticIdx] = { ...newMessages[optimisticIdx], ...msg };
              return newMessages;
            }

            // 3. If not an optimistic match, add it
            // We need to fetch the sender profile if it's not present
            if (!msg.sender) {
              fetchSenderProfile(msg.id, msg.sender_id);
            }
            
            return [...prev, msg];
          });
          
          if (msg.sender_id !== currentUser.id) {
            markMessagesAsRead();
          }
        } else if (payload.eventType === 'UPDATE') {
          const updatedMsg = payload.new as Message;
          setMessages(prev => prev.map(m => m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m));
        } else if (payload.eventType === 'DELETE') {
          const deletedId = payload.old.id;
          setMessages(prev => prev.filter(m => m.id !== deletedId));
        }
      })
      .on('broadcast' as any, { event: 'typing' }, ({ payload }: any) => {
        if (payload.userId !== currentUser.id) {
          setTypingUsers(prev => {
            if (prev.includes(payload.username)) return prev;
            return [...prev, payload.username];
          });
          
          if (typingTimeoutsRef.current[payload.username]) {
            clearTimeout(typingTimeoutsRef.current[payload.username]);
          }

          typingTimeoutsRef.current[payload.username] = setTimeout(() => {
            setTypingUsers(prev => prev.filter(u => u !== payload.username));
            delete typingTimeoutsRef.current[payload.username];
          }, 4000);
        }
      })
      .subscribe((status) => {
  if (status === 'SUBSCRIBED') {
    console.log(`Subscribed to realtime messages for ${channelId}`);
    
    // 🔥 İlk yükleme burada yapılmalı
    fetchMessages(true);
    markMessagesAsRead();
  }
});
    
    channelRef.current = channel;

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
      channelRef.current = null;
    };
  }, [conversation.id]);

  const fetchSenderProfile = async (messageId: string, senderId: string) => {
    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', senderId)
      .single();
    
    if (profile) {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, sender: profile } : m));
    }
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

      const { data, error } = await supabase
        .from('messages')
        .insert([messageData])
        .select()
        .single();

      if (error) throw error;
      
      // The realtime listener will handle the update via client_id, 
      // but we can also update it here for faster feedback
      setMessages(prev => prev.map(m => m.client_id === clientId ? { ...data, sender: currentUser } : m));
    } catch (err) {
      console.error('Error sending message:', err);
      setMessages(prev => prev.filter(m => m.client_id !== clientId));
    }
  };

  const handleTyping = () => {
    const now = Date.now();
    if (now - lastTypingBroadcastRef.current > 2000) {
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'typing',
          payload: { userId: currentUser.id, username: currentUser.username },
        });
        lastTypingBroadcastRef.current = now;
      }
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop } = e.currentTarget;
    if (scrollTop === 0 && hasMore && !loadingMore) {
      fetchMessages();
    }
  };

  useEffect(() => {
    if (!loadingMore) {
      scrollToBottom();
    }
  }, [messages.length]);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  const otherParticipant = useMemo(() => {
    return !conversation.is_group 
      ? conversation.participants?.find(p => p.user_id !== currentUser.id)?.profile
      : null;
  }, [conversation.participants, currentUser.id, conversation.is_group]);

  const displayName = conversation.is_group ? conversation.name : otherParticipant?.username;
  const displayAvatar = conversation.is_group 
    ? conversation.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${conversation.name}`
    : otherParticipant?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${otherParticipant?.username}`;

  const messageRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visibleMessageIds = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => entry.target.getAttribute('data-message-id'))
          .filter((id): id is string => id !== null);

        if (visibleMessageIds.length > 0) {
          markMessagesAsReadBatch(visibleMessageIds);
        }
      },
      { threshold: 0.5 }
    );

    Object.values(messageRefs.current).forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, [messages]);

  const markMessagesAsReadBatch = async (messageIds: string[]) => {
    const unreadIds = messagesRef.current
      .filter(m => messageIds.includes(m.id) && !m.is_read && m.sender_id !== currentUser.id)
      .map(m => m.id);

    if (unreadIds.length === 0) return;

    try {
      const { error } = await supabase
        .from('messages')
        .update({ is_read: true })
        .in('id', unreadIds);

      if (error) throw error;
      
      // Update local state optimistically
      setMessages(prev => prev.map(m => unreadIds.includes(m.id) ? { ...m, is_read: true } : m));
    } catch (err) {
      console.error('Error marking messages as read batch:', err);
    }
  };

  const MessageBubble = React.memo(({ msg, isMe, showSender }: { msg: Message, isMe: boolean, showSender: boolean }) => (
    <div 
      ref={el => { messageRefs.current[msg.id] = el; }}
      data-message-id={msg.id}
      className={cn(
        "flex w-full group animate-in fade-in slide-in-from-bottom-2 duration-300",
        isMe ? "justify-end" : "justify-start"
      )}
    >
      <div className={cn(
        "flex flex-col max-w-[80%] md:max-w-[70%]",
        isMe ? "items-end" : "items-start"
      )}>
        {showSender && (
          <span className="text-[10px] font-bold text-brand uppercase tracking-widest mb-1.5 ml-1">
            {msg.sender?.username}
          </span>
        )}
        
        <div className={cn(
          "px-4 py-3 rounded-2xl shadow-sm relative transition-all duration-200",
          isMe 
            ? "bg-brand text-white rounded-tr-none premium-shadow" 
            : "bg-bg-card text-white/90 rounded-tl-none border border-border-subtle"
        )}>
          <div className="flex flex-col gap-2">
            {msg.message_type === 'image' && (
              <div className="rounded-xl overflow-hidden border border-white/10">
                <img src={msg.media_url!} className="max-w-full hover:scale-105 transition-transform duration-500 cursor-pointer" referrerPolicy="no-referrer" />
              </div>
            )}
            {msg.message_type === 'video' && (
              <div className="rounded-xl overflow-hidden border border-white/10">
                <video src={msg.media_url!} controls className="max-w-full" />
              </div>
            )}
            {msg.message_type === 'call' && (
              <div className="flex items-center gap-3 py-1">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center",
                  isMe ? "bg-white/20" : "bg-brand/20 text-brand"
                )}>
                  <Phone className="w-4 h-4" />
                </div>
                <p className="text-[13px] font-bold italic opacity-90">
                  {msg.content}
                </p>
              </div>
            )}
            {msg.content && msg.message_type !== 'call' && (
              <p className="text-[14px] leading-relaxed break-words font-medium">
                {msg.content}
              </p>
            )}
          </div>
          
          <div className={cn(
            "flex items-center gap-1.5 mt-2 opacity-60 group-hover:opacity-100 transition-opacity",
            isMe ? "justify-end" : "justify-start"
          )}>
            <span className="text-[9px] font-bold tabular-nums uppercase tracking-tighter">
              {format(new Date(msg.created_at), 'HH:mm')}
            </span>
            {isMe && (
              <div className="flex items-center">
                {msg.is_read ? (
                  <CheckCheck className="w-3 h-3 text-white" />
                ) : (
                  <Check className="w-3 h-3 text-white/50" />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  ));

  return (
    <div className="flex-1 flex flex-col h-full bg-bg-main relative overflow-hidden">
      {/* Chat Header */}
      <div className="h-20 bg-bg-main/80 backdrop-blur-xl flex items-center justify-between px-6 border-b border-border-subtle z-20">
        <div 
          className="flex items-center gap-4 cursor-pointer group"
          onClick={() => setShowDetails(true)}
        >
          <div className="relative">
            <img src={displayAvatar || ''} className="w-11 h-11 rounded-xl object-cover ring-1 ring-white/10 group-hover:ring-brand/30 transition-all" referrerPolicy="no-referrer" />
            {!conversation.is_group && otherParticipant && isOnline(otherParticipant.id) && (
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-brand border-2 border-bg-main rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
            )}
          </div>
          <div>
            <p className="font-bold text-sm tracking-tight text-white group-hover:text-brand transition-colors">{displayName}</p>
            <div className="flex items-center gap-1.5">
              {conversation.is_group ? (
                <span className="text-[10px] text-text-dim font-medium uppercase tracking-wider">
                  {conversation.participants?.length} members
                </span>
              ) : (
                <>
                  <div className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    otherParticipant && isOnline(otherParticipant.id) ? "bg-brand animate-pulse" : "bg-text-dim/30"
                  )}></div>
                  <span className="text-[10px] text-text-dim font-semibold uppercase tracking-widest">
                    {otherParticipant && isOnline(otherParticipant.id) ? 'Online' : 'Offline'}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-white/5 rounded-xl p-1 border border-white/5">
            <div className="relative group/tooltip">
              <button 
                className={cn(
                  "p-2 rounded-lg transition-all",
                  otherParticipant && isOnline(otherParticipant.id) 
                    ? "hover:bg-brand/10 text-brand hover:text-brand-light" 
                    : "text-text-dim/30 cursor-not-allowed"
                )} 
                onClick={() => {
                  if (otherParticipant && isOnline(otherParticipant.id)) {
                    setActiveCall('video');
                    handleSendMessage(undefined, undefined, 'call');
                  }
                }}
                disabled={!(!conversation.is_group && otherParticipant && isOnline(otherParticipant.id))}
              >
                <Video className="w-5 h-5" />
              </button>
              {!(!conversation.is_group && otherParticipant && isOnline(otherParticipant.id)) && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-bg-card border border-border-subtle rounded text-[10px] whitespace-nowrap opacity-0 group-hover/tooltip:opacity-100 pointer-events-none transition-opacity">
                  User is offline
                </div>
              )}
            </div>
            
            <div className="relative group/tooltip">
              <button 
                className={cn(
                  "p-2 rounded-lg transition-all",
                  otherParticipant && isOnline(otherParticipant.id) 
                    ? "hover:bg-brand/10 text-brand hover:text-brand-light" 
                    : "text-text-dim/30 cursor-not-allowed"
                )} 
                onClick={() => {
                  if (otherParticipant && isOnline(otherParticipant.id)) {
                    setActiveCall('audio');
                    handleSendMessage(undefined, undefined, 'call');
                  }
                }}
                disabled={!(!conversation.is_group && otherParticipant && isOnline(otherParticipant.id))}
              >
                <Phone className="w-5 h-5" />
              </button>
              {!(!conversation.is_group && otherParticipant && isOnline(otherParticipant.id)) && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-bg-card border border-border-subtle rounded text-[10px] whitespace-nowrap opacity-0 group-hover/tooltip:opacity-100 pointer-events-none transition-opacity">
                  User is offline
                </div>
              )}
            </div>
          </div>
          
          <div className="w-px h-6 bg-border-subtle mx-1" />
          
          <div className="flex items-center gap-1">
            <button className="p-2 hover:bg-white/5 rounded-lg text-text-dim hover:text-white transition-colors">
              <Search className="w-5 h-5" />
            </button>
            {conversation.is_group && (
              <button 
                className="p-2 hover:bg-white/5 rounded-lg text-text-dim hover:text-white transition-colors"
                onClick={() => setShowGroupSettings(true)}
              >
                <Settings className="w-5 h-5" />
              </button>
            )}
            <button className="p-2 hover:bg-white/5 rounded-lg text-text-dim hover:text-white transition-colors">
              <MoreVertical className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {showDetails && (
        <DetailsModal 
          type={conversation.is_group ? 'group' : 'user'}
          data={conversation.is_group ? (conversation as any) : otherParticipant!}
          onClose={() => setShowDetails(false)}
        />
      )}

      {showGroupSettings && (
        <GroupSettingsModal 
          group={conversation}
          currentUser={currentUser}
          onClose={() => setShowGroupSettings(false)}
          onUpdate={() => onUpdateConversation?.()}
        />
      )}

      {activeCall && (
        <CallModal 
          type={activeCall}
          targetUserId={otherParticipant?.id || ''}
          targetName={displayName || ''}
          targetAvatar={displayAvatar || ''}
          onClose={() => setActiveCall(null)}
          currentUser={currentUser}
        />
      )}

      {/* Messages Area */}
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-6 md:px-12 scroll-smooth"
      >
        {loading ? (
          <div className="flex flex-col justify-center items-center h-full gap-4">
            <div className="w-10 h-10 border-2 border-brand/20 border-t-brand rounded-full animate-spin"></div>
            <p className="text-xs text-text-dim font-medium uppercase tracking-widest animate-pulse">Decrypting messages</p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto">
            {loadingMore && (
              <div className="flex justify-center py-2">
                <div className="w-4 h-4 border-2 border-brand/30 border-t-brand rounded-full animate-spin"></div>
              </div>
            )}
            
            <div className="space-y-4">
              {messages.map((msg) => (
                <MessageBubble 
                  key={msg.id} 
                  msg={msg} 
                  isMe={msg.sender_id === currentUser.id} 
                  showSender={conversation.is_group && msg.sender_id !== currentUser.id} 
                />
              ))}
            </div>
            
            {typingUsers.length > 0 && (
              <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2 mt-4">
                <div className="bg-bg-card/50 backdrop-blur-md border border-border-subtle px-4 py-2.5 rounded-2xl rounded-tl-none flex items-center gap-3">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-brand rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-1.5 h-1.5 bg-brand rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-1.5 h-1.5 bg-brand rounded-full animate-bounce"></span>
                  </div>
                  <span className="text-[10px] text-text-dim font-bold uppercase tracking-widest">
                    {typingUsers.length === 1 ? `${typingUsers[0]} is typing` : 'Multiple users typing'}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="px-6 py-6 bg-bg-main">
        <div className="max-w-4xl mx-auto relative">
          <div className="flex items-end gap-3 bg-bg-card border border-border-subtle rounded-2xl p-2 focus-within:border-brand/40 focus-within:ring-4 focus-within:ring-brand/5 transition-all premium-shadow">
            <div className="flex items-center gap-1 mb-1 ml-1">
              <button className="p-2 hover:bg-white/5 rounded-xl text-text-dim hover:text-brand transition-colors">
                <Smile className="w-5 h-5" />
              </button>
              
              <div className="relative">
                <button 
                  onClick={() => setShowMediaMenu(!showMediaMenu)}
                  className={cn(
                    "p-2 rounded-xl transition-all",
                    showMediaMenu ? "bg-brand/10 text-brand" : "hover:bg-white/5 text-text-dim hover:text-brand"
                  )}
                >
                  <Paperclip className={cn("w-5 h-5 transition-transform", showMediaMenu && "rotate-45")} />
                </button>
                
                {showMediaMenu && (
                  <div className="absolute bottom-full left-0 mb-4 bg-bg-card border border-border-subtle rounded-2xl p-2 shadow-2xl min-w-[180px] animate-in fade-in zoom-in-95 duration-200 z-30">
                    <p className="px-3 py-2 text-[10px] font-bold text-text-dim uppercase tracking-widest border-b border-border-subtle mb-1">Attachments</p>
                    <label className="flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl cursor-pointer group transition-colors">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-all">
                        <ImageIcon className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-semibold">Image</span>
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => handleSendMessage(undefined, reader.result as string, 'image');
                          reader.readAsDataURL(file);
                        }
                      }} />
                    </label>
                    <label className="flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl cursor-pointer group transition-colors">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white transition-all">
                        <Film className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-semibold">Video</span>
                      <input type="file" className="hidden" accept="video/*" onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => handleSendMessage(undefined, reader.result as string, 'video');
                          reader.readAsDataURL(file);
                        }
                      }} />
                    </label>
                  </div>
                )}
              </div>
            </div>

            <form onSubmit={(e) => handleSendMessage(e)} className="flex-1 mb-1">
              <input
                type="text"
                placeholder="Type your message..."
                className="w-full bg-transparent border-none outline-none text-sm py-2 px-2 text-white placeholder:text-text-dim/40"
                value={newMessage}
                onChange={(e) => {
                  setNewMessage(e.target.value);
                  handleTyping();
                }}
              />
            </form>

            <button 
              onClick={() => handleSendMessage()}
              disabled={!newMessage.trim()}
              className={cn(
                "p-3 rounded-xl transition-all flex-shrink-0 mb-0.5 mr-0.5",
                newMessage.trim() 
                  ? "bg-brand text-white shadow-[0_0_15px_rgba(16,185,129,0.4)] hover:scale-105 active:scale-95" 
                  : "bg-white/5 text-text-dim/30 cursor-not-allowed"
              )}
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
