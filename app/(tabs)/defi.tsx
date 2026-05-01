import { Ionicons } from "@expo/vector-icons";
import { usePrivy } from "@privy-io/expo";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";

import {
  claimStakingRewards,
  completeStakingWithdrawal,
  fetchDefiStakingSummary,
  stakeStrk,
  startStakingWithdrawal,
  type DefiActionResponse,
  type DefiStakingSummary,
} from "@/lib/defi";
import { shortenAddress } from "@/lib/http";
import { Toast } from "@/components/SharedComponents";

type Mode = "deposit" | "withdraw";

const STRK_ICON = require("@/assets/images/strk.png");

function parseAmount(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanAmount(value: string): string {
  const cleaned = value.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length <= 1) return cleaned;
  return `${parts[0]}.${parts.slice(1).join("")}`;
}

function compact(value: string | number, digits = 4): string {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return "0";
  return parsed.toLocaleString(undefined, {
    maximumFractionDigits: parsed >= 1 ? digits : 6,
  });
}

function formatDate(iso: string | null): string {
  if (!iso) return "No active cooldown";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.valueOf())) return "Pending";
  return parsed.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function isWithdrawalReady(iso: string | null): boolean {
  if (!iso) return false;
  const parsed = new Date(iso);
  return !Number.isNaN(parsed.valueOf()) && Date.now() >= parsed.getTime();
}

