import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { usePrivy } from '@privy-io/expo';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  fetchMyPredictionBalances,
  fetchMyProfile,
  fetchMyTransactions,
  type PredictionBalanceResponse,
  type ProfileMeResponse,
  type UserTransactionActivity,
} from '@/lib/profile';
import { shortenAddress } from '@/lib/http';

/* ───────────────────── helpers (no changes) ──────────────── */

type TransactionVisual = {
  iconName: 'arrow-up-outline' | 'arrow-down-outline';
  iconColor: string;
  iconBubble: string;
  amountColor: string;
};

function buildInitials(username: string): string {
  const cleaned = username.trim();
  if (!cleaned) {
    return 'AN';
  }

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

function addThousandsSeparators(raw: string): string {
  return raw.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatStrkTwoDecimals(wei: string | null | undefined): string {
  const parsedWei = BigInt(wei ?? '0');
  const roundedInCents = (parsedWei + 5_000_000_000_000_000n) / 10_000_000_000_000_000n;
  const whole = roundedInCents / 100n;
  const fractional = (roundedInCents % 100n).toString().padStart(2, '0');
  return `${addThousandsSeparators(whole.toString())}.${fractional}`;
}

function formatTransactionClock(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.valueOf())) {
    return '--:--';
  }

  return parsed.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function shortenWalletForCard(address: string | null): string {
  if (!address) {
    return 'Not linked';
  }

  if (address.length <= 8) {
    return address;
  }

  return `${address.slice(0, 4)}...${address.slice(-2)}`;
}

function prettyAction(action: string): string {
  if (!action) {
    return 'Transaction';
  }

  return action
    .replace(/_/g, ' ')
    .split(' ')
    .map((part) => (part ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part))
    .join(' ');
}

function resolveTransactionVisual(transaction: UserTransactionActivity): TransactionVisual {
  const action = transaction.action.toLowerCase();
  const incoming = action.includes('claim') || action.includes('resolved') || action.includes('check') || action.includes('receive');

  if (transaction.status === 'failed') {
    return {
      iconName: 'arrow-up-outline',
      iconColor: '#ef6f5d',
      iconBubble: '#fdf1ef',
      amountColor: '#c23f31',
    };
  }

  if (incoming) {
    return {
      iconName: 'arrow-down-outline',
      iconColor: '#0ca74b',
      iconBubble: '#edf8f0',
      amountColor: '#0ca74b',
    };
  }

  return {
    iconName: 'arrow-up-outline',
    iconColor: '#ff7f32',
    iconBubble: '#fdf4ea',
    amountColor: '#242424',
  };
}

function transactionSubtitle(transaction: UserTransactionActivity): string {
  const metadata = transaction.metadata as { marketId?: unknown };
  const marketId = typeof metadata.marketId === 'string' ? metadata.marketId : null;
  const signature = shortenAddress(transaction.txHash ?? transaction.details ?? '-');

  if (marketId) {
    return `Market #${marketId} • ${signature}`;
  }

  return signature;
}

/* ───────────────────── screen ────────────────────────────── */

export default function ProfileScreen() {
  const { user, isReady, getAccessToken } = usePrivy();
  const { width } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileMeResponse | null>(null);
  const [balances, setBalances] = useState<PredictionBalanceResponse | null>(null);
  const [transactions, setTransactions] = useState<UserTransactionActivity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const walletAddress = profile?.wallet?.address ?? null;
  const username = profile?.profile?.username ?? 'Anonymous';

  const initials = useMemo(() => buildInitials(username), [username]);
  const prettyBalance = useMemo(() => formatStrkTwoDecimals(balances?.userBalance ?? null), [balances?.userBalance]);
  const shortWallet = useMemo(() => shortenWalletForCard(walletAddress), [walletAddress]);

  /* ── responsive ──────────────────────────────────────── */
  const compact = width < 375;

  const avatarSize = compact ? 48 : 56;
  const balanceFontSize = compact ? 34 : 40;
  const txnIconSize = compact ? 38 : 44;

  const loadData = useCallback(
    async (showLoader = true) => {
      if (!user) {
        setLoading(false);
        return;
      }

      if (showLoader) {
        setLoading(true);
      }

      setError(null);

      try {
        const [nextProfile, nextBalances, nextTransactions] = await Promise.all([
          fetchMyProfile(getAccessToken),
          fetchMyPredictionBalances(getAccessToken).catch(() => null),
          fetchMyTransactions(getAccessToken, 12).catch(() => ({ transactions: [], limit: 12 })),
        ]);

        setProfile(nextProfile);
        setBalances(nextBalances);
        setTransactions(nextTransactions.transactions);
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : 'Failed to load profile';
        setError(message);
      } finally {
        if (showLoader) {
          setLoading(false);
        }
      }
    },
    [user, getAccessToken],
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const refreshProfileData = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadData(false);
    } finally {
      setRefreshing(false);
    }
  }, [loadData]);

  async function copyWalletAddress() {
    if (!walletAddress) {
      return;
    }

    await Clipboard.setStringAsync(walletAddress);
    setCopyStatus('Copied wallet address');

    setTimeout(() => {
      setCopyStatus(null);
    }, 1200);
  }

  /* ── loading / auth gates ────────────────────────────── */

  if (!isReady || loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#05ad43" />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.fallbackText}>Login required</Text>
      </View>
    );
  }

  /* ── render ──────────────────────────────────────────── */

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <StatusBar style="dark" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void refreshProfileData();
            }}
            tintColor="#06ad43"
          />
        }>
        {/* ── Header ────────────────────────────────── */}
        <View style={styles.headerRow}>
          <View style={styles.identityRow}>
            <View
              style={[
                styles.avatarCircle,
                { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 },
              ]}>
              <Text style={[styles.avatarInitials, { fontSize: compact ? 14 : 16 }]}>
                {initials}
              </Text>
            </View>

            <View style={styles.identityTextWrap}>
              <Text style={styles.welcomeLabel}>Welcome back</Text>
              <Text style={styles.usernameText} numberOfLines={1}>
                {username}
              </Text>
            </View>
          </View>

          <Pressable
            style={styles.refreshButton}
            onPress={() => {
              void refreshProfileData();
            }}>
            <Ionicons name="refresh" size={20} color="#8e9196" />
          </Pressable>
        </View>

        {/* ── Balance Card ──────────────────────────── */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Total Balance</Text>

          <View style={styles.balanceMainRow}>
            <Text style={[styles.balanceAmount, { fontSize: balanceFontSize }]}>
              {prettyBalance}
            </Text>
            <Text style={styles.balanceToken}>STRK</Text>
          </View>

          <View style={styles.walletRow}>
            <Text style={styles.walletText}>{shortWallet}</Text>
            <Pressable
              style={styles.copyButton}
              onPress={() => {
                void copyWalletAddress();
              }}>
              <Ionicons
                name={copyStatus ? 'checkmark' : 'copy-outline'}
                size={16}
                color="rgba(255,255,255,0.75)"
              />
            </Pressable>
          </View>
        </View>

        {/* ── Recent Transactions ───────────────────── */}
        <Text style={styles.sectionTitle}>Recent Transactions</Text>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {transactions.length === 0 ? (
          <View style={styles.emptyTxnCard}>
            <Text style={styles.emptyTxnTitle}>No transactions yet</Text>
            <Text style={styles.emptyTxnText}>Your signatures will appear here.</Text>
          </View>
        ) : (
          transactions.map((transaction) => {
            const visual = resolveTransactionVisual(transaction);

            return (
              <View key={transaction.id} style={styles.txnCard}>
                <View style={styles.txnLeftGroup}>
                  <View
                    style={[
                      styles.txnIconWrap,
                      {
                        backgroundColor: visual.iconBubble,
                        width: txnIconSize,
                        height: txnIconSize,
                        borderRadius: txnIconSize / 2,
                      },
                    ]}>
                    <Ionicons name={visual.iconName} size={compact ? 16 : 20} color={visual.iconColor} />
                  </View>

                  <View style={styles.txnTextGroup}>
                    <Text style={styles.txnAction} numberOfLines={1}>
                      {prettyAction(transaction.action)}
                    </Text>
                    <Text style={styles.txnSignature} numberOfLines={1}>
                      {transactionSubtitle(transaction)}
                    </Text>
                  </View>
                </View>

                <View style={styles.txnMetaGroup}>
                  <Text
                    style={[styles.txnStatus, { color: visual.amountColor }]}
                    numberOfLines={1}>
                    {transaction.status === 'success' ? 'Confirmed' : 'Failed'}
                  </Text>
                  <Text style={styles.txnTime}>{formatTransactionClock(transaction.createdAt)}</Text>
                </View>
              </View>
            );
          })
        )}

        {copyStatus ? (
          <View style={styles.copyToast}>
            <Text style={styles.copyToastText}>{copyStatus}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ─────────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
  /* ── scaffold ──────────────────────────────────────────── */
  screen: {
    flex: 1,
    backgroundColor: '#faf9f7',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#faf9f7',
  },
  fallbackText: {
    color: '#4a4d52',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingTop: 12,
    paddingBottom: 100,
    paddingHorizontal: 20,
    gap: 16,
  },

  /* ── header ────────────────────────────────────────────── */
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
    paddingRight: 8,
  },
  avatarCircle: {
    backgroundColor: '#F5A623',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: '#ffffff',
    fontFamily: 'Inter_600SemiBold',
  },
  identityTextWrap: {
    flex: 1,
    gap: 1,
  },
  welcomeLabel: {
    color: '#8e9196',
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  usernameText: {
    color: '#1c1f24',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 22,
    letterSpacing: -0.2,
  },
  refreshButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },

  /* ── balance card ──────────────────────────────────────── */
  balanceCard: {
    borderRadius: 28,
    backgroundColor: '#2daa57',
    paddingHorizontal: 22,
    paddingVertical: 24,
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#1b7a39',
    shadowOpacity: 0.16,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    elevation: 4,
  },
  balanceLabel: {
    color: 'rgba(255,255,255,0.70)',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    marginBottom: 4,
  },
  balanceMainRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 10,
  },
  balanceAmount: {
    color: '#ffffff',
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: -0.5,
  },
  balanceToken: {
    color: 'rgba(255,255,255,0.60)',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
  },
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  walletText: {
    color: 'rgba(255,255,255,0.70)',
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    letterSpacing: 0.3,
  },
  copyButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },

  /* ── section ───────────────────────────────────────────── */
  sectionTitle: {
    color: '#1f2227',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 20,
    letterSpacing: -0.15,
    marginTop: 8,
  },
  errorText: {
    color: '#c34635',
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    marginBottom: 2,
  },

  /* ── empty txn ─────────────────────────────────────────── */
  emptyTxnCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ebebeb',
    backgroundColor: '#ffffff',
    minHeight: 80,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    gap: 2,
  },
  emptyTxnTitle: {
    color: '#2d3035',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
  emptyTxnText: {
    color: '#8c9097',
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  },

  /* ── transaction card ──────────────────────────────────── */
  txnCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ebebeb',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  txnLeftGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  txnIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  txnTextGroup: {
    flex: 1,
    gap: 2,
  },
  txnAction: {
    color: '#22252a',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
  txnSignature: {
    color: '#8c9097',
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  },
  txnMetaGroup: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 3,
    minWidth: 80,
  },
  txnStatus: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  txnTime: {
    color: '#a5a8ad',
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },

  /* ── copy toast ────────────────────────────────────────── */
  copyToast: {
    marginTop: 4,
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: '#e8f7ed',
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  copyToastText: {
    color: '#249a52',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
});
