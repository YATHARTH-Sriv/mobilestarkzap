import { Ionicons } from "@expo/vector-icons";
import { usePrivy } from "@/lib/use-auth";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    Animated,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";

import { OnboardingCta } from "@/components/onboarding-cta";
import { OnboardingFrame } from "@/components/onboarding-frame";
import { shortenAddress } from "@/lib/http";
import {
    completeMyOnboarding,
    deployMyWallet,
    fetchMyProfile,
    fetchMyWalletOnboardingState,
    fundMyWalletForOnboarding,
    prepareMyWalletForOnboarding,
    type ProfileMeResponse,
    type WalletOnboardingStateResponse,
} from "@/lib/profile";

export default function WalletStepScreen() {
  const { user, getAccessToken } = usePrivy();
  const [profileData, setProfileData] = useState<ProfileMeResponse | null>(null);
  const [walletState, setWalletState] = useState<WalletOnboardingStateResponse | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadingWallet, setLoadingWallet] = useState(false);
  const [fundingBusy, setFundingBusy] = useState(false);
  const [deployBusy, setDeployBusy] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.1, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  const walletAddress = walletState?.wallet?.address ?? profileData?.wallet?.address ?? null;
  const funding = walletState?.funding;
  const canDeploy = funding?.canDeploy ?? false;
  const isDeployed = walletState?.deployment?.ready ?? false;

  function syncWalletState(payload: WalletOnboardingStateResponse, profileOverride?: ProfileMeResponse["profile"]) {
    setWalletState(payload);
    setProfileData((prev) => ({
      profile: profileOverride ?? prev?.profile ?? null,
      wallet: {
        id: payload.wallet.id,
        address: payload.wallet.address,
        publicKey: payload.wallet.publicKey,
      },
    }));
  }

  async function refreshWalletState(): Promise<WalletOnboardingStateResponse> {
    try {
      const payload = await fetchMyWalletOnboardingState(getAccessToken);
      syncWalletState(payload);
      return payload;
    } catch (stateError) {
      if (/No Starknet wallet found/i.test((stateError as Error).message)) {
        const payload = await prepareMyWalletForOnboarding(getAccessToken);
        syncWalletState(payload);
        return payload;
      }
      throw stateError;
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!user) { router.replace("./welcome"); return; }
      try {
        const payload = await fetchMyProfile(getAccessToken);
        if (cancelled) return;
        setProfileData(payload);
        if (payload.profile?.onboardingCompleted) { router.replace("/(tabs)"); return; }
        if (!payload.profile?.username) { router.replace("./username"); return; }

        setLoadingWallet(true);
        const onboardingWallet = await prepareMyWalletForOnboarding(getAccessToken);
        if (cancelled) return;
        syncWalletState(onboardingWallet, payload.profile ?? null);

        if (onboardingWallet.funding?.canDeploy) {
          setStatus("Wallet funded. You're ready to deploy.");
        } else {
          setStatus(`Your wallet needs ${onboardingWallet.funding?.amountStrk ?? "10"} STRK to deploy.`);
        }
      } catch (profileError) {
        if (!cancelled) setError("Failed to initialize wallet step");
      } finally {
        if (!cancelled) setLoadingWallet(false);
      }
    }
    void bootstrap();
    return () => { cancelled = true; };
  }, [user, getAccessToken]);

  async function copyWalletAddress() {
    if (!walletAddress) return;
    await Clipboard.setStringAsync(walletAddress);
    setStatus("Address copied!");
  }

  async function fundWallet() {
    try {
      setFundingBusy(true);
      setError(null);
      setStatus("Funding your wallet...");
      const payload = await fundMyWalletForOnboarding(getAccessToken);
      syncWalletState(payload);
      if (payload.funding.canDeploy) {
        setStatus("Funded! Now let's deploy your wallet.");
      } else {
        setStatus("Funding request sent. Processing on-chain...");
      }
      await refreshWalletState();
    } catch (fundError) {
      setError("Funding failed. Please try again.");
    } finally {
      setFundingBusy(false);
    }
  }

  async function deployOrCheckWallet() {
    try {
      setDeployBusy(true);
      setError(null);
      setStatus("Deploying to Starknet...");
      const currentState = walletState ?? (await refreshWalletState());
      if (!currentState.funding?.canDeploy) {
        setError("Funding required before deployment");
        return;
      }
      const walletPayload = await deployMyWallet(getAccessToken);
      syncWalletState(walletPayload);
      if (walletPayload.deployment?.ready) {
        setStatus("Success! Taking you to the home screen...");
        await completeMyOnboarding(getAccessToken);
        router.replace("./done");
      } else {
        setStatus(walletPayload.deployment?.message ?? "Deployment in progress...");
      }
    } catch (walletError) {
      setError("Deployment failed. Please retry.");
    } finally {
      setDeployBusy(false);
    }
  }

  const ctaLabel = deployBusy ? "Deploying..." : fundingBusy ? "Funding..." : canDeploy ? "Deploy Wallet" : "Get Free STRK";
  const actionBusy = loadingWallet || deployBusy || fundingBusy;

  return (
    <OnboardingFrame>
      <View style={styles.container}>
        <Animated.View style={[styles.header, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepText}>Step 2 of 2</Text>
          </View>
          <Text style={styles.title}>Secure your{'\n'}Wallet</Text>
          <Text style={styles.subtitle}>
            We'll fund your wallet with free STRK and deploy it on the Starknet network.
          </Text>
        </Animated.View>

        <Animated.View style={[styles.main, { opacity: fadeAnim }]}>
          <View style={styles.addressCard}>
            <View style={styles.addressHeader}>
              <Text style={styles.addressLabel}>YOUR STARKNET ADDRESS</Text>
              {canDeploy && !isDeployed && (
                <Animated.View style={[styles.liveIndicator, { transform: [{ scale: pulseAnim }] }]}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>Ready</Text>
                </Animated.View>
              )}
            </View>
            <View style={styles.addressRow}>
              <Text style={styles.addressValue}>
                {walletAddress ? shortenAddress(walletAddress) : "Preparing..."}
              </Text>
              <Pressable onPress={copyWalletAddress} style={styles.copyButton}>
                <Ionicons name="copy-outline" size={20} color="#00c2ff" />
              </Pressable>
            </View>
          </View>

          <View style={styles.progressContainer}>
            <ProgressStep
              icon="cash-outline"
              label="Funding"
              status={canDeploy || isDeployed ? "completed" : fundingBusy ? "active" : "pending"}
            />
            <View style={styles.progressLine} />
            <ProgressStep
              icon="rocket-outline"
              label="Deployment"
              status={isDeployed ? "completed" : deployBusy ? "active" : "pending"}
            />
          </View>

          {status ? <Text style={styles.statusText}>{status}</Text> : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </Animated.View>

        <View style={styles.footer}>
          <OnboardingCta
            label={ctaLabel}
            onPress={canDeploy ? deployOrCheckWallet : fundWallet}
            disabled={actionBusy}
            variant="green"
          />
        </View>
      </View>
    </OnboardingFrame>
  );
}

function ProgressStep({ icon, label, status }: { icon: any; label: string; status: "completed" | "active" | "pending" }) {
  const isActive = status === "active";
  const isCompleted = status === "completed";

  return (
    <View style={styles.stepItem}>
      <View style={[
        styles.stepIconWrap,
        isCompleted && styles.stepIconCompleted,
        isActive && styles.stepIconActive,
      ]}>
        <Ionicons
          name={isCompleted ? "checkmark" : icon}
          size={20}
          color={isCompleted || isActive ? "#ffffff" : "#9ca3af"}
        />
      </View>
      <Text style={[styles.stepLabel, (isCompleted || isActive) && styles.stepLabelActive]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "space-between",
    paddingTop: 40,
    paddingBottom: 40,
  },
  header: {
    alignItems: "center",
    gap: 16,
  },
  stepBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  stepText: {
    color: "#64748b",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
  },
  title: {
    color: "#1c1f24",
    fontSize: 40,
    lineHeight: 46,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  subtitle: {
    color: "#64748b",
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    paddingHorizontal: 30,
  },
  main: {
    gap: 32,
  },
  addressCard: {
    width: "100%",
    backgroundColor: "#f8fafc",
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  addressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  addressLabel: {
    color: "#94a3b8",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(16,185,129,0.1)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10b981",
  },
  liveText: {
    color: "#10b981",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  addressValue: {
    color: "#1c1f24",
    fontSize: 22,
    fontFamily: "Inter_600SemiBold",
  },
  copyButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
  },
  stepItem: {
    alignItems: "center",
    gap: 8,
  },
  stepIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  stepIconActive: {
    backgroundColor: "#1c1f24",
    borderColor: "#10b981",
  },
  stepIconCompleted: {
    backgroundColor: "#10b981",
  },
  stepLabel: {
    color: "#94a3b8",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  stepLabelActive: {
    color: "#1c1f24",
  },
  progressLine: {
    width: 40,
    height: 2,
    backgroundColor: "#e2e8f0",
    marginTop: -20,
  },
  statusText: {
    color: "#10b981",
    fontSize: 14,
    textAlign: "center",
    fontFamily: "Inter_500Medium",
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 14,
    textAlign: "center",
    fontFamily: "Inter_500Medium",
  },
  footer: {
    paddingBottom: 20,
  },
});