export default function DefiScreen() {
  const { getAccessToken } = usePrivy();
  const [summary, setSummary] = useState<DefiStakingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mode, setMode] = useState<Mode>("deposit");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [completingExit, setCompletingExit] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [lastAction, setLastAction] = useState<DefiActionResponse | null>(null);
  const fade = useRef(new Animated.Value(0)).current;

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
  };

  const loadSummary = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);

    try {
      const next = await fetchDefiStakingSummary(getAccessToken);
      setSummary(next);
      Animated.timing(fade, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }).start();
    } catch (loadError) {
      showToast(loadError instanceof Error ? loadError.message : "Failed to load DeFi");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fade, getAccessToken]);

  useFocusEffect(
    useCallback(() => {
      void loadSummary();
    }, [loadSummary]),
  );

  const position = summary?.position;
  const walletBalance = parseAmount(summary?.walletBalance.unit ?? "0");
  const staked = parseAmount(position?.staked.unit ?? "0");
  const rewards = parseAmount(position?.rewards.unit ?? "0");
  const total = parseAmount(position?.total.unit ?? "0");
  const unpooling = parseAmount(position?.unpooling.unit ?? "0");
  const inputAmount = useMemo(() => parseAmount(amount), [amount]);
  const maxForMode = mode === "deposit" ? walletBalance : staked;
  const primaryPool = summary?.primaryPool;
  const canSubmit = Boolean(primaryPool) && inputAmount > 0 && inputAmount <= maxForMode && !submitting;
  const canClaim = Boolean(primaryPool) && rewards > 0 && !claiming;
  const canCompleteExit = Boolean(primaryPool && isWithdrawalReady(position?.unpoolTime ?? null)) && !completingExit;

  function setMax() {
    setAmount(maxForMode > 0 ? String(Number(maxForMode.toFixed(6))) : "");
  }

  async function submitStakeAction() {
    if (!primaryPool || !canSubmit) return;

    setSubmitting(true);
    setLastAction(null);

    try {
      const action =
        mode === "deposit"
          ? await stakeStrk(getAccessToken, primaryPool.poolContract, amount)
          : await startStakingWithdrawal(getAccessToken, primaryPool.poolContract, amount);
      setLastAction(action);
      setAmount("");
      await loadSummary(true);
    } catch (actionError) {
      showToast(actionError instanceof Error ? actionError.message : "Staking action failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function claimRewards() {
    if (!primaryPool || !canClaim) return;

    setClaiming(true);
    setLastAction(null);

    try {
      const action = await claimStakingRewards(getAccessToken, primaryPool.poolContract);
      setLastAction(action);
      await loadSummary(true);
    } catch (claimError) {
      showToast(claimError instanceof Error ? claimError.message : "Claim failed");
    } finally {
      setClaiming(false);
    }
  }

  async function completeWithdrawal() {
    if (!primaryPool || !canCompleteExit) return;

    setCompletingExit(true);
    setLastAction(null);

    try {
      const action = await completeStakingWithdrawal(getAccessToken, primaryPool.poolContract);
      setLastAction(action);
      await loadSummary(true);
    } catch (exitError) {
      showToast(exitError instanceof Error ? exitError.message : "Withdrawal completion failed");
    } finally {
      setCompletingExit(false);
    }
  }

  if (loading && !summary) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#1c1f24" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void loadSummary(true)} tintColor="#15b981" />
        }
      >
        <Animated.View style={{ opacity: fade }}>
          <View style={styles.header}>
            <View>
              {/* <Text style={styles.eyebrow}>DeFi vault</Text> */}
              <Text style={styles.title}>Earn on STRK</Text>
            </View>
            <Pressable style={styles.refreshButton} onPress={() => void loadSummary(true)}>
              {refreshing ? <ActivityIndicator size="small" color="#1c1f24" /> : <Ionicons name="refresh" size={20} color="#1c1f24" />}
            </Pressable>
          </View>

          <View style={styles.heroPanel}>
            <View style={styles.heroTop}>
              <View>
                <Text style={styles.heroLabel}>Total staked</Text>
                <Text style={styles.heroValue}>{compact(total)} STRK</Text>
              </View>
              {/* <View style={styles.apyPill}>
                <Ionicons name="trending-up" size={15} color="#064e3b" />
                <Text style={styles.apyText}>{summary?.stats.estimatedApy.toFixed(1) ?? "0.0"}% APY</Text>
              </View> */}
            </View>

            <EarningsChart staked={staked} rewards={rewards} yearly={Number(summary?.stats.projectedYearlyRewards ?? "0") || 0} />

            <View style={styles.metricGrid}>
              <Metric label="Wallet" value={`${compact(walletBalance)} STRK`} />
              <Metric label="Rewards" value={`${compact(rewards)} STRK`} tone="green" />
              <Metric label="Unstaking" value={`${compact(unpooling)} STRK`} />
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Primary validator</Text>
            <Text style={styles.sectionMeta}>{summary?.chainId === "SN_SEPOLIA" ? "Sepolia" : "Mainnet"}</Text>
          </View>

          <View style={styles.validatorRow}>
            <View style={styles.validatorAvatar}>
              <Image source={STRK_ICON} style={styles.validatorIcon} />
            </View>
            <View style={styles.validatorCopy}>
              <Text style={styles.validatorName}>
                {primaryPool?.validator?.name ?? "STRK delegation pool"}
              </Text>
              <Text style={styles.validatorAddress}>
                {shortenAddress(primaryPool?.poolContract)}
              </Text>
            </View>
            <View style={styles.commissionBadge}>
              <Text style={styles.commissionText}>{position?.commissionPercent ?? 0}% fee</Text>
            </View>
          </View>

          <View style={styles.actionPanel}>
            <View style={styles.segmented}>
              <Pressable
                style={[styles.segment, mode === "deposit" && styles.segmentActive]}
                onPress={() => {
                  setMode("deposit");
                  setAmount("");
                }}
              >
                <Text style={[styles.segmentText, mode === "deposit" && styles.segmentTextActive]}>Deposit</Text>
              </Pressable>
              <Pressable
                style={[styles.segment, mode === "withdraw" && styles.segmentActive]}
                onPress={() => {
                  setMode("withdraw");
                  setAmount("");
                }}
              >
                <Text style={[styles.segmentText, mode === "withdraw" && styles.segmentTextActive]}>Withdraw</Text>
              </Pressable>
            </View>

            <View style={styles.inputShell}>
              <View>
                <Text style={styles.inputLabel}>{mode === "deposit" ? "Stake amount" : "Withdraw amount"}</Text>
                <Text style={styles.inputLimit}>
                  Available {compact(maxForMode)} STRK
                </Text>
              </View>
              <View style={styles.amountLine}>
                <TextInput
                  value={amount}
                  onChangeText={(value) => {
                    setAmount(cleanAmount(value));
                  }}
                  placeholder="0"
                  placeholderTextColor="#d1d5db"
                  keyboardType="decimal-pad"
                  style={styles.amountInput}
                />
                <Pressable style={styles.maxPill} onPress={setMax}>
                  <Text style={styles.maxText}>Max</Text>
                </Pressable>
              </View>
            </View>

            <Pressable
              style={[styles.primaryButton, !canSubmit && styles.primaryButtonDisabled]}
              onPress={submitStakeAction}
              disabled={!canSubmit}
            >
              {submitting ? <ActivityIndicator size="small" color="#ffffff" /> : <Ionicons name={mode === "deposit" ? "arrow-down" : "arrow-up"} size={18} color="#ffffff" />}
              <Text style={styles.primaryButtonText}>
                {submitting ? "Submitting" : mode === "deposit" ? "Deposit STRK" : "Start withdrawal"}
              </Text>
            </Pressable>
          </View>

          <View style={styles.manageGrid}>
            <Pressable
              style={[styles.manageButton, !canClaim && styles.manageDisabled]}
              onPress={claimRewards}
              disabled={!canClaim}
            >
              {claiming ? <ActivityIndicator size="small" color="#10b981" /> : <Ionicons name="sparkles" size={20} color="#10b981" />}
              <Text style={styles.manageTitle}>Claim rewards</Text>
              <Text style={styles.manageSubtitle}>{compact(rewards)} STRK ready</Text>
            </Pressable>

            <Pressable
              style={[styles.manageButton, !canCompleteExit && styles.manageDisabled]}
              onPress={completeWithdrawal}
              disabled={!canCompleteExit}
            >
              {completingExit ? <ActivityIndicator size="small" color="#1c1f24" /> : <Ionicons name="time-outline" size={20} color="#1c1f24" />}
              <Text style={styles.manageTitle}>Complete exit</Text>
              <Text style={styles.manageSubtitle}>{formatDate(position?.unpoolTime ?? null)}</Text>
            </Pressable>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Earnings path</Text>
            <Text style={styles.sectionMeta}>Projected</Text>
          </View>

          <View style={styles.timeline}>
            {["Today", "1 mo", "6 mo", "1 yr"].map((label, index) => {
              const projected = staked + (Number(summary?.stats.projectedYearlyRewards ?? "0") || 0) * ([0, 1 / 12, 0.5, 1][index] ?? 0);
              return (
                <View key={label} style={styles.timelineStep}>
                  <View style={[styles.timelineDot, index === 3 && styles.timelineDotActive]} />
                  <Text style={styles.timelineLabel}>{label}</Text>
                  <Text style={styles.timelineValue}>{compact(projected)} STRK</Text>
                </View>
              );
            })}
          </View>

          {lastAction ? (
            <View style={styles.successCard}>
              <View style={styles.successIcon}>
                <Ionicons name="checkmark" size={18} color="#ffffff" />
              </View>
              <View style={styles.successCopy}>
                <Text style={styles.successTitle}>{lastAction.message}</Text>
                <Text style={styles.successText}>{shortenAddress(lastAction.txHash)}</Text>
              </View>
            </View>
          ) : null}
        </Animated.View>
      </ScrollView>
      <Toast message={toastMsg} visible={toastVisible} onHide={() => setToastVisible(false)} />
    </SafeAreaView>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "green" }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, tone === "green" && styles.metricValueGreen]}>{value}</Text>
    </View>
  );
}

