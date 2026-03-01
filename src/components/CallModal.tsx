import React, { useState, useEffect, useRef } from 'react';
import { Phone, Video, Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff, User, Maximize2 } from 'lucide-react';
import { MediaConnection } from 'peerjs';
import { Profile } from '../lib/supabase';
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
}

export default function CallModal({ type, targetUserId, targetName, targetAvatar, onClose, currentUser, incomingCall }: CallModalProps) {
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'in-call'>(incomingCall ? 'calling' : 'calling');
  const [status, setStatus] = useState(incomingCall ? 'Gelen Arama...' : 'Aranıyor...');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(type === 'audio');
  const [isSwapped, setIsSwapped] = useState(false); 
  const [duration, setDuration] = useState(0);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const callRef = useRef<MediaConnection | null>(incomingCall || null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  // --- KRİTİK DÜZELTME: Akış Bağlama Mantığı ---
  useEffect(() => {
    // 1. Kendi görüntümüzü bağla
    if (localStream) {
      const targetRef = isSwapped ? remoteVideoRef : localVideoRef;
      if (targetRef.current) targetRef.current.srcObject = localStream;
    }
    
    // 2. Karşı tarafın görüntüsünü bağla (Sadece varsa)
    if (remoteStream) {
      const targetRef = isSwapped ? localVideoRef : remoteVideoRef;
      if (targetRef.current) targetRef.current.srcObject = remoteStream;
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [localStream, remoteStream, isSwapped]);

  useEffect(() => {
    const startCall = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: type === 'video',
          audio: true
        });
        setLocalStream(stream);

        const peer = getPeer(currentUser.id);
        if (!peer) return;

        if (incomingCall) {
          callRef.current = incomingCall;
        } else {
          const call = peer.call(targetUserId, stream, { metadata: { type } });
          callRef.current = call;
          handleCall(call);
        }
      } catch (err) {
        setStatus('Kamera/Mikrofon erişimi reddedildi');
      }
    };

    startCall();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (localStream) localStream.getTracks().forEach(t => t.stop());
      if (callRef.current) callRef.current.close();
    };
  }, []);

  const handleCall = (call: MediaConnection) => {
    call.on('stream', (rStream) => {
      setRemoteStream(rStream);
      setCallStatus('in-call');
      setStatus('Bağlandı');
      if (!timerRef.current) {
        timerRef.current = setInterval(() => setDuration(prev => prev + 1), 1000);
      }
    });
    call.on('close', onClose);
  };

  const answerCall = () => {
    if (callRef.current && localStream) {
      callRef.current.answer(localStream);
      handleCall(callRef.current);
      setIsAnswered(true);
    }
  };

  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 bg-black z-[100] flex flex-col items-center justify-between text-white overflow-hidden">
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* --- BÜYÜK GÖRÜNTÜ (ARKA PLAN) --- */}
      <div className="absolute inset-0 w-full h-full z-0 bg-bg-main">
        <video
          ref={isSwapped ? localVideoRef : remoteVideoRef}
          autoPlay
          playsInline
          muted={isSwapped} // Arka planda sen varsan sesini kapat
          className={cn(
            "w-full h-full object-cover transition-opacity duration-700",
            // Eğer swap yoksa ve karşıdan yayın gelmediyse büyük videoyu gizle (Avatar kalsın)
            (!isSwapped && !remoteStream) || (isSwapped && isVideoOff) ? "opacity-0" : "opacity-100"
          )}
        />
        
        {/* Karşı tarafın görüntüsü yoksa veya swap durumunda senin videon kapalıysa avatar göster */}
        {((!isSwapped && !remoteStream) || (isSwapped && isVideoOff)) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg-main/60 backdrop-blur-3xl">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <img src={targetAvatar} className="w-32 h-32 md:w-48 md:h-48 rounded-full border-4 border-white/10" />
            </motion.div>
            <h2 className="text-2xl md:text-4xl font-bold mt-8">{targetName}</h2>
            <p className="text-brand font-bold tracking-widest mt-2 animate-pulse">{status}</p>
          </div>
        )}
      </div>

      {/* --- KÜÇÜK GÖRÜNTÜ (SÜRÜKLENEBİLİR) --- */}
      {type === 'video' && (
        <motion.div
          drag
          dragConstraints={{ left: -400, right: 0, top: 0, bottom: 600 }}
          whileDrag={{ scale: 1.05 }}
          onClick={() => setIsSwapped(!isSwapped)}
          className="absolute top-8 right-8 w-28 h-40 md:w-40 md:h-56 bg-bg-card rounded-2xl md:rounded-3xl border-2 border-white/20 overflow-hidden shadow-2xl z-50 cursor-pointer group"
        >
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
            <Maximize2 className="w-6 h-6" />
          </div>
          <video
            ref={isSwapped ? remoteVideoRef : localVideoRef}
            autoPlay
            playsInline
            muted={!isSwapped} // Küçük ekranda sen varsan yankı olmasın diye mute'la
            className={cn(
              "w-full h-full object-cover", 
              (!isSwapped && isVideoOff) || (isSwapped && !remoteStream) ? "hidden" : "block"
            )}
          />
          {/* İçerik yoksa ikon göster */}
          {((!isSwapped && isVideoOff) || (isSwapped && !remoteStream)) && (
            <div className="w-full h-full flex items-center justify-center bg-bg-card">
              <User className="w-10 h-10 text-white/10" />
            </div>
          )}
        </motion.div>
      )}

      {/* --- KONTROLLER --- */}
      <div className="relative z-[60] flex flex-col items-center gap-6 mb-12 w-full px-6">
        {callStatus === 'in-call' && (
          <div className="bg-black/40 backdrop-blur-xl px-4 py-1.5 rounded-full border border-white/10 text-xs font-bold tracking-widest text-brand">
            {formatDuration(duration)}
          </div>
        )}

        <div className="flex items-center gap-4 md:gap-6 p-4 bg-white/5 backdrop-blur-3xl rounded-[2.5rem] border border-white/10 shadow-2xl">
          {callStatus === 'calling' && incomingCall && !isAnswered ? (
            <div className="flex gap-4">
              <button onClick={answerCall} className="w-16 h-16 bg-brand text-white rounded-2xl flex items-center justify-center shadow-lg hover:scale-110 animate-bounce">
                <VideoIcon />
              </button>
              <button onClick={onClose} className="w-16 h-16 bg-red-500 text-white rounded-2xl flex items-center justify-center shadow-lg hover:scale-110">
                <PhoneOff />
              </button>
            </div>
          ) : (
            <>
              <button 
                onClick={() => {
                  if (localStream) {
                    localStream.getAudioTracks().forEach(t => t.enabled = !t.enabled);
                    setIsMuted(!isMuted);
                  }
                }} 
                className={cn("w-14 h-14 rounded-2xl flex items-center justify-center transition-all", isMuted ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20')}
              >
                {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </button>

              <button onClick={onClose} className="w-14 h-14 bg-red-500 text-white rounded-2xl flex items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition-all">
                <PhoneOff className="w-6 h-6" />
              </button>

              {type === 'video' && (
                <button 
                  onClick={() => {
                    if (localStream) {
                      localStream.getVideoTracks().forEach(t => t.enabled = !t.enabled);
                      setIsVideoOff(!isVideoOff);
                    }
                  }} 
                  className={cn("w-14 h-14 rounded-2xl flex items-center justify-center transition-all", isVideoOff ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20')}
                >
                  {isVideoOff ? <VideoOff className="w-6 h-6" /> : <VideoIcon className="w-6 h-6" />}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}