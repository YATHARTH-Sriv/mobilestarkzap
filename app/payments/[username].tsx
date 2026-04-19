import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePrivy } from '@privy-io/expo';

import { shortenAddress } from '@/lib/http';
import {
  fetchPaymentHistory,
  sendDirectPayment,
  type DirectPaymentHistoryItem,
} from '@/lib/payments';

function formatClock(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.valueOf())) {
    return '--:--';
  }

  return parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function looksLikeWalletAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{10,}$/.test(value);
}

export default function PaymentHistoryScreen() {
  const router = useRouter();
  const { username } = useLocalSearchParams<{ username?: string }>();
  const { user, getAccessToken } = usePrivy();

  const selectedRecipient = typeof username === 'string' ? username.trim() : '';

  const [history, setHistory] = useState<DirectPaymentHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [sending, setSending] = useState(false);

  const title = useMemo(() => {
    if (!selectedRecipient) {
      return 'Payments';
    }

    if (looksLikeWalletAddress(selectedRecipient)) {
      return shortenAddress(selectedRecipient);
    }

    return `@${selectedRecipient}`;
  }, [selectedRecipient]);

  const loadHistory = useCallback(async (showLoader = true) => {
    if (!user || !selectedRecipient) {
      setLoading(false);
      return;
    }

    if (showLoader) {
      setLoading(true);
    }

    setError(null);

    try {
      const paymentHistory = await fetchPaymentHistory(getAccessToken, selectedRecipient, 60);
      setHistory(paymentHistory);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Failed to load payment history';
      setError(message);
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }, [getAccessToken, selectedRecipient, user]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const refreshHistory = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadHistory(false);
    } finally {
      setRefreshing(false);
    }
  }, [loadHistory]);

  const submitPayment = useCallback(async () => {
    if (!selectedRecipient) {
      return;
    }

    if (!amountInput.trim()) {
      setError('Enter an amount in STRK');
      return;
    }

    try {
      setSending(true);
      setError(null);
      await sendDirectPayment(getAccessToken, {
        recipient: selectedRecipient,
        amount: amountInput.trim(),
      });
      setAmountInput('');
      await loadHistory(false);
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : 'Payment failed';
      setError(message);
    } finally {
      setSending(false);
    }
  }, [amountInput, getAccessToken, loadHistory, selectedRecipient]);

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingWrap} edges={['top']}>
        <ActivityIndicator size="large" color="#05ad43" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.headerRow}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#50545b" />
        </Pressable>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void refreshHistory();
            }}
            tintColor="#05ad43"
          />
        }>
        {history.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No payments yet</Text>
            <Text style={styles.emptyBody}>Send your first STRK transfer to start this history.</Text>
          </View>
        ) : (
          history.map((item) => {
            const mine = item.senderPrivyUserId === user?.id;
              const counterpartyIsExternal = mine ? item.recipientPrivyUserId === null : false;

            return (
              <View
                key={item.id}
                style={[styles.messageRow, mine ? styles.messageRowOutgoing : styles.messageRowIncoming]}>
                <View style={[styles.messageBubble, mine ? styles.outgoingBubble : styles.incomingBubble]}>
                  <Text style={[styles.messageAmount, mine ? styles.outgoingText : styles.incomingText]}>
                    {mine ? '-' : '+'}
                    {item.amountUnit} {item.tokenSymbol}
                  </Text>
                    {counterpartyIsExternal ? (
                      <Text style={[styles.externalBadge, mine ? styles.outgoingExternalBadge : styles.incomingExternalBadge]}>
                        External
                      </Text>
                    ) : null}
                  <Text style={[styles.messageMeta, mine ? styles.outgoingMeta : styles.incomingMeta]}>
                    {shortenAddress(item.txHash ?? item.details ?? '-')}
                  </Text>
                  <Text style={[styles.messageMeta, mine ? styles.outgoingMeta : styles.incomingMeta]}>
                    {formatClock(item.createdAt)}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <View style={styles.composerWrap}>
        <TextInput
          value={amountInput}
          onChangeText={setAmountInput}
          placeholder="Amount in STRK"
          placeholderTextColor="#94989e"
          keyboardType="decimal-pad"
          style={styles.amountInput}
        />
        <Pressable
          style={[styles.sendButton, sending ? styles.sendButtonDisabled : undefined]}
          disabled={sending}
          onPress={() => {
            void submitPayment();
          }}>
          <Text style={styles.sendButtonText}>{sending ? 'Sending...' : 'Send'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f5f5f3',
    paddingHorizontal: 16,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f3',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 8,
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ececec',
  },
  headerTitle: {
    color: '#1e2125',
    fontSize: 19,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 34,
    height: 34,
  },
  errorText: {
    color: '#c24333',
    fontSize: 13,
    marginBottom: 8,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
    gap: 8,
  },
  emptyCard: {
    minHeight: 110,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e4e4e2',
    backgroundColor: '#fbfbfa',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    gap: 4,
  },
  emptyTitle: {
    color: '#23262b',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyBody: {
    color: '#757a82',
    fontSize: 13,
    textAlign: 'center',
  },
  messageRow: {
    flexDirection: 'row',
  },
  messageRowOutgoing: {
    justifyContent: 'flex-end',
  },
  messageRowIncoming: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '82%',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 2,
  },
  outgoingBubble: {
    backgroundColor: '#1f2937',
  },
  incomingBubble: {
    backgroundColor: '#e8f6eb',
  },
  messageAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
  outgoingText: {
    color: '#eff4ff',
  },
  incomingText: {
    color: '#176f33',
  },
  messageMeta: {
    fontSize: 12,
    fontWeight: '500',
  },
  externalBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    borderRadius: 8,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  outgoingExternalBadge: {
    color: '#f8dd9a',
    backgroundColor: '#374151',
  },
  incomingExternalBadge: {
    color: '#5f4a15',
    backgroundColor: '#f8eabf',
  },
  outgoingMeta: {
    color: '#c9d2de',
  },
  incomingMeta: {
    color: '#4d7b58',
  },
  composerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    marginBottom: 18,
  },
  amountInput: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dbdbd9',
    backgroundColor: '#f9f9f8',
    paddingHorizontal: 14,
    color: '#1e2125',
    fontSize: 15,
  },
  sendButton: {
    minWidth: 88,
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: '#0aae45',
  },
  sendButtonDisabled: {
    opacity: 0.75,
  },
  sendButtonText: {
    color: '#f0f9f0',
    fontSize: 15,
    fontWeight: '700',
  },
});
