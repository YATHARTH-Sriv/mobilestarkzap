import { hp, ms, wp } from "@/lib/responsive";
import { Ionicons } from "@expo/vector-icons";
import { usePrivy } from "@/lib/use-auth";
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

import { shortenAddress, formatErrorMessage } from "@/lib/http";
import {
  fetchPaymentHistory,
  sendDirectPayment,
  type DirectPaymentHistoryItem,
} from "@/lib/payments";

function formatPaymentDateTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.valueOf())) {
    return "--:--";
  }

  const date = parsed.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
  const clock = parsed.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return `${date} • ${clock}`;
}

function looksLikeWalletAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{10,}$/.test(value);
}

function formatCounterparty(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Unknown";
  }

  if (trimmed.startsWith("@")) {
    return trimmed;
  }

  if (looksLikeWalletAddress(trimmed) || trimmed.includes("...")) {
    return trimmed;
  }

  return `@${trimmed}`;
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
          60
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
    [getAccessToken, selectedRecipient, user]
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
      setError(formatErrorMessage(sendError, "Payment failed"));
    } finally {
      setSending(false);
    }
  }, [amountInput, getAccessToken, loadHistory, selectedRecipient]);

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingWrap} edges={["top", "bottom"]}>
        <ActivityIndicator size="large" color="#10b981" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#1c1f24" />
          </Pressable>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>{title}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

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
              tintColor="#10b981"
            />
          }
        >
          {history.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="receipt-outline" size={48} color="#d1d5db" />
              </View>
              <Text style={styles.emptyTitle}>No payments yet</Text>
              <Text style={styles.emptyBody}>
                Send your first STRK transfer to start this history.
              </Text>
            </View>
          ) : (
            history.map((item) => {
              const mine = item.senderPrivyUserId === user?.id;
              const amountLabel = `${mine ? "-" : "+"}${item.amountUnit} ${item.tokenSymbol}`;

              return (
                <View key={item.id} style={styles.txnCard}>
                  <View style={styles.txnHeader}>
                    <View
                      style={[
                        styles.txnIconWrap,
                        { backgroundColor: mine ? "#fee2e2" : "#d1fae5" },
                      ]}
                    >
                      <Ionicons
                        name={mine ? "arrow-up" : "arrow-down"}
                        size={16}
                        color={mine ? "#ef4444" : "#10b981"}
                      />
                    </View>
                    <View style={styles.txnMeta}>
                      <Text style={styles.txnTitle}>
                        {mine ? "Sent STRK" : "Received STRK"}
                      </Text>
                      <Text style={styles.txnDate}>
                        {formatPaymentDateTime(item.createdAt)}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.txnAmount,
                        { color: mine ? "#1c1f24" : "#10b981" },
                      ]}
                    >
                      {amountLabel}
                    </Text>
                  </View>
                  <View style={styles.txnFooter}>
                    <Text style={styles.txnStatus}>
                      {item.status === "success" ? "Completed" : "Failed"}
                    </Text>
                    {item.txHash && (
                      <Text style={styles.txnHash}>
                        {shortenAddress(item.txHash)}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <View style={styles.inputContainer}>
            <TextInput
              value={amountInput}
              onChangeText={setAmountInput}
              placeholder="0.00"
              placeholderTextColor="#9ca3af"
              keyboardType="decimal-pad"
              style={styles.amountInput}
            />
            <Text style={styles.currencyTag}>STRK</Text>
          </View>
          <Pressable
            style={[
              styles.sendButton,
              sending || !amountInput.trim() ? styles.sendButtonDisabled : undefined,
            ]}
            disabled={sending || !amountInput.trim()}
            onPress={() => {
              void submitPayment();
            }}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.sendButtonText}>Send</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  keyboardContainer: {
    flex: 1,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1c1f24",
    fontFamily: "Inter_600SemiBold",
  },
  errorBanner: {
    backgroundColor: "#fee2e2",
    padding: 12,
    marginHorizontal: 20,
    borderRadius: 12,
    marginBottom: 12,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    maxWidth: 600,
    alignSelf: "center" as const,
    width: "100%" as unknown as number,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1c1f24",
    fontFamily: "Inter_600SemiBold",
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 16,
    color: "#6b7280",
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingHorizontal: 40,
  },
  txnCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#f3f4f6",
    marginBottom: 12,
  },
  txnHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  txnIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  txnMeta: {
    flex: 1,
  },
  txnTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1c1f24",
    fontFamily: "Inter_600SemiBold",
  },
  txnDate: {
    fontSize: 12,
    color: "#6b7280",
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  txnAmount: {
    fontSize: 18,
    fontWeight: "700",
    fontFamily: "Inter_600SemiBold",
  },
  txnFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  txnStatus: {
    fontSize: 12,
    color: "#10b981",
    fontFamily: "Inter_500Medium",
  },
  txnHash: {
    fontSize: 12,
    color: "#9ca3af",
    fontFamily: "Inter_400Regular",
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    maxWidth: 600,
    alignSelf: "center" as const,
    width: "100%" as unknown as number,
  },
  inputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 56,
  },
  amountInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: "600",
    color: "#1c1f24",
    fontFamily: "Inter_600SemiBold",
    minHeight: 44,
    paddingVertical: 8,
    ...(Platform.OS === "web" ? { outlineStyle: "none" as any } : {}),
  },
  currencyTag: {
    fontSize: 14,
    fontWeight: "700",
    color: "#6b7280",
    fontFamily: "Inter_600SemiBold",
    marginLeft: 8,
  },
  sendButton: {
    height: 56,
    paddingHorizontal: 24,
    borderRadius: 16,
    backgroundColor: "#10b981",
    justifyContent: "center",
    alignItems: "center",
    minWidth: 100,
  },
  sendButtonDisabled: {
    backgroundColor: "#d1d5db",
  },
  sendButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
    fontFamily: "Inter_600SemiBold",
  },
});
