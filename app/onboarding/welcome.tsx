import { Ionicons } from "@expo/vector-icons";
import { usePrivy } from "@privy-io/expo";
import { useLogin } from "@privy-io/expo/ui";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { OnboardingCta } from "@/components/onboarding-cta";
import { OnboardingFrame } from "@/components/onboarding-frame";
import { ONBOARDING_COLORS } from "@/lib/onboarding-theme";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export default function WelcomeScreen() {
  const { user } = usePrivy();
  const { login } = useLogin();
  const { width, height } = useWindowDimensions();

  const compactWidth = width <= 375;
  const compactHeight = height <= 760;
  const verySmallWidth = width <= 340;
  const verySmallHeight = height <= 700;

  const titleSize = clamp(
    Math.round(width * (verySmallWidth ? 0.2 : 0.215)),
    64,
    90,
  );
  const welcomeSize = clamp(Math.round(width * 0.056), 16, 24);
  const taglineSize = clamp(Math.round(width * 0.046), 14, 19);
  const contentTopPadding = verySmallHeight ? 18 : compactHeight ? 28 : 44;
  const contentBottomPadding = verySmallHeight ? 8 : 14;
  const contentGap = verySmallHeight ? 10 : compactHeight ? 14 : 18;
  const logoBox = clamp(Math.round(width * 0.31), 96, 132);
  const logoCore = clamp(Math.round(width * 0.22), 72, 92);
  const sparklesSize = compactWidth ? 32 : 38;

  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      router.replace("./username");
    }
  }, [user]);

  async function handleContinue() {
    try {
      setError(null);
      setStatus("Opening secure login...");
      await login({ loginMethods: ["email"] });
      setStatus("Login successful");
      router.replace("./username");
    } catch (loginError) {
      const message =
        loginError instanceof Error ? loginError.message : "Login failed";
      setError(message);
      setStatus("");
    }
  }

  return (
    <OnboardingFrame>
      <View
        style={[
          styles.contentStack,
          {
            paddingTop: contentTopPadding,
            paddingBottom: contentBottomPadding,
            gap: contentGap,
          },
        ]}
      >
        <View
          style={[
            styles.headerWrap,
            { gap: Math.max(6, Math.round(contentGap * 0.6)) },
          ]}
        >
          <Text style={[styles.welcomeLine, { fontSize: welcomeSize }]}>
            Welcome To
          </Text>
          <Text
            style={[
              styles.brandTitle,
              { fontSize: titleSize, lineHeight: Math.round(titleSize * 1.03) },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.74}
          >
            Starkbet
          </Text>
          <Text style={[styles.tagline, { fontSize: taglineSize }]}>
            One App For All Your Needs
          </Text>
        </View>

        <View style={styles.logoSection}>
          <View style={styles.logoWrap}>
            <View
              style={[
                styles.logoSoftGreen,
                {
                  width: logoBox,
                  height: logoBox,
                  borderRadius: compactWidth ? 24 : 28,
                },
              ]}
            />
            <View
              style={[
                styles.logoSoftOrange,
                {
                  width: logoBox,
                  height: logoBox,
                  borderRadius: compactWidth ? 24 : 28,
                },
              ]}
            />
            <View
              style={[
                styles.logoCore,
                {
                  width: logoCore,
                  height: logoCore,
                  borderRadius: logoCore / 2,
                },
              ]}
            >
              <Ionicons
                name="sparkles"
                size={sparklesSize}
                color={ONBOARDING_COLORS.greenDark}
              />
            </View>
          </View>
        </View>

        <View style={styles.ctaSlot}>
          <OnboardingCta
            label="Login with Privy"
            onPress={handleContinue}
            variant="black"
            disabled={status === "Opening secure login..."}
            icon={
              <Ionicons name="shield-checkmark" size={24} color="#24d06c" />
            }
          />
          {status ? <Text style={styles.statusText}>{status}</Text> : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      </View>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  contentStack: {
    flex: 1,
    justifyContent: "space-between",
  },
  headerWrap: {
    alignItems: "center",
  },
  welcomeLine: {
    color: ONBOARDING_COLORS.green,
    fontWeight: "700",
  },
  brandTitle: {
    color: ONBOARDING_COLORS.textPrimary,
    fontWeight: "900",
    width: "100%",
    textAlign: "center",
    letterSpacing: -1.4,
  },
  tagline: {
    color: ONBOARDING_COLORS.textSecondary,
    fontWeight: "500",
    textAlign: "center",
  },
  logoSection: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logoWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  logoSoftGreen: {
    position: "absolute",
    borderWidth: 5,
    borderColor: "#b9e6bf",
    transform: [{ rotate: "-12deg" }],
  },
  logoSoftOrange: {
    position: "absolute",
    borderWidth: 4,
    borderColor: "#f6c28a",
    transform: [{ rotate: "10deg" }],
  },
  logoCore: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3faf2",
  },
  ctaSlot: {
    width: "100%",
    gap: 8,
    marginBottom: 80,
  },
  statusText: {
    color: ONBOARDING_COLORS.textSecondary,
    fontSize: 13,
    textAlign: "center",
  },
  errorText: {
    color: "#bd3f3f",
    fontSize: 13,
    textAlign: "center",
  },
});
