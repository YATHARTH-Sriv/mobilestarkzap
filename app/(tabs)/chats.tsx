import "@/lib/runtime-polyfills";
import { Ionicons } from "@expo/vector-icons";
import { usePrivy } from "@privy-io/expo";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Animated,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
    useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { API_BASE_URL, WS_BASE_URL } from "@/lib/config";
import { readErrorMessage, shortenAddress } from "@/lib/http";
import {
    connectRealtimeSocket,
    fetchMyProfile,
    fetchMyTransactions,
    formatWeiToStrk,
    type ProfileMeResponse,
    type UserTransactionActivity,
} from "@/lib/profile";
import { hp, ms, wp } from "@/lib/responsive";

type RoomSummary = {
  roomName: string;
  createdAt: string;
  memberCount: number;
  visibility: "public" | "private";
  joinPolicy: "open" | "approval" | "invite_only";
  myMembershipStatus:
    | "active"
    | "pending"
    | "invited"
    | "removed"
    | "banned"
    | null;
  myRole: "owner" | "admin" | "member" | null;
  isMember: boolean;
};

type RoomMember = {
  roomName: string;
  privyUserId: string;
  role: "owner" | "admin" | "member";
  status: "active" | "pending" | "invited" | "removed" | "banned";
  createdByPrivyUserId: string | null;
  createdAt: string;
  updatedAt: string;
  username: string | null;
};

type RoomMessage = {
  id: string;
  type: "message_received";
  room: string;
  userId: string;
  username: string;
  content: string;
  timestamp: string;
};

type RoomContractMarket = {
  id: string;
  marketId: string;
  title?: string;
  deadlineUnix?: string;
  createTxHash?: string;
  createdByWalletAddress: string;
  linkedExternalMarket?: {
    id: string;
    source: string;
    sourceUrl: string;
    title: string;
  };
  createdAt: string;
};

type MarketDetail = {
  market: RoomContractMarket;
  chain: {
    marketId: string;
    questionAscii: string | null;
    creator: string;
    deadlineUnix: string;
    yesPool: string;
    noPool: string;
    totalPool: string;
    resolved: boolean;
    winningOutcome: boolean;
  };
};

type WsServerMessage =
  | { type: "connection"; clientId: string }
  | { type: "error"; message: string }
  | { type: "room_joined"; room: string }
  | { type: "room_left"; room: string }
  | {
      type: "room_access_update";
      room: string;
      status: "pending" | "denied";
      message: string;
    }
  | { type: "message_history"; messages: RoomMessage[] }
  | RoomMessage;

type ActiveMarketCard = {
  id: string;
  marketId: string;
  title: string;
  creator: string;
  creatorWalletAddress: string;
  deadlineUnix: string | null;
  yesPool: string;
  noPool: string;
  totalPool: string;
  resolved: boolean;
  winningOutcome: boolean | null;
  canResolve: boolean;
  isCreator: boolean;
  isMine: boolean;
  hasPlacedBet: boolean;
  hasClaimed: boolean;
  canClaim: boolean;
};

type MarketActionType = "bet" | "resolve" | "claim";

type MarketActionModalState = {
  visible: boolean;
  action: MarketActionType;
  market: ActiveMarketCard | null;
};

const DEFAULT_CREATE_DEADLINE_SECONDS = 2 * 60 * 60;

const MSG = {
  JOIN_ROOM: "join_room",
  LEAVE_ROOM: "leave_room",
  CHAT_MESSAGE: "chat_message",
} as const;

const ROOM_ICONS = [
  "football-outline",
  "trending-up-outline",
  "american-football-outline",
  "basketball-outline",
];

function normalizeHexAddress(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  if (!trimmed.startsWith("0x")) {
    return null;
  }

  const withoutLeading = trimmed.slice(2).replace(/^0+/, "");
  return `0x${withoutLeading || "0"}`;
}

function formatRoomTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) {
    return "-";
  }

  const now = new Date();
  const sameDay = now.toDateString() === date.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatJoinPolicyLabel(joinPolicy: RoomSummary["joinPolicy"]): string {
  if (joinPolicy === "open") {
    return "Open";
  }

  if (joinPolicy === "approval") {
    return "Approval";
  }

  return "Invite only";
}

function formatVisibilityLabel(visibility: RoomSummary["visibility"]): string {
  return visibility === "private" ? "Private" : "Community";
}

function formatRoomStatusLine(room: RoomSummary): string {
  if (room.myMembershipStatus === "pending") {
    return "Request pending admin approval";
  }

  if (room.myMembershipStatus === "invited") {
    return "Invited - tap to join";
  }

  if (room.myMembershipStatus === "banned") {
    return "Access blocked";
  }

  if (room.myMembershipStatus === "removed") {
    return "Removed by admin";
  }

  if (room.isMember) {
    return `${room.memberCount} members active`;
  }

  return `${formatVisibilityLabel(room.visibility)} • ${formatJoinPolicyLabel(room.joinPolicy)}`;
}

function formatRoleLabel(role: RoomMember["role"]): string {
  if (role === "owner") {
    return "Owner";
  }

  if (role === "admin") {
    return "Admin";
  }

  return "Member";
}

function formatMembershipStatusLabel(status: RoomMember["status"]): string {
  if (status === "pending") {
    return "Pending";
  }

  if (status === "invited") {
    return "Invited";
  }

  if (status === "removed") {
    return "Removed";
  }

  if (status === "banned") {
    return "Banned";
  }

  return "Active";
}

function formatMessageTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) {
    return "";
  }
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDeadline(unix: string | null): string {
  if (!unix || !/^\d+$/.test(unix)) {
    return "No deadline";
  }

  const milliseconds = Number(unix) * 1000;
  const date = new Date(milliseconds);
  if (Number.isNaN(date.valueOf())) {
    return "No deadline";
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function parseStrkToWei(value: string): string | null {
  const normalized = value.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }

  const [wholePart, fractionalPart = ""] = normalized.split(".");
  const whole = BigInt(wholePart);
  const fractionPadded = `${fractionalPart}${"0".repeat(18)}`.slice(0, 18);
  const fraction = BigInt(fractionPadded || "0");

  const wei = whole * 10n ** 18n + fraction;
  if (wei <= 0n) {
    return null;
  }

  return wei.toString();
}

function parseOutcomeBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (normalized === "yes" || normalized === "true" || normalized === "1") {
      return true;
    }

    if (normalized === "no" || normalized === "false" || normalized === "0") {
      return false;
    }
  }

  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }

    if (value === 0) {
      return false;
    }
  }

  return null;
}

function formatPoolAsStrk(wei: string): string {
  try {
    return formatWeiToStrk(wei);
  } catch {
    return "0 STRK";
  }
}

function toAsciiTitle(raw: string): string {
  return raw
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .slice(0, 31);
}

function normalizeRoomName(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[^\x20-\x7E]/g, "")
    .slice(0, 40);
}

function normalizeUsernameDraft(raw: string): string {
  return raw
    .trim()
    .replace(/[^a-zA-Z0-9_]/g, "")
    .slice(0, 20);
}

function parseDeadlineToUnix(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d+$/.test(trimmed)) {
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }

    const seconds =
      parsed > 1_000_000_000_000
        ? Math.trunc(parsed / 1000)
        : Math.trunc(parsed);
    return seconds > 0 ? String(seconds) : null;
  }

  const compact = trimmed.replace(/\s+/g, " ");
  const normalized = /^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}$/.test(compact)
    ? compact.replace(" ", "T")
    : compact;

  const parsedDate = new Date(normalized);
  if (Number.isNaN(parsedDate.valueOf())) {
    return null;
  }

  return String(Math.trunc(parsedDate.getTime() / 1000));
}

function marketStageLabel(market: ActiveMarketCard): string {
  if (market.resolved) {
    return "Resolved";
  }

  if (market.canResolve) {
    return "Awaiting Resolution";
  }

  return "Open";
}

