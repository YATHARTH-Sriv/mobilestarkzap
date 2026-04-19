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
      style={[styles.button, variant === 'black' ? styles.blackButton : styles.greenButton, disabled ? styles.disabled : undefined]}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.iconWrap}>
        {icon ?? <Ionicons name="arrow-forward" size={24} color="#f5f7f9" />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 66,
    borderRadius: 33,
    paddingHorizontal: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000000',
    shadowOpacity: 0.09,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  greenButton: {
    backgroundColor: ONBOARDING_COLORS.greenDark,
  },
  blackButton: {
    backgroundColor: '#131922',
  },
  label: {
    color: '#f5f7f9',
    fontSize: 19,
    fontWeight: '700',
  },
  iconWrap: {
    width: 36,
    alignItems: 'center',
  },
  disabled: {
    opacity: 0.55,
  },
});
