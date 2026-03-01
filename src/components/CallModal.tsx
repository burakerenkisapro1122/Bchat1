import React, { useState, useEffect, useRef } from 'react';
import { Phone, Video, X, Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff, User } from 'lucide-react';
import { MediaConnection } from 'peerjs';
import { Profile } from '../lib/supabase';
import { getPeer } from '../lib/peer';
import { cn } from '../lib/utils';

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
  const [duration, setDuration] = useState(0);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const callRef = useRef<MediaConnection | null>(incomingCall || null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  // Sesin her durumda çalması için ref
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const startCall = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: type === 'video',
          audio: true
        });
        setLocalStream(stream);
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        const peer = getPeer(currentUser.id);
        if (!peer) return;

        const errorHandler = (err: any) => {
          if (err.type === 'peer-unavailable') {
            setStatus('Ulaşılamıyor');
            setTimeout(onClose, 3000);
          }
        };
        peer.on('error', errorHandler);

        if (incomingCall) {
          callRef.current = incomingCall;
        } else {
          const call = peer.call(targetUserId, stream, { metadata: { type } });
          callRef.current = call;
          handleCall(call);

          const timeout = setTimeout(() => {
            if (callStatus === 'calling') {
              setStatus('Cevap verilmedi');
              setTimeout(onClose, 2000);
            }
          }, 30000);

          return () => {
            clearTimeout(timeout);
            peer.off('error', errorHandler);
          };
        }
      } catch (err) {
        console.error('Erişim hatası:', err);
        setStatus('Erişim reddedildi');
      }
    };

    startCall();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      if (callRef.current) {
        callRef.current.close();
      }
    };
  }, [targetUserId, type]);

  const handleCall = (call: MediaConnection) => {
    call.on('stream', (rStream) => {
      setRemoteStream(rStream);
      
      // KRİTİK: Hem ses hem video elementi için stream bağlanmalı
      if (remoteVideoRef.current && type === 'video') {
        remoteVideoRef.current.srcObject = rStream;
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = rStream;
      }

      setCallStatus('in-call');
      setStatus('Bağlandı');
      
      if (!timerRef.current) {
        timerRef.current = setInterval(() => {
          setDuration(prev => prev + 1);
        }, 1000);
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

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(t => t.enabled = !t.enabled);
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream && type === 'video') {
      localStream.getVideoTracks().forEach(t => t.enabled = !t.enabled);
      setIsVideoOff(!isVideoOff);
    }
  };

  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 bg-bg-main z-[100] flex flex-col items-center justify-between p-6 md:p-12 text-white overflow-hidden">
      {/* Gizli Ses Elementi (Sadece Sesli Aramalar veya Yedek İçin) */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-brand/5 rounded-full blur-[150px] pointer-events-none"></div>
      
      {type === 'video' && remoteStream && (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={cn("absolute inset-0 w-full h-full object-cover transition-opacity duration-1000", isVideoOff ? "opacity-0" : "opacity-40")}
        />
      )}

      {/* Üst Kısım: Profil ve Durum */}
      <div className="relative z-10 flex flex-col items-center gap-4 md:gap-6 mt-8 md:mt-16">
        <div className="relative group">
          <div className="absolute inset-0 bg-brand/20 rounded-3xl md:rounded-[3rem] blur-2xl group-hover:bg-brand/30 transition-all duration-500"></div>
          <img src={targetAvatar} className="w-24 h-24 md:w-40 md:h-40 rounded-3xl md:rounded-[3rem] object-cover border-4 border-white/10 shadow-2xl relative z-10" />
          
          {type === 'video' && localStream && (
            <div className="absolute -bottom-4 -right-4 md:-bottom-6 md:-right-6 w-24 h-32 md:w-32 md:h-44 bg-bg-card rounded-2xl border border-white/10 overflow-hidden shadow-2xl z-20 group-hover:scale-110 transition-transform">
              <video ref={localVideoRef} autoPlay muted playsInline className={cn("w-full h-full object-cover", isVideoOff && "hidden")} />
              {isVideoOff && <div className="w-full h-full flex items-center justify-center bg-bg-card"><User className="w-8 h-8 md:w-10 md:h-10 text-text-dim/20" /></div>}
            </div>
          )}
        </div>
        
        <div className="text-center space-y-1 md:space-y-2 relative z-10">
          <h2 className="text-2xl md:text-4xl font-bold tracking-tight text-white truncate max-w-[250px] md:max-w-none">{targetName}</h2>
          <div className="flex items-center justify-center gap-2 md:gap-3">
            <div className={cn("w-1.5 h-1.5 md:w-2 md:h-2 rounded-full", callStatus === 'in-call' ? "bg-brand animate-pulse" : "bg-red-500 animate-bounce")}></div>
            <p className="text-brand font-bold uppercase tracking-[0.2em] md:tracking-[0.3em] text-[10px] md:text-xs">
              {callStatus === 'in-call' ? formatDuration(duration) : status}
            </p>
          </div>
        </div>
      </div>

      {/* Alt Kısım: Kontroller */}
      <div className="relative z-10 flex items-center gap-4 md:gap-6 mb-8 md:mb-16 px-6 py-3 md:px-8 md:py-4 bg-white/5 backdrop-blur-2xl rounded-3xl md:rounded-[2.5rem] border border-white/10 shadow-2xl">
        {callStatus === 'calling' && incomingCall && !isAnswered ? (
          <div className="flex items-center gap-4 md:gap-6">
            <button onClick={answerCall} className="w-16 h-16 md:w-20 md:h-20 bg-brand text-white rounded-2xl md:rounded-3xl flex items-center justify-center shadow-lg hover:scale-110 animate-pulse transition-all">
              {type === 'video' ? <VideoIcon className="w-7 h-7 md:w-8 md:h-8" /> : <Phone className="w-7 h-7 md:w-8 md:h-8" />}
            </button>
            <button onClick={onClose} className="w-16 h-16 md:w-20 md:h-20 bg-red-500 text-white rounded-2xl md:rounded-3xl flex items-center justify-center shadow-lg hover:scale-110 transition-all">
              <PhoneOff className="w-7 h-7 md:w-8 md:h-8" />
            </button>
          </div>
        ) : (
          <>
            <button onClick={toggleMute} className={cn("w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl flex items-center justify-center transition-all", isMuted ? 'bg-white text-bg-main shadow-xl' : 'bg-white/5 text-white hover:bg-white/10')}>
              {isMuted ? <MicOff className="w-5 h-5 md:w-6 md:h-6" /> : <Mic className="w-5 h-5 md:w-6 md:h-6" />}
            </button>

            {type === 'video' && (
              <button onClick={toggleVideo} className={cn("w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl flex items-center justify-center transition-all", isVideoOff ? 'bg-white text-bg-main shadow-xl' : 'bg-white/5 text-white hover:bg-white/10')}>
                {isVideoOff ? <VideoOff className="w-5 h-5 md:w-6 md:h-6" /> : <VideoIcon className="w-5 h-5 md:w-6 md:h-6" />}
              </button>
            )}

            <button onClick={onClose} className="w-12 h-12 md:w-14 md:h-14 bg-red-500 text-white rounded-xl md:rounded-2xl flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-all">
              <PhoneOff className="w-5 h-5 md:w-6 md:h-6" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}