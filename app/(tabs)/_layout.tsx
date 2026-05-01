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
        tabBarActiveTintColor: '#1c1f24',
        tabBarInactiveTintColor: '#9a9ca1',
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopWidth: 0,
          height: 70,
          paddingBottom: 12,
          paddingTop: 12,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: ms(11),
          fontFamily: 'Inter_500Medium',
          marginTop: hp(4),
        },
        headerShown: false,
        tabBarButton: (props) => (
          <HapticTab 
            {...props} 
            style={[
              props.style, 
              { 
                justifyContent: 'center', 
                alignItems: 'center',
              }
            ]} 
          />
        ),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.tabIconContainer, focused && styles.activeTabPill]}>
              <Ionicons size={ms(22)} name={focused ? "home" : "home-outline"} color={color} />
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="predict"
        options={{
          title: 'Predict',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.tabIconContainer, focused && styles.activeTabPill]}>
              <Ionicons size={ms(22)} name={focused ? "trending-up" : "trending-up-outline"} color={color} />
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="defi"
        options={{
          title: 'DeFi',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.tabIconContainer, focused && styles.activeTabPill]}>
              <Ionicons size={ms(22)} name={focused ? "wallet" : "wallet-outline"} color={color} />
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.tabIconContainer, focused && styles.activeTabPill]}>
              <Ionicons size={ms(22)} name={focused ? "person" : "person-outline"} color={color} />
            </View>
          ),
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
  tabIconContainer: {
    width: ms(48),
    height: ms(32),
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: ms(16),
  },
  activeTabPill: {
    backgroundColor: '#f3f4f6',
  },
});
