import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ONBOARDING_COLORS } from '@/lib/onboarding-theme';

type OnboardingCtaProps = {
  label: string;
  onPress: () => void | Promise<void>;
  disabled?: boolean;
  variant?: 'green' | 'black';
  icon?: ReactNode;
};

export function OnboardingCta({
  label,
  onPress,
  disabled,
  variant = 'green',
  icon,
}: OnboardingCtaProps) {
  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        void onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        variant === 'black' ? styles.blueButton : styles.greenButton,
        disabled ? styles.disabled : undefined,
        pressed && styles.pressed,
      ]}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.iconWrap}>
        {icon ?? <Ionicons name="arrow-forward" size={24} color="#ffffff" />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 60,
    borderRadius: 30,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  greenButton: {
    backgroundColor: '#10b981',
  },
  blueButton: {
    backgroundColor: '#1c1f24', // Deep black/navy for premium look on white
  },
  label: {
    color: '#ffffff',
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
});
