import { useState, useEffect, useRef } from 'react';
import { supabase, Profile, Conversation } from './lib/supabase';
import Auth from './components/Auth';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import CallModal from './components/CallModal';
import { cn } from './lib/utils';
import { MessageSquare, ChevronLeft } from 'lucide-react';
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
      <div className="h-screen flex flex-col items-center justify-center bg-bg-main gap-4">
        <div className="w-12 h-12 border-2 border-brand/20 border-t-brand rounded-full animate-spin"></div>
        <p className="text-[10px] text-brand font-bold uppercase tracking-[0.2em] animate-pulse">Initializing Secure Session</p>
      </div>
    );
  }

  if (!session || !profile) {
    return <Auth onAuthSuccess={() => {}} />;
  }

  return (
    <div className="h-screen w-screen flex bg-bg-main overflow-hidden overflow-x-hidden">
      <div className="flex w-full h-full overflow-hidden relative">
        {/* Sidebar container with mobile responsiveness */}
        <div className={cn(
          "h-full border-r border-border-subtle transition-all duration-300 ease-in-out z-30 flex-shrink-0",
          selectedConversation ? "hidden md:block w-[380px]" : "w-full md:w-[380px]"
        )}>
          <Sidebar 
            currentUser={profile} 
            onSelectConversation={setSelectedConversation}
            onUpdateProfile={setProfile}
            selectedConversationId={selectedConversation?.id}
          />
        </div>
        
        {/* Chat area with mobile responsiveness */}
        <div className={cn(
          "flex-1 flex flex-col bg-bg-main relative h-full min-w-0",
          !selectedConversation ? "hidden md:flex" : "flex"
        )}>
          {selectedConversation ? (
            <ChatWindow 
              conversation={selectedConversation} 
              currentUser={profile} 
              onUpdateConversation={() => {
                window.dispatchEvent(new CustomEvent('refresh-conversations'));
              }}
              onBack={() => setSelectedConversation(null)}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 md:p-12 bg-bg-main relative overflow-hidden">
              {/* Decorative Background Elements */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] md:w-[500px] h-[300px] md:h-[500px] bg-brand/5 rounded-full blur-[80px] md:blur-[120px] pointer-events-none"></div>
              
              <div className="max-w-md relative z-10 px-4">
                <div className="w-20 h-20 md:w-24 md:h-24 bg-white/5 rounded-[1.5rem] md:rounded-[2rem] flex items-center justify-center mb-6 md:mb-8 mx-auto ring-1 ring-white/10 shadow-2xl rotate-12 hover:rotate-0 transition-transform duration-500">
                  <MessageSquare className="w-8 h-8 md:w-10 md:h-10 text-brand" />
                </div>
                <h1 className="text-2xl md:text-4xl font-bold text-white mb-3 md:mb-4 tracking-tight">Select a conversation</h1>
                <p className="text-xs md:text-sm text-text-dim leading-relaxed font-medium opacity-60">
                  Choose a chat from the sidebar to start messaging.<br className="hidden md:block" />
                  Your conversations are secured with end-to-end encryption.
                </p>
                
                <div className="mt-8 md:mt-12 flex flex-wrap items-center justify-center gap-2 md:gap-4">
                  <div className="px-3 py-1.5 md:px-4 md:py-2 bg-white/5 rounded-full border border-white/5 text-[8px] md:text-[10px] font-bold text-text-dim uppercase tracking-widest">
                    Real-time Sync
                  </div>
                  <div className="px-3 py-1.5 md:px-4 md:py-2 bg-white/5 rounded-full border border-white/5 text-[8px] md:text-[10px] font-bold text-text-dim uppercase tracking-widest">
                    P2P Calling
                  </div>
                  <div className="px-3 py-1.5 md:px-4 md:py-2 bg-white/5 rounded-full border border-white/5 text-[8px] md:text-[10px] font-bold text-text-dim uppercase tracking-widest">
                    Group Chats
                  </div>
                </div>
              </div>
              
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 text-text-dim/30 text-[8px] md:text-[10px] font-bold uppercase tracking-[0.3em] whitespace-nowrap">
                <div className="w-1 h-1 bg-brand rounded-full"></div>
                <span>Premium Communication Suite</span>
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
