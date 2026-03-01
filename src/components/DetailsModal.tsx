import React from 'react';
import { Profile, Group } from '../lib/supabase';
import { X, User, Users, Info, Calendar } from 'lucide-react';
import { format } from 'date-fns';

interface DetailsModalProps {
  type: 'user' | 'group';
  data: Profile | Group;
  onClose: () => void;
}

export default function DetailsModal({ type, data, onClose }: DetailsModalProps) {
  const isUser = type === 'user';
  const profile = isUser ? (data as Profile) : null;
  const group = !isUser ? (data as Group) : null;

  const displayName = isUser ? profile?.username : group?.name;
  const displayAvatar = isUser 
    ? profile?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile?.username}`
    : group?.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${group?.name}`;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-6 animate-in fade-in duration-300">
      <div className="bg-bg-card w-full max-w-md rounded-[2.5rem] border border-border-subtle shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="relative h-80 bg-bg-sidebar">
          <img src={displayAvatar} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-bg-card via-bg-card/20 to-transparent"></div>
          
          <button 
            onClick={onClose}
            className="absolute top-6 left-6 p-2 bg-black/20 hover:bg-brand rounded-xl text-white transition-all backdrop-blur-md border border-white/10"
          >
            <X className="w-5 h-5" />
          </button>
          
          <div className="absolute bottom-0 left-0 right-0 p-8">
            <div className="flex items-center gap-2 mb-2">
              <div className="px-2 py-0.5 bg-brand/20 border border-brand/30 rounded text-[9px] font-bold text-brand uppercase tracking-widest">
                {isUser ? 'Profile' : 'Collective'}
              </div>
            </div>
            <h2 className="text-3xl font-bold text-white tracking-tight">{displayName}</h2>
            <p className="text-xs text-text-dim font-medium mt-1 opacity-80">
              {isUser ? `@${profile?.username}` : 'Group Conversation'}
            </p>
          </div>
        </div>

        <div className="p-8 space-y-8">
          <div className="space-y-6">
            <div className="flex items-start gap-5 group">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-text-dim group-hover:text-brand transition-colors border border-white/5">
                <Info className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-bold text-text-dim uppercase tracking-widest mb-1">About</p>
                <p className="text-sm text-white/80 leading-relaxed font-medium">
                  {isUser ? (profile?.bio || 'No bio provided.') : 'A secure space for group communication.'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-5 group">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-text-dim group-hover:text-brand transition-colors border border-white/5">
                <Calendar className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-bold text-text-dim uppercase tracking-widest mb-1">Established</p>
                <p className="text-sm text-white/80 font-medium">
                  {format(new Date(isUser ? profile!.updated_at : group!.created_at), 'MMMM d, yyyy')}
                </p>
              </div>
            </div>

            {!isUser && (
              <div className="flex items-start gap-5 group">
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-text-dim group-hover:text-brand transition-colors border border-white/5">
                  <Users className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-bold text-text-dim uppercase tracking-widest mb-1">Population</p>
                  <p className="text-sm text-white/80 font-medium">{group?.members?.length || 0} Members</p>
                </div>
              </div>
            )}
          </div>
          
          <button 
            onClick={onClose}
            className="w-full py-4 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl text-sm font-bold text-white transition-all active:scale-[0.98]"
          >
            Close Details
          </button>
        </div>
      </div>
    </div>
  );
}
