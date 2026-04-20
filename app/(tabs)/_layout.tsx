import { Tabs, Redirect } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { usePrivy } from '@privy-io/expo';

import { HapticTab } from '@/components/haptic-tab';
import { fetchMyProfile } from '@/lib/profile';
import { ONBOARDING_COLORS } from '@/lib/onboarding-theme';
import { wp, hp, ms } from '@/lib/responsive';

export default function TabLayout() {
  const { user, isReady, getAccessToken } = usePrivy();
  const [loading, setLoading] = useState(true);
  const [hasUsername, setHasUsername] = useState(false);
  const [hasWallet, setHasWallet] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkOnboarding() {
      if (!user) {
        if (!cancelled) {
          setHasUsername(false);
          setHasWallet(false);
          setOnboardingCompleted(false);
          setLoading(false);
        }
        return;
      }

      try {
        const payload = await fetchMyProfile(getAccessToken);
        if (!cancelled) {
          setHasUsername(Boolean(payload.profile?.username));
          setHasWallet(Boolean(payload.wallet));
          setOnboardingCompleted(Boolean(payload.profile?.onboardingCompleted));
        }
      } catch {
        if (!cancelled) {
          setHasUsername(false);
          setHasWallet(false);
          setOnboardingCompleted(false);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void checkOnboarding();

    return () => {
      cancelled = true;
    };
  }, [user, getAccessToken]);

  if (!isReady || loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={ONBOARDING_COLORS.greenDark} />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="../onboarding/welcome" />;
  }

  if (!hasUsername) {
    return <Redirect href="../onboarding/username" />;
  }

  if (!hasWallet || !onboardingCompleted) {
    return <Redirect href="../onboarding/wallet" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: ONBOARDING_COLORS.greenDark,
        tabBarInactiveTintColor: '#9a9ca1',
        tabBarStyle: {
          backgroundColor: '#f4f4f4',
          borderTopColor: '#dfdfdf',
          borderTopWidth: 1,
          height: hp(72),
          paddingTop: hp(10),
          paddingBottom: hp(10),
        },
        tabBarShowLabel: false,
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <Ionicons size={ms(24)} name="home-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Chats',
          tabBarIcon: ({ color }) => (
            <Ionicons size={ms(24)} name="chatbubbles-outline" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <Ionicons size={ms(24)} name="person-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ONBOARDING_COLORS.background,
  },
});
