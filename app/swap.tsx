import { Ionicons } from "@expo/vector-icons";
import { usePrivy } from "@privy-io/expo";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  fetchMyPredictionBalances,
  formatWeiToStrk,
  formatWeiToUsdc,
  type PredictionBalanceResponse,
} from "@/lib/profile";
import {
  executeSwap,
  fetchSwapQuote,
  type SwapExecuteResponse,
  type SwapQuoteResponse,
  type SwapTokenSymbol,
} from "@/lib/swap";

const TOKEN_META: Record<
  SwapTokenSymbol,
  {
    name: string;
    image: number;
    accent: string;
    soft: string;
  }
> = {
  STRK: {
    name: "Starknet",
    image: require("@/assets/images/strk.png"),
    accent: "#1c1f24",
    soft: "#f3f4f6",
  },
  USDC: {
    name: "USD Coin",
    image: require("@/assets/images/usd.png"),
    accent: "#2775ca",
    soft: "#eef6ff",
  },
};

const SLIPPAGE_OPTIONS = [50, 100, 200] as const;

function cleanAmountInput(value: string): string {
  const normalized = value.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const parts = normalized.split(".");
  if (parts.length <= 1) return normalized;
  return `${parts[0]}.${parts.slice(1).join("")}`;
}

function parseDisplayAmount(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCompactAmount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString(undefined, {
    maximumFractionDigits: value >= 1 ? 4 : 6,
  });
}

function formatBps(value: number | string | null): string {
  if (value === null) return "-";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return `${(parsed / 100).toFixed(parsed % 100 === 0 ? 0 : 2)}%`;
}

function tokenBalance(
  balances: PredictionBalanceResponse | null,
  token: SwapTokenSymbol,
): number {
  if (!balances) return 0;
  const formatted =
    token === "STRK"
      ? formatWeiToStrk(balances.userBalance)
      : formatWeiToUsdc(balances.userUsdcBalance);
  return parseDisplayAmount(formatted.split(" ")[0] ?? "0");
}

