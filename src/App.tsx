import { useState, useEffect, useRef } from 'react';
import { supabase, Profile, Conversation } from './lib/supabase';
import Auth from './components/Auth';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import CallModal from './components/CallModal';
import { MessageSquare } from 'lucide-react';
import { getPeer } from './lib/peer';
import { MediaConnection, Peer } from 'peerjs';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [incomingCall, setIncomingCall] = useState<{
    type: 'audio' | 'video';
    caller: Profile;
    call: MediaConnection;
  } | null>(null);
  
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching profile:', error);
    } else {
      setProfile(data);
      initPeer(data);
    }
    setLoading(false);
  };

  const initPeer = (user: Profile) => {
    const peer = getPeer(user.id);
    if (!peer) return;

    peer.on('call', async (call: MediaConnection) => {
      // Fetch caller profile
      const { data: caller } = await supabase
        .from('users')
        .select('*')
        .eq('id', call.peer)
        .single();
      
      if (caller) {
        setIncomingCall({
          type: call.metadata?.type || 'video',
          caller,
          call
        });
      }
    });

    peer.on('error', (err) => {
      console.error('Peer global error:', err);
      if (err.type === 'peer-unavailable') {
        console.warn('Target peer is not available.');
      } else if (err.type === 'server-error') {
        console.error('PeerJS server error. Attempting to reconnect...');
      }
    });
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#f0f2f5]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#25d366]"></div>
      </div>
    );
  }

  if (!session || !profile) {
    return <Auth onAuthSuccess={() => {}} />;
  }

  return (
    <div className="h-screen w-screen flex bg-[#f0f2f5] overflow-hidden">
      <div className="flex w-full h-full max-w-[1600px] mx-auto shadow-2xl">
        <Sidebar 
          currentUser={profile} 
          onSelectConversation={setSelectedConversation}
          onUpdateProfile={setProfile}
          selectedConversationId={selectedConversation?.id}
        />
        
        <div className="flex-1 flex flex-col bg-[#f0f2f5]">
          {selectedConversation ? (
            <ChatWindow 
              conversation={selectedConversation} 
              currentUser={profile} 
              onUpdateConversation={() => {
                // Trigger sidebar refresh
                window.dispatchEvent(new CustomEvent('refresh-conversations'));
              }}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-[#f8f9fa] border-b-[6px] border-[#25d366]">
              <div className="max-w-md">
                <img 
                  src="https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png" 
                  alt="WhatsApp Web" 
                  className="w-64 h-auto mb-8 opacity-50 mx-auto grayscale"
                />
                <h1 className="text-3xl font-light text-gray-600 mb-4">WhatsApp Web</h1>
                <p className="text-sm text-gray-500 leading-relaxed">
                  Send and receive messages without keeping your phone online.<br />
                  Use WhatsApp on up to 4 linked devices and 1 phone at the same time.
                </p>
                <div className="mt-16 flex items-center justify-center gap-2 text-gray-400 text-xs">
                  <MessageSquare className="w-4 h-4" />
                  <span>End-to-end encrypted</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {incomingCall && (
        <CallModal 
          type={incomingCall.type}
          targetUserId={incomingCall.caller.id}
          targetName={incomingCall.caller.username}
          targetAvatar={incomingCall.caller.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${incomingCall.caller.username}`}
          onClose={() => setIncomingCall(null)}
          currentUser={profile}
          incomingCall={incomingCall.call}
        />
      )}
    </div>
  );
}
