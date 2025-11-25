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
});

export const JoinQueueResponse = QueueStatus;

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

// Subscription event types
export const MatchedEvent = Type.Object({
  type: Type.Literal('matched'),
  sessionId: Type.String(),
  partner: UserInfo,
});

export const PartnerDisconnectedEvent = Type.Object({
  type: Type.Literal('partner-disconnected'),
  sessionId: Type.String(),
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

export const SessionEvent = Type.Union([
  MatchedEvent,
  PartnerDisconnectedEvent,
  InviteReceivedEvent,
  InviteResponseEvent,
  SignalReceivedEvent,
]);
