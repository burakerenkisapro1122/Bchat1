import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff, User, 
  MonitorUp, Circle, Square, MessageSquare, X, Send, MonitorOff
} from 'lucide-react';
import { MediaConnection, DataConnection } from 'peerjs';
import { Profile, supabase } from '../lib/supabase';
import { getPeer } from '../lib/peer';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface CallModalProps {
  type: 'audio' | 'video';
  targetUserId: string;
  targetName: string;
  targetAvatar: string;
  onClose: () => void;
  currentUser: Profile;
  incomingCall?: MediaConnection;
  groupId?: string; // Grup araması desteği eklendi
}

export default function CallModal({ type, targetUserId, targetName, targetAvatar, onClose, currentUser, incomingCall, groupId }: CallModalProps) {
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'in-call' | 'ended'>('calling');
  const [status, setStatus] = useState(incomingCall ? 'Gelen Arama...' : 'Aranıyor...');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(type === 'audio');
  const [isSwapped, setIsSwapped] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<{sender: 'me' | 'them', text: string}[]>([]);
  const [inputText, setInputText] = useState('');
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const callRef = useRef<MediaConnection | null>(incomingCall || null);
  const dataConnRef = useRef<DataConnection | null>(null); 
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Yeni mesaj geldiğinde aşağı kaydır
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, showChat]);

  useEffect(() => {
    if (localStream && localVideoRef.current) localVideoRef.current.srcObject = localStream;
    if (remoteStream && remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
    if (remoteStream && remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream;
  }, [localStream, remoteStream, isSwapped]);

  useEffect(() => {
    const initCall = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: type === 'video' ? { width: 1280, height: 720 } : false, 
          audio: true 
        });
        setLocalStream(stream);
        const peer = getPeer(currentUser.id);
        if (!peer) return;

        peer.on('connection', (conn) => {
          dataConnRef.current = conn;
          setupDataListeners(conn);
        });

        if (incomingCall) {
          callRef.current = incomingCall;
          handleCall(incomingCall);
          // Gelen aramada yanıtla
          incomingCall.answer(stream);
        } else {
          const call = peer.call(targetUserId, stream);
          callRef.current = call;
          handleCall(call);

          const conn = peer.connect(targetUserId);
          dataConnRef.current = conn;
          setupDataListeners(conn);
        }
        
        peer.on('error', (err) => {
          if (err.type === 'peer-unavailable' || err.type === 'disconnected') {
            setStatus('Cevap Yok');
            setCallStatus('ended');
            setTimeout(onClose, 1500);
          }
        });

      } catch (err) { 
        console.error(err);
        setStatus('Kamera/Mikrofon Hatası'); 
      }
    };
    initCall();

    return () => {
      localStream?.getTracks().forEach(track => track.stop());
      callRef.current?.close();
    };
  }, []);

  const setupDataListeners = (conn: DataConnection) => {
    conn.on('data', (data: any) => {
      if (data.type === 'chat') {
        setMessages(prev => [...prev, { sender: 'them', text: data.text }]);
      }
    });
  };

  const handleCall = (call: MediaConnection) => {
    call.on('stream', (rStream) => {
      setRemoteStream(rStream);
      setCallStatus('in-call');
      setStatus('Bağlandı');
    });
    call.on('close', () => {
      setStatus('Arama Sonlandırıldı');
      setCallStatus('ended');
      setTimeout(onClose, 1200);
    });
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const messageContent = inputText.trim();
    setInputText('');

    // 1. Peer üzerinden anlık gönder (Gecikmesiz UI için)
    if (dataConnRef.current) {
      dataConnRef.current.send({ type: 'chat', text: messageContent });
    }

    setMessages(prev => [...prev, { sender: 'me', text: messageContent }]);

    // 2. VERİTABANINA DM/GRUP OLARAK KAYDET
    try {
      await supabase.from('messages').insert({
        sender_id: currentUser.id,
        content: messageContent,
        [groupId ? 'group_id' : 'receiver_id']: groupId || targetUserId,
        type: 'text'
      });
    } catch (err) {
      console.error("Bchat Kayıt Hatası:", err);
    }
  };

  const toggleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        setIsScreenSharing(true);
        const videoTrack = screenStream.getVideoTracks()[0];
        const sender = callRef.current?.peerConnection.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(videoTrack);
        
        videoTrack.onended = () => toggleScreenShare();
      } else {
        const camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setIsScreenSharing(false);
        const videoTrack = camStream.getVideoTracks()[0];
        const sender = callRef.current?.peerConnection.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(videoTrack);
      }
    } catch (err) {
      console.error("Paylaşım Hatası:", err);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#050505] z-[100] flex flex-col md:flex-row text-white overflow-hidden font-sans">
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* ANA VİDEO ALANI */}
      <div className="relative flex-1 bg-black flex flex-col overflow-hidden">
        <video 
           ref={isSwapped ? localVideoRef : remoteVideoRef} 
           autoPlay playsInline muted={isSwapped}
           className={cn(
             "w-full h-full object-cover transition-all duration-700", 
             callStatus === 'ended' && "opacity-20 scale-110 blur-xl"
           )} 
        />
        
        {/* FLOAT LOCAL VIDEO (Küçük pencere) */}
        {callStatus === 'in-call' && !isScreenSharing && (
          <div 
            onClick={() => setIsSwapped(!isSwapped)}
            className="absolute top-6 right-6 w-32 h-48 md:w-48 md:h-64 rounded-2xl overflow-hidden border-2 border-white/10 shadow-2xl cursor-pointer z-50 bg-neutral-900"
          >
            <video 
              ref={isSwapped ? remoteVideoRef : localVideoRef} 
              autoPlay playsInline muted={!isSwapped}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* MERKEZİ BİLGİ */}
        {callStatus !== 'in-call' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }} 
              className="text-center"
            >
              <div className="relative inline-block">
                <img src={targetAvatar} className="w-32 h-32 md:w-40 md:h-40 rounded-full border-4 border-brand shadow-[0_0_50px_rgba(var(--brand-rgb),0.3)] mx-auto object-cover" alt="" />
                <div className="absolute inset-0 rounded-full border border-white/20 animate-ping opacity-20" />
              </div>
              <h2 className="text-3xl font-bold mt-6 tracking-tight text-white">{targetName}</h2>
              <p className={cn(
                "mt-3 font-medium tracking-[0.2em] uppercase text-sm px-4 py-1 rounded-full bg-white/5 inline-block border border-white/10", 
                status.includes('Reddedildi') ? "text-red-500 border-red-500/20" : "text-brand animate-pulse border-brand/20"
              )}>
                {status}
              </p>
            </motion.div>
          </div>
        )}

        {/* KONTROL PANELİ */}
        <motion.div 
          initial={{ y: 100 }} animate={{ y: 0 }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-3 p-3 bg-white/5 backdrop-blur-3xl rounded-[2.5rem] border border-white/10 z-[70] shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
        >
          <button onClick={() => setIsMuted(!isMuted)} className={cn("p-4 rounded-full transition-all hover:scale-110", isMuted ? "bg-red-500 shadow-lg shadow-red-500/20" : "bg-white/5 hover:bg-white/10")}><MicOff size={22}/></button>
          <button onClick={() => setIsVideoOff(!isVideoOff)} className={cn("p-4 rounded-full transition-all hover:scale-110", isVideoOff ? "bg-red-500 shadow-lg shadow-red-500/20" : "bg-white/5 hover:bg-white/10")}><VideoOff size={22}/></button>
          <button onClick={toggleScreenShare} className={cn("p-4 rounded-full transition-all hover:scale-110", isScreenSharing ? "bg-brand shadow-lg shadow-brand/20" : "bg-white/5 hover:bg-white/10")}>{isScreenSharing ? <MonitorOff size={22}/> : <MonitorUp size={22}/>}</button>
          <button 
            onClick={() => setShowChat(!showChat)} 
            className={cn("p-4 rounded-full relative transition-all hover:scale-110", showChat ? "bg-brand shadow-lg shadow-brand/20" : "bg-white/5 hover:bg-white/10")}
          >
            <MessageSquare size={22}/>
            {!showChat && <span className="absolute top-3 right-3 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-black animate-pulse"></span>}
          </button>
          <div className="w-[1px] h-8 bg-white/10 mx-1" />
          <button onClick={onClose} className="p-4 bg-red-600 rounded-full hover:scale-110 hover:rotate-90 active:scale-90 transition-all shadow-xl shadow-red-600/30"><PhoneOff size={24}/></button>
        </motion.div>
      </div>

      {/* BCHAT SOHBET PANELİ */}
      <AnimatePresence>
        {showChat && (
          <motion.div 
            initial={{ x: '100%', opacity: 0 }} 
            animate={{ x: 0, opacity: 1 }} 
            exit={{ x: '100%', opacity: 0 }}
            className="w-full md:w-[420px] bg-[#080808] border-l border-white/5 flex flex-col z-[80] absolute md:relative inset-y-0 right-0 shadow-[-30px_0_60px_rgba(0,0,0,0.8)]"
          >
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02] backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-brand animate-pulse" />
                <div>
                  <h3 className="font-bold text-lg leading-none">Bchat Canlı</h3>
                  <p className="text-[10px] text-white/30 uppercase tracking-widest mt-1">Realtime Entegrasyonu</p>
                </div>
              </div>
              <button onClick={() => setShowChat(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={20}/></button>
            </div>

            <div className="flex-1 p-5 overflow-y-auto space-y-4 custom-scrollbar bg-[radial-gradient(circle_at_bottom,_var(--tw-gradient-stops))] from-brand/5 via-transparent to-transparent">
              {messages.map((m, i) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }} 
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  key={i} 
                  className={cn("flex w-full", m.sender === 'me' ? "justify-end" : "justify-start")}
                >
                  <div className={cn(
                    "max-w-[85%] p-4 rounded-[1.5rem] text-[13px] shadow-lg leading-relaxed border", 
                    m.sender === 'me' 
                      ? "bg-gradient-to-br from-brand to-violet-700 text-white rounded-tr-none border-white/10" 
                      : "bg-white/5 text-white/90 rounded-tl-none border-white/5 backdrop-blur-sm"
                  )}>
                    {m.text}
                  </div>
                </motion.div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={sendMessage} className="p-4 bg-white/[0.01] border-t border-white/5 flex gap-2">
              <input 
                value={inputText} onChange={e => setInputText(e.target.value)}
                placeholder="Mesajını buraya bırak..."
                className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-brand/50 transition-all text-sm placeholder:text-white/20"
              />
              <button type="submit" className="p-4 bg-brand rounded-2xl hover:shadow-[0_0_20px_rgba(var(--brand-rgb),0.5)] hover:scale-105 active:scale-95 transition-all flex items-center justify-center">
                <Send size={18} className="text-white"/>
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}