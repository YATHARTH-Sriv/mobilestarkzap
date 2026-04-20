import { Ionicons } from "@expo/vector-icons";
import { usePrivy } from "@privy-io/expo";
import * as Clipboard from "expo-clipboard";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { shortenAddress } from "@/lib/http";
import {
    fetchMyPredictionBalances,
    fetchMyProfile,
    fetchMyTransactions,
    type PredictionBalanceResponse,
    type ProfileMeResponse,
    type UserTransactionActivity,
} from "@/lib/profile";

/* ───────────────────── helpers (no changes) ──────────────── */

type TransactionVisual = {
  iconName: "arrow-up-outline" | "arrow-down-outline";
  iconColor: string;
  iconBubble: string;
  amountColor: string;
};

function buildInitials(username: string): string {
  const cleaned = username.trim();
  if (!cleaned) {
    return "AN";
  }

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function addThousandsSeparators(raw: string): string {
  return raw.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatStrkTwoDecimals(wei: string | null | undefined): string {
  const parsedWei = BigInt(wei ?? "0");
  const roundedInCents =
    (parsedWei + 5_000_000_000_000_000n) / 10_000_000_000_000_000n;
  const whole = roundedInCents / 100n;
  const fractional = (roundedInCents % 100n).toString().padStart(2, "0");
  return `${addThousandsSeparators(whole.toString())}.${fractional}`;
}

function formatTransactionWhen(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.valueOf())) {
    return "--:--";
  }

  const day = parsed.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
  const clock = parsed.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return `${day} • ${clock}`;
}

function shortenWalletForCard(address: string | null): string {
  if (!address) {
    return "Not linked";
  }

  if (address.length <= 8) {
    return address;
  }

  return `${address.slice(0, 4)}...${address.slice(-2)}`;
}

function prettyAction(action: string): string {
  if (!action) {
    return "Transaction";
  }

  return action
    .replace(/_/g, " ")
    .split(" ")
    .map((part) =>
      part ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part,
    )
    .join(" ");
}

function metadataString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function counterpartyLabel(value: string | null): string | null {
  if (!value) {
    return null;
  }

  if (value.startsWith("@")) {
    return value;
  }

  if (/^0x[a-fA-F0-9]{8,}$/.test(value) || value.includes("...")) {
    return value;
  }

  return `@${value}`;
}

type DirectPaymentDescriptor = {
  actionLabel: string;
  subtitle: string;
  amountLabel: string | null;
};

function resolveDirectPaymentDescriptor(
  transaction: UserTransactionActivity,
): DirectPaymentDescriptor | null {
  const action = transaction.action.toLowerCase();
  const sent = action.includes("direct payment sent");
  const received = action.includes("direct payment received");

  if (!sent && !received) {
    return null;
  }

  const metadata = transaction.metadata as {
    amountUnit?: unknown;
    tokenSymbol?: unknown;
    recipientDisplayName?: unknown;
    recipientUsername?: unknown;
    recipientWalletAddress?: unknown;
    senderDisplayName?: unknown;
    senderUsername?: unknown;
    senderWalletAddress?: unknown;
  };

  const amountUnit = metadataString(metadata.amountUnit);
  const tokenSymbol = metadataString(metadata.tokenSymbol) ?? "STRK";
  const amountLabel = amountUnit
    ? `${received ? "+" : "-"}${amountUnit} ${tokenSymbol}`
    : null;

  if (sent) {
    const recipient =
      counterpartyLabel(
        metadataString(metadata.recipientDisplayName) ??
          metadataString(metadata.recipientUsername) ??
          metadataString(metadata.recipientWalletAddress),
      ) ?? "recipient";

    return {
      actionLabel: "Payment Sent",
      subtitle: `To ${recipient}`,
      amountLabel,
    };
  }

  const sender =
    counterpartyLabel(
      metadataString(metadata.senderDisplayName) ??
        metadataString(metadata.senderUsername) ??
        metadataString(metadata.senderWalletAddress),
    ) ?? "sender";

  return {
    actionLabel: "Payment Received",
    subtitle: `From ${sender}`,
    amountLabel,
  };
}

