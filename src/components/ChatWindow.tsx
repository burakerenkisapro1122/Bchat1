import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase, Conversation, Message, Profile, MessageType } from '../lib/supabase';
import { Send, Smile, Paperclip, MoreVertical, Phone, Video, ChevronLeft, Check, CheckCheck, Image as ImageIcon, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import DetailsModal from './DetailsModal';
import CallModal from './CallModal';
import { usePresence } from '../lib/usePresence';
import { motion, AnimatePresence } from 'framer-motion';

const LinkifiedText = ({ text }: { text: string }) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((part, i) => (
        urlRegex.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" 
             className="text-cyan-400 hover:text-cyan-300 underline decoration-cyan-400/30 underline-offset-4 transition-colors font-semibold"
             onClick={(e) => e.stopPropagation()}>{part}</a>
        ) : (part)
      ))}
    </span>
  );
};

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
  const [activeCall, setActiveCall] = useState<'audio' | 'video' | null>(null);
  
  // Görsel State'leri
  const [uploading, setUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastTypingBroadcastRef = useRef<number>(0);
  const channelRef = useRef<any>(null);
  
  const { isOnline } = usePresence(currentUser.id);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior });
    }
  }, []);

  // Mesajları getir
  const fetchMessages = useCallback(async (initial = false) => {
    if (!initial && (!hasMore || loadingMore)) return;
    if (initial) setLoading(true);
    else setLoadingMore(true);

    try {
      let query = supabase
        .from('v_messages_with_users')
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

  useEffect(() => {
    setMessages([]);
    setHasMore(true);
    fetchMessages(true);
  }, [conversation.id]);

  // Realtime
  useEffect(() => {
    const channelId = conversation.is_group ? `group-${conversation.id}` : `chat-${conversation.id}`;
    const channel = supabase
      .channel(channelId)
      .on('postgres_changes', { event: 'INSERT', table: 'messages', schema: 'public' }, async (payload: any) => {
        const msg = payload.new as Message;
        if (msg.sender_id !== currentUser.id) {
           const { data: user } = await supabase.from('users').select('id, username, avatar_url').eq('id', msg.sender_id).single();
           msg.sender = user;
        } else {
           msg.sender = currentUser;
        }
        setMessages(prev => [...prev.filter(m => m.client_id !== msg.client_id), msg]);
        setTimeout(() => scrollToBottom('smooth'), 50);
      })
      .subscribe();
    
    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [conversation.id, currentUser, scrollToBottom]);

  // Görsel Seçme İşlemi
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) return alert("Dosya 5MB'dan küçük olmalı");
      setSelectedFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSendMessage = async (e?: React.FormEvent, type: MessageType = 'text') => {
    if (e) e.preventDefault();
    if (!newMessage.trim() && !selectedFile && type !== 'call') return;

    setUploading(true);
    const clientId = crypto.randomUUID();
    let finalContent = newMessage;
    let finalType = type;

    try {
      // Eğer görsel varsa önce yükle
      if (selectedFile) {
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${conversation.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('chat-attachments')
          .upload(filePath, selectedFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('chat-attachments')
          .getPublicUrl(filePath);

        finalContent = publicUrl;
        finalType = 'image';
      }

      const messageData = conversation.is_group 
        ? { group_id: conversation.id, sender_id: currentUser.id, content: finalContent, message_type: finalType, client_id: clientId }
        : { conversation_id: conversation.id, sender_id: currentUser.id, content: finalContent, message_type: finalType, client_id: clientId };

      setNewMessage('');
      setSelectedFile(null);
      setImagePreview(null);

      const { error } = await supabase.from('messages').insert([messageData]);
      if (error) throw error;

    } catch (err) {
      console.error('Gönderim hatası:', err);
    } finally {
      setUploading(false);
    }
  };

  const otherParticipant = useMemo(() => {
    return !conversation.is_group ? conversation.participants?.find(p => p.user_id !== currentUser.id)?.profile : null;
  }, [conversation.participants, currentUser.id, conversation.is_group]);

  const displayName = conversation.is_group ? conversation.name : otherParticipant?.username;
  const displayAvatar = conversation.is_group 
    ? conversation.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${conversation.name}`
    : otherParticipant?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${otherParticipant?.username}`;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#050505] relative overflow-hidden">
      {/* Header */}
      <div className="h-20 flex-shrink-0 bg-bg-main/40 backdrop-blur-2xl flex items-center justify-between px-6 border-b border-white/5 z-20">
        <div className="flex items-center gap-4 cursor-pointer min-w-0" onClick={() => setShowDetails(true)}>
          <div className="relative flex-shrink-0">
            <img src={displayAvatar || ''} className="w-11 h-11 rounded-2xl object-cover border border-white/10" alt="avatar" />
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
        </div>
      </div>

      {/* Mesaj Alanı */}
      <div ref={scrollRef} className="flex-1 overflow-y-scroll p-4 md:p-8 lg:px-20 space-y-4 custom-scrollbar">
        <div className="max-w-4xl mx-auto flex flex-col">
          {messages.map((msg, idx) => {
            const isMe = msg.sender_id === currentUser.id;
            return (
              <div key={msg.id} className={cn("flex w-full mb-2", isMe ? "justify-end" : "justify-start")}>
                <div className={cn("flex flex-col max-w-[80%]", isMe ? "items-end" : "items-start")}>
                  <div className={cn(
                    "px-4 py-2.5 rounded-2xl text-[14px] relative border transition-all",
                    isMe ? "bg-brand text-white rounded-tr-none border-white/10" : "bg-white/5 text-white/90 rounded-tl-none border-white/5"
                  )}>
                    {msg.message_type === 'image' ? (
                      <img src={msg.content} alt="sent" className="max-w-xs rounded-lg mb-1 cursor-zoom-in" 
                           onClick={() => window.open(msg.content, '_blank')} />
                    ) : (
                      <LinkifiedText text={msg.content} />
                    )}
                    <div className={cn("flex items-center gap-1 mt-1 opacity-30 text-[9px]", isMe ? "justify-end" : "justify-start")}>
                      {format(new Date(msg.created_at), 'HH:mm')}
                      {isMe && (msg.is_read ? <CheckCheck size={12} className="text-blue-400" /> : <Check size={12} />)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Görsel Önizleme Barı */}
      <AnimatePresence>
        {imagePreview && (
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
                      className="px-6 py-2 bg-white/5 backdrop-blur-xl border-t border-white/10 flex items-center gap-4">
            <div className="relative">
              <img src={imagePreview} className="w-16 h-16 rounded-xl object-cover border border-brand" alt="preview" />
              <button onClick={() => { setImagePreview(null); setSelectedFile(null); }}
                      className="absolute -top-2 -right-2 p-1 bg-red-500 rounded-full text-white"><X size={12} /></button>
            </div>
            <p className="text-xs text-text-dim">Görsel gönderilmeye hazır...</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input Alanı */}
      <div className="p-6 bg-bg-main/40 backdrop-blur-md flex-shrink-0">
        <div className="max-w-4xl mx-auto flex items-center gap-2 bg-white/[0.03] border border-white/5 rounded-[2rem] p-1.5 focus-within:border-brand/40">
          <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileSelect} />
          <button onClick={() => fileInputRef.current?.click()} 
                  className="p-3 text-text-dim hover:text-brand transition-colors"><ImageIcon size={20} /></button>
          
          <form onSubmit={handleSendMessage} className="flex-1">
            <input 
              type="text" 
              placeholder={uploading ? "Yükleniyor..." : "Mesaj gönder..."} 
              className="w-full h-10 bg-transparent border-none outline-none text-sm px-2 text-white" 
              value={newMessage} 
              onChange={(e) => setNewMessage(e.target.value)}
              disabled={uploading}
            />
          </form>
          <button 
            onClick={() => handleSendMessage()} 
            disabled={(!newMessage.trim() && !selectedFile) || uploading} 
            className={cn("p-3 rounded-full transition-all", (newMessage.trim() || selectedFile) ? "bg-brand text-white shadow-lg shadow-brand/20" : "bg-white/5 text-white/10")}
          >
            {uploading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}