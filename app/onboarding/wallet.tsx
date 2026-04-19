import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { usePrivy } from '@privy-io/expo';

import { OnboardingFrame } from '@/components/onboarding-frame';
import { OnboardingCta } from '@/components/onboarding-cta';
import { API_BASE_URL } from '@/lib/config';
import { readErrorMessage, shortenAddress } from '@/lib/http';
import { completeMyOnboarding, fetchMyProfile, type ProfileMeResponse } from '@/lib/profile';
import { ONBOARDING_COLORS } from '@/lib/onboarding-theme';

type WalletApiResponse = {
  wallet: {
    id: string;
    address: string;
    publicKey?: string;
  };
  deployment?: {
    ready: boolean;
    mode?: 'user_pays' | 'sponsored';
    message?: string;
  };
};

export default function WalletStepScreen() {
  const { user, getAccessToken } = usePrivy();
  const { width, height } = useWindowDimensions();
  const [profileData, setProfileData] = useState<ProfileMeResponse | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const compactWidth = width <= 375;
  const compactHeight = height <= 760;
  const topPadding = compactHeight ? 126 : 168;
  const titleSize = compactWidth ? 44 : 52;
  const fieldMinHeight = compactWidth ? 78 : 88;

  const walletAddress = profileData?.wallet?.address ?? null;

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!user) {
        router.replace('./welcome');
        return;
      }

      try {
        const payload = await fetchMyProfile(getAccessToken);
        if (cancelled) {
          return;
        }

        setProfileData(payload);

        if (payload.profile?.onboardingCompleted) {
          router.replace('/(tabs)');
          return;
        }

        if (!payload.profile?.username) {
          router.replace('./username');
        }
      } catch (profileError) {
        if (!cancelled) {
          const message = profileError instanceof Error ? profileError.message : 'Failed to load profile';
          setError(message);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [user, getAccessToken]);

  const formattedAddress = useMemo(() => {
    return walletAddress ? shortenAddress(walletAddress) : 'No wallet yet';
  }, [walletAddress]);

  async function copyWalletAddress() {
    if (!walletAddress) {
      return;
    }

    await Clipboard.setStringAsync(walletAddress);
    setStatus('Wallet address copied');
  }

  async function deployOrCheckWallet() {
    try {
      setBusy(true);
      setError(null);
      setStatus('Preparing wallet...');

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      const token = await getAccessToken();
      if (!token) {
        throw new Error('Missing access token');
      }

      headers.Authorization = `Bearer ${token}`;

      const walletEndpoint = profileData?.wallet ? '/api/wallet/deploy' : '/api/wallet/starknet';
      const walletResponse = await fetch(`${API_BASE_URL}${walletEndpoint}`, {
        method: 'POST',
        headers,
      });

      if (!walletResponse.ok && walletResponse.status !== 409) {
        throw new Error(await readErrorMessage(walletResponse));
      }

      const walletPayload = (await walletResponse.json()) as WalletApiResponse;
      setProfileData((prev) => ({
        profile: prev?.profile ?? null,
        wallet: {
          id: walletPayload.wallet.id,
          address: walletPayload.wallet.address,
          publicKey: walletPayload.wallet.publicKey,
        },
      }));

      if (walletPayload.deployment?.ready) {
        setStatus('Wallet is ready. Finishing setup...');
      } else if (walletPayload.deployment?.message) {
        setStatus(walletPayload.deployment.message);
      } else {
        setStatus('Wallet checked. Finishing setup...');
      }

      await completeMyOnboarding(getAccessToken);
      router.replace('./done');
    } catch (walletError) {
      const message = walletError instanceof Error ? walletError.message : 'Wallet step failed';
      setError(message);
      setStatus('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <OnboardingFrame
      footer={
        <OnboardingCta
          label="Deploy / Check"
          onPress={deployOrCheckWallet}
          disabled={busy}
          variant="green"
        />
      }>
      <View style={[styles.centeredContent, { paddingTop: topPadding }]}>
        <View style={[styles.stepBadge, compactWidth ? styles.stepBadgeCompact : undefined]}>
          <Text style={[styles.stepText, compactWidth ? styles.stepTextCompact : undefined]}>Step 2/2</Text>
        </View>
        <Text style={[styles.title, { fontSize: titleSize }]}>Wallet Address</Text>

        <View style={[styles.addressCard, { minHeight: fieldMinHeight }]}> 
          <Text style={[styles.addressText, compactWidth ? styles.addressTextCompact : undefined]}>{formattedAddress}</Text>
          <Pressable onPress={copyWalletAddress} style={[styles.copyButton, compactWidth ? styles.copyButtonCompact : undefined]}>
            <Ionicons name="copy-outline" size={compactWidth ? 22 : 24} color={ONBOARDING_COLORS.greenDark} />
          </Pressable>
        </View>

        {status ? <Text style={styles.statusText}>{status}</Text> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  centeredContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 26,
  },
  stepBadge: {
    minHeight: 50,
    minWidth: 170,
    paddingHorizontal: 22,
    borderRadius: 25,
    backgroundColor: ONBOARDING_COLORS.softGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    color: '#2e2f33',
    fontSize: 20,
    fontWeight: '700',
  },
  stepBadgeCompact: {
    minHeight: 46,
    minWidth: 158,
  },
  stepTextCompact: {
    fontSize: 18,
  },
  title: {
    color: '#1b1d21',
    fontWeight: '800',
  },
  addressCard: {
    width: '100%',
    minHeight: 88,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: ONBOARDING_COLORS.inputBorder,
    backgroundColor: '#f5f5f5',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    justifyContent: 'space-between',
  },
  addressText: {
    color: '#3d3f43',
    fontSize: 20,
    fontWeight: '500',
  },
  addressTextCompact: {
    fontSize: 18,
  },
  copyButton: {
    width: 58,
    height: 58,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e8e8e8',
  },
  copyButtonCompact: {
    width: 52,
    height: 52,
  },
  statusText: {
    color: ONBOARDING_COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
  },
  errorText: {
    color: '#bd3f3f',
    fontSize: 13,
    textAlign: 'center',
  },
});
