import { Type } from '@sinclair/typebox';

// WebRTC signal types
export const SignalType = Type.Union([
  Type.Literal('offer'),
  Type.Literal('answer'),
  Type.Literal('ice-candidate'),
]);

// Session states
export const SessionState = Type.Union([
  Type.Literal('idle'),
  Type.Literal('waiting'),
  Type.Literal('matched'),
  Type.Literal('in-session'),
]);

// Session types
export const SessionType = Type.Union([
  Type.Literal('solo'),
  Type.Literal('group'),
  Type.Literal('freeRoom'),
]);

// User info for matching
export const UserInfo = Type.Object({
  id: Type.String(),
  username: Type.Union([Type.String(), Type.Null()]),
  profileImageUrl: Type.Union([Type.String(), Type.Null()]),
});

// Match result
export const MatchResult = Type.Object({
  sessionId: Type.String(),
  partner: UserInfo,
});

// Friend info with online status
export const FriendInfo = Type.Object({
  id: Type.String(),
  username: Type.Union([Type.String(), Type.Null()]),
  profileImageUrl: Type.Union([Type.String(), Type.Null()]),
  isOnline: Type.Boolean(),
  isIdle: Type.Boolean(),
});

// Friend invite result
export const InviteResult = Type.Union([
  Type.Object({
    status: Type.Literal('sent'),
    friendId: Type.String(),
  }),
  Type.Object({
    status: Type.Literal('accepted'),
    sessionId: Type.String(),
    partner: UserInfo,
  }),
  Type.Object({
    status: Type.Literal('declined'),
  }),
  Type.Object({
    status: Type.Literal('offline'),
  }),
]);

// WebRTC signal payload
export const SignalPayload = Type.Object({
  type: SignalType,
  sessionId: Type.String(),
  senderId: Type.Optional(Type.String()),
  targetId: Type.Optional(Type.String()),
  data: Type.Any(),
});

// Queue status
export const QueueStatus = Type.Object({
  status: Type.Union([
    Type.Literal('joined'),
    Type.Literal('already-in-queue'),
    Type.Literal('already-matched'),
  ]),
  position: Type.Optional(Type.Number()),
});

// Request/Response types for procedures
export const JoinQueueRequest = Type.Object({
  userId: Type.String(),
  sessionType: Type.Optional(SessionType),
});

export const JoinQueueResponse = Type.Object({
  status: Type.Union([
    Type.Literal('joined'),
    Type.Literal('already-in-queue'),
    Type.Literal('already-matched'),
  ]),
  position: Type.Optional(Type.Number()),
  sessionId: Type.Optional(Type.String()),
});

export const LeaveQueueRequest = Type.Object({
  userId: Type.String(),
});

export const LeaveQueueResponse = Type.Object({
  success: Type.Boolean(),
});

export const HeartbeatRequest = Type.Object({
  userId: Type.String(),
});

export const HeartbeatResponse = Type.Object({
  acknowledged: Type.Boolean(),
  serverTime: Type.Number(),
});

export const DisconnectRequest = Type.Object({
  userId: Type.String(),
  sessionId: Type.Optional(Type.String()),
});

export const DisconnectResponse = Type.Object({
  success: Type.Boolean(),
});

export const SendSignalRequest = SignalPayload;

export const SendSignalResponse = Type.Object({
  delivered: Type.Boolean(),
});

// Friend-related request/response types
export const AddFriendRequest = Type.Object({
  userId: Type.String(),
  friendId: Type.String(),
});

export const AddFriendResponse = Type.Object({
  success: Type.Boolean(),
  message: Type.Optional(Type.String()),
});

export const RemoveFriendRequest = Type.Object({
  userId: Type.String(),
  friendId: Type.String(),
});

export const RemoveFriendResponse = Type.Object({
  success: Type.Boolean(),
});

export const GetFriendsRequest = Type.Object({
  userId: Type.String(),
});

export const GetFriendsResponse = Type.Object({
  friends: Type.Array(FriendInfo),
});

export const InviteFriendRequest = Type.Object({
  userId: Type.String(),
  friendId: Type.String(),
});

export const InviteFriendResponse = InviteResult;

export const RespondToInviteRequest = Type.Object({
  userId: Type.String(),
  inviterId: Type.String(),
  accept: Type.Boolean(),
});

export const RespondToInviteResponse = Type.Object({
  success: Type.Boolean(),
  sessionId: Type.Optional(Type.String()),
  partner: Type.Optional(UserInfo),
});

// Free room request/response types
export const CreateFreeRoomRequest = Type.Object({
  userId: Type.String(),
  title: Type.Optional(Type.String()),
});

export const CreateFreeRoomResponse = Type.Object({
  sessionId: Type.String(),
});

export const JoinFreeRoomRequest = Type.Object({
  userId: Type.String(),
  sessionId: Type.String(),
});

export const JoinFreeRoomResponse = Type.Object({
  success: Type.Boolean(),
});

