// Enhanced WebRTC manager for mesh networking (up to 5 participants)

export const rtcConfig: RTCConfiguration = {
  iceServers: [
    // STUN servers for NAT traversal (public, no auth required)
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    // Metered.ca free TURN servers (generous free tier)
    {
      urls: 'stun:stun.relay.metered.ca:80',
    },
    {
      urls: 'turn:global.relay.metered.ca:80',
      username: 'e8dd65d92de6ad1e38cce953',
      credential: 'dJGq9j3cQZKf/Bwo',
    },
    {
      urls: 'turn:global.relay.metered.ca:80?transport=tcp',
      username: 'e8dd65d92de6ad1e38cce953',
      credential: 'dJGq9j3cQZKf/Bwo',
    },
    {
      urls: 'turn:global.relay.metered.ca:443',
      username: 'e8dd65d92de6ad1e38cce953',
      credential: 'dJGq9j3cQZKf/Bwo',
    },
    {
      urls: 'turns:global.relay.metered.ca:443?transport=tcp',
      username: 'e8dd65d92de6ad1e38cce953',
      credential: 'dJGq9j3cQZKf/Bwo',
    },
  ],
  // Allow more ICE candidate gathering time
  iceCandidatePoolSize: 10,
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
  isScreenShare?: boolean;
  username?: string;
  profileImageUrl?: string;
}

export interface DataChannelMessage {
  type: 'screen-blur' | 'screen-share-start' | 'screen-share-stop';
  data?: unknown;
}

export interface MeshCallbacks {
  onPeerStream?: (info: PeerStreamInfo) => void;
  onPeerScreenStream?: (peerId: string, stream: MediaStream | null) => void;
  onPeerScreenBlur?: (peerId: string, blurred: boolean) => void;
  onPeerDisconnected?: (peerId: string) => void;
  onSignal?: (signal: SignalData) => void;
  onConnectionStateChange?: (peerId: string, state: RTCPeerConnectionState) => void;
}

export interface MediaCapabilities {
  hasVideo: boolean;
  hasAudio: boolean;
  videoError?: string;
  audioError?: string;
}

// Track kind used to identify screen share streams
const SCREEN_SHARE_STREAM_ID_PREFIX = 'screen-share-';

class MeshWebRTCManager {
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private remoteStreams: Map<string, MediaStream> = new Map();
  private remoteScreenStreams: Map<string, MediaStream> = new Map();
  private remoteScreenBlurred: Map<string, boolean> = new Map();
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private screenBlurred: boolean = false;
  private callbacks: MeshCallbacks = {};
  private sessionId: string = '';
  private myUserId: string = '';
  private iceCandidateBuffer: Map<string, RTCIceCandidateInit[]> = new Map();
  private mediaCapabilities: MediaCapabilities = { hasVideo: false, hasAudio: false };

  setCallbacks(callbacks: MeshCallbacks) {
    this.callbacks = callbacks;
  }

  setSessionId(sessionId: string) {
    this.sessionId = sessionId;
  }

  setMyUserId(userId: string) {
    this.myUserId = userId;
  }

  getMediaCapabilities(): MediaCapabilities {
    return { ...this.mediaCapabilities };
  }

  getRemoteScreenBlurred(peerId: string): boolean {
    return this.remoteScreenBlurred.get(peerId) || false;
  }

  getRemoteScreenStream(peerId: string): MediaStream | null {
    return this.remoteScreenStreams.get(peerId) || null;
  }

  async getUserMedia(): Promise<MediaStream> {
    this.mediaCapabilities = { hasVideo: false, hasAudio: false };
    
    // Try to get both video and audio first
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      this.mediaCapabilities = { hasVideo: true, hasAudio: true };
      console.log('[WebRTC Mesh] Got both video and audio');
      return this.localStream;
    } catch (error) {
      console.warn('[WebRTC Mesh] Failed to get video+audio, trying fallbacks:', error);
    }

