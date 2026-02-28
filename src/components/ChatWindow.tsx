import React, { useState, useEffect, useRef } from 'react';
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

export default function ChatWindow({ conversation, currentUser, onUpdateConversation }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [activeCall, setActiveCall] = useState<'audio' | 'video' | null>(null);
  const [showMediaMenu, setShowMediaMenu] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastTypingBroadcastRef = useRef<number>(0);
  const typingTimeoutsRef = useRef<{ [key: string]: NodeJS.Timeout }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef<any>(null);
  
  const { isOnline } = usePresence(currentUser.id);

  useEffect(() => {
    fetchMessages();
    markMessagesAsRead();
    
    // Subscribe to new messages, typing indicators, and read status updates
    const channelId = conversation.is_group ? `group:${conversation.id}` : `chat:${conversation.id}`;
    const channel = supabase
      .channel(channelId)
      .on('postgres_changes' as any, { 
        event: 'INSERT', 
        table: 'messages', 
        schema: 'public',
        filter: conversation.is_group 
          ? `group_id=eq.${conversation.id}` 
          : `conversation_id=eq.${conversation.id}` 
      }, (payload: any) => {
        const msg = payload.new as Message;
        fetchSenderProfile(msg);
        if (msg.sender_id !== currentUser.id) {
          markMessagesAsRead();
        }
      })
      .on('postgres_changes' as any, {
        event: 'UPDATE',
        table: 'messages',
        schema: 'public',
        filter: conversation.is_group 
          ? `group_id=eq.${conversation.id}` 
          : `conversation_id=eq.${conversation.id}`
      }, (payload: any) => {
        const updatedMsg = payload.new as Message;
        setMessages(prev => prev.map(m => m.id === updatedMsg.id ? { ...m, is_read: updatedMsg.is_read } : m));
      })
      .on('broadcast' as any, { event: 'typing' }, ({ payload }: any) => {
        if (payload.userId !== currentUser.id) {
          setTypingUsers(prev => {
            if (prev.includes(payload.username)) return prev;
            return [...prev, payload.username];
          });
          
          // Clear existing timeout for this user
          if (typingTimeoutsRef.current[payload.username]) {
            clearTimeout(typingTimeoutsRef.current[payload.username]);
          }

          // Set new timeout to remove typing indicator
          typingTimeoutsRef.current[payload.username] = setTimeout(() => {
            setTypingUsers(prev => prev.filter(u => u !== payload.username));
            delete typingTimeoutsRef.current[payload.username];
          }, 4000);
        }
      })
      .subscribe();
    
    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
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

  const handleTyping = () => {
    const now = Date.now();
    // Throttle typing broadcasts to every 2 seconds
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    handleTyping();
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*, sender:users(*)')
        .eq(conversation.is_group ? 'group_id' : 'conversation_id', conversation.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (err) {
      console.error('Error fetching messages:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSenderProfile = async (msg: Message) => {
    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', msg.sender_id)
      .single();
    
    setMessages(prev => [...prev, { ...msg, sender: profile }]);
  };

  const handleSendMessage = async (e?: React.FormEvent, mediaUrl?: string, type: MessageType = 'text') => {
    if (e) e.preventDefault();
    if (!newMessage.trim() && !mediaUrl) return;

    const content = newMessage;
    setNewMessage('');
    setShowMediaMenu(false);

    try {
      const messageData = conversation.is_group 
        ? { group_id: conversation.id, sender_id: currentUser.id, content, message_type: type, media_url: mediaUrl }
        : { conversation_id: conversation.id, sender_id: currentUser.id, content, message_type: type, media_url: mediaUrl };

      const { error } = await supabase
        .from('messages')
        .insert([messageData]);

      if (error) throw error;
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: MessageType) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // In a real app, upload to Supabase Storage
    const reader = new FileReader();
    reader.onloadend = () => {
      handleSendMessage(undefined, reader.result as string, type);
    };
    reader.readAsDataURL(file);
  };

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  const otherParticipant = !conversation.is_group 
    ? conversation.participants?.find(p => p.user_id !== currentUser.id)?.profile
    : null;

  const displayName = conversation.is_group ? conversation.name : otherParticipant?.username;
  const displayAvatar = conversation.is_group 
    ? conversation.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${conversation.name}`
    : otherParticipant?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${otherParticipant?.username}`;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#efeae2] relative overflow-hidden">
      {/* Chat Header */}
      <div className="h-[60px] bg-[#f0f2f5] flex items-center justify-between px-4 py-2 border-b border-gray-200 z-10">
        <div 
          className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => setShowDetails(true)}
        >
          <img src={displayAvatar || ''} className="w-10 h-10 rounded-full object-cover" />
          <div>
            <p className="font-medium text-gray-800">{displayName}</p>
            <p className="text-xs text-gray-500">
              {conversation.is_group 
                ? `${conversation.participants?.length} members` 
                : (otherParticipant && isOnline(otherParticipant.id) ? 'çevrimiçi' : 'çevrimdışı')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-5 text-gray-500">
          <Video className="w-5 h-5 cursor-pointer hover:text-gray-700" onClick={() => setActiveCall('video')} />
          <Phone className="w-5 h-5 cursor-pointer hover:text-gray-700" onClick={() => setActiveCall('audio')} />
          <div className="w-[1px] h-6 bg-gray-300 mx-1" />
          <Search className="w-5 h-5 cursor-pointer hover:text-gray-700" />
          {conversation.is_group && (
            <Settings 
              className="w-5 h-5 cursor-pointer hover:text-gray-700" 
              onClick={() => setShowGroupSettings(true)}
            />
          )}
          <MoreVertical className="w-5 h-5 cursor-pointer hover:text-gray-700" />
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
          targetName={displayName || ''}
          targetAvatar={displayAvatar || ''}
          onClose={() => setActiveCall(null)}
        />
      )}

      {/* Messages Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 md:px-16 space-y-2 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat"
      >
        {loading ? (
          <div className="flex justify-center items-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#25d366]"></div>
          </div>
        ) : (
          <>
            {messages.map((msg, idx) => {
              const isMe = msg.sender_id === currentUser.id;
              const showSender = conversation.is_group && !isMe;
              
              return (
                <div
                  key={msg.id}
                  className={cn(
                    "flex w-full mb-1",
                    isMe ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] md:max-w-[65%] px-2 py-1.5 rounded-lg shadow-sm relative",
                      isMe ? "bg-[#d9fdd3] rounded-tr-none" : "bg-white rounded-tl-none"
                    )}
                  >
                    {showSender && (
                      <p className="text-xs font-bold text-[#00a884] mb-1">
                        {msg.sender?.username}
                      </p>
                    )}
                    <div className="flex flex-col gap-1">
                      {msg.message_type === 'image' && (
                        <img src={msg.media_url!} className="max-w-full rounded-md mb-1 cursor-pointer hover:opacity-90" />
                      )}
                      {msg.message_type === 'video' && (
                        <video src={msg.media_url!} controls className="max-w-full rounded-md mb-1" />
                      )}
                      {msg.content && (
                        <p className="text-[14.2px] text-gray-800 break-words leading-tight">
                          {msg.content}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 justify-end mt-1">
                      <span className="text-[10px] text-gray-500 whitespace-nowrap">
                        {format(new Date(msg.created_at), 'HH:mm')}
                      </span>
                      {isMe && (
                        msg.is_read ? (
                          <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />
                        ) : (
                          <Check className="w-3.5 h-3.5 text-gray-400" />
                        )
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {typingUsers.length > 0 && (
              <div className="flex justify-start mb-4 animate-in fade-in slide-in-from-bottom-2">
                <div className="bg-white px-3 py-1.5 rounded-2xl rounded-tl-none text-xs text-gray-500 shadow-sm flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce"></span>
                  </div>
                  <span className="italic">
                    {typingUsers.join(', ')} {typingUsers.length === 1 ? 'yazıyor' : 'yazıyorlar'}...
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Input Area */}
      <div className="bg-[#f0f2f5] px-4 py-2 flex items-center gap-3 relative">
        <Smile className="w-7 h-7 text-gray-500 cursor-pointer hover:text-gray-700" />
        
        <div className="relative">
          <Paperclip 
            className={cn(
              "w-6 h-6 text-gray-500 cursor-pointer hover:text-gray-700 -rotate-45 transition-transform",
              showMediaMenu && "rotate-0 text-[#00a884]"
            )} 
            onClick={() => setShowMediaMenu(!showMediaMenu)}
          />
          
          {showMediaMenu && (
            <div className="absolute bottom-14 left-0 bg-white rounded-xl shadow-xl p-2 flex flex-col gap-1 min-w-[160px] border border-gray-100 animate-in fade-in slide-in-from-bottom-2">
              <label className="flex items-center gap-3 p-3 hover:bg-[#f5f6f6] rounded-lg cursor-pointer transition-colors">
                <ImageIcon className="w-5 h-5 text-[#007bfc]" />
                <span className="text-sm font-medium text-gray-700">Fotoğraf</span>
                <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'image')} />
              </label>
              <label className="flex items-center gap-3 p-3 hover:bg-[#f5f6f6] rounded-lg cursor-pointer transition-colors">
                <Film className="w-5 h-5 text-[#00a884]" />
                <span className="text-sm font-medium text-gray-700">Video</span>
                <input type="file" className="hidden" accept="video/*" onChange={(e) => handleFileUpload(e, 'video')} />
              </label>
            </div>
          )}
        </div>

        <form onSubmit={(e) => handleSendMessage(e)} className="flex-1">
          <input
            type="text"
            placeholder="Mesaj yazın"
            className="w-full bg-white rounded-lg px-4 py-2 outline-none text-sm"
            value={newMessage}
            onChange={handleInputChange}
          />
        </form>
        <button 
          onClick={() => handleSendMessage()}
          className="bg-transparent border-none outline-none"
        >
          <Send className={cn(
            "w-6 h-6 transition-colors",
            newMessage.trim() ? "text-[#00a884]" : "text-gray-500"
          )} />
        </button>
      </div>
    </div>
  );
}