export const GetFreeRoomsRequest = Type.Object({});

export const FreeRoomInfo = Type.Object({
  sessionId: Type.String(),
  title: Type.String(),
  participantCount: Type.Number(),
  maxCapacity: Type.Number(),
  hostId: Type.String(),
});

export const GetFreeRoomsResponse = Type.Object({
  rooms: Type.Array(FreeRoomInfo),
});

export const LeaveRoomRequest = Type.Object({
  userId: Type.String(),
  sessionId: Type.String(),
});

export const LeaveRoomResponse = Type.Object({
  success: Type.Boolean(),
});

// Join scheduled session request/response types
export const JoinScheduledSessionRequest = Type.Object({
  userId: Type.String(),
  sessionId: Type.String(),
});

export const JoinScheduledSessionResponse = Type.Object({
  success: Type.Boolean(),
  participants: Type.Optional(Type.Array(UserInfo)),
  error: Type.Optional(Type.String()),
});

// Subscription event types
export const MatchedEvent = Type.Object({
  type: Type.Literal('matched'),
  sessionId: Type.String(),
  partner: Type.Optional(UserInfo),
  sessionType: Type.Optional(SessionType),
  participants: Type.Optional(Type.Array(UserInfo)),
});

export const PartnerDisconnectedEvent = Type.Object({
  type: Type.Literal('partner-disconnected'),
  sessionId: Type.String(),
});

export const ParticipantJoinedEvent = Type.Object({
  type: Type.Literal('participant-joined'),
  sessionId: Type.String(),
  participant: UserInfo,
});

export const ParticipantLeftEvent = Type.Object({
  type: Type.Literal('participant-left'),
  sessionId: Type.String(),
  participant: Type.Object({
    id: Type.String(),
    username: Type.Union([Type.String(), Type.Null()]),
  }),
});

export const RoomJoinedEvent = Type.Object({
  type: Type.Literal('room-joined'),
  sessionId: Type.String(),
  sessionType: SessionType,
  participants: Type.Array(UserInfo),
});

export const RoomEndedEvent = Type.Object({
  type: Type.Literal('room-ended'),
  sessionId: Type.String(),
});

export const SessionExpiredEvent = Type.Object({
  type: Type.Literal('session-expired'),
  sessionId: Type.String(),
  reason: Type.Literal('no-participants'),
});

export const InviteReceivedEvent = Type.Object({
  type: Type.Literal('invite-received'),
  inviter: UserInfo,
});

export const InviteResponseEvent = Type.Object({
  type: Type.Literal('invite-response'),
  accepted: Type.Boolean(),
  sessionId: Type.Optional(Type.String()),
  partner: Type.Optional(UserInfo),
});

export const SignalReceivedEvent = Type.Object({
  type: Type.Literal('signal'),
  signal: SignalPayload,
});

// Session update events for real-time notifications
export const SessionUpdatedEvent = Type.Object({
  type: Type.Literal('session-updated'),
  sessionId: Type.String(),
  status: Type.Optional(Type.String()),
});

export const PartnerCancelledEvent = Type.Object({
  type: Type.Literal('partner-cancelled'),
  sessionId: Type.String(),
  cancelledBy: Type.Object({
    id: Type.String(),
    username: Type.Union([Type.String(), Type.Null()]),
    firstName: Type.Union([Type.String(), Type.Null()]),
    lastName: Type.Union([Type.String(), Type.Null()]),
  }),
});

export const AutoRematchedEvent = Type.Object({
  type: Type.Literal('auto-rematched'),
  originalSessionId: Type.String(),
  newSessionId: Type.String(),
  cancelledBy: Type.Object({
    id: Type.String(),
    username: Type.Union([Type.String(), Type.Null()]),
  }),
  newMatch: Type.Object({
    id: Type.String(),
    username: Type.Union([Type.String(), Type.Null()]),
    firstName: Type.Union([Type.String(), Type.Null()]),
    lastName: Type.Union([Type.String(), Type.Null()]),
  }),
});

export const MatchFoundEvent = Type.Object({
  type: Type.Literal('match-found'),
  sessionId: Type.String(),
  partner: Type.Object({
    id: Type.String(),
    username: Type.Union([Type.String(), Type.Null()]),
    firstName: Type.Union([Type.String(), Type.Null()]),
    lastName: Type.Union([Type.String(), Type.Null()]),
    profileImageUrl: Type.Union([Type.String(), Type.Null()]),
  }),
});

export const SessionEvent = Type.Union([
  MatchedEvent,
  PartnerDisconnectedEvent,
  ParticipantJoinedEvent,
  ParticipantLeftEvent,
  RoomJoinedEvent,
  RoomEndedEvent,
  SessionExpiredEvent,
  InviteReceivedEvent,
  InviteResponseEvent,
  SignalReceivedEvent,
  SessionUpdatedEvent,
  PartnerCancelledEvent,
  AutoRematchedEvent,
  MatchFoundEvent,
]);
