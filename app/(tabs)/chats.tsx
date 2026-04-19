import '@/lib/runtime-polyfills';
import { usePrivy } from '@privy-io/expo';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { API_BASE_URL, WS_BASE_URL } from '@/lib/config';
import { readErrorMessage, shortenAddress } from '@/lib/http';
import {
  connectRealtimeSocket,
  fetchMyProfile,
  fetchMyTransactions,
  type ProfileMeResponse,
  type UserTransactionActivity,
} from '@/lib/profile';
import { ONBOARDING_COLORS } from '@/lib/onboarding-theme';

type RoomSummary = {
  roomName: string;
  createdAt: string;
  memberCount: number;
};

type RoomMessage = {
  id: string;
  type: 'message_received';
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
  | { type: 'connection'; clientId: string }
  | { type: 'error'; message: string }
  | { type: 'room_joined'; room: string }
  | { type: 'room_left'; room: string }
  | { type: 'message_history'; messages: RoomMessage[] }
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
};

type MarketActionType = 'bet' | 'resolve' | 'claim';

type MarketActionModalState = {
  visible: boolean;
  action: MarketActionType;
  market: ActiveMarketCard | null;
};

const MSG = {
  JOIN_ROOM: 'join_room',
  LEAVE_ROOM: 'leave_room',
  CHAT_MESSAGE: 'chat_message',
} as const;

const ROOM_ICONS = ['football-outline', 'trending-up-outline', 'american-football-outline', 'basketball-outline'];

function normalizeHexAddress(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  if (!trimmed.startsWith('0x')) {
    return null;
  }

  const withoutLeading = trimmed.slice(2).replace(/^0+/, '');
  return `0x${withoutLeading || '0'}`;
}

function formatRoomTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) {
    return '-';
  }

  const now = new Date();
  const sameDay = now.toDateString() === date.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatMessageTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) {
    return '';
  }
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDeadline(unix: string | null): string {
  if (!unix || !/^\d+$/.test(unix)) {
    return 'No deadline';
  }

  const milliseconds = Number(unix) * 1000;
  const date = new Date(milliseconds);
  if (Number.isNaN(date.valueOf())) {
    return 'No deadline';
  }

  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function parseStrkToWei(value: string): string | null {
  const normalized = value.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }

  const [wholePart, fractionalPart = ''] = normalized.split('.');
  const whole = BigInt(wholePart);
  const fractionPadded = `${fractionalPart}${'0'.repeat(18)}`.slice(0, 18);
  const fraction = BigInt(fractionPadded || '0');

  const wei = whole * 10n ** 18n + fraction;
  if (wei <= 0n) {
    return null;
  }

  return wei.toString();
}

function toAsciiTitle(raw: string): string {
  return raw
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
    .slice(0, 31);
}

function normalizeRoomName(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[^\x20-\x7E]/g, '')
    .slice(0, 40);
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

    const seconds = parsed > 1_000_000_000_000 ? Math.trunc(parsed / 1000) : Math.trunc(parsed);
    return seconds > 0 ? String(seconds) : null;
  }

  const compact = trimmed.replace(/\s+/g, ' ');
  const normalized =
    /^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}$/.test(compact) ? compact.replace(' ', 'T') : compact;

  const parsedDate = new Date(normalized);
  if (Number.isNaN(parsedDate.valueOf())) {
    return null;
  }

  return String(Math.trunc(parsedDate.getTime() / 1000));
}

function marketStageLabel(market: ActiveMarketCard): string {
  if (market.resolved) {
    return 'Resolved';
  }

  if (market.canResolve) {
    return 'Awaiting Resolution';
  }

  return 'Open';
}

