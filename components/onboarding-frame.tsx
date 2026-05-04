import type { PropsWithChildren, ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type OnboardingFrameProps = PropsWithChildren<{
  footer?: ReactNode;
}>;

export function OnboardingFrame({ children, footer }: OnboardingFrameProps) {
  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.shell}>
        <View style={styles.bgGlowContainer}>
          <View style={[styles.glow, styles.glowTopLeft]} />
          <View style={[styles.glow, styles.glowBottomRight]} />
        </View>

        <View style={styles.content}>{children}</View>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  shell: {
    flex: 1,
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  bgGlowContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  glow: {
    position: "absolute",
    borderRadius: 1000,
    opacity: 0.15,
  },
  glowTopLeft: {
    top: -100,
    left: -100,
    width: 350,
    height: 350,
    backgroundColor: "#10b981",
  },
  glowBottomRight: {
    bottom: -150,
    right: -100,
    width: 450,
    height: 450,
    backgroundColor: "#00c2ff",
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    zIndex: 2,
    maxWidth: 540,
    alignSelf: "center" as const,
    width: "100%" as unknown as number,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 20,
    marginBottom: 60,
    zIndex: 3,
  },
});