function resolveTransactionVisual(
  transaction: UserTransactionActivity,
): TransactionVisual {
  const action = transaction.action.toLowerCase();
  const directSent = action.includes("direct payment sent");
  const directReceived = action.includes("direct payment received");
  const incoming =
    directReceived ||
    (!directSent &&
      (action.includes("claim") ||
        action.includes("resolved") ||
        action.includes("check") ||
        action.includes("receive")));

  if (transaction.status === "failed") {
    return {
      iconName: "arrow-up-outline",
      iconColor: "#ef6f5d",
      iconBubble: "#fdf1ef",
      amountColor: "#c23f31",
    };
  }

  if (incoming) {
    return {
      iconName: "arrow-down-outline",
      iconColor: "#0ca74b",
      iconBubble: "#edf8f0",
      amountColor: "#0ca74b",
    };
  }

  return {
    iconName: "arrow-up-outline",
    iconColor: "#ff7f32",
    iconBubble: "#fdf4ea",
    amountColor: "#ff7f32",
  };
}

function transactionSubtitle(transaction: UserTransactionActivity): string {
  const metadata = transaction.metadata as { marketId?: unknown };
  const marketId =
    typeof metadata.marketId === "string" ? metadata.marketId : null;
  const signature = shortenAddress(
    transaction.txHash ?? transaction.details ?? "-",
  );

  if (marketId) {
    return `Market #${marketId} • ${signature}`;
  }

  return signature;
}

/* ───────────────────── screen ────────────────────────────── */

