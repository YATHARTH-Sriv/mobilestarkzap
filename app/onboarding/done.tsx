import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { OnboardingFrame } from '@/components/onboarding-frame';
import { OnboardingCta } from '@/components/onboarding-cta';
import { ONBOARDING_COLORS } from '@/lib/onboarding-theme';

export default function DoneScreen() {
  const { width, height } = useWindowDimensions();
  const scale = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const compactWidth = width <= 375;
  const compactHeight = height <= 760;
  const topPadding = compactHeight ? 132 : 168;
  const circleSize = compactWidth ? 204 : 236;
  const iconSize = compactWidth ? 76 : 86;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(scale, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.back(1.3)),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      router.replace('/(tabs)');
    }, 1300);

    return () => clearTimeout(timer);
  }, [scale, opacity]);

  function enterApp() {
    router.replace('/(tabs)');
  }

  return (
    <OnboardingFrame footer={<OnboardingCta label="Enter App" onPress={enterApp} variant="green" />}>
      <View style={[styles.centeredContent, { paddingTop: topPadding }]}> 
        <Text style={[styles.title, compactWidth ? styles.titleCompact : undefined]}>Setup Done!</Text>

        <Animated.View
          style={[
            styles.checkCircle,
            { width: circleSize, height: circleSize, borderRadius: circleSize / 2, transform: [{ scale }], opacity },
          ]}>
          <Ionicons name="checkmark" size={iconSize} color="#f7faf8" />
        </Animated.View>
      </View>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  centeredContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 62,
  },
  title: {
    color: '#4a4d51',
    fontSize: 66 / 2,
    fontWeight: '800',
  },
  titleCompact: {
    fontSize: 30,
  },
  checkCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ONBOARDING_COLORS.green,
    shadowColor: '#67b96c',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
});