export default function SwapScreen() {
  const { getAccessToken } = usePrivy();
  const router = useRouter();

  const [balances, setBalances] = useState<PredictionBalanceResponse | null>(null);
  const [tokenIn, setTokenIn] = useState<SwapTokenSymbol>("STRK");
  const [tokenOut, setTokenOut] = useState<SwapTokenSymbol>("USDC");
  const [amount, setAmount] = useState("");
  const [slippageBps, setSlippageBps] = useState<(typeof SLIPPAGE_OPTIONS)[number]>(50);
  const [quote, setQuote] = useState<SwapQuoteResponse | null>(null);
  const [result, setResult] = useState<SwapExecuteResponse | null>(null);
  const [loadingBalances, setLoadingBalances] = useState(true);
  const [quoting, setQuoting] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quoteOpacity = useRef(new Animated.Value(0)).current;
  const quoteTranslate = useRef(new Animated.Value(10)).current;
  const switchSpin = useRef(new Animated.Value(0)).current;
  const switchTurns = useRef(0);
  const successScale = useRef(new Animated.Value(0.86)).current;

  const inputBalance = useMemo(() => tokenBalance(balances, tokenIn), [balances, tokenIn]);
  const outputBalance = useMemo(() => tokenBalance(balances, tokenOut), [balances, tokenOut]);
  const numericAmount = useMemo(() => parseDisplayAmount(amount), [amount]);
  const insufficientBalance = numericAmount > 0 && numericAmount > inputBalance;

  const receiveAmount = quote?.amountOut ?? "";

  const loadBalances = useCallback(async () => {
    setLoadingBalances(true);
    try {
      setBalances(await fetchMyPredictionBalances(getAccessToken));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load balances");
    } finally {
      setLoadingBalances(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    void loadBalances();
  }, [loadBalances]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(quoteOpacity, {
        toValue: quote ? 1 : 0,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(quoteTranslate, {
        toValue: quote ? 0 : 10,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [quote, quoteOpacity, quoteTranslate]);

  useEffect(() => {
    let cancelled = false;
    const trimmedAmount = amount.trim();

    setResult(null);
    if (!trimmedAmount || numericAmount <= 0 || insufficientBalance) {
      setQuote(null);
      setQuoting(false);
      return;
    }

    setQuoting(true);
    setError(null);

    const timeout = setTimeout(async () => {
      try {
        const nextQuote = await fetchSwapQuote(getAccessToken, {
          tokenIn,
          tokenOut,
          amount: trimmedAmount,
          slippageBps,
        });
        if (!cancelled) {
          setQuote(nextQuote);
        }
      } catch (quoteError) {
        if (!cancelled) {
          setQuote(null);
          setError(quoteError instanceof Error ? quoteError.message : "Quote failed");
        }
      } finally {
        if (!cancelled) {
          setQuoting(false);
        }
      }
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [amount, getAccessToken, insufficientBalance, numericAmount, slippageBps, tokenIn, tokenOut]);

  function onSwitchTokens() {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setQuote(null);
    setResult(null);
    setError(null);
    switchTurns.current += 1;
    Animated.spring(switchSpin, {
      toValue: switchTurns.current,
      damping: 14,
      stiffness: 180,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }

  function setMaxAmount() {
    setAmount(inputBalance > 0 ? String(Number(inputBalance.toFixed(tokenIn === "USDC" ? 6 : 8))) : "");
  }

  async function onSwap() {
    if (!quote || swapping || insufficientBalance) return;

    setSwapping(true);
    setError(null);
    setResult(null);
    try {
      const nextResult = await executeSwap(getAccessToken, {
        tokenIn,
        tokenOut,
        amount: amount.trim(),
        slippageBps,
      });
      setResult(nextResult);
      setQuote(nextResult);
      Animated.spring(successScale, {
        toValue: 1,
        damping: 10,
        stiffness: 180,
        useNativeDriver: true,
      }).start();
      await loadBalances();
    } catch (swapError) {
      setError(swapError instanceof Error ? swapError.message : "Swap failed");
    } finally {
      setSwapping(false);
    }
  }

  const switchRotation = switchSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  const buttonLabel = (() => {
    if (loadingBalances) return "Loading balances";
    if (!amount.trim() || numericAmount <= 0) return "Enter amount";
    if (insufficientBalance) return `Insufficient ${tokenIn}`;
    if (quoting) return "Finding best route";
    if (error && !quote) return "Quote unavailable";
    if (!quote) return "No quote available";
    if (swapping) return "Swapping";
    return `Swap ${tokenIn} to ${tokenOut}`;
  })();

  const canSwap = Boolean(quote) && !swapping && !quoting && !insufficientBalance && numericAmount > 0;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color="#1c1f24" />
          </Pressable>
          <Text style={styles.headerTitle}>Swap</Text>
          <Pressable style={styles.backButton} onPress={loadBalances}>
            {loadingBalances ? (
              <ActivityIndicator size="small" color="#1c1f24" />
            ) : (
              <Ionicons name="refresh" size={20} color="#1c1f24" />
            )}
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.hero}>
            <Text style={styles.heroEyebrow}>Starknet DeFi</Text>
            <Text style={styles.heroTitle}>Trade STRK and USDC</Text>
          </View>

          <View style={styles.swapSurface}>
            <View style={styles.amountPanel}>
              <View style={styles.panelTop}>
                <Text style={styles.panelLabel}>You pay</Text>
                <Text style={styles.balanceText}>Balance {formatCompactAmount(inputBalance)}</Text>
              </View>
              <View style={styles.amountRow}>
                <TextInput
                  style={styles.amountInput}
                  value={amount}
                  onChangeText={(value) => {
                    setAmount(cleanAmountInput(value));
                    setError(null);
                  }}
                  placeholder="0"
                  placeholderTextColor="#d1d5db"
                  keyboardType="decimal-pad"
                  selectionColor="#1c1f24"
                />
                <TokenPill token={tokenIn} />
              </View>
              <Pressable style={styles.maxButton} onPress={setMaxAmount}>
                <Text style={styles.maxButtonText}>Max</Text>
              </Pressable>
            </View>

            <View style={styles.switchWrap}>
              <Pressable style={styles.switchButton} onPress={onSwitchTokens}>
                <Animated.View style={{ transform: [{ rotate: switchRotation }] }}>
                  <Ionicons name="swap-vertical" size={22} color="#1c1f24" />
                </Animated.View>
              </Pressable>
            </View>

            <View style={styles.amountPanel}>
              <View style={styles.panelTop}>
                <Text style={styles.panelLabel}>You receive</Text>
                <Text style={styles.balanceText}>Balance {formatCompactAmount(outputBalance)}</Text>
              </View>
              <View style={styles.amountRow}>
                <Text style={[styles.amountInput, !receiveAmount && styles.receivePlaceholder]}>
                  {receiveAmount || "0"}
                </Text>
                <TokenPill token={tokenOut} />
              </View>
              <Text style={styles.receiveMeta}>
                {quoting ? "Checking route..." : quote ? quote.amountOutFormatted : "Estimated after quote"}
              </Text>
            </View>
          </View>

          <View style={styles.slippageRow}>
            <Text style={styles.slippageLabel}>Slippage</Text>
            <View style={styles.slippageOptions}>
              {SLIPPAGE_OPTIONS.map((option) => {
                const active = option === slippageBps;
                return (
                  <Pressable
                    key={option}
                    style={[styles.slippagePill, active && styles.slippagePillActive]}
                    onPress={() => setSlippageBps(option)}
                  >
                    <Text style={[styles.slippageText, active && styles.slippageTextActive]}>
                      {formatBps(option)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Animated.View
            style={[
              styles.quoteCard,
              {
                opacity: quoteOpacity,
                transform: [{ translateY: quoteTranslate }],
              },
            ]}
          >
            <QuoteRow label="Route" value={quote ? quote.provider.toUpperCase() : "-"} />
            <QuoteRow label="Price impact" value={formatBps(quote?.priceImpactBps ?? null)} />
            <QuoteRow label="Minimum received" value={quote ? `${quote.amountOut} ${tokenOut}` : "-"} />
          </Animated.View>

          {error ? (
            <View style={styles.messageCard}>
              <Ionicons name="alert-circle-outline" size={18} color="#ef4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {result ? (
            <Animated.View style={[styles.successCard, { transform: [{ scale: successScale }] }]}>
              <View style={styles.successIcon}>
                <Ionicons name="checkmark" size={18} color="#ffffff" />
              </View>
              <View style={styles.successCopy}>
                <Text style={styles.successTitle}>Swap submitted</Text>
                <Text style={styles.successText} numberOfLines={1}>
                  {result.txHash}
                </Text>
              </View>
            </Animated.View>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          {error ? (
            <View style={styles.footerError}>
              <Ionicons name="alert-circle-outline" size={16} color="#ef4444" />
              <Text style={styles.footerErrorText} numberOfLines={2}>
                {error}
              </Text>
            </View>
          ) : null}
          <Pressable
            style={[styles.swapButton, !canSwap && styles.swapButtonDisabled]}
            onPress={onSwap}
            disabled={!canSwap}
          >
            {swapping || quoting ? <ActivityIndicator size="small" color="#ffffff" /> : null}
            <Text style={styles.swapButtonText}>{buttonLabel}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function TokenPill({ token }: { token: SwapTokenSymbol }) {
  const meta = TOKEN_META[token];
  return (
    <View style={[styles.tokenPill, { backgroundColor: meta.soft }]}>
      <Image source={meta.image} style={styles.tokenIcon} />
      <View>
        <Text style={styles.tokenSymbol}>{token}</Text>
        <Text style={styles.tokenName}>{meta.name}</Text>
      </View>
    </View>
  );
}

function QuoteRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.quoteRow}>
      <Text style={styles.quoteLabel}>{label}</Text>
      <Text style={styles.quoteValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  keyboardWrap: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1c1f24",
    fontFamily: "Inter_600SemiBold",
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 132,
  },
  hero: {
    marginBottom: 22,
  },
  heroEyebrow: {
    fontSize: 13,
    color: "#10b981",
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
  },
  heroTitle: {
    marginTop: 6,
    fontSize: 30,
    lineHeight: 36,
    color: "#1c1f24",
    fontFamily: "Inter_600SemiBold",
  },
  swapSurface: {
    position: "relative",
    gap: 10,
  },
  amountPanel: {
    borderWidth: 1,
    borderColor: "#edf0f2",
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 16,
  },
  panelTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  panelLabel: {
    fontSize: 14,
    color: "#6b7280",
    fontFamily: "Inter_500Medium",
  },
  balanceText: {
    fontSize: 12,
    color: "#9ca3af",
    fontFamily: "Inter_500Medium",
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  amountInput: {
    flex: 1,
    minHeight: 58,
    fontSize: 38,
    color: "#1c1f24",
    fontFamily: "Inter_600SemiBold",
    padding: 0,
  },
  receivePlaceholder: {
    color: "#d1d5db",
  },
  maxButton: {
    alignSelf: "flex-start",
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: "#f3f4f6",
  },
  maxButtonText: {
    fontSize: 13,
    color: "#1c1f24",
    fontFamily: "Inter_600SemiBold",
  },
  receiveMeta: {
    marginTop: 12,
    fontSize: 13,
    color: "#9ca3af",
    fontFamily: "Inter_500Medium",
  },
  switchWrap: {
    height: 0,
    zIndex: 2,
    alignItems: "center",
  },
  switchButton: {
    position: "absolute",
    top: -14,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 4,
    borderColor: "#ffffff",
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  tokenPill: {
    minWidth: 112,
    height: 52,
    borderRadius: 26,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    gap: 8,
  },
  tokenIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  tokenSymbol: {
    fontSize: 15,
    color: "#1c1f24",
    fontFamily: "Inter_600SemiBold",
  },
  tokenName: {
    fontSize: 11,
    color: "#6b7280",
    fontFamily: "Inter_500Medium",
  },
  slippageRow: {
    marginTop: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  slippageLabel: {
    fontSize: 14,
    color: "#6b7280",
    fontFamily: "Inter_600SemiBold",
  },
  slippageOptions: {
    flexDirection: "row",
    gap: 8,
  },
  slippagePill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "#f3f4f6",
  },
  slippagePillActive: {
    backgroundColor: "#1c1f24",
  },
  slippageText: {
    fontSize: 13,
    color: "#6b7280",
    fontFamily: "Inter_600SemiBold",
  },
  slippageTextActive: {
    color: "#ffffff",
  },
  quoteCard: {
    marginTop: 18,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "#f9fafb",
    gap: 12,
  },
  quoteRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  quoteLabel: {
    fontSize: 14,
    color: "#6b7280",
    fontFamily: "Inter_500Medium",
  },
  quoteValue: {
    maxWidth: "58%",
    textAlign: "right",
    fontSize: 14,
    color: "#1c1f24",
    fontFamily: "Inter_600SemiBold",
  },
  messageCard: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#fef2f2",
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: "#ef4444",
    fontFamily: "Inter_500Medium",
  },
  successCard: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "#ecfdf5",
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
    fontSize: 14,
    color: "#065f46",
    fontFamily: "Inter_600SemiBold",
  },
  successText: {
    marginTop: 2,
    fontSize: 12,
    color: "#047857",
    fontFamily: "Inter_500Medium",
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 16,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  footerError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  footerErrorText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: "#ef4444",
    fontFamily: "Inter_500Medium",
  },
  swapButton: {
    height: 56,
    borderRadius: 28,
    backgroundColor: "#1c1f24",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  swapButtonDisabled: {
    backgroundColor: "#d1d5db",
  },
  swapButtonText: {
    fontSize: 16,
    color: "#ffffff",
    fontFamily: "Inter_600SemiBold",
  },
});