    // Fallback: Try audio only
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true,
      });
      this.mediaCapabilities = { hasVideo: false, hasAudio: true, videoError: 'Camera not available' };
      console.log('[WebRTC Mesh] Got audio only (no video)');
      return this.localStream;
    } catch (error) {
      console.warn('[WebRTC Mesh] Failed to get audio only:', error);
      this.mediaCapabilities.audioError = 'Microphone not available';
    }

    // Fallback: Try video only
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      this.mediaCapabilities = { 
        hasVideo: true, 
        hasAudio: false, 
        audioError: 'Microphone not available' 
      };
      console.log('[WebRTC Mesh] Got video only (no audio)');
      return this.localStream;
    } catch (error) {
      console.warn('[WebRTC Mesh] Failed to get video only:', error);
      this.mediaCapabilities.videoError = 'Camera not available';
    }

    // No media available - create empty stream so WebRTC can still work
    console.log('[WebRTC Mesh] No media devices available, continuing without local media');
    this.mediaCapabilities = {
      hasVideo: false,
      hasAudio: false,
      videoError: 'Camera not available',
      audioError: 'Microphone not available',
    };
    
    // Create an empty MediaStream so the session can still proceed
    this.localStream = new MediaStream();
    return this.localStream;
  }

  async getDisplayMedia(): Promise<MediaStream> {
    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      
      // Create a new stream with a specific ID to identify it as screen share
      const screenShareStream = new MediaStream();
      this.screenStream.getTracks().forEach(track => {
        screenShareStream.addTrack(track);
      });
      
      // Store reference and add to all peer connections
      this.screenStream = screenShareStream;
      
      // Add screen tracks to all existing peer connections
      this.screenStream.getTracks().forEach((track) => {
        this.peerConnections.forEach((pc) => {
          pc.addTrack(track, this.screenStream!);
        });
      });
      
      // Notify all peers that screen share started
      this.broadcastDataMessage({ type: 'screen-share-start' });
      
      return this.screenStream;
    } catch (error) {
      console.error('[WebRTC Mesh] Error getting display media:', error);
      throw error;
    }
  }

  setScreenBlurred(blurred: boolean) {
    this.screenBlurred = blurred;
    // Broadcast blur state to all peers
    this.broadcastDataMessage({ type: 'screen-blur', data: blurred });
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

  getRemoteScreenStreams(): Map<string, MediaStream> {
    return this.remoteScreenStreams;
  }

  getPeerConnection(peerId: string): RTCPeerConnection | undefined {
    return this.peerConnections.get(peerId);
  }

  private broadcastDataMessage(message: DataChannelMessage) {
    const messageStr = JSON.stringify(message);
    this.dataChannels.forEach((channel, peerId) => {
      if (channel.readyState === 'open') {
        channel.send(messageStr);
        console.log(`[WebRTC Mesh] Sent data message to ${peerId}:`, message);
      }
    });
  }

  private setupDataChannel(peerId: string, channel: RTCDataChannel) {
    this.dataChannels.set(peerId, channel);
    
    channel.onopen = () => {
      console.log(`[WebRTC Mesh] Data channel opened with ${peerId}`);
      // Send current screen share state if we're sharing
      if (this.screenStream) {
        channel.send(JSON.stringify({ type: 'screen-share-start' }));
        channel.send(JSON.stringify({ type: 'screen-blur', data: this.screenBlurred }));
      }
    };
    
    channel.onmessage = (event) => {
      try {
        const message: DataChannelMessage = JSON.parse(event.data);
        console.log(`[WebRTC Mesh] Received data message from ${peerId}:`, message);
        
        switch (message.type) {
          case 'screen-blur':
            this.remoteScreenBlurred.set(peerId, message.data as boolean);
            if (this.callbacks.onPeerScreenBlur) {
              this.callbacks.onPeerScreenBlur(peerId, message.data as boolean);
            }
            break;
          case 'screen-share-start':
            // The screen stream will be received via ontrack
            break;
          case 'screen-share-stop':
            this.remoteScreenStreams.delete(peerId);
            this.remoteScreenBlurred.delete(peerId);
            if (this.callbacks.onPeerScreenStream) {
              this.callbacks.onPeerScreenStream(peerId, null);
            }
            break;
        }
      } catch (error) {
        console.error('[WebRTC Mesh] Error parsing data channel message:', error);
      }
    };
    
    channel.onclose = () => {
      console.log(`[WebRTC Mesh] Data channel closed with ${peerId}`);
      this.dataChannels.delete(peerId);
    };
  }

  async initializePeerConnection(peerId: string): Promise<RTCPeerConnection> {
    // Close existing connection if any
    const existing = this.peerConnections.get(peerId);
    if (existing) {
      existing.close();
    }

    const pc = new RTCPeerConnection(rtcConfig);
    this.peerConnections.set(peerId, pc);

    // Create data channel for signaling screen share blur state
    const dataChannel = pc.createDataChannel('control');
    this.setupDataChannel(peerId, dataChannel);

    // Handle incoming data channel (for when we receive connection)
    pc.ondatachannel = (event) => {
      this.setupDataChannel(peerId, event.channel);
    };

    // Add local stream tracks if available (handles empty streams gracefully)
    if (this.localStream) {
      const tracks = this.localStream.getTracks();
      if (tracks.length > 0) {
        tracks.forEach((track) => {
          pc.addTrack(track, this.localStream!);
        });
        console.log(`[WebRTC Mesh] Added ${tracks.length} local tracks to peer ${peerId}`);
      } else {
        console.log(`[WebRTC Mesh] No local tracks available for peer ${peerId} (no camera/mic)`);
      }
    }
    
    // Add screen share tracks if available
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.screenStream!);
      });
    }

    // Handle negotiation needed (for adding/removing tracks)
    pc.onnegotiationneeded = async () => {
      try {
        console.log('[WebRTC Mesh] Negotiation needed for', peerId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        if (this.callbacks.onSignal) {
          this.callbacks.onSignal({
            type: 'offer',
            sessionId: this.sessionId,
            senderId: this.myUserId,
            targetId: peerId,
            data: offer,
          });
        }
      } catch (error) {
        console.error('[WebRTC Mesh] Error during renegotiation:', error);
      }
    };

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

    // Track stream IDs we've seen to distinguish between camera and screen
    const seenStreamIds = new Set<string>();

    // Handle incoming tracks
    pc.ontrack = (event) => {
      if (event.streams[0]) {
        const stream = event.streams[0];
        const streamId = stream.id;
        const track = event.track;
        
        console.log(`[WebRTC Mesh] Received track from ${peerId}:`, {
          kind: track.kind,
          label: track.label,
          streamId,
          trackId: track.id,
        });

        // Check if this is a new stream (likely screen share)
        // The first stream we receive is usually the camera stream
        // Subsequent streams are likely screen shares
        if (!seenStreamIds.has(streamId)) {
          const streamCount = seenStreamIds.size;
          seenStreamIds.add(streamId);
          
          if (streamCount === 0) {
            // First stream is camera
            this.remoteStreams.set(peerId, stream);
            if (this.callbacks.onPeerStream) {
              this.callbacks.onPeerStream({
                peerId,
                stream,
                isScreenShare: false,
              });
            }
          } else {
            // Subsequent streams are screen shares
            this.remoteScreenStreams.set(peerId, stream);
            if (this.callbacks.onPeerScreenStream) {
              this.callbacks.onPeerScreenStream(peerId, stream);
            }
          }
        } else {
          // Update existing stream
          if (seenStreamIds.size === 1) {
            this.remoteStreams.set(peerId, stream);
            if (this.callbacks.onPeerStream) {
              this.callbacks.onPeerStream({
                peerId,
                stream,
                isScreenShare: false,
              });
            }
          }
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

    // Handle ICE connection state for better debugging and ICE restart
    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState;
      console.log(`[WebRTC Mesh] Peer ${peerId} ICE state: ${iceState}`);
      
      if (iceState === 'failed') {
        console.error(`[WebRTC Mesh] ICE failed for ${peerId} - attempting ICE restart`);
        // Attempt ICE restart
        this.restartIce(peerId);
      } else if (iceState === 'disconnected') {
        console.warn(`[WebRTC Mesh] ICE disconnected for ${peerId} - will attempt restart if it doesn't recover`);
        // Give it a few seconds to recover before restarting
        setTimeout(() => {
          const currentPc = this.peerConnections.get(peerId);
          if (currentPc && currentPc.iceConnectionState === 'disconnected') {
            console.log(`[WebRTC Mesh] ICE still disconnected for ${peerId} - attempting restart`);
            this.restartIce(peerId);
          }
        }, 3000);
      } else if (iceState === 'connected') {
        console.log(`[WebRTC Mesh] ICE connected to ${peerId} - media should flow`);
      }
    };

    // Log ICE gathering state
    pc.onicegatheringstatechange = () => {
      console.log(`[WebRTC Mesh] Peer ${peerId} ICE gathering: ${pc.iceGatheringState}`);
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

  // Restart ICE when connection fails
  private async restartIce(peerId: string) {
    const pc = this.peerConnections.get(peerId);
    if (!pc) {
      console.warn(`[WebRTC Mesh] Cannot restart ICE - no connection for ${peerId}`);
      return;
    }

    try {
      console.log(`[WebRTC Mesh] Restarting ICE for ${peerId}`);
      
      // Create a new offer with ICE restart flag
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      
      // Signal the new offer to the peer
      if (this.callbacks.onSignal) {
        this.callbacks.onSignal({
          type: 'offer',
          sessionId: this.sessionId,
          senderId: this.myUserId,
          targetId: peerId,
          data: offer,
        });
      }
      
      console.log(`[WebRTC Mesh] ICE restart offer sent to ${peerId}`);
    } catch (error) {
      console.error(`[WebRTC Mesh] ICE restart failed for ${peerId}:`, error);
    }
  }

  removePeer(peerId: string) {
    const pc = this.peerConnections.get(peerId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(peerId);
    }

    this.remoteStreams.delete(peerId);
    this.remoteScreenStreams.delete(peerId);
    this.remoteScreenBlurred.delete(peerId);
    this.dataChannels.delete(peerId);
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
      // Notify all peers that screen share stopped
      this.broadcastDataMessage({ type: 'screen-share-stop' });
      
      // Remove screen tracks from all peer connections
      const screenTracks = this.screenStream.getTracks();
      this.peerConnections.forEach((pc) => {
        const senders = pc.getSenders();
        senders.forEach((sender) => {
          if (sender.track && screenTracks.includes(sender.track)) {
            pc.removeTrack(sender);
          }
        });
      });
      
      // Stop the screen tracks
      screenTracks.forEach((track) => track.stop());
      this.screenStream = null;
      this.screenBlurred = false;
    }
  }

  close() {
    // Close all peer connections
    for (const [peerId, pc] of Array.from(this.peerConnections.entries())) {
      pc.close();
      this.peerConnections.delete(peerId);
    }

    // Clear data channels
    this.dataChannels.clear();

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
    this.remoteScreenStreams.clear();
    this.remoteScreenBlurred.clear();

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
