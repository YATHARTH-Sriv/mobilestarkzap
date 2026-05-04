import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, RefreshControl, TextInput, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { usePrivy } from '@/lib/use-auth';
import { Ionicons } from '@expo/vector-icons';
import { ms } from '@/lib/responsive';
import { getMarketDetail, placeBet, resolveMarket, claimWinnings, type MarketDetail } from '@/lib/api/prediction';
import { formatWeiToStrk } from '@/lib/profile';
import { FadeInView, Toast } from '@/components/SharedComponents';
import { PredictHeader } from '@/components/predict/PredictHeader';

export default function MarketDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getAccessToken } = usePrivy();
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [marketDetail, setMarketDetail] = useState<MarketDetail | null>(null);
  const [betAmount, setBetAmount] = useState("");
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
  };

  const loadMarketDetail = async (silent = false) => {
    if (!id) return;
    if (!silent) setLoading(true);
    
    let attempts = 0;
    const maxAttempts = 3;
    
    const fetchWithRetry = async () => {
      try {
        const detail = await getMarketDetail(getAccessToken, id);
        // If it looks like placeholder data (newly created but not yet indexed fully)
        const isPlaceholder = (!detail.question || detail.question === "Untitled Market") && 
                              (!detail.deadline || detail.deadline === "0");
        
        if (isPlaceholder && attempts < maxAttempts && !silent) {
          attempts++;
          await new Promise(resolve => setTimeout(resolve, 2000));
          return fetchWithRetry();
        }
        
        setMarketDetail(detail);
      } catch (e) {
        if (!silent) showToast(e instanceof Error ? e.message : "Failed to load market");
      } finally {
        if (!silent) setLoading(false);
      }
    };

    await fetchWithRetry();
  };

  useEffect(() => {
    loadMarketDetail();
  }, [id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMarketDetail(true);
    setRefreshing(false);
  };

  const handlePlaceBet = async (outcome: boolean) => {
    if (!id || !betAmount) return showToast("Enter amount");
    setLoading(true);
    try {
      const amountWei = (BigInt(Math.floor(parseFloat(betAmount) * 1e9)) * BigInt(1e9)).toString();
      await placeBet(getAccessToken, id, outcome, amountWei);
      showToast("Bet Placed!");
      setBetAmount("");
      await loadMarketDetail(true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to place bet");
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (winningOutcome: boolean) => {
    if (!id) return;
    setLoading(true);
    try {
      await resolveMarket(getAccessToken, id, winningOutcome);
      showToast("Market Resolved!");
      await loadMarketDetail(true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to resolve");
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async () => {
    if (!id) return;
    setLoading(true);
    try {
      await claimWinnings(getAccessToken, id);
      showToast("Winnings Claimed!");
      await loadMarketDetail(true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to claim");
    } finally {
      setLoading(false);
    }
  };

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <PredictHeader title="Market Details" subtitle="Loading..." showBack />
        <View style={styles.fullLoading}>
          <ActivityIndicator size="large" color="#1c1f24" />
        </View>
      </SafeAreaView>
    );
  }

  if (!marketDetail) return null;

  const totalPool = BigInt(marketDetail.yesPool) + BigInt(marketDetail.noPool);
  const yesPercent = totalPool === 0n ? 50 : Number((BigInt(marketDetail.yesPool) * 100n) / totalPool);
  const noPercent = totalPool === 0n ? 50 : 100 - yesPercent;
  
  const isCreator = marketDetail.creator.toLowerCase() === marketDetail.userAddress.toLowerCase();
  const canResolve = !marketDetail.resolved && (Date.now() / 1000) > parseInt(marketDetail.deadline, 10);
  const hasBet = marketDetail.userBet.exists;
  const isWinner = hasBet && marketDetail.resolved && marketDetail.userBet.outcome === marketDetail.winningOutcome;
  const canClaim = isWinner && !marketDetail.userBet.claimed;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <PredictHeader 
        title="Market Details" 
        subtitle="Peer-to-Peer Betting" 
        showBack 
        onRefresh={onRefresh}
      />
      
      <ScrollView 
        style={styles.detailScroll} 
        contentContainerStyle={styles.detailContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
      >
        <FadeInView delay={0}>
          <View style={styles.marketHeaderCard}>
             <View style={styles.marketIdBadge}>
               <Text style={styles.marketIdText}>ID: {marketDetail.id}</Text>
             </View>
             <Text style={styles.marketQuestion}>{marketDetail.question || "Untitled Market"}</Text>
             <View style={styles.deadlineInfo}>
               <Ionicons name="time-outline" size={14} color="#6b7280" />
               <Text style={styles.deadlineInfoText}>
                 {marketDetail.resolved ? "Resolved" : 
                  (!marketDetail.deadline || marketDetail.deadline === "0") ? "No deadline set" :
                  `Closes: ${new Date(parseInt(marketDetail.deadline, 10) * 1000).toLocaleString()}`}
               </Text>
             </View>
  
             <View style={styles.poolStats}>
                <View style={[styles.poolCard, { borderColor: "#10b981" }]}>
                  <Text style={styles.poolLabel}>YES POOL</Text>
                  <Text style={styles.poolValue}>{formatWeiToStrk(marketDetail.yesPool)}</Text>
                  <View style={styles.progressBarBg}>
                     <View style={[styles.progressBarFill, { width: `${yesPercent}%`, backgroundColor: "#10b981" }]} />
                  </View>
                </View>
                <View style={[styles.poolCard, { borderColor: "#ef4444" }]}>
                  <Text style={styles.poolLabel}>NO POOL</Text>
                  <Text style={styles.poolValue}>{formatWeiToStrk(marketDetail.noPool)}</Text>
                  <View style={styles.progressBarBg}>
                     <View style={[styles.progressBarFill, { width: `${noPercent}%`, backgroundColor: "#ef4444" }]} />
                  </View>
                </View>
             </View>
          </View>
        </FadeInView>

        {!marketDetail.resolved && (
          <FadeInView delay={100}>
            <View style={styles.betCard}>
              <Text style={styles.betLabel}>Place Your Bet</Text>
              <View style={styles.betInputWrap}>
                <TextInput
                  style={styles.betInput}
                  placeholder="Amount in STRK"
                  placeholderTextColor="#9ca3af"
                  value={betAmount}
                  onChangeText={setBetAmount}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.betActions}>
                <Pressable style={[styles.betBtn, styles.betYesBtn]} onPress={() => handlePlaceBet(true)}>
                  <Text style={styles.betBtnText}>Bet YES</Text>
                </Pressable>
                <Pressable style={[styles.betBtn, styles.betNoBtn]} onPress={() => handlePlaceBet(false)}>
                  <Text style={styles.betBtnText}>Bet NO</Text>
                </Pressable>
              </View>
            </View>
          </FadeInView>
        )}

        {hasBet && (
          <FadeInView delay={150}>
            <View style={styles.userBetInfo}>
               <Ionicons name="receipt-outline" size={20} color="#1c1f24" />
               <Text style={styles.userBetText}>
                 You bet {formatWeiToStrk(marketDetail.userBet.amount)} on {marketDetail.userBet.outcome ? "YES" : "NO"}
               </Text>
               {marketDetail.userBet.claimed && (
                 <View style={styles.claimedBadge}>
                   <Text style={styles.claimedText}>Claimed</Text>
                 </View>
               )}
            </View>
          </FadeInView>
        )}

        {canClaim && (
          <FadeInView delay={200}>
            <Pressable style={styles.claimBtn} onPress={handleClaim}>
              <Text style={styles.claimBtnText}>Claim Winnings</Text>
            </Pressable>
          </FadeInView>
        )}

        {isCreator && canResolve && (
          <FadeInView delay={200}>
            <View style={styles.creatorCard}>
              <Text style={styles.creatorLabel}>Creator Actions (Resolve)</Text>
              <View style={styles.resolveActions}>
                <Pressable style={[styles.resolveBtn, styles.resolveYesBtn]} onPress={() => handleResolve(true)}>
                  <Text style={styles.resolveBtnText}>Resolve YES</Text>
                </Pressable>
                <Pressable style={[styles.resolveBtn, styles.resolveNoBtn]} onPress={() => handleResolve(false)}>
                  <Text style={styles.resolveBtnText}>Resolve NO</Text>
                </Pressable>
              </View>
            </View>
          </FadeInView>
        )}
      </ScrollView>

      <Toast message={toastMsg} visible={toastVisible} onHide={() => setToastVisible(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  fullLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  detailScroll: {
    flex: 1,
  },
  detailContent: {
    padding: 20,
    gap: 20,
    maxWidth: 600,
    alignSelf: "center" as const,
    width: "100%" as unknown as number,
  },
  marketHeaderCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: "#f3f4f6",
  },
  marketIdBadge: {
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: "flex-end",
  },
  marketIdText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: "#4b5563",
  },
  marketQuestion: {
    fontSize: ms(20),
    fontFamily: "Inter_700Bold",
    color: "#1c1f24",
    marginVertical: 12,
    lineHeight: ms(26),
  },
  deadlineInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 24,
  },
  deadlineInfoText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#6b7280",
  },
  poolStats: {
    flexDirection: "row",
    gap: 12,
  },
  poolCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
  },
  poolLabel: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: "#9ca3af",
    marginBottom: 4,
  },
  poolValue: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#1c1f24",
    marginBottom: 8,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: "#f3f4f6",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 2,
  },
  betCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: "#f3f4f6",
  },
  betLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#374151",
    marginBottom: 16,
  },
  betInputWrap: {
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#f3f4f6",
    marginBottom: 16,
  },
  betInput: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: "#1c1f24",
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 4,
    ...(Platform.OS === "web" ? { outlineStyle: "none" as any } : {}),
  },
  betActions: {
    flexDirection: "row",
    gap: 12,
  },
  betBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  betYesBtn: {
    backgroundColor: "#10b981",
  },
  betNoBtn: {
    backgroundColor: "#ef4444",
  },
  betBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  userBetInfo: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#f9fafb",
    borderRadius: 16,
    gap: 12,
  },
  userBetText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#1c1f24",
  },
  claimedBadge: {
    backgroundColor: "#d1fae5",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  claimedText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: "#065f46",
  },
  claimBtn: {
    backgroundColor: "#1c1f24",
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  claimBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  creatorCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: "#f3f4f6",
  },
  creatorLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#374151",
    marginBottom: 16,
  },
  resolveActions: {
    flexDirection: "row",
    gap: 12,
  },
  resolveBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  resolveYesBtn: {
    backgroundColor: "#10b981",
  },
  resolveNoBtn: {
    backgroundColor: "#ef4444",
  },
  resolveBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
});
