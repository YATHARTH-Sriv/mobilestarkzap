import type { PropsWithChildren, ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ONBOARDING_COLORS } from "@/lib/onboarding-theme";

type OnboardingFrameProps = PropsWithChildren<{
  footer?: ReactNode;
}>;

export function OnboardingFrame({ children, footer }: OnboardingFrameProps) {
  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
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
    backgroundColor: ONBOARDING_COLORS.card,
  },
  shell: {
    flex: 1,
    backgroundColor: ONBOARDING_COLORS.card,
    overflow: "hidden",
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  corner: {
    position: "absolute",
    width: 68,
    height: 68,
    zIndex: 2,
  },
  cornerTopLeftGreen: {
    top: 0,
    left: 0,
    borderBottomRightRadius: 68,
    backgroundColor: ONBOARDING_COLORS.green,
  },
  cornerTopRightOrange: {
    top: 0,
    right: 0,
    borderBottomLeftRadius: 68,
    backgroundColor: ONBOARDING_COLORS.orange,
    transform: [{ scaleX: 1.08 }, { scaleY: 0.7 }],
  },
  cornerBottomLeftGreen: {
    bottom: 0,
    left: 0,
    borderTopRightRadius: 68,
    backgroundColor: ONBOARDING_COLORS.green,
    transform: [{ scaleX: 1.08 }, { scaleY: 1.12 }],
  },
  cornerBottomRightOrange: {
    bottom: 0,
    right: 0,
    borderTopLeftRadius: 68,
    backgroundColor: ONBOARDING_COLORS.orange,
    transform: [{ scaleX: 1.08 }, { scaleY: 1.12 }],
  },
});
