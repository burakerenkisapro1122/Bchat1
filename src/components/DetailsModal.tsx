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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-md rounded-lg shadow-xl overflow-hidden">
        <div className="relative h-64 bg-gray-200">
          <img src={displayAvatar} className="w-full h-full object-cover" />
          <button 
            onClick={onClose}
            className="absolute top-4 left-4 p-2 bg-black/20 hover:bg-black/40 rounded-full text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/60 to-transparent text-white">
            <h2 className="text-2xl font-bold">{displayName}</h2>
            <p className="text-sm opacity-80">
              {isUser ? 'Kullanıcı Profili' : 'Grup Bilgisi'}
            </p>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <Info className="w-5 h-5 text-gray-400 mt-1" />
              <div>
                <p className="text-sm text-gray-500">{isUser ? 'Hakkımda' : 'Grup Açıklaması'}</p>
                <p className="text-gray-800">
                  {isUser ? (profile?.bio || 'Hey there! I am using B-Chat.') : 'Bu bir grup sohbetidir.'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <Calendar className="w-5 h-5 text-gray-400 mt-1" />
              <div>
                <p className="text-sm text-gray-500">Katılma Tarihi</p>
                <p className="text-gray-800">
                  {format(new Date(isUser ? profile!.updated_at : group!.created_at), 'd MMMM yyyy')}
                </p>
              </div>
            </div>

            {!isUser && (
              <div className="flex items-start gap-4">
                <Users className="w-5 h-5 text-gray-400 mt-1" />
                <div>
                  <p className="text-sm text-gray-500">Üye Sayısı</p>
                  <p className="text-gray-800">{group?.members?.length || 0} Üye</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
