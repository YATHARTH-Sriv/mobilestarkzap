import { Ionicons } from "@expo/vector-icons";
import { usePrivy } from "@privy-io/expo";
import * as Clipboard from "expo-clipboard";
import { StatusBar } from "expo-status-bar";
import type { ComponentProps } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";

import { shortenAddress } from "@/lib/http";
import { Toast } from "@/components/SharedComponents";
import {
  fetchMyPredictionBalances,
  fetchMyProfile,
  fetchMyTransactions,
  formatWeiToStrk,
  formatWeiToUsdc,
  type PredictionBalanceResponse,
  type ProfileMeResponse,
  type UserTransactionActivity,
} from "@/lib/profile";

const STRK_ICON = require("@/assets/images/strk.png");
const USDC_ICON = require("@/assets/images/usd.png");

type IconName = ComponentProps<typeof Ionicons>["name"];

function buildInitials(username: string): string {
  const cleaned = username.trim();
  if (!cleaned) return "AN";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function formatTransactionWhen(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.valueOf())) return "Today";
  const now = new Date();
  const isToday = parsed.toDateString() === now.toDateString();
  const options: Intl.DateTimeFormatOptions = isToday
    ? { hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric" };
  return isToday ? `Today, ${parsed.toLocaleTimeString([], options)}` : parsed.toLocaleDateString([], options);
}