export default function ProfileScreen() {
  const { user, isReady, getAccessToken, logout } = usePrivy();
  const { width } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileMeResponse | null>(null);
  const [balances, setBalances] = useState<PredictionBalanceResponse | null>(
    null,
  );
  const [transactions, setTransactions] = useState<UserTransactionActivity[]>(
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const walletAddress = profile?.wallet?.address ?? null;
  const username = profile?.profile?.username ?? "Anonymous";

  const initials = useMemo(() => buildInitials(username), [username]);
  const prettyBalance = useMemo(
    () => formatStrkTwoDecimals(balances?.userBalance ?? null),
    [balances?.userBalance],
  );
  const shortWallet = useMemo(
    () => shortenWalletForCard(walletAddress),
    [walletAddress],
  );

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
        const [nextProfile, nextBalances, nextTransactions] = await Promise.all(
          [
            fetchMyProfile(getAccessToken),
            fetchMyPredictionBalances(getAccessToken).catch(() => null),
            fetchMyTransactions(getAccessToken, 12).catch(() => ({
              transactions: [],
              limit: 12,
            })),
          ],
        );

        setProfile(nextProfile);
        setBalances(nextBalances);
        setTransactions(nextTransactions.transactions);
      } catch (loadError) {
        const message =
          loadError instanceof Error
            ? loadError.message
            : "Failed to load profile";
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
    setCopyStatus("Copied wallet address");

    setTimeout(() => {
      setCopyStatus(null);
    }, 1200);
  }

  async function switchAccount() {
    if (loggingOut) {
      return;
    }

    try {
      setLoggingOut(true);
      await logout();
    } catch (logoutError) {
      const message =
        logoutError instanceof Error
          ? logoutError.message
          : "Failed to switch account";
      setError(message);
      setLoggingOut(false);
    }
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
    <SafeAreaView style={styles.screen} edges={["top"]}>
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
        }
      >
        {/* ── Header ────────────────────────────────── */}
        <View style={styles.headerRow}>
          <View style={styles.identityRow}>
            <View
              style={[
                styles.avatarCircle,
                {
                  width: avatarSize,
                  height: avatarSize,
                  borderRadius: avatarSize / 2,
                },
              ]}
            >
              <Text
                style={[styles.avatarInitials, { fontSize: compact ? 14 : 16 }]}
              >
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

          <View style={styles.headerActions}>
            <Pressable
              style={styles.refreshButton}
              onPress={() => {
                void refreshProfileData();
              }}
            >
              <Ionicons name="refresh" size={20} color="#8e9196" />
            </Pressable>

            <Pressable
              style={[
                styles.switchButton,
                loggingOut ? styles.switchButtonDisabled : undefined,
              ]}
              onPress={() => {
                void switchAccount();
              }}
              disabled={loggingOut}
            >
              <Ionicons
                name={
                  loggingOut ? "hourglass-outline" : "swap-horizontal-outline"
                }
                size={15}
                color={loggingOut ? "#8e9196" : "#2daa57"}
              />
              <Text
                style={[
                  styles.switchButtonText,
                  loggingOut ? styles.switchButtonTextDisabled : undefined,
                ]}
              >
                {loggingOut ? "Switching..." : "Switch"}
              </Text>
            </Pressable>
          </View>
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
              }}
            >
              <Ionicons
                name={copyStatus ? "checkmark" : "copy-outline"}
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
            <Text style={styles.emptyTxnText}>
              Your signatures will appear here.
            </Text>
          </View>
        ) : (
          transactions.map((transaction) => {
            const visual = resolveTransactionVisual(transaction);
            const directPayment = resolveDirectPaymentDescriptor(transaction);
            const actionLabel = directPayment
              ? directPayment.actionLabel
              : prettyAction(transaction.action);
            const subtitleLabel = directPayment
              ? directPayment.subtitle
              : transactionSubtitle(transaction);
            const statusLabel =
              transaction.status === "success"
                ? (directPayment?.amountLabel ?? "Confirmed")
                : "Failed";

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
                    ]}
                  >
                    <Ionicons
                      name={visual.iconName}
                      size={compact ? 16 : 20}
                      color={visual.iconColor}
                    />
                  </View>

                  <View style={styles.txnTextGroup}>
                    <Text style={styles.txnAction} numberOfLines={1}>
                      {actionLabel}
                    </Text>
                    <Text style={styles.txnSignature} numberOfLines={1}>
                      {subtitleLabel}
                    </Text>
                  </View>
                </View>

                <View style={styles.txnMetaGroup}>
                  <Text
                    style={[styles.txnStatus, { color: visual.amountColor }]}
                    numberOfLines={1}
                  >
                    {statusLabel}
                  </Text>
                  <Text style={styles.txnTime}>
                    {formatTransactionWhen(transaction.createdAt)}
                  </Text>
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
    backgroundColor: "#faf9f7",
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#faf9f7",
  },
  fallbackText: {
    color: "#4a4d52",
    fontFamily: "Inter_600SemiBold",
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12,
    paddingRight: 8,
  },
  avatarCircle: {
    backgroundColor: "#F5A623",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    color: "#ffffff",
    fontFamily: "Inter_600SemiBold",
  },
  identityTextWrap: {
    flex: 1,
    gap: 1,
  },
  welcomeLabel: {
    color: "#8e9196",
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
  usernameText: {
    color: "#1c1f24",
    fontFamily: "Inter_600SemiBold",
    fontSize: 22,
    letterSpacing: -0.2,
  },
  refreshButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  switchButton: {
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d7ebdf",
    backgroundColor: "#f2fbf5",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  switchButtonDisabled: {
    backgroundColor: "#f5f5f5",
    borderColor: "#e6e6e6",
  },
  switchButtonText: {
    color: "#2b9250",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  switchButtonTextDisabled: {
    color: "#8e9196",
  },

  /* ── balance card ──────────────────────────────────────── */
  balanceCard: {
    borderRadius: 28,
    backgroundColor: "#2daa57",
    paddingHorizontal: 22,
    paddingVertical: 24,
    justifyContent: "center",
    gap: 6,
    shadowColor: "#1b7a39",
    shadowOpacity: 0.16,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    elevation: 4,
  },
  balanceLabel: {
    color: "rgba(255,255,255,0.70)",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    marginBottom: 4,
  },
  balanceMainRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    marginBottom: 10,
  },
  balanceAmount: {
    color: "#ffffff",
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.5,
  },
  balanceToken: {
    color: "rgba(255,255,255,0.60)",
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
  },
  walletRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  walletText: {
    color: "rgba(255,255,255,0.70)",
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    letterSpacing: 0.3,
  },
  copyButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },

  /* ── section ───────────────────────────────────────────── */
  sectionTitle: {
    color: "#1f2227",
    fontFamily: "Inter_600SemiBold",
    fontSize: 20,
    letterSpacing: -0.15,
    marginTop: 8,
  },
  errorText: {
    color: "#c34635",
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    marginBottom: 2,
  },

  /* ── empty txn ─────────────────────────────────────────── */
  emptyTxnCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#ebebeb",
    backgroundColor: "#ffffff",
    minHeight: 80,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    gap: 2,
  },
  emptyTxnTitle: {
    color: "#2d3035",
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  emptyTxnText: {
    color: "#8c9097",
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },

  /* ── transaction card ──────────────────────────────────── */
  txnCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#ebebeb",
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  txnLeftGroup: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  txnIconWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  txnTextGroup: {
    flex: 1,
    gap: 2,
  },
  txnAction: {
    color: "#22252a",
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  txnSignature: {
    color: "#8c9097",
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  txnMetaGroup: {
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 3,
    minWidth: 80,
  },
  txnStatus: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  txnTime: {
    color: "#a5a8ad",
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },

  /* ── copy toast ────────────────────────────────────────── */
  copyToast: {
    marginTop: 4,
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#e8f7ed",
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  copyToastText: {
    color: "#249a52",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
});
