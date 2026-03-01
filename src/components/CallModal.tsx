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
  const [activeCallUserId, setActiveCallUserId] = useState(targetUserId);
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

        // Handle peer-level errors (like peer-unavailable)
        const errorHandler = (err: any) => {
          if (err.type === 'peer-unavailable') {
            setStatus('Kullanıcı şu an ulaşılamıyor');
            setTimeout(onClose, 3000);
          }
        };
        peer.on('error', errorHandler);

        if (incomingCall) {
          // Wait for user to click answer
          callRef.current = incomingCall;
        } else {
          // Initiate call
          const call = peer.call(targetUserId, stream, { metadata: { type } });
          callRef.current = call;
          handleCall(call);

          // Timeout for connecting
          const timeout = setTimeout(() => {
            if (status === 'Aranıyor...') {
              setStatus('Cevap verilmedi');
              setTimeout(onClose, 3000);
            }
          }, 30000); // 30 seconds timeout

          return () => {
            clearTimeout(timeout);
            peer.off('error', errorHandler);
          };
        }

        return () => {
          peer.off('error', errorHandler);
        };

      } catch (err) {
        console.error('Failed to get local stream', err);
        setStatus('Kamera/Mikrofon erişimi reddedildi');
      }
    };

    const cleanup = startCall();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      if (callRef.current) {
        callRef.current.close();
      }
      cleanup.then(fn => fn?.());
    };
  }, [targetUserId, type]);

  const handleCall = (call: MediaConnection) => {
    call.on('stream', (remoteStream) => {
      setRemoteStream(remoteStream);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      setCallStatus('in-call');
      setStatus('Bağlandı');
      if (!timerRef.current) {
        timerRef.current = setInterval(() => {
          setDuration(prev => prev + 1);
        }, 1000);
      }
    });

    call.on('close', () => {
      onClose();
    });

    call.on('error', (err) => {
      console.error('Call error:', err);
      onClose();
    });
  };

  const answerCall = () => {
    if (callRef.current && localStream) {
      callRef.current.answer(localStream);
      handleCall(callRef.current);
      setIsAnswered(true);
      setCallStatus('in-call');
    }
  };

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream && type === 'video') {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff(!isVideoOff);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 bg-bg-main z-[100] flex flex-col items-center justify-between p-12 text-white overflow-hidden">
      {/* Decorative Background Elements */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-brand/5 rounded-full blur-[150px] pointer-events-none"></div>
      
      {/* Remote Video (Full Screen) */}
      {type === 'video' && remoteStream && !isVideoOff && (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-60"
        />
      )}

      {/* Header Info */}
      <div className="relative z-10 flex flex-col items-center gap-6 mt-16">
        <div className="relative group">
          <div className="absolute inset-0 bg-brand/20 rounded-[3rem] blur-2xl group-hover:bg-brand/30 transition-all duration-500"></div>
          <img 
            src={targetAvatar} 
            className="w-40 h-40 rounded-[3rem] object-cover border-4 border-white/10 shadow-2xl relative z-10" 
          />
          
          {/* Local Video (Picture in Picture) */}
          {type === 'video' && localStream && (
            <div className="absolute -bottom-6 -right-6 w-32 h-44 bg-bg-card rounded-2xl border border-white/10 overflow-hidden shadow-2xl z-20 group-hover:scale-110 transition-transform duration-500">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className={cn("w-full h-full object-cover", isVideoOff && "hidden")}
              />
              {isVideoOff && (
                <div className="w-full h-full flex items-center justify-center bg-bg-card">
                  <User className="w-10 h-10 text-text-dim/20" />
                </div>
              )}
              <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/40 backdrop-blur-md rounded text-[8px] font-bold text-white uppercase tracking-widest">
                You
              </div>
            </div>
          )}
        </div>
        
        <div className="text-center space-y-2 relative z-10">
          <h2 className="text-4xl font-bold tracking-tight text-white">{targetName}</h2>
          <div className="flex items-center justify-center gap-3">
            <div className={cn(
              "w-2 h-2 rounded-full",
              callStatus === 'in-call' ? "bg-brand animate-pulse" : "bg-brand/40"
            )}></div>
            <p className="text-brand font-bold uppercase tracking-[0.3em] text-xs">
              {callStatus === 'in-call' ? formatDuration(duration) : status}
            </p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="relative z-10 flex items-center gap-6 mb-16 px-8 py-4 bg-white/5 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 shadow-2xl">
        {callStatus === 'calling' && incomingCall && !isAnswered ? (
          <div className="flex items-center gap-6">
            <button 
              onClick={answerCall}
              className="w-16 h-16 bg-brand text-white rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:scale-110 active:scale-95 transition-all animate-bounce"
            >
              {type === 'video' ? <VideoIcon className="w-7 h-7" /> : <Phone className="w-7 h-7" />}
            </button>
            <button 
              onClick={onClose}
              className="w-16 h-16 bg-red-500 text-white rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.4)] hover:scale-110 active:scale-95 transition-all"
            >
              <PhoneOff className="w-7 h-7" />
            </button>
          </div>
        ) : (
          <>
            <button 
              onClick={toggleMute}
              className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95",
                isMuted ? 'bg-white text-bg-main shadow-xl' : 'bg-white/5 text-white hover:bg-white/10'
              )}
            >
              {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </button>

            {type === 'video' && (
              <button 
                onClick={toggleVideo}
                className={cn(
                  "w-14 h-14 rounded-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95",
                  isVideoOff ? 'bg-white text-bg-main shadow-xl' : 'bg-white/5 text-white hover:bg-white/10'
                )}
              >
                {isVideoOff ? <VideoOff className="w-6 h-6" /> : <VideoIcon className="w-6 h-6" />}
              </button>
            )}

            <button 
              onClick={onClose}
              className="w-14 h-14 bg-red-500 text-white rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.4)] hover:scale-110 active:scale-95 transition-all"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
