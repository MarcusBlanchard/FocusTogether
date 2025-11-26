// Enhanced WebRTC manager for mesh networking (up to 5 participants)

export const rtcConfig: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ],
};

export type SignalType = 'offer' | 'answer' | 'ice-candidate';

export interface SignalData {
  type: SignalType;
  sessionId: string;
  senderId: string;
  targetId: string;
  data: RTCSessionDescriptionInit | RTCIceCandidateInit;
}

export interface PeerStreamInfo {
  peerId: string;
  stream: MediaStream;
  username?: string;
  profileImageUrl?: string;
}

export interface MeshCallbacks {
  onPeerStream?: (info: PeerStreamInfo) => void;
  onPeerDisconnected?: (peerId: string) => void;
  onSignal?: (signal: SignalData) => void;
  onConnectionStateChange?: (peerId: string, state: RTCPeerConnectionState) => void;
}

class MeshWebRTCManager {
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private remoteStreams: Map<string, MediaStream> = new Map();
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private callbacks: MeshCallbacks = {};
  private sessionId: string = '';
  private myUserId: string = '';
  private iceCandidateBuffer: Map<string, RTCIceCandidateInit[]> = new Map();

  setCallbacks(callbacks: MeshCallbacks) {
    this.callbacks = callbacks;
  }

  setSessionId(sessionId: string) {
    this.sessionId = sessionId;
  }

  setMyUserId(userId: string) {
    this.myUserId = userId;
  }

  async getUserMedia(): Promise<MediaStream> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      return this.localStream;
    } catch (error) {
      console.error('[WebRTC Mesh] Error getting user media:', error);
      throw error;
    }
  }

  async getDisplayMedia(): Promise<MediaStream> {
    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      return this.screenStream;
    } catch (error) {
      console.error('[WebRTC Mesh] Error getting display media:', error);
      throw error;
    }
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getScreenStream(): MediaStream | null {
    return this.screenStream;
  }

  getRemoteStreams(): Map<string, MediaStream> {
    return this.remoteStreams;
  }

  getPeerConnection(peerId: string): RTCPeerConnection | undefined {
    return this.peerConnections.get(peerId);
  }

  async initializePeerConnection(peerId: string): Promise<RTCPeerConnection> {
    // Close existing connection if any
    const existing = this.peerConnections.get(peerId);
    if (existing) {
      existing.close();
    }

    const pc = new RTCPeerConnection(rtcConfig);
    this.peerConnections.set(peerId, pc);

    // Add local stream tracks if available
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && this.callbacks.onSignal) {
        this.callbacks.onSignal({
          type: 'ice-candidate',
          sessionId: this.sessionId,
          senderId: this.myUserId,
          targetId: peerId,
          data: event.candidate.toJSON(),
        });
      }
    };

    // Handle incoming tracks
    pc.ontrack = (event) => {
      if (event.streams[0]) {
        this.remoteStreams.set(peerId, event.streams[0]);
        if (this.callbacks.onPeerStream) {
          this.callbacks.onPeerStream({
            peerId,
            stream: event.streams[0],
          });
        }
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log(`[WebRTC Mesh] Peer ${peerId} connection state: ${state}`);
      
      if (this.callbacks.onConnectionStateChange) {
        this.callbacks.onConnectionStateChange(peerId, state);
      }

      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        this.removePeer(peerId);
        if (this.callbacks.onPeerDisconnected) {
          this.callbacks.onPeerDisconnected(peerId);
        }
      }
    };

    console.log(`[WebRTC Mesh] Initialized peer connection for ${peerId}`);
    return pc;
  }

  async createOffer(peerId: string): Promise<RTCSessionDescriptionInit> {
    let pc = this.peerConnections.get(peerId);
    if (!pc) {
      pc = await this.initializePeerConnection(peerId);
    }

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    return offer;
  }

  async createAnswer(peerId: string): Promise<RTCSessionDescriptionInit> {
    const pc = this.peerConnections.get(peerId);
    if (!pc) {
      throw new Error(`No peer connection found for ${peerId}`);
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    return answer;
  }

  async handleOffer(peerId: string, offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    let pc = this.peerConnections.get(peerId);
    if (!pc) {
      pc = await this.initializePeerConnection(peerId);
    }

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    
    // Flush any buffered ICE candidates
    await this.flushIceCandidateBuffer(peerId);
    
    return this.createAnswer(peerId);
  }

  async handleAnswer(peerId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.peerConnections.get(peerId);
    if (!pc) {
      throw new Error(`No peer connection found for ${peerId}`);
    }

    await pc.setRemoteDescription(new RTCSessionDescription(answer));
    
    // Flush any buffered ICE candidates
    await this.flushIceCandidateBuffer(peerId);
  }

  async handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const pc = this.peerConnections.get(peerId);
    if (!pc) {
      // Buffer the ICE candidate until peer connection is created
      if (!this.iceCandidateBuffer.has(peerId)) {
        this.iceCandidateBuffer.set(peerId, []);
      }
      this.iceCandidateBuffer.get(peerId)!.push(candidate);
      console.log(`[WebRTC Mesh] Buffered ICE candidate for ${peerId}`);
      return;
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error(`[WebRTC Mesh] Error adding ICE candidate for ${peerId}:`, error);
    }
  }

  private async flushIceCandidateBuffer(peerId: string) {
    const buffered = this.iceCandidateBuffer.get(peerId);
    if (!buffered || buffered.length === 0) return;

    const pc = this.peerConnections.get(peerId);
    if (!pc) return;

    console.log(`[WebRTC Mesh] Flushing ${buffered.length} buffered ICE candidates for ${peerId}`);
    
    for (const candidate of buffered) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error(`[WebRTC Mesh] Error adding buffered ICE candidate:`, error);
      }
    }

    this.iceCandidateBuffer.delete(peerId);
  }

  removePeer(peerId: string) {
    const pc = this.peerConnections.get(peerId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(peerId);
    }

    this.remoteStreams.delete(peerId);
    console.log(`[WebRTC Mesh] Removed peer ${peerId}`);
  }

  toggleAudio(enabled: boolean) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }

  toggleVideo(enabled: boolean) {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }

  stopScreenShare() {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((track) => track.stop());
      this.screenStream = null;
    }
  }

  close() {
    // Close all peer connections
    for (const [peerId, pc] of Array.from(this.peerConnections.entries())) {
      pc.close();
      this.peerConnections.delete(peerId);
    }

    // Stop local media
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    if (this.screenStream) {
      this.screenStream.getTracks().forEach((track) => track.stop());
      this.screenStream = null;
    }

    // Clear remote streams
    this.remoteStreams.clear();

    console.log('[WebRTC Mesh] Closed all connections');
  }

  getActivePeerCount(): number {
    return this.peerConnections.size;
  }

  getActivePeerIds(): string[] {
    return Array.from(this.peerConnections.keys());
  }
}

export const meshWebRTCManager = new MeshWebRTCManager();
