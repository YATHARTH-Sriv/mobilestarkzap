import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { usePrivy } from '@privy-io/expo';

import { fetchMyProfile, type ProfileMeResponse } from '@/lib/profile';
import { ONBOARDING_COLORS } from '@/lib/onboarding-theme';

export default function AppEntry() {
  const { user, isReady, getAccessToken } = usePrivy();
  const [profileState, setProfileState] = useState<ProfileMeResponse | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      if (!user) {
        setProfileState(null);
        setLoadError(null);
        setLoadingProfile(false);
        return;
      }

      setLoadingProfile(true);
      setLoadError(null);

      try {
        const nextProfile = await fetchMyProfile(getAccessToken);
        if (!cancelled) {
          setProfileState(nextProfile);
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Failed to load profile';
          setLoadError(message);
        }
      } finally {
        if (!cancelled) {
          setLoadingProfile(false);
        }
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [user, getAccessToken]);

  if (!isReady || loadingProfile) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={ONBOARDING_COLORS.greenDark} />
        <Text style={styles.loadingText}>Loading Zen...</Text>
      </View>
    );
  }

  if (!user) {
    return <Redirect href="./onboarding/welcome" />;
  }

  if (loadError) {
    return (
      <View style={styles.loadingScreen}>
        <Text style={styles.errorText}>{loadError}</Text>
        <Text style={styles.loadingText}>Redirecting to onboarding...</Text>
      </View>
    );
  }

  if (!profileState?.profile?.username) {
    return <Redirect href="./onboarding/username" />;
  }

  if (!profileState.wallet || !profileState.profile.onboardingCompleted) {
    return <Redirect href="./onboarding/wallet" />;
  }

  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    backgroundColor: ONBOARDING_COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 24,
  },
  loadingText: {
    color: ONBOARDING_COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  errorText: {
    color: '#c23a3a',
    fontSize: 14,
    textAlign: 'center',
  },
});
