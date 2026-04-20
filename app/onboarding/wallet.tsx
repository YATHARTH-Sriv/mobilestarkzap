import { Ionicons } from "@expo/vector-icons";
import { usePrivy } from "@privy-io/expo";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
    Pressable,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from "react-native";

import { OnboardingCta } from "@/components/onboarding-cta";
import { OnboardingFrame } from "@/components/onboarding-frame";
import { shortenAddress } from "@/lib/http";
import { ONBOARDING_COLORS } from "@/lib/onboarding-theme";
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
  const { width, height } = useWindowDimensions();
  const [profileData, setProfileData] = useState<ProfileMeResponse | null>(
    null,
  );
  const [walletState, setWalletState] =
    useState<WalletOnboardingStateResponse | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadingWallet, setLoadingWallet] = useState(false);
  const [fundingBusy, setFundingBusy] = useState(false);
  const [deployBusy, setDeployBusy] = useState(false);

  const compactWidth = width <= 375;
  const compactHeight = height <= 760;
  const topPadding = compactHeight ? 126 : 168;
  const titleSize = compactWidth ? 44 : 52;
  const fieldMinHeight = compactWidth ? 78 : 88;

  const walletAddress =
    walletState?.wallet?.address ?? profileData?.wallet?.address ?? null;
  const funding = walletState?.funding;
  const canDeploy = funding?.canDeploy ?? false;

  function syncWalletState(
    payload: WalletOnboardingStateResponse,
    profileOverride?: ProfileMeResponse["profile"],
  ) {
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
      const message =
        stateError instanceof Error
          ? stateError.message
          : "Failed to refresh wallet state";

      if (/No Starknet wallet found/i.test(message)) {
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
      if (!user) {
        router.replace("./welcome");
        return;
      }

      try {
        const payload = await fetchMyProfile(getAccessToken);
        if (cancelled) {
          return;
        }

        setProfileData(payload);

        if (payload.profile?.onboardingCompleted) {
          router.replace("/(tabs)");
          return;
        }

        if (!payload.profile?.username) {
          router.replace("./username");
          return;
        }

        setLoadingWallet(true);
        const onboardingWallet =
          await prepareMyWalletForOnboarding(getAccessToken);
        if (cancelled) {
          return;
        }

        syncWalletState(onboardingWallet, payload.profile ?? null);

        if (onboardingWallet.funding?.canDeploy) {
          setStatus("Wallet funded. Deploy/check to continue.");
        } else {
          const targetAmount = onboardingWallet.funding?.amountStrk ?? "10";
          setStatus(`Fund wallet with ${targetAmount} STRK to continue.`);
        }
      } catch (profileError) {
        if (!cancelled) {
          const message =
            profileError instanceof Error
              ? profileError.message
              : "Failed to load profile";
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoadingWallet(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [user, getAccessToken]);

  const formattedAddress = useMemo(() => {
    if (walletAddress) {
      return shortenAddress(walletAddress);
    }

    return loadingWallet ? "Preparing wallet..." : "No wallet yet";
  }, [walletAddress, loadingWallet]);

  async function copyWalletAddress() {
    if (!walletAddress) {
      return;
    }

    await Clipboard.setStringAsync(walletAddress);
    setStatus("Wallet address copied");
  }

  async function fundWallet() {
    try {
      setFundingBusy(true);
      setError(null);

      const amountLabel = walletState?.funding?.amountStrk ?? "10";
      setStatus(`Funding ${amountLabel} STRK...`);

      const payload = await fundMyWalletForOnboarding(getAccessToken);

      setWalletState((prev) => ({
        wallet: payload.wallet,
        deployment: prev?.deployment,
        funding: payload.funding,
      }));

      setProfileData((prev) => ({
        profile: prev?.profile ?? null,
        wallet: payload.wallet,
      }));

      if (payload.funding.canDeploy) {
        setStatus("Wallet funded. Deploy/check to continue.");
      } else {
        setStatus(
          payload.message ??
            "Funding submitted. Tap again in a few seconds if still pending.",
        );
      }

      await refreshWalletState();
    } catch (fundError) {
      const message =
        fundError instanceof Error
          ? fundError.message
          : "Wallet funding failed";
      setError(message);
      setStatus("");
    } finally {
      setFundingBusy(false);
    }
  }

  async function deployOrCheckWallet() {
    try {
      setDeployBusy(true);
      setError(null);
      setStatus("Deploying wallet...");

      const currentState = walletState ?? (await refreshWalletState());
      if (!currentState.funding?.canDeploy) {
        const requiredAmount = currentState.funding?.amountStrk ?? "10";
        setError(`Fund wallet with ${requiredAmount} STRK before deploy`);
        setStatus("");
        return;
      }

      const walletPayload = await deployMyWallet(getAccessToken);
      syncWalletState(walletPayload);

      if (walletPayload.deployment?.ready) {
        setStatus("Wallet is ready. Finishing setup...");
        await completeMyOnboarding(getAccessToken);
        router.replace("./done");
        return;
      } else if (walletPayload.deployment?.message) {
        setStatus(walletPayload.deployment.message);
      } else {
        setStatus("Wallet is not ready yet. Retry Deploy/Check.");
      }
    } catch (walletError) {
      const message =
        walletError instanceof Error
          ? walletError.message
          : "Wallet step failed";
      setError(message);
      setStatus("");
    } finally {
      setDeployBusy(false);
    }
  }

  async function handlePrimaryAction() {
    if (canDeploy) {
      await deployOrCheckWallet();
      return;
    }

    await fundWallet();
  }

  const ctaLabel = deployBusy
    ? "Deploying..."
    : fundingBusy
      ? "Funding..."
      : canDeploy
        ? "Deploy / Check"
        : "Fund Wallet";

  const actionBusy = loadingWallet || deployBusy || fundingBusy;

  return (
    <OnboardingFrame>
      <View style={[styles.centeredContent, { paddingTop: topPadding }]}>
        <View
          style={[
            styles.stepBadge,
            compactWidth ? styles.stepBadgeCompact : undefined,
          ]}
        >
          <Text
            style={[
              styles.stepText,
              compactWidth ? styles.stepTextCompact : undefined,
            ]}
          >
            Step 2/2
          </Text>
        </View>
        <Text style={[styles.title, { fontSize: titleSize }]}>
          Wallet Address
        </Text>

        <View style={[styles.addressCard, { minHeight: fieldMinHeight }]}>
          <Text
            style={[
              styles.addressText,
              compactWidth ? styles.addressTextCompact : undefined,
            ]}
          >
            {formattedAddress}
          </Text>
          <Pressable
            onPress={copyWalletAddress}
            disabled={!walletAddress}
            style={[
              styles.copyButton,
              compactWidth ? styles.copyButtonCompact : undefined,
              !walletAddress ? styles.copyButtonDisabled : undefined,
            ]}
          >
            <Ionicons
              name="copy-outline"
              size={compactWidth ? 22 : 24}
              color={ONBOARDING_COLORS.greenDark}
            />
          </Pressable>
        </View>

        {status ? <Text style={styles.statusText}>{status}</Text> : null}
        {funding?.error ? (
          <Text style={styles.errorText}>{funding.error}</Text>
        ) : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>

      <View style={styles.ctaContainer}>
        <OnboardingCta
          label={ctaLabel}
          onPress={handlePrimaryAction}
          disabled={actionBusy}
          variant="green"
        />
      </View>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  centeredContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 26,
  },
  ctaContainer: {
    paddingHorizontal: 24,
    paddingBottom: 80,
  },
  stepBadge: {
    minHeight: 50,
    minWidth: 170,
    paddingHorizontal: 22,
    borderRadius: 25,
    backgroundColor: ONBOARDING_COLORS.softGray,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: {
    color: "#2e2f33",
    fontSize: 20,
    fontWeight: "700",
  },
  stepBadgeCompact: {
    minHeight: 46,
    minWidth: 158,
  },
  stepTextCompact: {
    fontSize: 18,
  },
  title: {
    color: "#1b1d21",
    fontWeight: "800",
  },
  addressCard: {
    width: "100%",
    minHeight: 88,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: ONBOARDING_COLORS.inputBorder,
    backgroundColor: "#f5f5f5",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    justifyContent: "space-between",
  },
  addressText: {
    color: "#3d3f43",
    fontSize: 20,
    fontWeight: "500",
  },
  addressTextCompact: {
    fontSize: 18,
  },
  copyButton: {
    width: 58,
    height: 58,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e8e8e8",
  },
  copyButtonCompact: {
    width: 52,
    height: 52,
  },
  copyButtonDisabled: {
    opacity: 0.45,
  },
  statusText: {
    color: ONBOARDING_COLORS.textSecondary,
    fontSize: 13,
    textAlign: "center",
  },
  errorText: {
    color: "#bd3f3f",
    fontSize: 13,
    textAlign: "center",
  },
});

