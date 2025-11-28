// WebRTC configuration with STUN servers
export const rtcConfig: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ],
};

export interface MediaStreamState {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  screenStream: MediaStream | null;
}

export interface MediaCapabilities {
  hasVideo: boolean;
  hasAudio: boolean;
  videoError?: string;
  audioError?: string;
}

export type SignalType = 'offer' | 'answer' | 'ice-candidate';

export interface SignalData {
  type: SignalType;
  sessionId: string;
  data: RTCSessionDescriptionInit | RTCIceCandidateInit;
}

export class WebRTCManager {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private onRemoteStream: ((stream: MediaStream) => void) | null = null;
  private onIceCandidate: ((candidate: RTCIceCandidate) => void) | null = null;
  private onConnectionStateChange: ((state: RTCPeerConnectionState) => void) | null = null;
  private mediaCapabilities: MediaCapabilities = { hasVideo: false, hasAudio: false };

  constructor() {
    this.peerConnection = null;
  }

  getMediaCapabilities(): MediaCapabilities {
    return { ...this.mediaCapabilities };
  }

  setCallbacks(callbacks: {
    onRemoteStream?: (stream: MediaStream) => void;
    onIceCandidate?: (candidate: RTCIceCandidate) => void;
    onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  }) {
    this.onRemoteStream = callbacks.onRemoteStream || null;
    this.onIceCandidate = callbacks.onIceCandidate || null;
    this.onConnectionStateChange = callbacks.onConnectionStateChange || null;
  }

  async initializePeerConnection(): Promise<RTCPeerConnection> {
    if (this.peerConnection) {
      this.peerConnection.close();
    }

    this.peerConnection = new RTCPeerConnection(rtcConfig);

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.onIceCandidate) {
        this.onIceCandidate(event.candidate);
      }
    };

    this.peerConnection.ontrack = (event) => {
      if (this.onRemoteStream && event.streams[0]) {
        this.onRemoteStream(event.streams[0]);
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      if (this.onConnectionStateChange && this.peerConnection) {
        this.onConnectionStateChange(this.peerConnection.connectionState);
      }
    };

    return this.peerConnection;
  }

  async getUserMedia(): Promise<MediaStream | null> {
    this.mediaCapabilities = { hasVideo: false, hasAudio: false };
    
    // Try to get both video and audio first
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      this.mediaCapabilities = { hasVideo: true, hasAudio: true };
      console.log('[WebRTC] Got both video and audio');
      return this.localStream;
    } catch (error) {
      console.warn('[WebRTC] Failed to get video+audio, trying fallbacks:', error);
    }

    // Fallback: Try audio only
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true,
      });
      this.mediaCapabilities = { hasVideo: false, hasAudio: true, videoError: 'Camera not available' };
      console.log('[WebRTC] Got audio only (no video)');
      return this.localStream;
    } catch (error) {
      console.warn('[WebRTC] Failed to get audio only:', error);
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
      console.log('[WebRTC] Got video only (no audio)');
      return this.localStream;
    } catch (error) {
      console.warn('[WebRTC] Failed to get video only:', error);
      this.mediaCapabilities.videoError = 'Camera not available';
    }

    // No media available - create empty stream so WebRTC can still work
    console.log('[WebRTC] No media devices available, continuing without local media');
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
      return this.screenStream;
    } catch (error) {
      console.error('Error getting display media:', error);
      throw error;
    }
  }

  addLocalStream() {
    if (!this.peerConnection || !this.localStream) return;

    const tracks = this.localStream.getTracks();
    if (tracks.length === 0) {
      console.log('[WebRTC] No local tracks to add (no media available)');
      return;
    }

    tracks.forEach((track) => {
      this.peerConnection!.addTrack(track, this.localStream!);
    });
    console.log(`[WebRTC] Added ${tracks.length} local tracks`);
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    return offer;
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    return answer;
  }

  async handleOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) {
      await this.initializePeerConnection();
    }

    await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(offer));
    return this.createAnswer();
  }

  async handleAnswer(answer: RTCSessionDescriptionInit) {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async handleIceCandidate(candidate: RTCIceCandidateInit) {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
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

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getScreenStream(): MediaStream | null {
    return this.screenStream;
  }

  getConnectionState(): RTCPeerConnectionState | null {
    return this.peerConnection?.connectionState || null;
  }

  close() {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    if (this.screenStream) {
      this.screenStream.getTracks().forEach((track) => track.stop());
      this.screenStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
  }
}

export const webrtcManager = new WebRTCManager();
