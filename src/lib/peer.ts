import { Peer } from 'peerjs';

let peerInstance: Peer | null = null;

export const getPeer = (userId?: string) => {
  if (peerInstance) return peerInstance;
  if (!userId) return null;
  
  peerInstance = new Peer(userId, {
    debug: 2
  });

  return peerInstance;
};

export const destroyPeer = () => {
  if (peerInstance) {
    peerInstance.destroy();
    peerInstance = null;
  }
};
