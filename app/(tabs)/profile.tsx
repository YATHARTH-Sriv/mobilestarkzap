import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
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

type TransactionVisual = {
  iconName: 'arrow-up-outline' | 'arrow-down-outline';
  iconColor: string;
  iconBubble: string;
  statusColor: string;
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
  const incoming = action.includes('claim') || action.includes('resolved') || action.includes('check');

  if (transaction.status === 'failed') {
    return {
      iconName: 'arrow-up-outline',
      iconColor: '#ef6f5d',
      iconBubble: '#fdf1ef',
      statusColor: '#c23f31',
    };
  }

  if (incoming) {
    return {
      iconName: 'arrow-down-outline',
      iconColor: '#0ca74b',
      iconBubble: '#edf8f0',
      statusColor: '#06a444',
    };
  }

  return {
    iconName: 'arrow-up-outline',
    iconColor: '#ff7f32',
    iconBubble: '#fdf4ea',
    statusColor: '#242424',
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

export default function ProfileScreen() {
  const { user, isReady, getAccessToken } = usePrivy();
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
        <View style={styles.headerRow}>
          <View style={styles.identityRow}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitials}>{initials}</Text>
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
            <Ionicons name="refresh" size={28} color="#5c5f64" />
          </Pressable>
        </View>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Total Balance</Text>

          <View style={styles.balanceMainRow}>
            <Text style={styles.balanceAmount}>{prettyBalance}</Text>
            <Text style={styles.balanceToken}>STRK</Text>
          </View>

          <View style={styles.walletRow}>
            <Text style={styles.walletText}>{shortWallet}</Text>
            <Pressable
              style={styles.copyButton}
              onPress={() => {
                void copyWalletAddress();
              }}>
              <Ionicons name={copyStatus ? 'checkmark' : 'copy-outline'} size={20} color="#eaf8ec" />
            </Pressable>
          </View>
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
        </View>

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
                  <View style={[styles.txnIconWrap, { backgroundColor: visual.iconBubble }]}>
                    <Ionicons name={visual.iconName} size={22} color={visual.iconColor} />
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
                  <Text style={[styles.txnStatus, { color: visual.statusColor }]}>
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f5f5f3',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f3',
  },
  fallbackText: {
    color: '#4a4d52',
    fontSize: 16,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingTop: 16,
    paddingBottom: 122,
    paddingHorizontal: 20,
    gap: 18,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
    paddingRight: 8,
  },
  avatarCircle: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: '#ffa000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '500',
  },
  identityTextWrap: {
    flex: 1,
    gap: 2,
  },
  welcomeLabel: {
    color: '#6e7176',
    fontSize: 20 / 2,
    fontWeight: '500',
  },
  usernameText: {
    color: '#1c1f24',
    fontSize: 42 / 2,
    fontWeight: '700',
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f0ef',
  },
  balanceCard: {
    borderRadius: 38,
    backgroundColor: '#05ad43',
    minHeight: 256,
    paddingHorizontal: 22,
    paddingVertical: 26,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 18,
    elevation: 4,
  },
  balanceLabel: {
    color: '#dff5e5',
    fontSize: 20 / 2,
    fontWeight: '600',
    marginBottom: 14,
  },
  balanceMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 14,
  },
  balanceAmount: {
    color: '#f4fff7',
    fontSize: 76 / 2,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  balanceToken: {
    color: '#dff5e5',
    fontSize: 20 / 2,
    fontWeight: '600',
    marginBottom: 7,
  },
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  walletText: {
    color: '#dff5e5',
    fontSize: 38 / 2,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  copyButton: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  sectionHeaderRow: {
    marginTop: 14,
    marginBottom: 6,
  },
  sectionTitle: {
    color: '#1f2227',
    fontSize: 22,
    fontWeight: '700',
  },
  errorText: {
    color: '#c34635',
    fontSize: 14,
    marginBottom: 4,
  },
  emptyTxnCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    backgroundColor: '#fbfbfb',
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    gap: 2,
  },
  emptyTxnTitle: {
    color: '#2d3035',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyTxnText: {
    color: '#7c8086',
    fontSize: 14,
    fontWeight: '500',
  },
  txnCard: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    backgroundColor: '#fbfbfb',
    minHeight: 124,
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 12,
  },
  txnLeftGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  txnIconWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txnTextGroup: {
    flex: 1,
    gap: 3,
  },
  txnAction: {
    color: '#22252a',
    fontSize: 24 / 2,
    fontWeight: '600',
  },
  txnSignature: {
    color: '#7d8085',
    fontSize: 36 / 2,
    fontWeight: '500',
  },
  txnMetaGroup: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 4,
    minWidth: 88,
  },
  txnStatus: {
    fontSize: 44 / 2,
    fontWeight: '600',
  },
  txnTime: {
    color: '#9a9da2',
    fontSize: 42 / 2,
    fontWeight: '500',
  },
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
    fontSize: 12,
    fontWeight: '600',
  },
});
