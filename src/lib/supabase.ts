import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing. Please check your .env file.');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

export type Profile = {
  id: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  is_visible: boolean;
  updated_at: string;
};

export type Conversation = {
  id: string;
  created_at: string;
  last_message?: Message;
  participants?: Participant[];
  // UI helper fields
  is_group?: boolean;
  name?: string | null;
  avatar_url?: string | null;
  owner_id?: string | null;
  is_joinable?: boolean;
};

export type Group = {
  id: string;
  name: string;
  avatar_url: string | null;
  owner_id: string | null;
  is_joinable: boolean;
  created_at: string;
  last_message?: Message;
  members?: GroupMember[];
};

export type Participant = {
  conversation_id: string;
  user_id: string;
  profile?: Profile;
};

export type GroupMember = {
  group_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
  profile?: Profile;
};

export type MessageType = 'text' | 'image' | 'video' | 'audio';

export type Message = {
  id: string;
  conversation_id: string | null;
  group_id: string | null;
  sender_id: string;
  content: string | null;
  message_type: MessageType;
  media_url: string | null;
  created_at: string;
  is_read: boolean;
  sender?: Profile;
};
