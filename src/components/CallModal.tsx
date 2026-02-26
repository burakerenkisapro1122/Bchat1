import React, { useState, useEffect, useRef } from 'react';
import { Phone, Video, X, Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff } from 'lucide-react';

interface CallModalProps {
  type: 'audio' | 'video';
  targetName: string;
  targetAvatar: string;
  onClose: () => void;
}

export default function CallModal({ type, targetName, targetAvatar, onClose }: CallModalProps) {
  const [status, setStatus] = useState('Aranıyor...');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(type === 'audio');
  const [duration, setDuration] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Simulate call connecting after 2 seconds
    const connectTimer = setTimeout(() => {
      setStatus('Bağlandı');
      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    }, 2000);

    return () => {
      clearTimeout(connectTimer);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 bg-[#0b141a] z-[100] flex flex-col items-center justify-between p-12 text-white">
      <div className="flex flex-col items-center gap-4 mt-12">
        <div className="relative">
          <img src={targetAvatar} className="w-32 h-32 rounded-full object-cover border-4 border-[#00a884]" />
          {type === 'video' && !isVideoOff && (
            <div className="absolute -bottom-2 -right-2 w-12 h-12 bg-[#202c33] rounded-lg border-2 border-[#00a884] overflow-hidden">
              <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                <User className="w-6 h-6 text-gray-500" />
              </div>
            </div>
          )}
        </div>
        <h2 className="text-3xl font-light">{targetName}</h2>
        <p className="text-[#00a884] font-medium uppercase tracking-widest text-sm">
          {status === 'Bağlandı' ? formatDuration(duration) : status}
        </p>
      </div>

      {type === 'video' && !isVideoOff && (
        <div className="absolute inset-0 z-[-1] bg-gray-900">
          <div className="w-full h-full flex items-center justify-center opacity-20">
            <VideoIcon className="w-32 h-32" />
          </div>
        </div>
      )}

      <div className="flex items-center gap-8 mb-12">
        <button 
          onClick={() => setIsMuted(!isMuted)}
          className={`p-4 rounded-full transition-colors ${isMuted ? 'bg-white text-black' : 'bg-[#202c33] hover:bg-[#2a3942]'}`}
        >
          {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>

        {type === 'video' && (
          <button 
            onClick={() => setIsVideoOff(!isVideoOff)}
            className={`p-4 rounded-full transition-colors ${isVideoOff ? 'bg-white text-black' : 'bg-[#202c33] hover:bg-[#2a3942]'}`}
          >
            {isVideoOff ? <VideoOff className="w-6 h-6" /> : <VideoIcon className="w-6 h-6" />}
          </button>
        )}

        <button 
          onClick={onClose}
          className="p-4 bg-[#ea0038] hover:bg-[#ff003c] rounded-full transition-colors"
        >
          <PhoneOff className="w-8 h-8" />
        </button>
      </div>
    </div>
  );
}

function User({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}