function EarningsChart({ staked, rewards, yearly }: { staked: number; rewards: number; yearly: number }) {
  const base = Math.max(staked, 1);
  const lift = Math.min(54, Math.max(10, (yearly / base) * 260 + rewards * 2));
  const path = `M 4 72 C 45 ${68 - lift * 0.2}, 72 ${64 - lift * 0.4}, 110 ${56 - lift * 0.55} S 172 ${40 - lift * 0.7}, 226 ${22}`;

  return (
    <View style={styles.chartWrap}>
      <Svg width="100%" height="96" viewBox="0 0 230 96">
        <Defs>
          <LinearGradient id="earnLine" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#15b981" />
            <Stop offset="1" stopColor="#2775ca" />
          </LinearGradient>
        </Defs>
        <Path d="M 4 78 L 226 78" stroke="#edf0f2" strokeWidth="1" />
        <Path d="M 4 50 L 226 50" stroke="#edf0f2" strokeWidth="1" />
        <Path d={path} fill="none" stroke="url(#earnLine)" strokeWidth="5" strokeLinecap="round" />
        <Circle cx="226" cy="22" r="5" fill="#15b981" />
      </Svg>
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
    alignItems: "center",
    justifyContent: "space-between",
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
  refreshButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f4f6",
  },
  heroPanel: {
    overflow: "hidden",
    borderRadius: 26,
    backgroundColor: "#111827",
    padding: 20,
    marginBottom: 24,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  heroLabel: {
    color: "#a7f3d0",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  heroValue: {
    marginTop: 6,
    color: "#ffffff",
    fontSize: 34,
    lineHeight: 40,
    fontFamily: "Inter_600SemiBold",
  },
  apyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "#d1fae5",
  },
  apyText: {
    color: "#064e3b",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  chartWrap: {
    height: 104,
    marginTop: 14,
  },
  metricGrid: {
    flexDirection: "row",
    gap: 10,
  },
  metric: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  metricLabel: {
    color: "#9ca3af",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  metricValue: {
    marginTop: 5,
    color: "#ffffff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  metricValueGreen: {
    color: "#86efac",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    color: "#1c1f24",
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
  },
  sectionMeta: {
    color: "#9ca3af",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  validatorRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#edf0f2",
    borderRadius: 18,
    padding: 14,
    marginBottom: 18,
  },
  validatorAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  validatorIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  validatorCopy: {
    flex: 1,
  },
  validatorName: {
    color: "#1c1f24",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  validatorAddress: {
    marginTop: 3,
    color: "#6b7280",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  commissionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: "#eef6ff",
  },
  commissionText: {
    color: "#2775ca",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  actionPanel: {
    borderWidth: 1,
    borderColor: "#edf0f2",
    borderRadius: 22,
    padding: 14,
    marginBottom: 16,
  },
  segmented: {
    flexDirection: "row",
    padding: 4,
    borderRadius: 18,
    backgroundColor: "#f3f4f6",
    marginBottom: 14,
  },
  segment: {
    flex: 1,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentActive: {
    backgroundColor: "#ffffff",
  },
  segmentText: {
    color: "#6b7280",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  segmentTextActive: {
    color: "#1c1f24",
  },
  inputShell: {
    borderRadius: 18,
    backgroundColor: "#f9fafb",
    padding: 14,
    marginBottom: 12,
  },
  inputLabel: {
    color: "#6b7280",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  inputLimit: {
    marginTop: 3,
    color: "#9ca3af",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  amountLine: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  amountInput: {
    flex: 1,
    minHeight: 52,
    padding: 0,
    color: "#1c1f24",
    fontSize: 34,
    fontFamily: "Inter_600SemiBold",
  },
  maxPill: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 16,
    backgroundColor: "#ffffff",
  },
  maxText: {
    color: "#1c1f24",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  primaryButton: {
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 9,
    backgroundColor: "#1c1f24",
  },
  primaryButtonDisabled: {
    backgroundColor: "#d1d5db",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  manageGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  manageButton: {
    flex: 1,
    minHeight: 116,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#edf0f2",
    padding: 14,
    justifyContent: "space-between",
  },
  manageDisabled: {
    opacity: 0.48,
  },
  manageTitle: {
    color: "#1c1f24",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  manageSubtitle: {
    color: "#6b7280",
    fontSize: 12,
    lineHeight: 17,
    fontFamily: "Inter_500Medium",
  },
  timeline: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderRadius: 20,
    backgroundColor: "#f9fafb",
    padding: 14,
    marginBottom: 16,
  },
  timelineStep: {
    flex: 1,
  },
  timelineDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#d1d5db",
    marginBottom: 10,
  },
  timelineDotActive: {
    backgroundColor: "#10b981",
  },
  timelineLabel: {
    color: "#6b7280",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  timelineValue: {
    marginTop: 4,
    color: "#1c1f24",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  successCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 18,
    backgroundColor: "#ecfdf5",
    padding: 14,
    marginBottom: 12,
  },
  successIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#10b981",
  },
  successCopy: {
    flex: 1,
  },
  successTitle: {
    color: "#065f46",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  successText: {
    marginTop: 2,
    color: "#047857",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 16,
    backgroundColor: "#fef2f2",
    padding: 14,
  },
  errorText: {
    flex: 1,
    color: "#ef4444",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
});
