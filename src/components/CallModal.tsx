import React, { useState, useEffect, useRef } from 'react';
import { Phone, Video, X, Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff, User } from 'lucide-react';
import { MediaConnection } from 'peerjs';
import { Profile } from '../lib/supabase';
import { getPeer } from '../lib/peer';

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
  const [status, setStatus] = useState(incomingCall ? 'Gelen Arama...' : 'Aranıyor...');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(type === 'audio');
  const [duration, setDuration] = useState(0);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isAnswered, setIsAnswered] = useState(!!incomingCall);
  
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
    <div className="fixed inset-0 bg-[#0b141a] z-[100] flex flex-col items-center justify-between p-12 text-white overflow-hidden">
      {/* Remote Video (Full Screen) */}
      {type === 'video' && remoteStream && !isVideoOff && (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {/* Header Info */}
      <div className="relative z-10 flex flex-col items-center gap-4 mt-12">
        <div className="relative">
          <img src={targetAvatar} className="w-32 h-32 rounded-full object-cover border-4 border-[#00a884] shadow-2xl" />
          
          {/* Local Video (Picture in Picture) */}
          {type === 'video' && localStream && (
            <div className="absolute -bottom-4 -right-4 w-24 h-32 bg-[#202c33] rounded-lg border-2 border-[#00a884] overflow-hidden shadow-xl">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className={`w-full h-full object-cover ${isVideoOff ? 'hidden' : ''}`}
              />
              {isVideoOff && (
                <div className="w-full h-full flex items-center justify-center bg-gray-800">
                  <User className="w-8 h-8 text-gray-500" />
                </div>
              )}
            </div>
          )}
        </div>
        <h2 className="text-3xl font-light drop-shadow-md">{targetName}</h2>
        <p className="text-[#00a884] font-medium uppercase tracking-widest text-sm drop-shadow-md">
          {status === 'Bağlandı' ? formatDuration(duration) : status}
        </p>
      </div>

      {/* Controls */}
      <div className="relative z-10 flex items-center gap-8 mb-12">
        {incomingCall && !isAnswered ? (
          <>
            <button 
              onClick={answerCall}
              className="p-6 bg-[#25d366] hover:bg-[#20bd5c] rounded-full transition-all transform hover:scale-110 shadow-lg animate-bounce"
            >
              {type === 'video' ? <VideoIcon className="w-8 h-8" /> : <Phone className="w-8 h-8" />}
            </button>
            <button 
              onClick={onClose}
              className="p-6 bg-[#ea0038] hover:bg-[#ff003c] rounded-full transition-all transform hover:scale-110 shadow-lg"
            >
              <PhoneOff className="w-8 h-8" />
            </button>
          </>
        ) : (
          <>
            <button 
              onClick={toggleMute}
              className={`p-4 rounded-full transition-all transform hover:scale-110 ${isMuted ? 'bg-white text-black' : 'bg-[#202c33] hover:bg-[#2a3942]'}`}
            >
              {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </button>

            {type === 'video' && (
              <button 
                onClick={toggleVideo}
                className={`p-4 rounded-full transition-all transform hover:scale-110 ${isVideoOff ? 'bg-white text-black' : 'bg-[#202c33] hover:bg-[#2a3942]'}`}
              >
                {isVideoOff ? <VideoOff className="w-6 h-6" /> : <VideoIcon className="w-6 h-6" />}
              </button>
            )}

            <button 
              onClick={onClose}
              className="p-4 bg-[#ea0038] hover:bg-[#ff003c] rounded-full transition-all transform hover:scale-110 shadow-lg"
            >
              <PhoneOff className="w-8 h-8" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