export default function ChatsScreen() {
  const { user, getAccessToken } = usePrivy();
  const authenticated = Boolean(user);
  const { width } = useWindowDimensions();

  const wsRef = useRef<WebSocket | null>(null);
  const messageScrollRef = useRef<ScrollView | null>(null);
  const claimedMarketIdsRef = useRef<Set<string>>(new Set());

  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const [clientId, setClientId] = useState<string | null>(null);
  const [identity, setIdentity] = useState<ProfileMeResponse | null>(null);

  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [roomDraft, setRoomDraft] = useState("");
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [createRoomModalVisible, setCreateRoomModalVisible] = useState(false);
  const [createRoomNameDraft, setCreateRoomNameDraft] = useState("");
  const [createRoomVisibility, setCreateRoomVisibility] = useState<
    "public" | "private"
  >("public");
  const [createRoomJoinPolicy, setCreateRoomJoinPolicy] = useState<
    "open" | "approval" | "invite_only"
  >("open");
  const [createRoomBusy, setCreateRoomBusy] = useState(false);
  const [manageRoomModalVisible, setManageRoomModalVisible] = useState(false);
  const [manageRoomBusy, setManageRoomBusy] = useState(false);
  const [inviteUsernameDraft, setInviteUsernameDraft] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [requestActionBusyKey, setRequestActionBusyKey] = useState<
    string | null
  >(null);
  const [roomMembers, setRoomMembers] = useState<RoomMember[]>([]);
  const [roomRequests, setRoomRequests] = useState<RoomMember[]>([]);

  const [roomMessages, setRoomMessages] = useState<RoomMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState("");

  const [activeMarkets, setActiveMarkets] = useState<ActiveMarketCard[]>([]);
  const [refreshingRooms, setRefreshingRooms] = useState(false);
  const [refreshingMessages, setRefreshingMessages] = useState(false);
  const [refreshingMarkets, setRefreshingMarkets] = useState(false);

  const [drawerVisible, setDrawerVisible] = useState(false);
  const drawerTranslateX = useRef(new Animated.Value(-(width * 0.78))).current;

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createDeadlineInput, setCreateDeadlineInput] = useState("");
  const [createPolymarketUrl, setCreatePolymarketUrl] = useState("");
  const [createBusy, setCreateBusy] = useState(false);

  const [actionModal, setActionModal] = useState<MarketActionModalState>({
    visible: false,
    action: "bet",
    market: null,
  });
  const [actionBusy, setActionBusy] = useState(false);
  const [betAmountStrk, setBetAmountStrk] = useState("10");
  const [betOutcomeYes, setBetOutcomeYes] = useState(true);
  const [resolveYes, setResolveYes] = useState(true);

  const myUsername = identity?.profile?.username ?? null;
  const myWalletAddress = identity?.wallet?.address ?? null;
  const activeRoomSummary = useMemo(
    () =>
      activeRoom
        ? (rooms.find((room) => room.roomName === activeRoom) ?? null)
        : null,
    [activeRoom, rooms],
  );
  const canManageActiveRoom = useMemo(() => {
    if (!activeRoomSummary?.isMember) {
      return false;
    }

    return (
      activeRoomSummary.myRole === "owner" ||
      activeRoomSummary.myRole === "admin"
    );
  }, [activeRoomSummary]);

  const drawerWidth = useMemo(() => Math.min(width * 0.8, 420), [width]);

  const createDeadlineDate = useMemo(() => {
    const parsed = parseDeadlineToUnix(createDeadlineInput);
    if (!parsed) {
      return null;
    }

    const next = new Date(Number(parsed) * 1000);
    return Number.isNaN(next.valueOf()) ? null : next;
  }, [createDeadlineInput]);

  const createDeadlineLabel = useMemo(() => {
    if (!createDeadlineDate) {
      return "Pick a deadline";
    }

    return createDeadlineDate.toLocaleString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }, [createDeadlineDate]);

  const createDeadlineHint = useMemo(() => {
    if (!createDeadlineDate) {
      return "Choose a closing time with quick actions below.";
    }

    const secondsLeft = Math.trunc(
      (createDeadlineDate.getTime() - Date.now()) / 1000,
    );
    if (secondsLeft <= 0) {
      return "This time has passed. Pick a future deadline.";
    }

    const days = Math.floor(secondsLeft / 86400);
    const hours = Math.floor((secondsLeft % 86400) / 3600);
    const minutes = Math.max(1, Math.floor((secondsLeft % 3600) / 60));

    if (days > 0) {
      return `Closes in ${days}d ${hours}h`;
    }

    if (hours > 0) {
      return `Closes in ${hours}h ${minutes}m`;
    }

    return `Closes in ${minutes}m`;
  }, [createDeadlineDate]);

  const buildHeaders = useCallback(async (): Promise<HeadersInit> => {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    const token = await getAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    return headers;
  }, [getAccessToken]);

  const loadIdentity = useCallback(async () => {
    if (!authenticated) {
      setIdentity(null);
      return;
    }

    try {
      const payload = await fetchMyProfile(getAccessToken);
      setIdentity(payload);
    } catch (loadError) {
      console.error(loadError);
      setError("Failed to load identity");
    }
  }, [authenticated, getAccessToken]);

  const loadRooms = useCallback(async () => {
    if (!authenticated) {
      setRooms([]);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat/rooms?limit=100`, {
        headers: await buildHeaders(),
      });

      if (!response.ok) {
        if (response.status === 401) {
          setRooms([]);
          return;
        }

        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as { rooms: RoomSummary[] };
      setRooms(payload.rooms);
    } catch (loadError) {
      console.error(loadError);
      setError("Failed to load rooms");
    }
  }, [authenticated, buildHeaders]);

  const loadRoomMembersAndRequests = useCallback(
    async (roomName: string) => {
      if (!authenticated) {
        setRoomMembers([]);
        setRoomRequests([]);
        return;
      }

      try {
        setManageRoomBusy(true);
        const headers = await buildHeaders();
        const [membersResponse, requestsResponse] = await Promise.all([
          fetch(
            `${API_BASE_URL}/api/chat/rooms/${encodeURIComponent(roomName)}/members`,
            { headers },
          ),
          fetch(
            `${API_BASE_URL}/api/chat/rooms/${encodeURIComponent(roomName)}/requests`,
            { headers },
          ),
        ]);

        if (!membersResponse.ok) {
          throw new Error(await readErrorMessage(membersResponse));
        }

        const membersPayload = (await membersResponse.json()) as {
          members: RoomMember[];
        };
        setRoomMembers(membersPayload.members);

        if (requestsResponse.status === 403) {
          setRoomRequests([]);
          return;
        }

        if (!requestsResponse.ok) {
          throw new Error(await readErrorMessage(requestsResponse));
        }

        const requestsPayload = (await requestsResponse.json()) as {
          requests: RoomMember[];
        };
        setRoomRequests(requestsPayload.requests);
      } catch (loadError) {
        console.error(loadError);
        setError("Failed to load room members");
      } finally {
        setManageRoomBusy(false);
      }
    },
    [authenticated, buildHeaders],
  );

  const loadRoomMessages = useCallback(
    async (roomName: string) => {
      if (!authenticated) {
        setRoomMessages([]);
        return;
      }

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/chat/rooms/${encodeURIComponent(roomName)}/messages?limit=80`,
          { headers: await buildHeaders() },
        );
        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }

        const payload = (await response.json()) as { messages: RoomMessage[] };
        setRoomMessages(payload.messages);
      } catch (loadError) {
        console.error(loadError);
        setError("Failed to load room messages");
      }
    },
    [authenticated, buildHeaders],
  );

  const loadActiveRoomMarkets = useCallback(
    async (roomName: string) => {
      if (!authenticated) {
        setActiveMarkets([]);
        return;
      }

      try {
        const authHeaders = await buildHeaders();
        const pageSize = 50;
        const roomMarkets: RoomContractMarket[] = [];

        for (let offset = 0; offset <= 450; offset += pageSize) {
          const marketsResponse = await fetch(
            `${API_BASE_URL}/api/chat/rooms/${encodeURIComponent(roomName)}/markets?limit=${pageSize}&offset=${offset}`,
            { headers: authHeaders },
          );

          if (!marketsResponse.ok) {
            throw new Error(await readErrorMessage(marketsResponse));
          }

          const marketsPayload = (await marketsResponse.json()) as {
            markets: RoomContractMarket[];
          };
          roomMarkets.push(...marketsPayload.markets);

          if (marketsPayload.markets.length < pageSize) {
            break;
          }
        }

        if (roomMarkets.length === 0) {
          setActiveMarkets([]);
          return;
        }

        const transactionsResponse = authenticated
          ? await fetchMyTransactions(getAccessToken, 200).catch(() => ({
              transactions: [] as UserTransactionActivity[],
              limit: 200,
            }))
          : { transactions: [] as UserTransactionActivity[], limit: 200 };

        const betPlacedSet = new Set<string>();
        const betOutcomeByMarket = new Map<string, boolean>();
        const claimedSet = new Set(claimedMarketIdsRef.current);

        for (const transaction of transactionsResponse.transactions) {
          if (transaction.status !== "success") {
            continue;
          }

          const metadata = transaction.metadata as {
            marketId?: unknown;
            outcome?: unknown;
          };

          const marketId =
            typeof metadata.marketId === "number" ||
            typeof metadata.marketId === "string"
              ? String(metadata.marketId)
              : "";

          if (!marketId) {
            continue;
          }

          const action = transaction.action.trim().toLowerCase();

          if (action.includes("bet")) {
            betPlacedSet.add(marketId);

            const outcome = parseOutcomeBoolean(metadata.outcome);
            if (outcome !== null) {
              betOutcomeByMarket.set(marketId, outcome);
            }
          }

          if (action.includes("claim")) {
            claimedSet.add(marketId);
          }
        }

        claimedMarketIdsRef.current = claimedSet;

        const enriched = await Promise.all(
          roomMarkets.map(async (market) => {
            let detail: MarketDetail | null = null;
            let canResolvePayload: {
              canResolve: boolean;
              isCreator: boolean;
              isResolved: boolean;
            } | null = null;

            try {
              const [detailResponse, canResolveResponse] = await Promise.all([
                fetch(
                  `${API_BASE_URL}/api/chat/rooms/${encodeURIComponent(roomName)}/markets/${encodeURIComponent(market.marketId)}/details`,
                  { headers: authHeaders },
                ),
                authenticated
                  ? fetch(
                      `${API_BASE_URL}/api/chat/rooms/${encodeURIComponent(roomName)}/markets/${encodeURIComponent(market.marketId)}/can-resolve`,
                      { headers: authHeaders },
                    )
                  : Promise.resolve(null),
              ]);

              if (detailResponse.ok) {
                detail = (await detailResponse.json()) as MarketDetail;
              }

              if (canResolveResponse && canResolveResponse.ok) {
                canResolvePayload = (await canResolveResponse.json()) as {
                  canResolve: boolean;
                  isCreator: boolean;
                  isResolved: boolean;
                };
              }
            } catch {
              // Ignore per-market detail failures and use fallback metadata.
            }

            const marketId = String(market.marketId);
            const creator =
              detail?.chain.creator ?? market.createdByWalletAddress;
            const title =
              detail?.chain.questionAscii ??
              market.title ??
              `Market #${market.marketId}`;
            const resolved =
              detail?.chain.resolved ?? canResolvePayload?.isResolved ?? false;
            const winningOutcome = resolved
              ? (detail?.chain.winningOutcome ?? null)
              : null;
            const deadlineUnix =
              detail?.chain.deadlineUnix ?? market.deadlineUnix ?? null;
            const yesPool = detail?.chain.yesPool ?? "0";
            const noPool = detail?.chain.noPool ?? "0";
            const hasPlacedBet = betPlacedSet.has(marketId);
            const hasClaimed = claimedSet.has(marketId);
            const userBetOutcome = betOutcomeByMarket.get(marketId);

            const canClaim =
              resolved &&
              hasPlacedBet &&
              !hasClaimed &&
              winningOutcome !== null &&
              (userBetOutcome === undefined ||
                userBetOutcome === winningOutcome);

            const totalPool = hasClaimed
              ? "0"
              : (detail?.chain.totalPool ?? "0");

            const normalizedCreator = normalizeHexAddress(creator);
            const normalizedMine = normalizeHexAddress(myWalletAddress);
            const isMine =
              normalizedCreator !== null &&
              normalizedMine !== null &&
              normalizedCreator === normalizedMine;

            return {
              id: market.id,
              marketId: market.marketId,
              title,
              creator: shortenAddress(creator),
              creatorWalletAddress: creator,
              deadlineUnix,
              yesPool,
              noPool,
              totalPool,
              resolved,
              winningOutcome,
              canResolve: Boolean(canResolvePayload?.canResolve),
              isCreator: Boolean(canResolvePayload?.isCreator),
              isMine,
              hasPlacedBet,
              hasClaimed,
              canClaim,
            } as ActiveMarketCard;
          }),
        );

        setActiveMarkets(enriched);
      } catch (loadError) {
        console.error(loadError);
        setError("Failed to load room markets");
      }
    },
    [authenticated, getAccessToken, buildHeaders, myWalletAddress],
  );

  const sendWs = useCallback((payload: Record<string, unknown>) => {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setError("Realtime socket is not connected");
      return;
    }

    socket.send(JSON.stringify(payload));
  }, []);

  const connectSocket = useCallback(async () => {
    if (!authenticated) {
      setIsConnected(false);
      setStatus("Authenticate with Privy to chat");
      return;
    }

    const current = wsRef.current;
    if (
      current &&
      (current.readyState === WebSocket.OPEN ||
        current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    setError(null);
    setStatus("Connecting...");

    try {
      await loadIdentity();
      const socket = await connectRealtimeSocket(getAccessToken, WS_BASE_URL);
      wsRef.current = socket;

      socket.onopen = () => {
        setIsConnected(true);
        setStatus("Connected");
      };

      socket.onclose = () => {
        setIsConnected(false);
        setStatus("Disconnected");
      };

      socket.onerror = () => {
        setIsConnected(false);
        setStatus("Socket error");
        setError("Realtime socket error");
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as WsServerMessage;

          switch (payload.type) {
            case "connection":
              setClientId(payload.clientId);
              return;
            case "error":
              setError(payload.message);
              return;
            case "room_joined":
              setActiveRoom(payload.room);
              setError(null);
              setStatus(`Joined #${payload.room}`);
              void loadRooms();
              return;
            case "room_access_update":
              setActiveRoom(null);
              setRoomMessages([]);
              setActiveMarkets([]);
              setManageRoomModalVisible(false);
              setRoomMembers([]);
              setRoomRequests([]);
              setStatus(payload.message);
              setError(payload.message);
              void loadRooms();
              return;
            case "room_left":
              setActiveRoom(null);
              setRoomMessages([]);
              setActiveMarkets([]);
              setManageRoomModalVisible(false);
              setRoomMembers([]);
              setRoomRequests([]);
              setStatus("Left room");
              void loadRooms();
              return;
            case "message_history":
              setRoomMessages(payload.messages);
              return;
            case "message_received":
              setRoomMessages((previous) => [...previous, payload]);
              return;
            default:
              return;
          }
        } catch {
          setError("Invalid websocket payload");
        }
      };
    } catch (connectError) {
      console.error(connectError);
      setError("Socket auth failed");
      setStatus("Socket auth failed");
      setIsConnected(false);
    }
  }, [authenticated, getAccessToken, loadIdentity, loadRooms]);

  const disconnectSocket = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  const refreshRooms = useCallback(async () => {
    setRefreshingRooms(true);
    try {
      await loadRooms();
    } finally {
      setRefreshingRooms(false);
    }
  }, [loadRooms]);

  const refreshActiveRoom = useCallback(async () => {
    if (!activeRoom) {
      await refreshRooms();
      return;
    }

    setRefreshingMessages(true);
    try {
      await loadRoomMessages(activeRoom);
      if (drawerVisible) {
        await loadActiveRoomMarkets(activeRoom);
      }
      if (manageRoomModalVisible) {
        await loadRoomMembersAndRequests(activeRoom);
      }
      await loadRooms();
    } finally {
      setRefreshingMessages(false);
    }
  }, [
    activeRoom,
    drawerVisible,
    manageRoomModalVisible,
    loadRoomMessages,
    loadActiveRoomMarkets,
    loadRoomMembersAndRequests,
    loadRooms,
    refreshRooms,
  ]);

  const refreshMarkets = useCallback(async () => {
    if (!activeRoom) {
      return;
    }

    setRefreshingMarkets(true);
    try {
      await loadActiveRoomMarkets(activeRoom);
    } finally {
      setRefreshingMarkets(false);
    }
  }, [activeRoom, loadActiveRoomMarkets]);

  useEffect(() => {
    void connectSocket();

    return () => {
      disconnectSocket();
    };
  }, [connectSocket, disconnectSocket]);

  useEffect(() => {
    claimedMarketIdsRef.current = new Set();
    setActiveMarkets([]);
  }, [user?.id]);

  useEffect(() => {
    if (!activeRoom) {
      return;
    }

    void loadRoomMessages(activeRoom);
  }, [activeRoom, loadRoomMessages]);

  useEffect(() => {
    if (!activeRoom || !drawerVisible) {
      return;
    }

    void loadActiveRoomMarkets(activeRoom);
  }, [activeRoom, drawerVisible, loadActiveRoomMarkets]);

  useEffect(() => {
    if (!activeRoom || !manageRoomModalVisible) {
      return;
    }

    void loadRoomMembersAndRequests(activeRoom);
  }, [activeRoom, manageRoomModalVisible, loadRoomMembersAndRequests]);

  useEffect(() => {
    if (activeRoom) {
      return;
    }

    setManageRoomModalVisible(false);
    setRoomMembers([]);
    setRoomRequests([]);
  }, [activeRoom]);

  useFocusEffect(
    useCallback(() => {
      void loadRooms();

      if (activeRoom) {
        void loadRoomMessages(activeRoom);
        if (drawerVisible) {
          void loadActiveRoomMarkets(activeRoom);
        }
        if (manageRoomModalVisible) {
          void loadRoomMembersAndRequests(activeRoom);
        }
      }

      const interval = setInterval(
        () => {
          if (activeRoom) {
            void loadRoomMessages(activeRoom);
            if (drawerVisible) {
              void loadActiveRoomMarkets(activeRoom);
            }
            if (manageRoomModalVisible) {
              void loadRoomMembersAndRequests(activeRoom);
            }
          } else {
            void loadRooms();
          }
        },
        activeRoom ? 5000 : 7000,
      );

      return () => {
        clearInterval(interval);
      };
    }, [
      activeRoom,
      drawerVisible,
      manageRoomModalVisible,
      loadRoomMembersAndRequests,
      loadRooms,
      loadRoomMessages,
      loadActiveRoomMarkets,
    ]),
  );

  useEffect(() => {
    if (!activeRoom) {
      return;
    }

    messageScrollRef.current?.scrollToEnd({ animated: true });
  }, [roomMessages, activeRoom]);

  function joinRoom(rawRoomName: string) {
    const normalized = normalizeRoomName(rawRoomName);
    if (!normalized) {
      setError("Please enter a room name");
      return;
    }

    const knownRoom = rooms.find((room) => room.roomName === normalized);
    if (knownRoom?.myMembershipStatus === "pending") {
      setError("Join request already pending approval");
      return;
    }

    if (knownRoom?.myMembershipStatus === "banned") {
      setError("You are blocked from this room");
      return;
    }

    if (knownRoom?.myMembershipStatus === "removed") {
      setError("You were removed from this room");
      return;
    }

    setError(null);
    setRoomMessages([]);
    setActiveMarkets([]);
    setRoomDraft(normalized);
    setStatus(`Joining #${normalized}...`);
    sendWs({ type: MSG.JOIN_ROOM, room: normalized });
  }

  function openCreateRoomPrompt() {
    setError(null);
    setCreateRoomNameDraft(roomDraft.trim());
    setCreateRoomVisibility("public");
    setCreateRoomJoinPolicy("open");
    setCreateRoomModalVisible(true);
  }

  async function confirmCreateRoom() {
    const normalized = normalizeRoomName(createRoomNameDraft);
    if (!normalized) {
      setError("Please add a room name before creating");
      return;
    }

    const joinPolicy =
      createRoomVisibility === "public" ? "open" : createRoomJoinPolicy;

    try {
      setCreateRoomBusy(true);
      setError(null);

      const response = await fetch(`${API_BASE_URL}/api/chat/rooms`, {
        method: "POST",
        headers: await buildHeaders(),
        body: JSON.stringify({
          roomName: normalized,
          visibility: createRoomVisibility,
          joinPolicy,
        }),
      });

      if (!response.ok && response.status !== 409) {
        throw new Error(await readErrorMessage(response));
      }

      setCreateRoomModalVisible(false);
      await loadRooms();
      joinRoom(normalized);
    } catch (createRoomError) {
      console.error(createRoomError);
      setError("Failed to create room");
    } finally {
      setCreateRoomBusy(false);
    }
  }

  function joinRoomFromDraft() {
    const normalized = normalizeRoomName(roomDraft);
    if (!normalized) {
      setError("Type a room name to join");
      return;
    }

    joinRoom(normalized);
  }

  function backToRooms() {
    sendWs({ type: MSG.LEAVE_ROOM });
    setActiveRoom(null);
    setDrawerVisible(false);
    setManageRoomModalVisible(false);
    setRoomMembers([]);
    setRoomRequests([]);
    setInviteUsernameDraft("");
    setRequestActionBusyKey(null);
    setCreateModalVisible(false);
    setActionModal({ visible: false, action: "bet", market: null });
    void loadRooms();
  }

  function sendRoomMessage() {
    const content = messageDraft.trim();
    if (!content || !activeRoom) {
      return;
    }

    sendWs({ type: MSG.CHAT_MESSAGE, content });
    setMessageDraft("");
  }

  function openDrawer() {
    setDrawerVisible(true);
    if (activeRoom) {
      void loadActiveRoomMarkets(activeRoom);
    }
    drawerTranslateX.setValue(-drawerWidth);
    Animated.timing(drawerTranslateX, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }

  function closeDrawer() {
    Animated.timing(drawerTranslateX, {
      toValue: -drawerWidth,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setDrawerVisible(false);
    });
  }

  function openManageRoomModal() {
    if (!activeRoom || !canManageActiveRoom) {
      return;
    }

    setError(null);
    setInviteUsernameDraft("");
    setManageRoomModalVisible(true);
    void loadRoomMembersAndRequests(activeRoom);
  }

  function closeManageRoomModal() {
    if (inviteBusy || requestActionBusyKey !== null) {
      return;
    }

    setManageRoomModalVisible(false);
  }

  async function submitRoomInvite() {
    if (!activeRoom) {
      return;
    }

    const username = normalizeUsernameDraft(inviteUsernameDraft);
    if (!username) {
      setError("Enter a username to invite");
      return;
    }

    try {
      setInviteBusy(true);
      setError(null);

      const response = await fetch(
        `${API_BASE_URL}/api/chat/rooms/${encodeURIComponent(activeRoom)}/invite`,
        {
          method: "POST",
          headers: await buildHeaders(),
          body: JSON.stringify({ username }),
        },
      );

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as {
        status:
          | "invited"
          | "already_member"
          | "banned"
          | "not_found"
          | "invalid";
        message: string;
      };

      setInviteUsernameDraft("");
      setStatus(payload.message || "Invite processed");
      await loadRoomMembersAndRequests(activeRoom);
      await loadRooms();
    } catch (inviteError) {
      console.error(inviteError);
      setError("Failed to invite user");
    } finally {
      setInviteBusy(false);
    }
  }

  async function submitRequestDecision(
    targetPrivyUserId: string,
    action: "approve" | "reject",
  ) {
    if (!activeRoom) {
      return;
    }

    const decisionKey = `${action}:${targetPrivyUserId}`;

    try {
      setRequestActionBusyKey(decisionKey);
      setError(null);

      const response = await fetch(
        `${API_BASE_URL}/api/chat/rooms/${encodeURIComponent(activeRoom)}/requests/${encodeURIComponent(targetPrivyUserId)}/${action}`,
        {
          method: "POST",
          headers: await buildHeaders(),
        },
      );

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      setStatus(action === "approve" ? "Request approved" : "Request rejected");
      await loadRoomMembersAndRequests(activeRoom);
      await loadRooms();
    } catch (decisionError) {
      console.error(decisionError);
      setError(
        action === "approve"
          ? "Failed to approve request"
          : "Failed to reject request",
      );
    } finally {
      setRequestActionBusyKey(null);
    }
  }

  function openActionModal(action: MarketActionType, market: ActiveMarketCard) {
    setActionModal({ visible: true, action, market });
  }

  function closeActionModal() {
    if (actionBusy) {
      return;
    }
    setActionModal({ visible: false, action: "bet", market: null });
  }

  function setCreateDeadlineFromDate(next: Date) {
    setCreateDeadlineInput(String(Math.trunc(next.getTime() / 1000)));
  }

  function openCreateMarketModal() {
    const nowSeconds = Math.trunc(Date.now() / 1000);
    const existing = parseDeadlineToUnix(createDeadlineInput);

    if (!existing || Number(existing) <= nowSeconds) {
      setCreateDeadlineInput(
        String(nowSeconds + DEFAULT_CREATE_DEADLINE_SECONDS),
      );
    }

    setError(null);
    setCreateModalVisible(true);
  }

  function setCreateDeadlineHoursFromNow(hoursAhead: number) {
    const next = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
    setCreateDeadlineFromDate(next);
  }

  function setCreateDeadlineTomorrowAt(hour: number, minute: number) {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(hour, minute, 0, 0);
    setCreateDeadlineFromDate(next);
  }

  function shiftCreateDeadlineByMinutes(minutesDelta: number) {
    const fallback = new Date(
      Date.now() + DEFAULT_CREATE_DEADLINE_SECONDS * 1000,
    );
    const base = createDeadlineDate ?? fallback;
    const next = new Date(base.getTime() + minutesDelta * 60 * 1000);
    setCreateDeadlineFromDate(next);
  }

  function shiftCreateDeadlineByDays(daysDelta: number) {
    const fallback = new Date(
      Date.now() + DEFAULT_CREATE_DEADLINE_SECONDS * 1000,
    );
    const base = createDeadlineDate ?? fallback;
    const next = new Date(base);
    next.setDate(next.getDate() + daysDelta);
    setCreateDeadlineFromDate(next);
  }

  async function submitCreateMarket() {
    if (!activeRoom) {
      return;
    }

    const title = toAsciiTitle(createTitle);
    if (!title) {
      setError("Title is required (ASCII, max 31 chars)");
      return;
    }

    const deadlineUnix = parseDeadlineToUnix(createDeadlineInput);
    if (!deadlineUnix) {
      setError("Please pick a deadline");
      return;
    }

    if (Number(deadlineUnix) <= Math.trunc(Date.now() / 1000)) {
      setError("Deadline must be in the future");
      return;
    }

    try {
      setCreateBusy(true);
      setError(null);
      setStatus("Creating market...");

      const marketCountResponse = await fetch(
        `${API_BASE_URL}/api/market-count`,
      );
      if (!marketCountResponse.ok) {
        throw new Error(await readErrorMessage(marketCountResponse));
      }

      const marketCountPayload = (await marketCountResponse.json()) as {
        count?: string;
        raw?: string;
      };
      const beforeCount = BigInt(
        marketCountPayload.count ?? marketCountPayload.raw ?? "0",
      );
      const inferredMarketId = beforeCount.toString();

      let externalMarketLinkId: string | undefined;
      const trimmedExternalUrl = createPolymarketUrl.trim();

      if (trimmedExternalUrl) {
        const externalResponse = await fetch(
          `${API_BASE_URL}/api/chat/rooms/${encodeURIComponent(activeRoom)}/external-markets`,
          {
            method: "POST",
            headers: await buildHeaders(),
            body: JSON.stringify({ url: trimmedExternalUrl }),
          },
        );

        if (!externalResponse.ok) {
          throw new Error(await readErrorMessage(externalResponse));
        }

        const externalPayload = (await externalResponse.json()) as {
          externalMarket?: { id?: string };
        };

        externalMarketLinkId = externalPayload.externalMarket?.id;
      }

      const createResponse = await fetch(`${API_BASE_URL}/create-market`, {
        method: "POST",
        headers: await buildHeaders(),
        body: JSON.stringify({
          title,
          time: deadlineUnix,
        }),
      });

      if (!createResponse.ok) {
        throw new Error(await readErrorMessage(createResponse));
      }

      const attachResponse = await fetch(
        `${API_BASE_URL}/api/chat/rooms/${encodeURIComponent(activeRoom)}/markets/attach`,
        {
          method: "POST",
          headers: await buildHeaders(),
          body: JSON.stringify({
            marketId: inferredMarketId,
            title,
            deadlineUnix,
            externalMarketLinkId,
          }),
        },
      );

      if (!attachResponse.ok) {
        throw new Error(await readErrorMessage(attachResponse));
      }

      sendWs({
        type: MSG.CHAT_MESSAGE,
        content: `Created market #${inferredMarketId}: ${title}`,
      });

      setCreateTitle("");
      setCreateDeadlineInput(
        String(Math.trunc(Date.now() / 1000) + DEFAULT_CREATE_DEADLINE_SECONDS),
      );
      setCreatePolymarketUrl("");
      setCreateModalVisible(false);
      setStatus(`Market #${inferredMarketId} created`);

      await loadActiveRoomMarkets(activeRoom);
    } catch (createError) {
      console.error(createError);
      setError("Create market failed. Please try again.");
      setStatus("Create market failed");
    } finally {
      setCreateBusy(false);
    }
  }

  async function submitMarketAction() {
    if (!actionModal.market) {
      return;
    }

    const { market, action } = actionModal;

    try {
      setActionBusy(true);
      setError(null);

      if (action === "bet") {
        const amountWei = parseStrkToWei(betAmountStrk);
        if (!amountWei) {
          throw new Error("Enter a valid STRK amount > 0");
        }

        const response = await fetch(`${API_BASE_URL}/place-bet`, {
          method: "POST",
          headers: await buildHeaders(),
          body: JSON.stringify({
            marketId: market.marketId,
            outcome: betOutcomeYes,
            amount: amountWei,
          }),
        });

        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }

        sendWs({
          type: MSG.CHAT_MESSAGE,
          content: `Placed ${betOutcomeYes ? "YES" : "NO"} bet on market #${market.marketId}`,
        });
        setStatus("Bet submitted");
      }

      if (action === "resolve") {
        const response = await fetch(`${API_BASE_URL}/resolve-market`, {
          method: "POST",
          headers: await buildHeaders(),
          body: JSON.stringify({
            marketId: market.marketId,
            winningOutcome: resolveYes,
          }),
        });

        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }

        sendWs({
          type: MSG.CHAT_MESSAGE,
          content: `Resolved market #${market.marketId} with ${resolveYes ? "YES" : "NO"} as winner`,
        });
        setStatus("Market resolved");
      }

      if (action === "claim") {
        const response = await fetch(`${API_BASE_URL}/claim-winnings`, {
          method: "POST",
          headers: await buildHeaders(),
          body: JSON.stringify({
            marketId: market.marketId,
          }),
        });

        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }

        sendWs({
          type: MSG.CHAT_MESSAGE,
          content: `Claimed winnings for market #${market.marketId}`,
        });

        claimedMarketIdsRef.current.add(String(market.marketId));
        setActiveMarkets((previous) =>
          previous.map((current) =>
            current.marketId === market.marketId
              ? {
                  ...current,
                  hasClaimed: true,
                  canClaim: false,
                  totalPool: "0",
                  yesPool: "0",
                  noPool: "0",
                }
              : current,
          ),
        );

        setStatus("Claim submitted");
      }

      closeActionModal();
      if (activeRoom) {
        await loadActiveRoomMarkets(activeRoom);
      }
    } catch (actionError) {
      console.error(actionError);
      setError("Market action failed. Please check context and try again.");
      setStatus("Market action failed");
    } finally {
      setActionBusy(false);
    }
  }

  const sortedRooms = useMemo(() => {
    return [...rooms].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [rooms]);

  const privateRooms = useMemo(
    () => sortedRooms.filter((room) => room.visibility === "private"),
    [sortedRooms],
  );

  const communityRooms = useMemo(
    () => sortedRooms.filter((room) => room.visibility === "public"),
    [sortedRooms],
  );

  const renderRoomCard = (room: RoomSummary, index: number) => (
    <Pressable
      key={room.roomName}
      style={styles.groupCard}
      onPress={() => {
        joinRoom(room.roomName);
      }}
    >
      <View style={styles.groupIconCircle}>
        <Ionicons
          name={ROOM_ICONS[index % ROOM_ICONS.length] as "football-outline"}
          size={ms(20)}
          color="#fff"
        />
      </View>

      <View style={styles.groupMainCopy}>
        <View style={styles.groupTitleRow}>
          <Text style={styles.groupName}>{room.roomName}</Text>
          <View
            style={[
              styles.groupTypeBadge,
              room.visibility === "private"
                ? styles.groupTypeBadgePrivate
                : styles.groupTypeBadgeCommunity,
            ]}
          >
            <Text style={styles.groupTypeBadgeText}>
              {room.visibility === "private" ? "Private" : "Public"}
            </Text>
          </View>
        </View>

        <Text style={styles.groupSubtitle}>{formatRoomStatusLine(room)}</Text>

        <Text style={styles.groupPolicyText}>
          Join: {formatJoinPolicyLabel(room.joinPolicy)}
          {room.myRole ? ` • Role: ${room.myRole}` : ""}
        </Text>
      </View>

      <View style={styles.groupMetaColumn}>
        <Text style={styles.groupTime}>{formatRoomTime(room.createdAt)}</Text>
        {room.myMembershipStatus === "pending" ? (
          <Text style={styles.groupPendingBadge}>Pending</Text>
        ) : null}
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      {!activeRoom ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.contentWrap}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshingRooms}
              onRefresh={() => {
                void refreshRooms();
              }}
              tintColor="#08a844"
            />
          }
        >
          {/* ── Header ──────────────────────────── */}
          <View style={styles.topHeaderRow}>
            <View>
              <Text style={styles.screenTitle}>Chats</Text>
              <Text style={styles.screenSubtitle}>
                {isConnected ? "Online" : "Connecting..."}
              </Text>
            </View>
            <Pressable
              style={styles.miniHeaderBtn}
              onPress={() => {
                void refreshRooms();
              }}
            >
              <Ionicons name="refresh" size={ms(18)} color="#8e9196" />
            </Pressable>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* ── Search / Join ───────────────────── */}
          <View style={styles.searchRow}>
            <Ionicons name="search-outline" size={ms(18)} color="#9b9ea4" />
            <TextInput
              value={roomDraft}
              onChangeText={setRoomDraft}
              placeholder="Search or join a room..."
              placeholderTextColor="#9d9fa5"
              style={styles.searchInput}
              autoCapitalize="words"
              autoCorrect={false}
              onSubmitEditing={() => {
                joinRoomFromDraft();
              }}
            />
            <Pressable
              style={styles.searchJoinBtn}
              onPress={() => {
                joinRoomFromDraft();
              }}
            >
              <Ionicons name="arrow-forward" size={ms(16)} color="#fff" />
            </Pressable>
          </View>

          {/* ── Create Room ─────────────────────── */}
          <Pressable
            style={styles.createRoomButton}
            onPress={() => {
              openCreateRoomPrompt();
            }}
          >
            <Ionicons name="add" size={ms(22)} color="#fff" />
            <Text style={styles.createRoomLabel}>Create New Room</Text>
          </Pressable>

          {/* ── Private Groups ─────────────────── */}
          <Text style={styles.sectionTitle}>Private Groups</Text>
          {privateRooms.length === 0 ? (
            <Text style={styles.emptyRoomCopy}>
              No private groups yet. Create one for friend-only markets.
            </Text>
          ) : (
            privateRooms.map((room, index) => renderRoomCard(room, index))
          )}

          {/* ── Community Rooms ────────────────── */}
          <Text style={styles.sectionTitle}>Community Rooms</Text>
          {communityRooms.length === 0 ? (
            <Text style={styles.emptyRoomCopy}>No community rooms yet.</Text>
          ) : (
            communityRooms.map((room, index) =>
              renderRoomCard(room, index + privateRooms.length),
            )
          )}
        </ScrollView>
      ) : (
        <View style={styles.chatWrap}>
          {/* ── Chat Header ─────────────────────── */}
          <View style={styles.chatHeaderRow}>
            <Pressable style={styles.headerIconBtn} onPress={backToRooms}>
              <Ionicons name="arrow-back" size={ms(20)} color="#3f4349" />
            </Pressable>

            <Text style={styles.chatTitle} numberOfLines={1}>
              #{activeRoom}
            </Text>

            <View style={styles.chatHeaderActions}>
              {canManageActiveRoom ? (
                <Pressable
                  style={styles.headerIconBtn}
                  onPress={openManageRoomModal}
                >
                  <Ionicons
                    name="people-outline"
                    size={ms(18)}
                    color="#3f4349"
                  />
                </Pressable>
              ) : null}
              <Pressable
                style={styles.headerIconBtn}
                onPress={() => {
                  void refreshActiveRoom();
                }}
              >
                <Ionicons name="refresh" size={ms(18)} color="#3f4349" />
              </Pressable>
              <Pressable style={styles.headerIconBtn} onPress={openDrawer}>
                <Ionicons
                  name="stats-chart-outline"
                  size={ms(18)}
                  color="#3f4349"
                />
              </Pressable>
            </View>
          </View>

          <Text style={styles.metaStatus}>
            {activeRoomSummary
              ? `${formatVisibilityLabel(activeRoomSummary.visibility)} room • ${formatJoinPolicyLabel(activeRoomSummary.joinPolicy)} join`
              : status}
          </Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* ── Messages ────────────────────────── */}
          <ScrollView
            ref={messageScrollRef}
            style={styles.messagesScroll}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshingMessages}
                onRefresh={() => {
                  void refreshActiveRoom();
                }}
                tintColor="#08a844"
              />
            }
          >
            {roomMessages.map((message) => {
              const isMine =
                myUsername !== null && message.username === myUsername;

              return (
                <View
                  key={message.id}
                  style={[
                    styles.messageRow,
                    isMine ? styles.messageRowMine : styles.messageRowOther,
                  ]}
                >
                  <View
                    style={[
                      styles.messageBubble,
                      isMine ? styles.mineBubble : styles.otherBubble,
                    ]}
                  >
                    <Text
                      style={[
                        styles.messageUser,
                        isMine ? styles.mineMetaText : styles.otherMetaText,
                      ]}
                    >
                      {isMine ? "You" : message.username}
                    </Text>
                    <Text
                      style={[
                        styles.messageText,
                        isMine ? styles.mineText : styles.otherText,
                      ]}
                    >
                      {message.content}
                    </Text>
                    <Text
                      style={[
                        styles.messageTime,
                        isMine ? styles.mineMetaText : styles.otherMetaText,
                      ]}
                    >
                      {formatMessageTime(message.timestamp)}
                    </Text>
                  </View>
                </View>
              );
            })}
            {roomMessages.length === 0 ? (
              <Text style={styles.metaStatus}>
                No messages yet in this room.
              </Text>
            ) : null}
          </ScrollView>

          {/* ── Composer ────────────────────────── */}
          <View style={styles.composerRow}>
            <Pressable style={styles.plusBtn} onPress={openCreateMarketModal}>
              <Ionicons name="add" size={ms(24)} color="#8e9196" />
            </Pressable>

            <TextInput
              value={messageDraft}
              onChangeText={setMessageDraft}
              placeholder="Message..."
              placeholderTextColor="#a5a8ad"
              style={styles.messageInput}
              autoCorrect={false}
            />

            <Pressable style={styles.sendBtn} onPress={sendRoomMessage}>
              <Ionicons name="send" size={ms(18)} color="#fff" />
            </Pressable>
          </View>
        </View>
      )}

      <Modal
        visible={drawerVisible}
        transparent
        animationType="none"
        onRequestClose={closeDrawer}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} />
          <Animated.View
            style={[
              styles.drawerPanel,
              {
                width: drawerWidth,
                transform: [{ translateX: drawerTranslateX }],
              },
            ]}
          >
            <View style={styles.drawerHeaderRow}>
              <Pressable style={styles.headerIconBtn} onPress={closeDrawer}>
                <Ionicons name="arrow-back" size={ms(22)} color="#f0f0f0" />
              </Pressable>
              <Text style={styles.drawerTitle}>Room Markets</Text>
              <Pressable
                style={styles.drawerRefreshBtn}
                onPress={() => {
                  void refreshMarkets();
                }}
              >
                <Ionicons name="refresh" size={ms(18)} color="#eaf1ff" />
              </Pressable>
            </View>

            <Text style={styles.drawerSubtext}>
              All markets in this chat are shown with their current stage.
            </Text>

            <ScrollView
              style={styles.drawerScroll}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshingMarkets}
                  onRefresh={() => {
                    void refreshMarkets();
                  }}
                  tintColor="#a8bfde"
                />
              }
            >
              {activeMarkets.length === 0 ? (
                <View style={styles.drawerEmptyCard}>
                  <Text style={styles.drawerEmptyText}>
                    No markets in this chat yet.
                  </Text>
                </View>
              ) : (
                activeMarkets.map((market) => (
                  <View key={market.id} style={styles.marketCard}>
                    <View style={styles.marketTopRow}>
                      <Text style={styles.marketTitle}>{market.title}</Text>
                      <View style={styles.marketBadgeRow}>
                        <Text
                          style={[
                            styles.marketStageBadge,
                            market.resolved
                              ? styles.marketStageResolvedBadge
                              : styles.marketStageOpenBadge,
                          ]}
                        >
                          {marketStageLabel(market)}
                        </Text>
                        {market.isMine ? (
                          <Text style={styles.mineBadge}>Mine</Text>
                        ) : null}
                      </View>
                    </View>

                    <Text style={styles.marketMeta}>
                      Market #{market.marketId}
                    </Text>
                    <Text style={styles.marketMeta}>
                      Creator: {market.creator}
                    </Text>
                    <Text style={styles.marketMeta}>
                      Deadline: {formatDeadline(market.deadlineUnix)}
                    </Text>
                    <Text style={styles.marketMeta}>
                      Total Pool: {formatPoolAsStrk(market.totalPool)}
                    </Text>
                    {market.resolved ? (
                      <Text style={styles.marketMeta}>
                        Winning Outcome:{" "}
                        {market.winningOutcome === null
                          ? "Unavailable"
                          : market.winningOutcome
                            ? "YES"
                            : "NO"}
                      </Text>
                    ) : null}
                    {market.resolved ? (
                      <Text style={styles.claimHintText}>
                        Claims are per account. Each winning wallet must claim
                        separately.
                      </Text>
                    ) : null}
                    {market.hasPlacedBet ? (
                      <Text style={styles.placedBetBadge}>Bet placed</Text>
                    ) : null}
                    {market.hasClaimed ? (
                      <Text style={styles.claimedBadge}>Claimed</Text>
                    ) : null}

                    <View style={styles.marketActionRow}>
                      {!market.resolved ? (
                        <Pressable
                          style={styles.marketActionBtn}
                          onPress={() => openActionModal("bet", market)}
                        >
                          <Text style={styles.marketActionLabel}>
                            Place Bet
                          </Text>
                        </Pressable>
                      ) : null}

                      {market.canResolve && !market.resolved ? (
                        <Pressable
                          style={[
                            styles.marketActionBtn,
                            styles.marketActionResolveBtn,
                          ]}
                          onPress={() => openActionModal("resolve", market)}
                        >
                          <Text style={styles.marketActionLabel}>Resolve</Text>
                        </Pressable>
                      ) : null}

                      {market.canClaim ? (
                        <Pressable
                          style={[
                            styles.marketActionBtn,
                            styles.marketActionClaimBtn,
                          ]}
                          onPress={() => openActionModal("claim", market)}
                        >
                          <Text style={styles.marketActionLabel}>Claim</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>

      <Modal
        visible={createRoomModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateRoomModalVisible(false)}
      >
        <View style={styles.centerModalOverlay}>
          <View style={styles.centerModalCard}>
            <Text style={styles.centerModalTitle}>Name your room</Text>
            <Text style={styles.modalInfoText}>
              Choose a clear room name for your group.
            </Text>

            <TextInput
              value={createRoomNameDraft}
              onChangeText={setCreateRoomNameDraft}
              placeholder="Example: Weekend Premier Picks"
              placeholderTextColor="#9ea1a7"
              style={styles.modalInput}
              autoCapitalize="words"
              autoCorrect={false}
              onSubmitEditing={() => {
                void confirmCreateRoom();
              }}
            />

            <Text style={styles.modalFieldLabel}>Room type</Text>
            <View style={styles.modalToggleRow}>
              <Pressable
                style={[
                  styles.modalToggle,
                  createRoomVisibility === "public"
                    ? styles.modalToggleActive
                    : undefined,
                ]}
                onPress={() => {
                  setCreateRoomVisibility("public");
                  setCreateRoomJoinPolicy("open");
                }}
              >
                <Text style={styles.modalToggleText}>Community</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.modalToggle,
                  createRoomVisibility === "private"
                    ? styles.modalToggleActive
                    : undefined,
                ]}
                onPress={() => {
                  setCreateRoomVisibility("private");
                  if (createRoomJoinPolicy === "open") {
                    setCreateRoomJoinPolicy("invite_only");
                  }
                }}
              >
                <Text style={styles.modalToggleText}>Private</Text>
              </Pressable>
            </View>

            {createRoomVisibility === "private" ? (
              <>
                <Text style={styles.modalFieldLabel}>Private join mode</Text>
                <View style={styles.modalToggleRow}>
                  <Pressable
                    style={[
                      styles.modalToggle,
                      createRoomJoinPolicy === "invite_only"
                        ? styles.modalToggleActive
                        : undefined,
                    ]}
                    onPress={() => setCreateRoomJoinPolicy("invite_only")}
                  >
                    <Text style={styles.modalToggleText}>Invite Only</Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.modalToggle,
                      createRoomJoinPolicy === "approval"
                        ? styles.modalToggleActive
                        : undefined,
                    ]}
                    onPress={() => setCreateRoomJoinPolicy("approval")}
                  >
                    <Text style={styles.modalToggleText}>Approval</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <Text style={styles.modalInfoText}>
                Community rooms are open for everyone to join and chat.
              </Text>
            )}

            <View style={styles.modalButtonRow}>
              <Pressable
                style={[styles.modalButton, styles.modalCancelButton]}
                disabled={createRoomBusy}
                onPress={() => setCreateRoomModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.modalButton,
                  styles.modalConfirmButton,
                  createRoomBusy ? styles.buttonDisabled : undefined,
                ]}
                disabled={createRoomBusy}
                onPress={() => {
                  void confirmCreateRoom();
                }}
              >
                <Text style={styles.modalConfirmText}>
                  {createRoomBusy ? "Creating..." : "Create Room"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={createModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!createBusy) {
            setCreateModalVisible(false);
          }
        }}
      >
        <KeyboardAvoidingView
          style={styles.createMarketOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? hp(24) : 0}
        >
          <ScrollView
            contentContainerStyle={styles.createMarketOverlayContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.centerModalCard, styles.createMarketCard]}>
              <View style={styles.createMarketHeaderRow}>
                <View style={styles.createMarketIconWrap}>
                  <Ionicons
                    name="sparkles-outline"
                    size={ms(18)}
                    color="#1f8f4b"
                  />
                </View>
                <View style={styles.createMarketHeaderCopy}>
                  <Text style={styles.centerModalTitle}>
                    Create Room Market
                  </Text>
                  <Text style={styles.modalInfoText}>
                    Ask one clear question and set a deadline with taps.
                  </Text>
                </View>
              </View>

              <Text style={styles.modalFieldLabel}>Market title</Text>

              <TextInput
                value={createTitle}
                onChangeText={setCreateTitle}
                placeholder="Market title"
                placeholderTextColor="#9ea1a7"
                style={[styles.modalInput, styles.createMarketInput]}
                autoCapitalize="sentences"
                autoCorrect={false}
              />

              <View style={styles.deadlineCard}>
                <View style={styles.deadlineTopRow}>
                  <Text style={styles.modalFieldLabel}>Deadline</Text>
                  <Text style={styles.deadlineTimezoneBadge}>Local time</Text>
                </View>

                <Text style={styles.deadlineValue}>{createDeadlineLabel}</Text>
                <Text style={styles.deadlineHint}>{createDeadlineHint}</Text>

                <View style={styles.deadlineQuickRow}>
                  <Pressable
                    style={styles.deadlineQuickChip}
                    onPress={() => setCreateDeadlineHoursFromNow(1)}
                  >
                    <Text style={styles.deadlineQuickChipText}>+1 hour</Text>
                  </Pressable>

                  <Pressable
                    style={styles.deadlineQuickChip}
                    onPress={() => setCreateDeadlineHoursFromNow(6)}
                  >
                    <Text style={styles.deadlineQuickChipText}>+6 hours</Text>
                  </Pressable>

                  <Pressable
                    style={styles.deadlineQuickChip}
                    onPress={() => setCreateDeadlineTomorrowAt(21, 0)}
                  >
                    <Text style={styles.deadlineQuickChipText}>
                      Tomorrow 9:00 PM
                    </Text>
                  </Pressable>

                  <Pressable
                    style={styles.deadlineQuickChip}
                    onPress={() => shiftCreateDeadlineByDays(3)}
                  >
                    <Text style={styles.deadlineQuickChipText}>+3 days</Text>
                  </Pressable>
                </View>

                <View style={styles.deadlineAdjustRow}>
                  <Pressable
                    style={styles.deadlineAdjustBtn}
                    onPress={() => shiftCreateDeadlineByMinutes(-30)}
                  >
                    <Text style={styles.deadlineAdjustBtnText}>-30 min</Text>
                  </Pressable>

                  <Pressable
                    style={styles.deadlineAdjustBtn}
                    onPress={() => shiftCreateDeadlineByMinutes(30)}
                  >
                    <Text style={styles.deadlineAdjustBtnText}>+30 min</Text>
                  </Pressable>
                </View>

                <View style={styles.deadlineAdjustRow}>
                  <Pressable
                    style={styles.deadlineAdjustBtn}
                    onPress={() => shiftCreateDeadlineByDays(-1)}
                  >
                    <Text style={styles.deadlineAdjustBtnText}>-1 day</Text>
                  </Pressable>

                  <Pressable
                    style={styles.deadlineAdjustBtn}
                    onPress={() => shiftCreateDeadlineByDays(1)}
                  >
                    <Text style={styles.deadlineAdjustBtnText}>+1 day</Text>
                  </Pressable>
                </View>
              </View>

              {/*
              Polymarket URL input is intentionally hidden from the UI for now.
              Keep createPolymarketUrl state and submit wiring for future re-enable.
            */}

              <View style={styles.modalButtonRow}>
                <Pressable
                  style={[styles.modalButton, styles.modalCancelButton]}
                  onPress={() => {
                    if (!createBusy) {
                      setCreateModalVisible(false);
                    }
                  }}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.modalButton,
                    styles.modalConfirmButton,
                    createBusy ? styles.buttonDisabled : undefined,
                  ]}
                  disabled={createBusy}
                  onPress={() => {
                    void submitCreateMarket();
                  }}
                >
                  <Text style={styles.modalConfirmText}>
                    {createBusy ? "Creating..." : "Create Market"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={manageRoomModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeManageRoomModal}
      >
        <View style={styles.centerModalOverlay}>
          <View style={[styles.centerModalCard, styles.manageRoomModalCard]}>
            <View style={styles.manageRoomHeaderRow}>
              <Text style={styles.centerModalTitle}>Manage Room Access</Text>
              <Pressable
                style={styles.manageCloseBtn}
                disabled={inviteBusy || requestActionBusyKey !== null}
                onPress={closeManageRoomModal}
              >
                <Ionicons name="close" size={ms(18)} color="#5d6168" />
              </Pressable>
            </View>

            <Text style={styles.modalInfoText}>
              Invite members and approve pending requests for this private
              group.
            </Text>

            <Text style={styles.modalFieldLabel}>Invite by username</Text>
            <View style={styles.manageInviteRow}>
              <TextInput
                value={inviteUsernameDraft}
                onChangeText={setInviteUsernameDraft}
                placeholder="username"
                placeholderTextColor="#9ea1a7"
                style={[styles.modalInput, styles.manageInviteInput]}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!inviteBusy}
                onSubmitEditing={() => {
                  void submitRoomInvite();
                }}
              />
              <Pressable
                style={[
                  styles.manageInviteBtn,
                  inviteBusy ? styles.buttonDisabled : undefined,
                ]}
                disabled={inviteBusy}
                onPress={() => {
                  void submitRoomInvite();
                }}
              >
                <Text style={styles.manageInviteBtnText}>
                  {inviteBusy ? "Sending..." : "Invite"}
                </Text>
              </Pressable>
            </View>

            <Text style={styles.modalFieldLabel}>Pending Requests</Text>
            <ScrollView
              style={styles.manageListScroll}
              contentContainerStyle={styles.manageListContent}
              showsVerticalScrollIndicator={false}
            >
              {manageRoomBusy ? (
                <Text style={styles.manageEmptyText}>Loading...</Text>
              ) : roomRequests.length === 0 ? (
                <Text style={styles.manageEmptyText}>No pending requests.</Text>
              ) : (
                roomRequests.map((request) => {
                  const requestKey = request.privyUserId;
                  const approveKey = `approve:${requestKey}`;
                  const rejectKey = `reject:${requestKey}`;
                  const busy =
                    requestActionBusyKey === approveKey ||
                    requestActionBusyKey === rejectKey;

                  return (
                    <View key={requestKey} style={styles.manageRequestCard}>
                      <View style={styles.manageRequestMeta}>
                        <Text style={styles.manageRequestName}>
                          {request.username ?? request.privyUserId.slice(0, 10)}
                        </Text>
                        <Text style={styles.manageRequestSubtext}>
                          {formatMembershipStatusLabel(request.status)}
                        </Text>
                      </View>

                      <View style={styles.manageRequestActions}>
                        <Pressable
                          style={[
                            styles.manageRequestBtn,
                            styles.manageApproveBtn,
                            busy ? styles.buttonDisabled : undefined,
                          ]}
                          disabled={busy}
                          onPress={() => {
                            void submitRequestDecision(
                              request.privyUserId,
                              "approve",
                            );
                          }}
                        >
                          <Text style={styles.manageRequestBtnText}>
                            Approve
                          </Text>
                        </Pressable>

                        <Pressable
                          style={[
                            styles.manageRequestBtn,
                            styles.manageRejectBtn,
                            busy ? styles.buttonDisabled : undefined,
                          ]}
                          disabled={busy}
                          onPress={() => {
                            void submitRequestDecision(
                              request.privyUserId,
                              "reject",
                            );
                          }}
                        >
                          <Text style={styles.manageRequestBtnText}>
                            Reject
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>

            <Text style={styles.modalFieldLabel}>Active Members</Text>
            <ScrollView
              style={styles.manageListScroll}
              contentContainerStyle={styles.manageListContent}
              showsVerticalScrollIndicator={false}
            >
              {manageRoomBusy ? (
                <Text style={styles.manageEmptyText}>Loading...</Text>
              ) : roomMembers.length === 0 ? (
                <Text style={styles.manageEmptyText}>No active members.</Text>
              ) : (
                roomMembers.map((member) => (
                  <View
                    key={`${member.roomName}:${member.privyUserId}`}
                    style={styles.manageMemberCard}
                  >
                    <Text style={styles.manageMemberName}>
                      {member.username ?? member.privyUserId.slice(0, 10)}
                    </Text>
                    <Text style={styles.manageMemberRole}>
                      {formatRoleLabel(member.role)}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={actionModal.visible}
        transparent
        animationType="fade"
        onRequestClose={closeActionModal}
      >
        <View style={styles.centerModalOverlay}>
          <View style={styles.centerModalCard}>
            <Text style={styles.centerModalTitle}>
              {actionModal.action === "bet" && "Place Bet"}
              {actionModal.action === "resolve" && "Resolve Market"}
              {actionModal.action === "claim" && "Claim Winnings"}
            </Text>

            <Text style={styles.modalInfoText}>
              Market #{actionModal.market?.marketId ?? "-"}
            </Text>

            {actionModal.action === "bet" ? (
              <>
                <View style={styles.modalToggleRow}>
                  <Pressable
                    style={[
                      styles.modalToggle,
                      betOutcomeYes ? styles.modalToggleActive : undefined,
                    ]}
                    onPress={() => setBetOutcomeYes(true)}
                  >
                    <Text style={styles.modalToggleText}>YES</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.modalToggle,
                      !betOutcomeYes ? styles.modalToggleActive : undefined,
                    ]}
                    onPress={() => setBetOutcomeYes(false)}
                  >
                    <Text style={styles.modalToggleText}>NO</Text>
                  </Pressable>
                </View>

                <TextInput
                  value={betAmountStrk}
                  onChangeText={setBetAmountStrk}
                  placeholder="Amount in STRK"
                  placeholderTextColor="#9ea1a7"
                  keyboardType="decimal-pad"
                  style={styles.modalInput}
                />
              </>
            ) : null}

            {actionModal.action === "resolve" ? (
              <View style={styles.modalToggleRow}>
                <Pressable
                  style={[
                    styles.modalToggle,
                    resolveYes ? styles.modalToggleActive : undefined,
                  ]}
                  onPress={() => setResolveYes(true)}
                >
                  <Text style={styles.modalToggleText}>WIN YES</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.modalToggle,
                    !resolveYes ? styles.modalToggleActive : undefined,
                  ]}
                  onPress={() => setResolveYes(false)}
                >
                  <Text style={styles.modalToggleText}>WIN NO</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.modalButtonRow}>
              <Pressable
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={closeActionModal}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.modalButton,
                  styles.modalConfirmButton,
                  actionBusy ? styles.buttonDisabled : undefined,
                ]}
                disabled={actionBusy}
                onPress={() => {
                  void submitMarketAction();
                }}
              >
                <Text style={styles.modalConfirmText}>
                  {actionBusy ? "Submitting..." : "Confirm"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  /* ── scaffold ──────────────────────────────────────────── */
  screen: {
    flex: 1,
    backgroundColor: "#faf9f7",
  },
  scroll: {
    flex: 1,
  },
  contentWrap: {
    paddingHorizontal: wp(20),
    paddingTop: hp(8),
    paddingBottom: hp(100),
    gap: hp(16),
  },

  /* ── header ────────────────────────────────────────────── */
  topHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginTop: hp(4),
  },
  screenTitle: {
    color: "#1a1d22",
    fontFamily: "Inter_600SemiBold",
    fontSize: ms(28),
    letterSpacing: -0.3,
  },
  screenSubtitle: {
    color: "#8e9196",
    fontFamily: "Inter_500Medium",
    fontSize: ms(14),
    marginTop: hp(2),
  },
  miniHeaderBtn: {
    width: wp(36),
    height: wp(36),
    borderRadius: wp(18),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    marginTop: hp(6),
  },

  /* ── search ────────────────────────────────────────────── */
  searchRow: {
    height: hp(50),
    borderRadius: wp(16),
    borderWidth: 1,
    borderColor: "#e8e8e8",
    backgroundColor: "#ffffff",
    paddingHorizontal: wp(14),
    flexDirection: "row",
    alignItems: "center",
    gap: wp(10),
  },
  searchInput: {
    flex: 1,
    color: "#1a1d22",
    fontFamily: "Inter_500Medium",
    fontSize: ms(15),
  },
  searchJoinBtn: {
    width: wp(30),
    height: wp(30),
    borderRadius: wp(15),
    backgroundColor: "#2daa57",
    alignItems: "center",
    justifyContent: "center",
  },

  /* ── section ───────────────────────────────────────────── */
  sectionTitle: {
    color: "#1e2126",
    fontFamily: "Inter_600SemiBold",
    fontSize: ms(18),
    letterSpacing: -0.15,
    marginTop: hp(4),
  },

  /* ── group cards ───────────────────────────────────────── */
  groupCard: {
    borderRadius: wp(18),
    borderWidth: 1,
    borderColor: "#ebebeb",
    backgroundColor: "#ffffff",
    paddingHorizontal: wp(16),
    paddingVertical: hp(14),
    flexDirection: "row",
    alignItems: "center",
    gap: wp(14),
  },
  groupIconCircle: {
    width: wp(46),
    height: wp(46),
    borderRadius: wp(23),
    backgroundColor: "#2daa57",
    alignItems: "center",
    justifyContent: "center",
  },
  groupMainCopy: {
    flex: 1,
    gap: hp(2),
  },
  groupTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: wp(8),
  },
  groupName: {
    color: "#1c1f24",
    fontFamily: "Inter_600SemiBold",
    fontSize: ms(16),
  },
  groupTypeBadge: {
    borderRadius: wp(8),
    paddingHorizontal: wp(8),
    paddingVertical: hp(3),
  },
  groupTypeBadgePrivate: {
    backgroundColor: "#e8efff",
  },
  groupTypeBadgeCommunity: {
    backgroundColor: "#e8f7ed",
  },
  groupTypeBadgeText: {
    color: "#2c394f",
    fontFamily: "Inter_600SemiBold",
    fontSize: ms(10),
    textTransform: "uppercase",
  },
  groupSubtitle: {
    color: "#8c9097",
    fontFamily: "Inter_500Medium",
    fontSize: ms(13),
  },
  groupPolicyText: {
    color: "#a2a5ab",
    fontFamily: "Inter_500Medium",
    fontSize: ms(11),
  },
  groupMetaColumn: {
    alignItems: "flex-end",
    gap: hp(6),
  },
  groupTime: {
    color: "#a5a8ad",
    fontFamily: "Inter_500Medium",
    fontSize: ms(12),
  },
  groupPendingBadge: {
    color: "#8a5a00",
    backgroundColor: "#fff1cc",
    borderRadius: wp(6),
    paddingHorizontal: wp(6),
    paddingVertical: hp(3),
    fontFamily: "Inter_600SemiBold",
    fontSize: ms(10),
    textTransform: "uppercase",
  },
  emptyRoomCopy: {
    color: "#8c9097",
    fontFamily: "Inter_500Medium",
    fontSize: ms(13),
    marginTop: hp(-8),
    marginBottom: hp(4),
  },

  /* ── create room ───────────────────────────────────────── */
  createRoomButton: {
    height: hp(54),
    borderRadius: wp(16),
    backgroundColor: "#2daa57",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: wp(8),
    shadowColor: "#1b7a39",
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  createRoomLabel: {
    color: "#ffffff",
    fontFamily: "Inter_600SemiBold",
    fontSize: ms(16),
  },

  /* ── chat view ─────────────────────────────────────────── */
  chatWrap: {
    flex: 1,
    backgroundColor: "#faf9f7",
    paddingTop: hp(4),
  },
  chatHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: wp(20),
    paddingBottom: hp(12),
    borderBottomWidth: 1,
    borderBottomColor: "#ebebeb",
  },
  chatHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: wp(6),
  },
  headerIconBtn: {
    width: wp(36),
    height: wp(36),
    borderRadius: wp(18),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f0f0ee",
  },
  chatTitle: {
    flex: 1,
    textAlign: "center",
    color: "#1c1f24",
    fontFamily: "Inter_600SemiBold",
    fontSize: ms(18),
    letterSpacing: -0.2,
  },

  /* ── meta / error ──────────────────────────────────────── */
  metaStatus: {
    color: "#a5a8ad",
    fontFamily: "Inter_500Medium",
    fontSize: ms(12),
    paddingHorizontal: wp(20),
    marginTop: hp(4),
  },
  errorText: {
    color: "#c34635",
    fontFamily: "Inter_500Medium",
    fontSize: ms(12),
    paddingHorizontal: wp(20),
    marginBottom: hp(4),
  },

  /* ── messages ──────────────────────────────────────────── */
  messagesScroll: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: wp(16),
    paddingTop: hp(10),
    paddingBottom: hp(16),
    gap: hp(6),
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  messageRowMine: {
    justifyContent: "flex-end",
  },
  messageRowOther: {
    justifyContent: "flex-start",
  },
  messageBubble: {
    maxWidth: "78%",
    paddingHorizontal: wp(14),
    paddingVertical: hp(10),
    gap: hp(2),
  },
  mineBubble: {
    backgroundColor: "#2daa57",
    borderTopLeftRadius: wp(18),
    borderBottomLeftRadius: wp(18),
    borderBottomRightRadius: wp(4),
    borderTopRightRadius: wp(18),
  },
  otherBubble: {
    backgroundColor: "#ffffff",
    borderTopRightRadius: wp(18),
    borderBottomRightRadius: wp(18),
    borderBottomLeftRadius: wp(4),
    borderTopLeftRadius: wp(18),
    borderWidth: 1,
    borderColor: "#ebebeb",
  },
  messageUser: {
    fontFamily: "Inter_600SemiBold",
    fontSize: ms(11),
  },
  mineMetaText: {
    color: "rgba(255,255,255,0.65)",
  },
  otherMetaText: {
    color: "#a5a8ad",
  },
  messageText: {
    fontFamily: "Inter_500Medium",
    fontSize: ms(15),
    lineHeight: ms(21),
  },
  mineText: {
    color: "#ffffff",
  },
  otherText: {
    color: "#1c1f24",
  },
  messageTime: {
    fontFamily: "Inter_500Medium",
    fontSize: ms(10),
    alignSelf: "flex-end",
    marginTop: hp(2),
  },

  /* ── composer ──────────────────────────────────────────── */
  composerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: wp(8),
    paddingHorizontal: wp(16),
    paddingVertical: hp(10),
    borderTopWidth: 1,
    borderTopColor: "#ebebeb",
    backgroundColor: "#faf9f7",
  },
  plusBtn: {
    width: wp(36),
    height: wp(36),
    borderRadius: wp(18),
    alignItems: "center",
    justifyContent: "center",
  },
  messageInput: {
    flex: 1,
    height: hp(44),
    borderRadius: wp(22),
    backgroundColor: "#ffffff",
    paddingHorizontal: wp(16),
    color: "#1c1f24",
    fontFamily: "Inter_500Medium",
    fontSize: ms(15),
    borderWidth: 1,
    borderColor: "#e8e8e8",
  },
  sendBtn: {
    width: wp(40),
    height: wp(40),
    borderRadius: wp(20),
    backgroundColor: "#2daa57",
    alignItems: "center",
    justifyContent: "center",
  },

  /* ── drawer ────────────────────────────────────────────── */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.24)",
    justifyContent: "flex-start",
  },
  drawerPanel: {
    flex: 1,
    backgroundColor: "#0c0f14",
    paddingHorizontal: wp(16),
    paddingTop: hp(20),
    paddingBottom: hp(14),
  },
  drawerHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: hp(8),
  },
  drawerTitle: {
    flex: 1,
    marginLeft: wp(12),
    color: "#ffffff",
    fontSize: ms(22),
    fontWeight: "800",
  },
  drawerRefreshBtn: {
    width: wp(34),
    height: wp(34),
    borderRadius: wp(17),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1b232e",
  },
  drawerSubtext: {
    color: "#828d9c",
    fontSize: ms(12),
    marginBottom: hp(16),
  },
  drawerScroll: {
    flex: 1,
  },
  drawerEmptyCard: {
    borderRadius: wp(16),
    borderWidth: 1,
    borderColor: "#242a35",
    backgroundColor: "#151921",
    minHeight: hp(90),
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: wp(12),
  },
  drawerEmptyText: {
    color: "#7b8798",
    fontSize: ms(14),
  },
  marketCard: {
    borderRadius: wp(18),
    borderWidth: 1,
    borderColor: "#1e242f",
    backgroundColor: "#12161c",
    paddingHorizontal: wp(14),
    paddingVertical: hp(14),
    marginBottom: hp(12),
    gap: hp(6),
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
  },
  marketTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: wp(12),
    borderBottomWidth: 1,
    borderBottomColor: "#1d232e",
    paddingBottom: hp(10),
    marginBottom: hp(6),
  },
  marketBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: wp(6),
    marginTop: hp(2),
  },
  marketTitle: {
    flex: 1,
    color: "#ffffff",
    fontSize: ms(16),
    fontWeight: "700",
    lineHeight: ms(22),
  },
  marketStageBadge: {
    fontSize: ms(10),
    fontWeight: "800",
    textTransform: "uppercase",
    borderRadius: wp(6),
    paddingHorizontal: wp(6),
    paddingVertical: hp(4),
  },
  marketStageOpenBadge: {
    color: "#e4ebf5",
    backgroundColor: "#3b82f6",
  },
  marketStageResolvedBadge: {
    color: "#1a3c28",
    backgroundColor: "#4ade80",
  },
  mineBadge: {
    color: "#1e293b",
    backgroundColor: "#cbd5e1",
    fontSize: ms(10),
    fontWeight: "800",
    textTransform: "uppercase",
    borderRadius: wp(6),
    paddingHorizontal: wp(6),
    paddingVertical: hp(4),
  },
  marketMeta: {
    color: "#94a3b8",
    fontSize: ms(12),
    fontWeight: "500",
  },
  claimHintText: {
    color: "#7c8ea6",
    fontSize: ms(11),
    fontWeight: "500",
    marginTop: hp(4),
  },
  placedBetBadge: {
    color: "#854d0e",
    backgroundColor: "#fef08a",
    fontSize: ms(11),
    fontWeight: "800",
    borderRadius: wp(6),
    alignSelf: "flex-start",
    paddingHorizontal: wp(8),
    paddingVertical: hp(4),
    marginTop: hp(6),
  },
  claimedBadge: {
    color: "#14532d",
    backgroundColor: "#bbf7d0",
    fontSize: ms(11),
    fontWeight: "800",
    borderRadius: wp(6),
    alignSelf: "flex-start",
    paddingHorizontal: wp(8),
    paddingVertical: hp(4),
    marginTop: hp(6),
  },
  marketActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: wp(10),
    marginTop: hp(10),
  },
  marketActionBtn: {
    borderRadius: wp(12),
    backgroundColor: "#2563eb",
    paddingHorizontal: wp(14),
    paddingVertical: hp(10),
    minWidth: wp(80),
    alignItems: "center",
  },
  marketActionResolveBtn: {
    backgroundColor: "#16a34a",
  },
  marketActionClaimBtn: {
    backgroundColor: "#7c3aed",
  },
  marketActionLabel: {
    color: "#ffffff",
    fontSize: ms(13),
    fontWeight: "800",
  },

  /* ── modals ────────────────────────────────────────────── */
  centerModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.28)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: wp(22),
  },
  createMarketOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  createMarketOverlayContent: {
    flexGrow: 1,
    justifyContent: "flex-start",
    paddingHorizontal: wp(22),
    paddingTop: hp(44),
    paddingBottom: hp(18),
  },
  centerModalCard: {
    width: "100%",
    borderRadius: wp(22),
    borderWidth: 1,
    borderColor: "#e8e8e8",
    backgroundColor: "#ffffff",
    paddingHorizontal: wp(18),
    paddingVertical: hp(18),
    gap: hp(12),
  },
  createMarketCard: {
    borderColor: "#d6e9dc",
    backgroundColor: "#fcfffd",
    shadowColor: "#13311f",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  manageRoomModalCard: {
    maxHeight: "88%",
  },
  manageRoomHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  manageCloseBtn: {
    width: wp(30),
    height: wp(30),
    borderRadius: wp(15),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f0f0ee",
  },
  manageInviteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: wp(8),
  },
  manageInviteInput: {
    flex: 1,
  },
  manageInviteBtn: {
    minHeight: hp(44),
    borderRadius: wp(12),
    paddingHorizontal: wp(14),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2daa57",
  },
  manageInviteBtnText: {
    color: "#ffffff",
    fontFamily: "Inter_600SemiBold",
    fontSize: ms(13),
  },
  manageListScroll: {
    maxHeight: hp(160),
  },
  manageListContent: {
    gap: hp(8),
    paddingBottom: hp(4),
  },
  manageEmptyText: {
    color: "#8c9097",
    fontFamily: "Inter_500Medium",
    fontSize: ms(12),
  },
  manageRequestCard: {
    borderRadius: wp(12),
    borderWidth: 1,
    borderColor: "#e9e9e9",
    backgroundColor: "#fdfdfc",
    paddingHorizontal: wp(12),
    paddingVertical: hp(10),
    gap: hp(8),
  },
  manageRequestMeta: {
    gap: hp(2),
  },
  manageRequestName: {
    color: "#1f2937",
    fontFamily: "Inter_600SemiBold",
    fontSize: ms(13),
  },
  manageRequestSubtext: {
    color: "#7f848c",
    fontFamily: "Inter_500Medium",
    fontSize: ms(11),
  },
  manageRequestActions: {
    flexDirection: "row",
    gap: wp(8),
  },
  manageRequestBtn: {
    flex: 1,
    minHeight: hp(36),
    borderRadius: wp(10),
    alignItems: "center",
    justifyContent: "center",
  },
  manageApproveBtn: {
    backgroundColor: "#2daa57",
  },
  manageRejectBtn: {
    backgroundColor: "#d64c3b",
  },
  manageRequestBtnText: {
    color: "#ffffff",
    fontFamily: "Inter_600SemiBold",
    fontSize: ms(12),
  },
  manageMemberCard: {
    borderRadius: wp(12),
    borderWidth: 1,
    borderColor: "#ececec",
    backgroundColor: "#ffffff",
    paddingHorizontal: wp(12),
    paddingVertical: hp(9),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  manageMemberName: {
    color: "#1f2937",
    fontFamily: "Inter_500Medium",
    fontSize: ms(13),
  },
  manageMemberRole: {
    color: "#5b6470",
    fontFamily: "Inter_600SemiBold",
    fontSize: ms(11),
    textTransform: "uppercase",
  },
  createMarketHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: wp(10),
  },
  createMarketIconWrap: {
    width: wp(36),
    height: wp(36),
    borderRadius: wp(18),
    backgroundColor: "#e7f6ed",
    alignItems: "center",
    justifyContent: "center",
  },
  createMarketHeaderCopy: {
    flex: 1,
    gap: hp(2),
  },
  centerModalTitle: {
    color: "#1c1f24",
    fontFamily: "Inter_600SemiBold",
    fontSize: ms(20),
  },
  modalInfoText: {
    color: "#8c9097",
    fontFamily: "Inter_500Medium",
    fontSize: ms(13),
  },
  modalFieldLabel: {
    color: "#1f2937",
    fontFamily: "Inter_600SemiBold",
    fontSize: ms(13),
  },
  modalInput: {
    minHeight: hp(48),
    borderRadius: wp(14),
    borderWidth: 1,
    borderColor: "#e8e8e8",
    backgroundColor: "#faf9f7",
    paddingHorizontal: wp(14),
    color: "#1c1f24",
    fontFamily: "Inter_500Medium",
    fontSize: ms(15),
  },
  createMarketInput: {
    borderColor: "#dce8df",
    backgroundColor: "#ffffff",
  },
  deadlineCard: {
    borderRadius: wp(16),
    borderWidth: 1,
    borderColor: "#d8e8dc",
    backgroundColor: "#f5fbf7",
    paddingHorizontal: wp(12),
    paddingVertical: hp(12),
    gap: hp(8),
  },
  deadlineTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  deadlineTimezoneBadge: {
    color: "#17643a",
    backgroundColor: "#ddf5e7",
    borderRadius: wp(8),
    paddingHorizontal: wp(8),
    paddingVertical: hp(3),
    fontFamily: "Inter_600SemiBold",
    fontSize: ms(10),
    textTransform: "uppercase",
  },
  deadlineValue: {
    color: "#13251a",
    fontFamily: "Inter_600SemiBold",
    fontSize: ms(16),
  },
  deadlineHint: {
    color: "#5e7063",
    fontFamily: "Inter_500Medium",
    fontSize: ms(12),
  },
  deadlineQuickRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: wp(8),
    marginTop: hp(2),
  },
  deadlineQuickChip: {
    borderRadius: wp(11),
    borderWidth: 1,
    borderColor: "#c6decf",
    backgroundColor: "#ffffff",
    paddingHorizontal: wp(10),
    paddingVertical: hp(7),
  },
  deadlineQuickChipText: {
    color: "#215c3a",
    fontFamily: "Inter_600SemiBold",
    fontSize: ms(12),
  },
  deadlineAdjustRow: {
    flexDirection: "row",
    gap: wp(8),
  },
  deadlineAdjustBtn: {
    flex: 1,
    minHeight: hp(36),
    borderRadius: wp(10),
    borderWidth: 1,
    borderColor: "#d3e3d8",
    backgroundColor: "#fdfefd",
    alignItems: "center",
    justifyContent: "center",
  },
  deadlineAdjustBtnText: {
    color: "#2b5d3f",
    fontFamily: "Inter_600SemiBold",
    fontSize: ms(12),
  },
  modalButtonRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: wp(10),
    marginTop: hp(4),
  },
  modalButton: {
    minHeight: hp(44),
    borderRadius: wp(14),
    paddingHorizontal: wp(18),
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelButton: {
    backgroundColor: "#f0f0ee",
  },
  modalConfirmButton: {
    backgroundColor: "#2daa57",
  },
  modalCancelText: {
    color: "#3f4349",
    fontFamily: "Inter_600SemiBold",
    fontSize: ms(14),
  },
  modalConfirmText: {
    color: "#ffffff",
    fontFamily: "Inter_600SemiBold",
    fontSize: ms(14),
  },
  modalToggleRow: {
    flexDirection: "row",
    gap: wp(10),
  },
  modalToggle: {
    flex: 1,
    minHeight: hp(44),
    borderRadius: wp(14),
    borderWidth: 1,
    borderColor: "#e8e8e8",
    backgroundColor: "#f0f0ee",
    alignItems: "center",
    justifyContent: "center",
  },
  modalToggleActive: {
    borderColor: "#2daa57",
    backgroundColor: "#e8f7ed",
  },
  modalToggleText: {
    color: "#1c1f24",
    fontFamily: "Inter_600SemiBold",
    fontSize: ms(13),
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
