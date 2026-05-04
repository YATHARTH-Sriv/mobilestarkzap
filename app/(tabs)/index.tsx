import { Ionicons } from "@expo/vector-icons";
import { usePrivy } from "@/lib/use-auth";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  fetchMyPredictionBalances,
  fetchMyProfile,
  formatWeiToStrk,
  formatWeiToUsdc,
  type PredictionBalanceResponse,
} from "@/lib/profile";
import { fetchRecentPaymentContacts, type RecentPaymentContact } from "@/lib/payments";
import { Toast } from "@/components/SharedComponents";

const FALLBACK_USERNAME = "User";

const AVATAR_COLORS = [
  "#6366f1", // Indigo
  "#ec4899", // Pink
  "#f59e0b", // Amber
  "#10b981", // Emerald
  "#3b82f6", // Blue
  "#8b5cf6", // Violet
  "#ef4444", // Red
  "#06b6d4", // Cyan
] as const;

export default function HomeScreen() {
  const { getAccessToken } = usePrivy();
  const router = useRouter();
  const [username, setUsername] = useState(FALLBACK_USERNAME);
  const [refreshing, setRefreshing] = useState(false);
  const [strkBalance, setStrkBalance] = useState<PredictionBalanceResponse | null>(null);
  const [recentContacts, setRecentContacts] = useState<RecentPaymentContact[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
  };

  const loadData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const [profileData, balanceData, contactsData] = await Promise.all([
        fetchMyProfile(getAccessToken),
        fetchMyPredictionBalances(getAccessToken),
        fetchRecentPaymentContacts(getAccessToken, 12),
      ]);

      setUsername(profileData.profile?.username || FALLBACK_USERNAME);
      setStrkBalance(balanceData);
      setRecentContacts(contactsData);
    } catch (err) {
      console.error("Failed to load home data", err);
      showToast("Failed to sync data");
    } finally {
      if (showRefresh) setRefreshing(false);
    }
  }, [getAccessToken]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = () => loadData(true);

  // Real balance calculation
  const strkAmountStr = strkBalance ? formatWeiToStrk(strkBalance.userBalance).split(" ")[0] : "0";
  const strkAmount = parseFloat(strkAmountStr) || 0;

  const strkPrice = parseFloat(strkBalance?.strkPriceUsdc || "0") || 0;
  const strkFiat = strkAmount * strkPrice;

  const usdcAmountStr = strkBalance ? formatWeiToUsdc(strkBalance.userUsdcBalance).split(" ")[0] : "0";
  const usdcAmount = parseFloat(usdcAmountStr) || 0;
  const usdcPrice = parseFloat(strkBalance?.usdcPriceUsdc || "0") || 0;
  const usdcFiat = usdcAmount * usdcPrice;

  const totalFiat = strkFiat + usdcFiat;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.contentWrap}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.welcomeText}>Welcome back</Text>
            <Text style={styles.usernameText}>{username}</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable style={styles.iconButton} onPress={onRefresh}>
              <Ionicons name="refresh-outline" size={20} color="#1c1f24" />
            </Pressable>
            <Pressable style={styles.walletSelector}>
              <Text style={styles.walletText}>Wallet 1</Text>
              <Ionicons name="chevron-down" size={14} color="#6b7280" />
            </Pressable>
          </View>
        </View>

        {/* Balance Area */}
        <View style={styles.balanceContainer}>
          <Text style={styles.totalBalanceText}>
            ${totalFiat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
          {/* <Text style={styles.changeText}>+5.2% today</Text> */}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsRow}>
          <Pressable style={styles.actionPill} onPress={() => router.push("/send" as any)}>
            <Text style={styles.actionPillText}>Send</Text>
          </Pressable>
          <Pressable style={styles.actionPill} onPress={() => router.push("/swap" as any)}>
            <Text style={styles.actionPillText}>Swap</Text>
          </Pressable>
          <Pressable style={[styles.actionPill, styles.morePill]}>
            <Ionicons name="ellipsis-horizontal" size={18} color="#1c1f24" />
          </Pressable>
        </View>

        {/* Assets Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Assets</Text>
        </View>

        <View style={styles.assetCard}>
          <View style={styles.assetIconWrap}>
            <Image source={require("@/assets/images/strk.png")} style={styles.assetIcon} />
          </View>
          <View style={styles.assetInfo}>
            <Text style={styles.assetName}>STRK</Text>
            <Text style={styles.assetNetwork}>Starknet</Text>
          </View>
          <View style={styles.assetBalanceWrap}>
            <Text style={styles.assetBalanceCrypto}>{strkAmount.toLocaleString()} STRK</Text>
            <Text style={styles.assetBalanceFiat}>
              ${strkFiat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              {/* <Text style={styles.assetChangeText}> +5.2%</Text> */}
            </Text>
          </View>
        </View>

        <View style={styles.assetCard}>
          <View style={styles.assetIconWrap}>
            <Image source={require("@/assets/images/usd.png")} style={styles.assetIcon} />
          </View>
          <View style={styles.assetInfo}>
            <Text style={styles.assetName}>USDC</Text>
            <Text style={styles.assetNetwork}>USD Coin</Text>
          </View>
          <View style={styles.assetBalanceWrap}>
            <Text style={styles.assetBalanceCrypto}>{usdcAmount.toLocaleString()} USDC</Text>
            <Text style={styles.assetBalanceFiat}>
              {usdcPrice > 0
                ? `$${usdcFiat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : "--"}
              <Text style={styles.assetNeutralText}> 0.0%</Text>
            </Text>
          </View>
        </View>

        {/* Recent People Section */}
        {recentContacts.length > 0 && (
          <>
            <View style={[styles.sectionHeader, { marginTop: 12 }]}>
              <Text style={styles.sectionTitle}>Recent</Text>
            </View>
            <View style={styles.recentGrid}>
              {recentContacts.map((contact, index) => {
                const initials = contact.username.slice(0, 1).toUpperCase() || "?";
                const bgColor = AVATAR_COLORS[index % AVATAR_COLORS.length];

                return (
                  <Pressable
                    key={`${contact.walletAddress}-${index}`}
                    style={styles.recentItem}
                    onPress={() => router.push({
                      pathname: "../payments/[username]" as any,
                      params: { username: contact.walletAddress }
                    })}
                  >
                    <View style={[styles.avatarCircle, { backgroundColor: bgColor }]}>
                      <Text style={styles.avatarText}>{initials}</Text>
                    </View>
                    <Text style={styles.recentName} numberOfLines={1}>{contact.username}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
      <Toast message={toastMsg} visible={toastVisible} onHide={() => setToastVisible(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  scroll: {
    flex: 1,
  },
  contentWrap: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 40,
  },
  welcomeText: {
    fontSize: 14,
    color: "#6b7280",
    fontFamily: "Inter_500Medium",
  },
  usernameText: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1c1f24",
    fontFamily: "Inter_600SemiBold",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  walletSelector: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
  },
  walletText: {
    fontSize: 14,
    color: "#1c1f24",
    fontFamily: "Inter_600SemiBold",
  },
  balanceContainer: {
    alignItems: "center",
    marginBottom: 32,
  },
  totalBalanceText: {
    fontSize: 48,
    fontWeight: "700",
    color: "#1c1f24",
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -1,
  },
  changeText: {
    fontSize: 16,
    color: "#10b981",
    fontFamily: "Inter_500Medium",
    marginTop: 4,
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginBottom: 48,
  },
  actionPill: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: "#f3f4f6",
    minWidth: 80,
    alignItems: "center",
  },
  morePill: {
    paddingHorizontal: 16,
    minWidth: 0,
  },
  actionPillText: {
    fontSize: 16,
    color: "#1c1f24",
    fontFamily: "Inter_600SemiBold",
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1c1f24",
    fontFamily: "Inter_600SemiBold",
  },
  assetCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#f3f4f6",
    marginBottom: 12,
  },
  assetIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    overflow: "hidden",
  },
  assetIcon: {
    width: 48,
    height: 48,
  },
  assetInfo: {
    flex: 1,
  },
  assetName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1c1f24",
    fontFamily: "Inter_600SemiBold",
  },
  assetNetwork: {
    fontSize: 14,
    color: "#6b7280",
    fontFamily: "Inter_400Regular",
  },
  assetBalanceWrap: {
    alignItems: "flex-end",
  },
  assetBalanceCrypto: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1c1f24",
    fontFamily: "Inter_600SemiBold",
  },
  assetBalanceFiat: {
    fontSize: 14,
    color: "#6b7280",
    fontFamily: "Inter_500Medium",
  },
  assetChangeText: {
    color: "#10b981",
  },
  assetNeutralText: {
    color: "#6b7280",
  },
  recentGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -8,
  },
  recentItem: {
    width: "25%",
    alignItems: "center",
    paddingHorizontal: 8,
    marginBottom: 16,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  avatarText: {
    fontSize: 20,
    color: "#ffffff",
    fontWeight: "700",
    fontFamily: "Inter_600SemiBold",
  },
  recentName: {
    fontSize: 12,
    color: "#1c1f24",
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    width: "100%",
  },
});
