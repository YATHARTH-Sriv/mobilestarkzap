import { hp, ms, wp } from "@/lib/responsive";
import { Ionicons } from "@expo/vector-icons";
import { usePrivy } from "@privy-io/expo";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import {
    SafeAreaView,
    useSafeAreaInsets,
} from "react-native-safe-area-context";

import { shortenAddress } from "@/lib/http";
import {
    fetchPaymentHistory,
    sendDirectPayment,
    type DirectPaymentHistoryItem,
} from "@/lib/payments";

function formatClock(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.valueOf())) {
    return "--:--";
  }

  return parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function looksLikeWalletAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{10,}$/.test(value);
}

export default function PaymentHistoryScreen() {
  const router = useRouter();
  const { username } = useLocalSearchParams<{ username?: string }>();
  const { user, getAccessToken } = usePrivy();
  const insets = useSafeAreaInsets();

  const selectedRecipient = typeof username === "string" ? username.trim() : "";

  const [history, setHistory] = useState<DirectPaymentHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [sending, setSending] = useState(false);

  const title = useMemo(() => {
    if (!selectedRecipient) {
      return "Payments";
    }

    if (looksLikeWalletAddress(selectedRecipient)) {
      return shortenAddress(selectedRecipient);
    }

    return `@${selectedRecipient}`;
  }, [selectedRecipient]);

  const loadHistory = useCallback(
    async (showLoader = true) => {
      if (!user || !selectedRecipient) {
        setLoading(false);
        return;
      }

      if (showLoader) {
        setLoading(true);
      }

      setError(null);

      try {
        const paymentHistory = await fetchPaymentHistory(
          getAccessToken,
          selectedRecipient,
          60,
        );
        setHistory(paymentHistory);
      } catch (loadError) {
        const message =
          loadError instanceof Error
            ? loadError.message
            : "Failed to load payment history";
        setError(message);
      } finally {
        if (showLoader) {
          setLoading(false);
        }
      }
    },
    [getAccessToken, selectedRecipient, user],
  );

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
      setError("Enter an amount in STRK");
      return;
    }

    try {
      setSending(true);
      setError(null);
      await sendDirectPayment(getAccessToken, {
        recipient: selectedRecipient,
        amount: amountInput.trim(),
      });
      setAmountInput("");
      await loadHistory(false);
    } catch (sendError) {
      const message =
        sendError instanceof Error ? sendError.message : "Payment failed";
      setError(message);
    } finally {
      setSending(false);
    }
  }, [amountInput, getAccessToken, loadHistory, selectedRecipient]);

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingWrap} edges={["top", "bottom"]}>
        <ActivityIndicator size="large" color="#05ad43" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.headerRow}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={ms(22)} color="#50545b" />
          </Pressable>
          <Text style={styles.headerTitle}>{title}</Text>
          <View style={styles.headerSpacer} />
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                void refreshHistory();
              }}
              tintColor="#05ad43"
            />
          }
        >
          {history.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No payments yet</Text>
              <Text style={styles.emptyBody}>
                Send your first STRK transfer to start this history.
              </Text>
            </View>
          ) : (
            history.map((item) => {
              const mine = item.senderPrivyUserId === user?.id;
              const counterpartyIsExternal = mine
                ? item.recipientPrivyUserId === null
                : false;

              const cardTitle = mine
                ? `Payment to ${title.replace("@", "")}`
                : `Payment to you`;

              return (
                <View key={item.id} style={styles.transactionCard}>
                  <Text style={styles.transactionCardTitle}>{cardTitle}</Text>

                  <Text style={styles.transactionCardAmount}>
                    {item.amountUnit} {item.tokenSymbol}
                  </Text>

                  <View style={styles.transactionCardFooter}>
                    <Ionicons
                      name="checkmark-circle"
                      size={ms(16)}
                      color="#0fa866"
                    />
                    <Text style={styles.transactionCardDate}>
                      Paid • {formatClock(item.createdAt)}
                    </Text>

                    {counterpartyIsExternal ? (
                      <Text style={styles.transactionCardExternalBadge}>
                        External
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        <View
          style={[
            styles.composerWrap,
            { paddingBottom: Math.max(insets.bottom, hp(10)) },
          ]}
        >
          <TextInput
            value={amountInput}
            onChangeText={setAmountInput}
            placeholder="Amount in STRK"
            placeholderTextColor="#94989e"
            keyboardType="decimal-pad"
            style={styles.amountInput}
          />
          <Pressable
            style={[
              styles.sendButton,
              sending ? styles.sendButtonDisabled : undefined,
            ]}
            disabled={sending}
            onPress={() => {
              void submitPayment();
            }}
          >
            <Text style={styles.sendButtonText}>
              {sending ? "Sending..." : "Send"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#faf9f7",
    paddingHorizontal: wp(20),
  },
  keyboardContainer: {
    flex: 1,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#faf9f7",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: hp(4),
    marginBottom: hp(12),
  },
  backButton: {
    width: wp(36),
    height: wp(36),
    borderRadius: wp(18),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f0f0ee",
  },
  headerTitle: {
    color: "#1c1f24",
    fontFamily: "Inter_600SemiBold",
    fontSize: ms(18),
    letterSpacing: -0.2,
  },
  headerSpacer: {
    width: wp(36),
    height: wp(36),
  },
  errorText: {
    color: "#c34635",
    fontFamily: "Inter_500Medium",
    fontSize: ms(12),
    marginBottom: hp(6),
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: hp(16),
    gap: hp(16),
  },
  emptyCard: {
    minHeight: hp(100),
    borderRadius: wp(18),
    borderWidth: 1,
    borderColor: "#ebebeb",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: wp(16),
    gap: hp(4),
  },
  emptyTitle: {
    color: "#1c1f24",
    fontFamily: "Inter_600SemiBold",
    fontSize: ms(16),
  },
  emptyBody: {
    color: "#8c9097",
    fontFamily: "Inter_500Medium",
    fontSize: ms(13),
    textAlign: "center",
  },
  transactionCard: {
    backgroundColor: "#2a2d35",
    borderRadius: wp(20),
    padding: wp(20),
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  transactionCardTitle: {
    fontSize: ms(15),
    color: "rgba(255,255,255,0.70)",
    fontFamily: "Inter_500Medium",
    marginBottom: hp(4),
  },
  transactionCardAmount: {
    fontSize: ms(36),
    fontFamily: "Inter_600SemiBold",
    color: "#ffffff",
    letterSpacing: -0.5,
    marginBottom: hp(14),
  },
  transactionCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: wp(6),
  },
  transactionCardDate: {
    fontSize: ms(13),
    color: "rgba(255,255,255,0.55)",
    fontFamily: "Inter_500Medium",
  },
  transactionCardExternalBadge: {
    backgroundColor: "rgba(255,255,255,0.12)",
    color: "rgba(255,255,255,0.70)",
    fontSize: ms(11),
    fontFamily: "Inter_600SemiBold",
    paddingHorizontal: wp(8),
    paddingVertical: hp(3),
    borderRadius: wp(8),
    marginLeft: "auto",
  },
  composerWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: wp(10),
    paddingTop: hp(14),
    borderTopWidth: 1,
    borderTopColor: "#ebebeb",
  },
  amountInput: {
    flex: 1,
    height: hp(50),
    borderRadius: wp(16),
    borderWidth: 1,
    borderColor: "#e8e8e8",
    backgroundColor: "#ffffff",
    paddingHorizontal: wp(16),
    color: "#1c1f24",
    fontFamily: "Inter_500Medium",
    fontSize: ms(15),
  },
  sendButton: {
    minWidth: wp(80),
    height: hp(50),
    borderRadius: wp(16),
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: wp(16),
    backgroundColor: "#2daa57",
    shadowColor: "#1b7a39",
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  sendButtonDisabled: {
    opacity: 0.65,
  },
  sendButtonText: {
    color: "#ffffff",
    fontFamily: "Inter_600SemiBold",
    fontSize: ms(15),
  },
});