export default function ChatsScreen() {
  const { user, getAccessToken } = usePrivy();
  const authenticated = Boolean(user);
  const { width } = useWindowDimensions();

  const wsRef = useRef<WebSocket | null>(null);
  const messageScrollRef = useRef<ScrollView | null>(null);

  const [status, setStatus] = useState('Ready');
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const [clientId, setClientId] = useState<string | null>(null);
  const [identity, setIdentity] = useState<ProfileMeResponse | null>(null);

  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [roomDraft, setRoomDraft] = useState('');
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [createRoomModalVisible, setCreateRoomModalVisible] = useState(false);
  const [createRoomNameDraft, setCreateRoomNameDraft] = useState('');

  const [roomMessages, setRoomMessages] = useState<RoomMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState('');

  const [activeMarkets, setActiveMarkets] = useState<ActiveMarketCard[]>([]);
  const [refreshingRooms, setRefreshingRooms] = useState(false);
  const [refreshingMessages, setRefreshingMessages] = useState(false);
  const [refreshingMarkets, setRefreshingMarkets] = useState(false);

  const [drawerVisible, setDrawerVisible] = useState(false);
  const drawerTranslateX = useRef(new Animated.Value(-(width * 0.78))).current;

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createDeadlineInput, setCreateDeadlineInput] = useState('');
  const [createPolymarketUrl, setCreatePolymarketUrl] = useState('');
  const [createBusy, setCreateBusy] = useState(false);

  const [actionModal, setActionModal] = useState<MarketActionModalState>({
    visible: false,
    action: 'bet',
    market: null,
  });
  const [actionBusy, setActionBusy] = useState(false);
  const [betAmountStrk, setBetAmountStrk] = useState('10');
  const [betOutcomeYes, setBetOutcomeYes] = useState(true);
  const [resolveYes, setResolveYes] = useState(true);

  const myUsername = identity?.profile?.username ?? null;
  const myWalletAddress = identity?.wallet?.address ?? null;

  const drawerWidth = useMemo(() => Math.min(width * 0.8, 420), [width]);

  const buildHeaders = useCallback(async (): Promise<HeadersInit> => {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
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
      const message = loadError instanceof Error ? loadError.message : 'Failed to load identity';
      setError(message);
    }
  }, [authenticated, getAccessToken]);

  const loadRooms = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/chat/rooms?limit=100`);
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as { rooms: RoomSummary[] };
      setRooms(payload.rooms);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Failed to load rooms';
      setError(message);
    }
  }, []);

  const loadRoomMessages = useCallback(async (roomName: string) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/chat/rooms/${encodeURIComponent(roomName)}/messages?limit=80`,
      );
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as { messages: RoomMessage[] };
      setRoomMessages(payload.messages);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Failed to load room messages';
      setError(message);
    }
  }, []);

  const loadActiveRoomMarkets = useCallback(
    async (roomName: string) => {
      try {
        const pageSize = 50;
        const roomMarkets: RoomContractMarket[] = [];

        for (let offset = 0; offset <= 450; offset += pageSize) {
          const marketsResponse = await fetch(
            `${API_BASE_URL}/api/chat/rooms/${encodeURIComponent(roomName)}/markets?limit=${pageSize}&offset=${offset}`,
          );

          if (!marketsResponse.ok) {
            throw new Error(await readErrorMessage(marketsResponse));
          }

          const marketsPayload = (await marketsResponse.json()) as { markets: RoomContractMarket[] };
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
          ? await fetchMyTransactions(getAccessToken, 50).catch(() => ({
              transactions: [] as UserTransactionActivity[],
              limit: 50,
            }))
          : { transactions: [] as UserTransactionActivity[], limit: 50 };

        const betPlacedSet = new Set(
          transactionsResponse.transactions
            .filter((transaction) => transaction.status === 'success' && transaction.action === 'Bet Placed')
            .map((transaction) => {
              const metadata = transaction.metadata as { marketId?: unknown };
              return String(metadata.marketId ?? '');
            }),
        );

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
                ),
                authenticated
                  ? fetch(
                      `${API_BASE_URL}/api/chat/rooms/${encodeURIComponent(roomName)}/markets/${encodeURIComponent(market.marketId)}/can-resolve`,
                      { headers: await buildHeaders() },
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

            const creator = detail?.chain.creator ?? market.createdByWalletAddress;
            const title = detail?.chain.questionAscii ?? market.title ?? `Market #${market.marketId}`;
            const resolved = detail?.chain.resolved ?? canResolvePayload?.isResolved ?? false;
            const winningOutcome = resolved ? detail?.chain.winningOutcome ?? null : null;
            const deadlineUnix = detail?.chain.deadlineUnix ?? market.deadlineUnix ?? null;
            const yesPool = detail?.chain.yesPool ?? '0';
            const noPool = detail?.chain.noPool ?? '0';
            const totalPool = detail?.chain.totalPool ?? '0';

            const normalizedCreator = normalizeHexAddress(creator);
            const normalizedMine = normalizeHexAddress(myWalletAddress);
            const isMine = normalizedCreator !== null && normalizedMine !== null && normalizedCreator === normalizedMine;

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
              hasPlacedBet: betPlacedSet.has(String(market.marketId)),
            } as ActiveMarketCard;
          }),
        );

        setActiveMarkets(enriched);
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : 'Failed to load room markets';
        setError(message);
      }
    },
    [authenticated, getAccessToken, buildHeaders, myWalletAddress],
  );

  const sendWs = useCallback((payload: Record<string, unknown>) => {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setError('Realtime socket is not connected');
      return;
    }

    socket.send(JSON.stringify(payload));
  }, []);

  const connectSocket = useCallback(async () => {
    if (!authenticated) {
      setIsConnected(false);
      setStatus('Authenticate with Privy to chat');
      return;
    }

    const current = wsRef.current;
    if (current && (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    setError(null);
    setStatus('Connecting...');

    try {
      await loadIdentity();
      const socket = await connectRealtimeSocket(getAccessToken, WS_BASE_URL);
      wsRef.current = socket;

      socket.onopen = () => {
        setIsConnected(true);
        setStatus('Connected');
      };

      socket.onclose = () => {
        setIsConnected(false);
        setStatus('Disconnected');
      };

      socket.onerror = () => {
        setIsConnected(false);
        setStatus('Socket error');
        setError('Realtime socket error');
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as WsServerMessage;

          switch (payload.type) {
            case 'connection':
              setClientId(payload.clientId);
              return;
            case 'error':
              setError(payload.message);
              return;
            case 'room_joined':
              setActiveRoom(payload.room);
              setStatus(`Joined #${payload.room}`);
              void loadRooms();
              return;
            case 'room_left':
              setActiveRoom(null);
              setRoomMessages([]);
              setActiveMarkets([]);
              setStatus('Left room');
              void loadRooms();
              return;
            case 'message_history':
              setRoomMessages(payload.messages);
              return;
            case 'message_received':
              setRoomMessages((previous) => [...previous, payload]);
              return;
            default:
              return;
          }
        } catch {
          setError('Invalid websocket payload');
        }
      };
    } catch (connectError) {
      const message = connectError instanceof Error ? connectError.message : 'Socket auth failed';
      setError(message);
      setStatus('Socket auth failed');
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
      await loadRooms();
    } finally {
      setRefreshingMessages(false);
    }
  }, [activeRoom, drawerVisible, loadRoomMessages, loadActiveRoomMarkets, loadRooms, refreshRooms]);

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

  useFocusEffect(
    useCallback(() => {
      void loadRooms();

      if (activeRoom) {
        void loadRoomMessages(activeRoom);
        if (drawerVisible) {
          void loadActiveRoomMarkets(activeRoom);
        }
      }

      const interval = setInterval(() => {
        if (activeRoom) {
          void loadRoomMessages(activeRoom);
          if (drawerVisible) {
            void loadActiveRoomMarkets(activeRoom);
          }
        } else {
          void loadRooms();
        }
      }, activeRoom ? 5000 : 7000);

      return () => {
        clearInterval(interval);
      };
    }, [activeRoom, drawerVisible, loadRooms, loadRoomMessages, loadActiveRoomMarkets]),
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
      setError('Please enter a room name');
      return;
    }

    setError(null);
    setRoomMessages([]);
    setActiveMarkets([]);
    setRoomDraft(normalized);
    sendWs({ type: MSG.JOIN_ROOM, room: normalized });
    setActiveRoom(normalized);
    void loadRooms();
  }

  function openCreateRoomPrompt() {
    setError(null);
    setCreateRoomNameDraft(roomDraft.trim());
    setCreateRoomModalVisible(true);
  }

  function confirmCreateRoom() {
    const normalized = normalizeRoomName(createRoomNameDraft);
    if (!normalized) {
      setError('Please add a room name before creating');
      return;
    }

    setCreateRoomModalVisible(false);
    joinRoom(normalized);
  }

  function joinRoomFromDraft() {
    const normalized = normalizeRoomName(roomDraft);
    if (!normalized) {
      setError('Type a room name to join');
      return;
    }

    joinRoom(normalized);
  }

  function backToRooms() {
    sendWs({ type: MSG.LEAVE_ROOM });
    setActiveRoom(null);
    setDrawerVisible(false);
    setCreateModalVisible(false);
    setActionModal({ visible: false, action: 'bet', market: null });
    void loadRooms();
  }

  function sendRoomMessage() {
    const content = messageDraft.trim();
    if (!content || !activeRoom) {
      return;
    }

    sendWs({ type: MSG.CHAT_MESSAGE, content });
    setMessageDraft('');
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

  function openActionModal(action: MarketActionType, market: ActiveMarketCard) {
    setActionModal({ visible: true, action, market });
  }

  function closeActionModal() {
    if (actionBusy) {
      return;
    }
    setActionModal({ visible: false, action: 'bet', market: null });
  }

  async function submitCreateMarket() {
    if (!activeRoom) {
      return;
    }

    const title = toAsciiTitle(createTitle);
    if (!title) {
      setError('Title is required (ASCII, max 31 chars)');
      return;
    }

    const deadlineUnix = parseDeadlineToUnix(createDeadlineInput);
    if (!deadlineUnix) {
      setError('Enter deadline like 2026-05-20 18:30');
      return;
    }

    if (Number(deadlineUnix) <= Math.trunc(Date.now() / 1000)) {
      setError('Deadline must be in the future');
      return;
    }

    try {
      setCreateBusy(true);
      setError(null);
      setStatus('Creating market...');

      const marketCountResponse = await fetch(`${API_BASE_URL}/api/market-count`);
      if (!marketCountResponse.ok) {
        throw new Error(await readErrorMessage(marketCountResponse));
      }

      const marketCountPayload = (await marketCountResponse.json()) as { count?: string; raw?: string };
      const beforeCount = BigInt(marketCountPayload.count ?? marketCountPayload.raw ?? '0');
      const inferredMarketId = beforeCount.toString();

      let externalMarketLinkId: string | undefined;
      const trimmedExternalUrl = createPolymarketUrl.trim();

      if (trimmedExternalUrl) {
        const externalResponse = await fetch(
          `${API_BASE_URL}/api/chat/rooms/${encodeURIComponent(activeRoom)}/external-markets`,
          {
            method: 'POST',
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
        method: 'POST',
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
          method: 'POST',
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

      setCreateTitle('');
      setCreateDeadlineInput('');
      setCreatePolymarketUrl('');
      setCreateModalVisible(false);
      setStatus(`Market #${inferredMarketId} created`);

      await loadActiveRoomMarkets(activeRoom);
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : 'Create market failed';
      setError(message);
      setStatus('Create market failed');
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

      if (action === 'bet') {
        const amountWei = parseStrkToWei(betAmountStrk);
        if (!amountWei) {
          throw new Error('Enter a valid STRK amount > 0');
        }

        const response = await fetch(`${API_BASE_URL}/place-bet`, {
          method: 'POST',
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
          content: `Placed ${betOutcomeYes ? 'YES' : 'NO'} bet on market #${market.marketId}`,
        });
        setStatus('Bet submitted');
      }

      if (action === 'resolve') {
        const response = await fetch(`${API_BASE_URL}/resolve-market`, {
          method: 'POST',
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
          content: `Resolved market #${market.marketId} with ${resolveYes ? 'YES' : 'NO'} as winner`,
        });
        setStatus('Market resolved');
      }

      if (action === 'claim') {
        const response = await fetch(`${API_BASE_URL}/claim-winnings`, {
          method: 'POST',
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
        setStatus('Claim submitted');
      }

      closeActionModal();
      if (activeRoom) {
        await loadActiveRoomMarkets(activeRoom);
      }
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : 'Market action failed';
      setError(message);
      setStatus('Market action failed');
    } finally {
      setActionBusy(false);
    }
  }

  const sortedRooms = useMemo(() => {
    return [...rooms].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [rooms]);

  return (
    <View style={styles.screen}>
      {!activeRoom ? (
        <View style={styles.roomListWrap}>
          <View style={styles.topHeaderRow}>
            <Text style={styles.screenTitle}>Chat</Text>
            <Pressable
              style={styles.miniHeaderBtn}
              onPress={() => {
                void refreshRooms();
              }}>
              <Ionicons name="refresh" size={20} color="#676b72" />
            </Pressable>
          </View>

          <Text style={styles.metaStatus}>Socket: {isConnected ? 'connected' : 'disconnected'}</Text>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.searchRow}>
            <Ionicons name="search-outline" size={23} color="#9b9ea4" />
            <TextInput
              value={roomDraft}
              onChangeText={setRoomDraft}
              placeholder="Type room name to join"
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
              }}>
              <Ionicons name="arrow-forward" size={19} color="#f0f6f0" />
            </Pressable>
          </View>

          <View style={styles.groupHeaderRow}>
            <Text style={styles.groupHeaderTitle}>Your Chat Groups</Text>
            <Ionicons name="ellipsis-horizontal" size={20} color="#bababa" />
          </View>

          <ScrollView
            style={styles.groupsScroll}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshingRooms}
                onRefresh={() => {
                  void refreshRooms();
                }}
                tintColor={ONBOARDING_COLORS.greenDark}
              />
            }>
            {sortedRooms.map((room, index) => (
              <Pressable
                key={room.roomName}
                style={styles.groupCard}
                onPress={() => {
                  joinRoom(room.roomName);
                }}>
                <View style={styles.groupIconCircle}>
                  <Ionicons
                    name={ROOM_ICONS[index % ROOM_ICONS.length] as 'football-outline'}
                    size={24}
                    color="#f1f7f1"
                  />
                </View>

                <View style={styles.groupMainCopy}>
                  <Text style={styles.groupName}>{room.roomName}</Text>
                  <Text style={styles.groupSubtitle}>{room.memberCount} members active</Text>
                </View>

                <Text style={styles.groupTime}>{formatRoomTime(room.createdAt)}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Pressable
            style={styles.createRoomButton}
            onPress={() => {
              openCreateRoomPrompt();
            }}>
            <Ionicons name="add" size={28} color="#ecf8ec" />
            <Text style={styles.createRoomLabel}>Create New Room</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.chatWrap}>
          <View style={styles.chatHeaderRow}>
            <Pressable style={styles.headerIconBtn} onPress={openDrawer}>
              <Ionicons name="arrow-forward" size={22} color="#53565b" />
            </Pressable>

            <Text style={styles.chatTitle}>#{activeRoom}</Text>

            <View style={styles.chatHeaderActions}>
              <Pressable
                style={styles.headerIconBtn}
                onPress={() => {
                  void refreshActiveRoom();
                }}>
                <Ionicons name="refresh" size={20} color="#53565b" />
              </Pressable>
              <Pressable style={styles.headerIconBtn} onPress={backToRooms}>
                <Ionicons name="arrow-back" size={22} color="#53565b" />
              </Pressable>
            </View>
          </View>

          <Text style={styles.metaStatus}>Status: {status}</Text>
          <Text style={styles.metaStatus}>Client: {clientId ?? '-'}</Text>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

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
                tintColor={ONBOARDING_COLORS.greenDark}
              />
            }>
            {roomMessages.map((message) => {
              const isMine = myUsername !== null && message.username === myUsername;

              return (
                <View
                  key={message.id}
                  style={[styles.messageRow, isMine ? styles.messageRowMine : styles.messageRowOther]}>
                  <View style={[styles.messageBubble, isMine ? styles.mineBubble : styles.otherBubble]}>
                    <Text style={[styles.messageUser, isMine ? styles.mineMetaText : styles.otherMetaText]}>
                      {isMine ? 'You' : message.username}
                    </Text>
                    <Text style={[styles.messageText, isMine ? styles.mineText : styles.otherText]}>
                      {message.content}
                    </Text>
                    <Text style={[styles.messageTime, isMine ? styles.mineMetaText : styles.otherMetaText]}>
                      {formatMessageTime(message.timestamp)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.composerRow}>
            <Pressable style={styles.plusBtn} onPress={() => setCreateModalVisible(true)}>
              <Ionicons name="add" size={24} color="#f0f7f0" />
            </Pressable>

            <TextInput
              value={messageDraft}
              onChangeText={setMessageDraft}
              placeholder="Write a message..."
              placeholderTextColor="#9d9fa5"
              style={styles.messageInput}
              autoCorrect={false}
            />

            <Pressable style={styles.sendBtn} onPress={sendRoomMessage}>
              <Ionicons name="send" size={20} color="#f3f9f3" />
            </Pressable>
          </View>
        </View>
      )}

      <Modal visible={drawerVisible} transparent animationType="none" onRequestClose={closeDrawer}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} />
          <Animated.View
            style={[
              styles.drawerPanel,
              {
                width: drawerWidth,
                transform: [{ translateX: drawerTranslateX }],
              },
            ]}>
            <View style={styles.drawerHeaderRow}>
              <Pressable style={styles.headerIconBtn} onPress={closeDrawer}>
                <Ionicons name="arrow-back" size={22} color="#f0f0f0" />
              </Pressable>
              <Text style={styles.drawerTitle}>Room Markets</Text>
              <Pressable
                style={styles.drawerRefreshBtn}
                onPress={() => {
                  void refreshMarkets();
                }}>
                <Ionicons name="refresh" size={18} color="#eaf1ff" />
              </Pressable>
            </View>

            <Text style={styles.drawerSubtext}>All markets in this chat are shown with their current stage.</Text>

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
              }>
              {activeMarkets.length === 0 ? (
                <View style={styles.drawerEmptyCard}>
                  <Text style={styles.drawerEmptyText}>No markets in this chat yet.</Text>
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
                            market.resolved ? styles.marketStageResolvedBadge : styles.marketStageOpenBadge,
                          ]}>
                          {marketStageLabel(market)}
                        </Text>
                        {market.isMine ? <Text style={styles.mineBadge}>Mine</Text> : null}
                      </View>
                    </View>

                    <Text style={styles.marketMeta}>Market #{market.marketId}</Text>
                    <Text style={styles.marketMeta}>Creator: {market.creator}</Text>
                    <Text style={styles.marketMeta}>Deadline: {formatDeadline(market.deadlineUnix)}</Text>
                    <Text style={styles.marketMeta}>Total Pool: {market.totalPool}</Text>
                    {market.resolved ? (
                      <Text style={styles.marketMeta}>
                        Winning Outcome:{' '}
                        {market.winningOutcome === null ? 'Unavailable' : market.winningOutcome ? 'YES' : 'NO'}
                      </Text>
                    ) : null}
                    {market.hasPlacedBet ? <Text style={styles.placedBetBadge}>Bet placed</Text> : null}

                    <View style={styles.marketActionRow}>
                      {!market.resolved ? (
                        <Pressable style={styles.marketActionBtn} onPress={() => openActionModal('bet', market)}>
                          <Text style={styles.marketActionLabel}>Place Bet</Text>
                        </Pressable>
                      ) : null}

                      {market.canResolve && !market.resolved ? (
                        <Pressable
                          style={[styles.marketActionBtn, styles.marketActionResolveBtn]}
                          onPress={() => openActionModal('resolve', market)}>
                          <Text style={styles.marketActionLabel}>Resolve</Text>
                        </Pressable>
                      ) : null}

                      {market.resolved ? (
                        <Pressable
                          style={[styles.marketActionBtn, styles.marketActionClaimBtn]}
                          onPress={() => openActionModal('claim', market)}>
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
        onRequestClose={() => setCreateRoomModalVisible(false)}>
        <View style={styles.centerModalOverlay}>
          <View style={styles.centerModalCard}>
            <Text style={styles.centerModalTitle}>Name your room</Text>
            <Text style={styles.modalInfoText}>Choose a clear room name for your group.</Text>

            <TextInput
              value={createRoomNameDraft}
              onChangeText={setCreateRoomNameDraft}
              placeholder="Example: Weekend Premier Picks"
              placeholderTextColor="#9ea1a7"
              style={styles.modalInput}
              autoCapitalize="words"
              autoCorrect={false}
              onSubmitEditing={confirmCreateRoom}
            />

            <View style={styles.modalButtonRow}>
              <Pressable
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => setCreateRoomModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[styles.modalButton, styles.modalConfirmButton]}
                onPress={confirmCreateRoom}>
                <Text style={styles.modalConfirmText}>Create Room</Text>
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
        }}>
        <View style={styles.centerModalOverlay}>
          <View style={styles.centerModalCard}>
            <Text style={styles.centerModalTitle}>Create Room Market</Text>

            <TextInput
              value={createTitle}
              onChangeText={setCreateTitle}
              placeholder="Market title"
              placeholderTextColor="#9ea1a7"
              style={styles.modalInput}
            />

            <TextInput
              value={createDeadlineInput}
              onChangeText={setCreateDeadlineInput}
              placeholder="Deadline (e.g. 2026-05-20 18:30)"
              placeholderTextColor="#9ea1a7"
              style={styles.modalInput}
            />

            <Text style={styles.modalInfoText}>Uses your local time. Unix timestamps also work.</Text>

            <TextInput
              value={createPolymarketUrl}
              onChangeText={setCreatePolymarketUrl}
              placeholder="Polymarket URL (optional)"
              placeholderTextColor="#9ea1a7"
              style={styles.modalInput}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.modalButtonRow}>
              <Pressable
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => {
                  if (!createBusy) {
                    setCreateModalVisible(false);
                  }
                }}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[styles.modalButton, styles.modalConfirmButton, createBusy ? styles.buttonDisabled : undefined]}
                disabled={createBusy}
                onPress={() => {
                  void submitCreateMarket();
                }}>
                <Text style={styles.modalConfirmText}>{createBusy ? 'Creating...' : 'Create Market'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={actionModal.visible}
        transparent
        animationType="fade"
        onRequestClose={closeActionModal}>
        <View style={styles.centerModalOverlay}>
          <View style={styles.centerModalCard}>
            <Text style={styles.centerModalTitle}>
              {actionModal.action === 'bet' && 'Place Bet'}
              {actionModal.action === 'resolve' && 'Resolve Market'}
              {actionModal.action === 'claim' && 'Claim Winnings'}
            </Text>

            <Text style={styles.modalInfoText}>Market #{actionModal.market?.marketId ?? '-'}</Text>

            {actionModal.action === 'bet' ? (
              <>
                <View style={styles.modalToggleRow}>
                  <Pressable
                    style={[styles.modalToggle, betOutcomeYes ? styles.modalToggleActive : undefined]}
                    onPress={() => setBetOutcomeYes(true)}>
                    <Text style={styles.modalToggleText}>YES</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modalToggle, !betOutcomeYes ? styles.modalToggleActive : undefined]}
                    onPress={() => setBetOutcomeYes(false)}>
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

            {actionModal.action === 'resolve' ? (
              <View style={styles.modalToggleRow}>
                <Pressable
                  style={[styles.modalToggle, resolveYes ? styles.modalToggleActive : undefined]}
                  onPress={() => setResolveYes(true)}>
                  <Text style={styles.modalToggleText}>WIN YES</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalToggle, !resolveYes ? styles.modalToggleActive : undefined]}
                  onPress={() => setResolveYes(false)}>
                  <Text style={styles.modalToggleText}>WIN NO</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.modalButtonRow}>
              <Pressable
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={closeActionModal}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[styles.modalButton, styles.modalConfirmButton, actionBusy ? styles.buttonDisabled : undefined]}
                disabled={actionBusy}
                onPress={() => {
                  void submitMarketAction();
                }}>
                <Text style={styles.modalConfirmText}>{actionBusy ? 'Submitting...' : 'Confirm'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: ONBOARDING_COLORS.background,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
  },
  roomListWrap: {
    flex: 1,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: '#dddddd',
    backgroundColor: ONBOARDING_COLORS.card,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    overflow: 'hidden',
  },
  topHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  screenTitle: {
    color: '#1f2227',
    fontSize: 44 / 2,
    fontWeight: '800',
  },
  miniHeaderBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ececec',
  },
  searchRow: {
    minHeight: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#d7d7d7',
    backgroundColor: '#f7f7f7',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    color: '#23262a',
    fontSize: 18,
  },
  searchJoinBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: ONBOARDING_COLORS.greenDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  groupHeaderTitle: {
    color: '#23262a',
    fontSize: 38 / 2,
    fontWeight: '700',
  },
  groupsScroll: {
    flex: 1,
  },
  groupCard: {
    minHeight: 96,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#dddddd',
    backgroundColor: '#f7f7f7',
    paddingHorizontal: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  groupIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: ONBOARDING_COLORS.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupMainCopy: {
    flex: 1,
    gap: 2,
  },
  groupName: {
    color: '#21242a',
    fontSize: 34 / 2,
    fontWeight: '700',
  },
  groupSubtitle: {
    color: '#6f737b',
    fontSize: 16,
  },
  groupTime: {
    color: '#6f737b',
    fontSize: 15,
    fontWeight: '500',
  },
  createRoomButton: {
    minHeight: 66,
    borderRadius: 33,
    marginTop: 8,
    backgroundColor: ONBOARDING_COLORS.greenDark,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  createRoomLabel: {
    color: '#eff8ef',
    fontSize: 36 / 2,
    fontWeight: '700',
  },
  chatWrap: {
    flex: 1,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: '#dddddd',
    backgroundColor: ONBOARDING_COLORS.card,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    overflow: 'hidden',
  },
  chatHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  chatHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ececec',
  },
  chatTitle: {
    color: '#21242a',
    fontSize: 36 / 2,
    fontWeight: '800',
    maxWidth: '56%',
  },
  metaStatus: {
    color: '#848991',
    fontSize: 13,
    marginBottom: 4,
  },
  errorText: {
    color: '#c34848',
    fontSize: 13,
    marginBottom: 6,
  },
  messagesScroll: {
    flex: 1,
  },
  messagesContent: {
    paddingTop: 6,
    paddingBottom: 12,
    gap: 8,
  },
  messageRow: {
    flexDirection: 'row',
  },
  messageRowMine: {
    justifyContent: 'flex-end',
  },
  messageRowOther: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '84%',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  mineBubble: {
    backgroundColor: '#1f2836',
  },
  otherBubble: {
    backgroundColor: '#8ed089',
  },
  messageUser: {
    fontSize: 12,
    fontWeight: '700',
  },
  mineMetaText: {
    color: '#d7dee9',
  },
  otherMetaText: {
    color: '#265125',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  mineText: {
    color: '#f0f5ff',
  },
  otherText: {
    color: '#183f1d',
  },
  messageTime: {
    fontSize: 11,
    fontWeight: '500',
    alignSelf: 'flex-end',
  },
  composerRow: {
    minHeight: 58,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#d7d7d7',
    backgroundColor: '#f7f7f7',
    paddingHorizontal: 10,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  plusBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2b3b5a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageInput: {
    flex: 1,
    color: '#22252a',
    fontSize: 16,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: ONBOARDING_COLORS.greenDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.24)',
    justifyContent: 'flex-start',
  },
  drawerPanel: {
    flex: 1,
    backgroundColor: '#162033',
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 14,
  },
  drawerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  drawerTitle: {
    flex: 1,
    marginLeft: 10,
    color: '#eef3ff',
    fontSize: 22,
    fontWeight: '800',
  },
  drawerRefreshBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2a3a53',
  },
  drawerSubtext: {
    color: '#9eb2d0',
    fontSize: 13,
    marginBottom: 10,
  },
  drawerScroll: {
    flex: 1,
  },
  drawerEmptyCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334560',
    backgroundColor: '#1f2c44',
    minHeight: 78,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  drawerEmptyText: {
    color: '#b5c5de',
    fontSize: 14,
  },
  marketCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334560',
    backgroundColor: '#1f2c44',
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 10,
    gap: 4,
  },
  marketTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  marketBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  marketTitle: {
    flex: 1,
    color: '#ecf3ff',
    fontSize: 16,
    fontWeight: '700',
  },
  marketStageBadge: {
    fontSize: 11,
    fontWeight: '700',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  marketStageOpenBadge: {
    color: '#1f2f44',
    backgroundColor: '#9bc0ff',
  },
  marketStageResolvedBadge: {
    color: '#14321e',
    backgroundColor: '#89d8a1',
  },
  mineBadge: {
    color: '#1f2d1f',
    backgroundColor: '#96d38f',
    fontSize: 11,
    fontWeight: '700',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  marketMeta: {
    color: '#aac0de',
    fontSize: 12,
  },
  placedBetBadge: {
    color: '#1f2d1f',
    backgroundColor: '#ffc868',
    fontSize: 11,
    fontWeight: '700',
    borderRadius: 999,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 3,
  },
  marketActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  marketActionBtn: {
    borderRadius: 11,
    backgroundColor: '#2f7dd8',
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  marketActionResolveBtn: {
    backgroundColor: '#76994f',
  },
  marketActionClaimBtn: {
    backgroundColor: '#5f6ad0',
  },
  marketActionLabel: {
    color: '#f1f6ff',
    fontSize: 12,
    fontWeight: '700',
  },
  centerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  centerModalCard: {
    width: '100%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d8d8d8',
    backgroundColor: '#f7f7f7',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  centerModalTitle: {
    color: '#202328',
    fontSize: 20,
    fontWeight: '800',
  },
  modalInfoText: {
    color: '#5a5f66',
    fontSize: 13,
  },
  modalInput: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d1d1',
    backgroundColor: '#f2f2f2',
    paddingHorizontal: 12,
    color: '#21242a',
    fontSize: 15,
  },
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 2,
  },
  modalButton: {
    minHeight: 42,
    borderRadius: 11,
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelButton: {
    backgroundColor: '#e6e6e6',
  },
  modalConfirmButton: {
    backgroundColor: ONBOARDING_COLORS.greenDark,
  },
  modalCancelText: {
    color: '#3f4348',
    fontSize: 14,
    fontWeight: '700',
  },
  modalConfirmText: {
    color: '#edf8ef',
    fontSize: 14,
    fontWeight: '700',
  },
  modalToggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modalToggle: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1d1d1',
    backgroundColor: '#eeeeee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalToggleActive: {
    borderColor: '#5fad72',
    backgroundColor: '#7bc67c',
  },
  modalToggleText: {
    color: '#223026',
    fontSize: 13,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
