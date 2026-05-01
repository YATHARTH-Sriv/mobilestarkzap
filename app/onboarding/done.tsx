import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { OnboardingFrame } from '@/components/onboarding-frame';
import { OnboardingCta } from '@/components/onboarding-cta';
import { ONBOARDING_COLORS } from '@/lib/onboarding-theme';

export default function DoneScreen() {
  const scale = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(scale, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      router.replace('/(tabs)');
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  function enterApp() {
    router.replace('/(tabs)');
  }

  return (
    <OnboardingFrame>
      <View style={styles.container}>
        <View style={styles.content}>
          <Animated.View
            style={[
              styles.successCircle,
              { transform: [{ scale }], opacity },
            ]}>
            <View style={styles.successInner}>
              <Ionicons name="checkmark" size={60} color="#ffffff" />
            </View>
            <View style={styles.successRing} />
          </Animated.View>

          <Animated.View style={[styles.textBlock, { opacity }]}>
            <Text style={styles.title}>All Set!</Text>
            <Text style={styles.subtitle}>
              Your Zen account is ready. Welcome to the future of finance.
            </Text>
          </Animated.View>
        </View>

        <View style={styles.footer}>
          <OnboardingCta label="Enter App" onPress={enterApp} variant="black" />
        </View>
      </View>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "space-between",
    paddingTop: 80,
    paddingBottom: 40,
  },
  content: {
    alignItems: "center",
    gap: 40,
  },
  successCircle: {
    width: 160,
    height: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  successInner: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#00c2ff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#00c2ff",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  successRing: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 2,
    borderColor: "#00c2ff",
    opacity: 0.2,
  },
  textBlock: {
    alignItems: "center",
    gap: 12,
  },
  title: {
    color: "#ffffff",
    fontSize: 36,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    color: "#9ca3af",
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    paddingHorizontal: 40,
    lineHeight: 24,
  },
  footer: {
    width: "100%",
  },
});