function prettyAction(action: string): string {
  if (!action) return "Transaction";
  const map: Record<string, string> = {
    "direct_payment_sent": "Sent",
    "direct_payment_received": "Received",
  };
  return map[action.toLowerCase()] || action.split("_").map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

/* ───────────────────── screen ────────────────────────────── */

export default function ProfileScreen() {
  const { user, isReady, getAccessToken, logout } = usePrivy();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileMeResponse | null>(null);
  const [balances, setBalances] = useState<PredictionBalanceResponse | null>(null);
  const [transactions, setTransactions] = useState<UserTransactionActivity[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
  };

  const walletAddress = profile?.wallet?.address ?? null;
  const username = profile?.profile?.username ?? "Anonymous";
  const initials = useMemo(() => buildInitials(username), [username]);

  const strkAmount = useMemo(
    () => parseFloat(formatWeiToStrk(balances?.userBalance || "0").split(" ")[0]) || 0,
    [balances?.userBalance],
  );
  const strkPrice = useMemo(() => parseFloat(balances?.strkPriceUsdc || "0") || 0, [balances?.strkPriceUsdc]);
  const strkFiat = strkAmount * strkPrice;
  const usdcAmount = useMemo(
    () => parseFloat(formatWeiToUsdc(balances?.userUsdcBalance || "0").split(" ")[0]) || 0,
    [balances?.userUsdcBalance],
  );
  const usdcPrice = useMemo(() => parseFloat(balances?.usdcPriceUsdc || "0") || 0, [balances?.usdcPriceUsdc]);
  const usdcFiat = usdcAmount * usdcPrice;
  const totalFiat = strkFiat + usdcFiat;

  const loadData = useCallback(async (showLoader = true) => {
    if (!user) {
      setLoading(false);
      return;
    }
    if (showLoader) setLoading(true);
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
      showToast(loadError instanceof Error ? loadError.message : "Failed to load profile");
    } finally {
      if (showLoader) setLoading(false);
    }
  }, [user, getAccessToken]);

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
    if (!walletAddress) return;
    await Clipboard.setStringAsync(walletAddress);
    showToast("Address Copied");
  }

  if (!isReady || loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#1c1f24" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <StatusBar style="dark" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refreshProfileData} tintColor="#1c1f24" />
        }
      >
        <View style={styles.header}>
          <View>
            {/* <Text style={styles.eyebrow}>Profile</Text> */}
            <Text style={styles.title}>Account</Text>
          </View>
          <View style={styles.headerRightActions}>
            <Pressable style={styles.refreshIcon} onPress={refreshProfileData}>
              <Ionicons name="refresh" size={20} color="#1c1f24" />
            </Pressable>
            <Pressable style={styles.logoutIcon} onPress={logout}>
              <Ionicons name="log-out-outline" size={20} color="#ef4444" />
            </Pressable>
          </View>
        </View>

        <View style={styles.heroPanel}>
          <View style={styles.heroGlow} />
          <View style={styles.heroTop}>
            <View style={styles.profileLockup}>
              <View style={styles.avatarWrap}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              <View style={styles.identity}>
                <Text style={styles.welcomeLabel}>Welcome back</Text>
                <Text style={styles.usernameText} numberOfLines={1}>{username}</Text>
              </View>
            </View>
            <View style={styles.verifiedBadge}>
              <Ionicons name="shield-checkmark" size={14} color="#064e3b" />
              <Text style={styles.verifiedText}>Live</Text>
            </View>
          </View>

          <View style={styles.balanceBlock}>
            <Text style={styles.totalBalanceLabel}>Total balance</Text>
            <Text style={styles.totalBalanceValue}>
              ${totalFiat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>

          <PortfolioSparkline />

          <View style={styles.heroFooter}>
            <View style={styles.gainPill}>
              <Ionicons name="trending-up" size={15} color="#86efac" />
              {/* <Text style={styles.gainText}>5.2% this week</Text> */}
            </View>
            <Pressable style={styles.addressPill} onPress={copyWalletAddress}>
              <Text style={styles.addressText}>{shortenAddress(walletAddress || "")}</Text>
              <Ionicons name="copy-outline" size={14} color="#ffffff" />
            </Pressable>
          </View>
        </View>

        <View style={styles.assetGrid}>
          <AssetStat
            image={STRK_ICON}
            label="STRK"
            amount={`${strkAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })}`}
            value={`$${strkFiat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            tone="green"
          />
          <AssetStat
            image={USDC_ICON}
            label="USDC"
            amount={`${usdcAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })}`}
            value={`$${usdcFiat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            tone="blue"
          />
        </View>

        <View style={styles.activityHeader}>
          <View>
            <Text style={styles.sectionTitle}>Recent activity</Text>
            <Text style={styles.sectionMeta}>{transactions.length} latest movements</Text>
          </View>
          <View style={styles.activityBadge}>
            <Ionicons name="pulse" size={14} color="#10b981" />
          </View>
        </View>

        {transactions.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons name="receipt-outline" size={22} color="#9ca3af" />
            </View>
            <Text style={styles.emptyText}>No activity found</Text>
          </View>
        ) : (
          transactions.map((txn) => {
            const metadata = txn.metadata as any;
            const actionLower = txn.action.toLowerCase();
            
            // Determine if it's an incoming transaction
            const isReceived = 
              actionLower.includes("received") || 
              actionLower.includes("claimed") || 
              actionLower.includes("withdrawn") ||
              actionLower.includes("fund");

            const iconName = isReceived ? "arrow-down-outline" : "arrow-up-outline";
            const iconColor = isReceived ? "#10b981" : "#ef4444";
            const bgColor = isReceived ? "#ecfdf5" : "#fef2f2";

            let amountStr = metadata?.amountUnit;
            if (!amountStr && metadata?.amount) {
              // Convert raw amount from prediction metadata (WEI)
              amountStr = formatWeiToStrk(metadata.amount).split(" ")[0];
            }
            if (!amountStr) amountStr = "0";
            
            const symbol = metadata?.tokenSymbol || "STRK";

            return (
              <View key={txn.id} style={styles.txnCard}>
                <View style={[styles.txnIconWrap, { backgroundColor: bgColor }]}>
                  <Ionicons name={iconName} size={22} color={iconColor} />
                </View>
                <View style={styles.txnInfo}>
                  <Text style={styles.txnAction}>{prettyAction(txn.action)}</Text>
                  <Text style={styles.txnSubtitle} numberOfLines={1}>
                    {metadata?.marketId ? `Market #${metadata.marketId}` : shortenAddress(txn.txHash || "")}
                  </Text>
                </View>
                <View style={styles.txnRight}>
                  <Text style={[styles.txnAmount, { color: iconColor }]}>
                    {isReceived ? "+" : "-"}{parseFloat(amountStr).toLocaleString()} {symbol}
                  </Text>
                  <Text style={styles.txnTime}>{formatTransactionWhen(txn.createdAt)}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
      <Toast message={toastMsg} visible={toastVisible} onHide={() => setToastVisible(false)} />
    </SafeAreaView>
  );
}

function PortfolioSparkline() {
  return (
    <View style={styles.sparklineWrap}>
      <Svg width="100%" height="88" viewBox="0 0 240 88">
        <Defs>
          <LinearGradient id="profileLine" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#86efac" />
            <Stop offset="0.52" stopColor="#22d3ee" />
            <Stop offset="1" stopColor="#ffffff" />
          </LinearGradient>
        </Defs>
        <Path d="M 4 72 L 236 72" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        <Path d="M 4 46 L 236 46" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        <Path
          d="M 4 66 C 34 58, 44 38, 72 44 S 110 68, 138 48 S 178 20, 204 28 S 224 42, 236 24"
          fill="none"
          stroke="url(#profileLine)"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <Circle cx="236" cy="24" r="5" fill="#86efac" />
      </Svg>
    </View>
  );
}

function AssetStat({
  image,
  label,
  amount,
  value,
  tone,
}: {
  image: any;
  label: string;
  amount: string;
  value: string;
  tone: "green" | "blue";
}) {
  return (
    <View style={styles.assetStat}>
      <View style={[styles.assetIcon, tone === "green" ? styles.assetIconGreen : styles.assetIconBlue]}>
        <Image source={image} style={styles.tokenLogo} />
      </View>
      <Text style={styles.assetLabel}>{label}</Text>
      <Text style={styles.assetAmount} numberOfLines={1}>{amount}</Text>
      <Text style={styles.assetValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 120,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 22,
  },
  eyebrow: {
    color: "#10b981",
    fontSize: 13,
    textTransform: "uppercase",
    fontFamily: "Inter_600SemiBold",
  },
  title: {
    marginTop: 4,
    color: "#1c1f24",
    fontSize: 32,
    lineHeight: 38,
    fontFamily: "Inter_600SemiBold",
  },
  headerRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  refreshIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  logoutIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#fef2f2",
    justifyContent: "center",
    alignItems: "center",
  },
  heroPanel: {
    overflow: "hidden",
    borderRadius: 26,
    backgroundColor: "#111827",
    padding: 20,
    marginBottom: 14,
  },
  heroGlow: {
    position: "absolute",
    top: -70,
    right: -40,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: "rgba(16,185,129,0.22)",
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  profileLockup: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatarWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#10b981",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.26)",
  },
  avatarText: {
    color: "#ffffff",
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
  },
  identity: {
    flex: 1,
    gap: 2,
  },
  welcomeLabel: {
    fontSize: 13,
    color: "#a7f3d0",
    fontFamily: "Inter_500Medium",
  },
  usernameText: {
    fontSize: 22,
    color: "#ffffff",
    fontFamily: "Inter_600SemiBold",
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 15,
    backgroundColor: "#d1fae5",
  },
  verifiedText: {
    color: "#064e3b",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  balanceBlock: {
    marginTop: 26,
  },
  totalBalanceLabel: {
    fontSize: 13,
    color: "#9ca3af",
    fontFamily: "Inter_600SemiBold",
  },
  totalBalanceValue: {
    marginTop: 6,
    fontSize: 42,
    color: "#ffffff",
    fontFamily: "Inter_600SemiBold",
  },
  sparklineWrap: {
    height: 90,
    marginTop: 8,
  },
  heroFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  gainPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  gainText: {
    fontSize: 13,
    color: "#86efac",
    fontFamily: "Inter_600SemiBold",
  },
  addressPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "52%",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  addressText: {
    fontSize: 13,
    color: "#ffffff",
    fontFamily: "Inter_500Medium",
  },
  assetGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  assetStat: {
    flex: 1,
    minHeight: 130,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#edf0f2",
    padding: 14,
    backgroundColor: "#ffffff",
  },
  assetIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  assetIconGreen: {
    backgroundColor: "#ecfdf5",
  },
  assetIconBlue: {
    backgroundColor: "#eef6ff",
  },
  tokenLogo: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  assetLabel: {
    color: "#6b7280",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  assetAmount: {
    marginTop: 5,
    color: "#1c1f24",
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
  },
  assetValue: {
    marginTop: 3,
    color: "#9ca3af",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  activityHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: {
    color: "#1c1f24",
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
  },
  sectionMeta: {
    marginTop: 3,
    color: "#9ca3af",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  activityBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ecfdf5",
  },
  emptyCard: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f9fafb",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#edf0f2",
  },
  emptyIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    marginBottom: 10,
  },
  emptyText: {
    color: "#9ca3af",
    fontFamily: "Inter_500Medium",
  },
  txnCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#edf0f2",
  },
  txnIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  txnInfo: {
    flex: 1,
    marginLeft: 12,
    gap: 2,
    minWidth: 0,
  },
  txnAction: {
    fontSize: 16,
    color: "#1c1f24",
    fontFamily: "Inter_600SemiBold",
  },
  txnSubtitle: {
    fontSize: 13,
    color: "#9ca3af",
    fontFamily: "Inter_400Regular",
  },
  txnRight: {
    alignItems: "flex-end",
    gap: 2,
    maxWidth: "42%",
  },
  txnAmount: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  txnTime: {
    fontSize: 12,
    color: "#9ca3af",
    fontFamily: "Inter_400Regular",
  },
  logoutButton: {
    marginTop: 32,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: "#fef2f2",
  },
  logoutText: {
    fontSize: 16,
    color: "#ef4444",
    fontFamily: "Inter_600SemiBold",
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    backgroundColor: "#fef2f2",
    padding: 14,
    marginBottom: 18,
  },
  errorText: {
    flex: 1,
    color: "#b91c1c",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
});
