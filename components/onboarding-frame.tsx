import type { PropsWithChildren, ReactNode } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, View } from 'react-native';

import { ONBOARDING_COLORS } from '@/lib/onboarding-theme';

type OnboardingFrameProps = PropsWithChildren<{
  footer?: ReactNode;
}>;

export function OnboardingFrame({ children, footer }: OnboardingFrameProps) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.shell}>
        <View style={[styles.corner, styles.cornerTopLeftGreen]} />
        <View style={[styles.corner, styles.cornerTopRightOrange]} />
        <View style={[styles.corner, styles.cornerBottomLeftGreen]} />
        <View style={[styles.corner, styles.cornerBottomRightOrange]} />

        <View style={styles.content}>{children}</View>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: ONBOARDING_COLORS.background,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  shell: {
    flex: 1,
    borderWidth: 1,
    borderColor: ONBOARDING_COLORS.border,
    borderRadius: 46,
    backgroundColor: ONBOARDING_COLORS.card,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 28,
  },
  corner: {
    position: 'absolute',
    width: 64,
    height: 64,
    zIndex: 2,
  },
  cornerTopLeftGreen: {
    top: 0,
    left: 0,
    borderBottomRightRadius: 64,
    backgroundColor: ONBOARDING_COLORS.green,
  },
  cornerTopRightOrange: {
    top: 0,
    right: 0,
    borderBottomLeftRadius: 64,
    backgroundColor: ONBOARDING_COLORS.orange,
    transform: [{ scaleX: 1.08 }, { scaleY: 0.7 }],
  },
  cornerBottomLeftGreen: {
    bottom: 0,
    left: 0,
    borderTopRightRadius: 64,
    backgroundColor: ONBOARDING_COLORS.green,
    transform: [{ scaleX: 1.08 }, { scaleY: 1.12 }],
  },
  cornerBottomRightOrange: {
    bottom: 0,
    right: 0,
    borderTopLeftRadius: 64,
    backgroundColor: ONBOARDING_COLORS.orange,
    transform: [{ scaleX: 1.08 }, { scaleY: 1.12 }],
  },
});
