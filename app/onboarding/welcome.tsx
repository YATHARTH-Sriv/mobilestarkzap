import { Ionicons } from "@expo/vector-icons";
import { usePrivy, useLogin } from "@/lib/use-auth";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { OnboardingCta } from "@/components/onboarding-cta";
import { OnboardingFrame } from "@/components/onboarding-frame";

const FEATURES = [
  {
    id: "payments",
    title: "Payments",
    desc: "Send and receive crypto instantly.",
    icon: "swap-horizontal",
    color: "#10b981",
  },
  {
    id: "defi",
    title: "DeFi Staking",
    desc: "Earn high yield on your assets.",
    icon: "trending-up",
    color: "#8b5cf6",
  },
  {
    id: "predict",
    title: "Predictions",
    desc: "Bet on your favorite markets.",
    icon: "stats-chart",
    color: "#f59e0b",
  },
];

export default function WelcomeScreen() {
  const { user } = usePrivy();
  const { login } = useLogin();
  const { width } = useWindowDimensions();

  const [activeFeature, setActiveFeature] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const featureAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
    ]).start();

    const interval = setInterval(() => {
      Animated.sequence([
        Animated.timing(featureAnim, { toValue: -width, duration: 400, useNativeDriver: true }),
        Animated.timing(featureAnim, { toValue: width, duration: 0, useNativeDriver: true }),
        Animated.timing(featureAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start();

      setTimeout(() => {
        setActiveFeature((prev) => (prev + 1) % FEATURES.length);
      }, 400);
    }, 4000);

    return () => clearInterval(interval);
  }, [width]);

  useEffect(() => {
    if (user) {
      router.replace("./username");
    }
  }, [user]);

  async function handleContinue() {
    try {
      await login({ loginMethods: ["email"] });
      router.replace("./username");
    } catch (e) {}
  }

  const feature = FEATURES[activeFeature];

  return (
    <OnboardingFrame>
      <View style={styles.container}>
        <Animated.View style={[styles.header, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <Text style={styles.logoText}>Zen</Text>
          <Text style={styles.tagline}>One App For All Your Finance</Text>
        </Animated.View>

        <View style={styles.featureStage}>
          <Animated.View style={[styles.featureCard, { backgroundColor: feature.color, transform: [{ translateX: featureAnim }] }]}>
            <View style={styles.iconCircle}>
              <Ionicons name={feature.icon as any} size={48} color={feature.color} />
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>{feature.title}</Text>
              <Text style={styles.featureDesc}>{feature.desc}</Text>
            </View>
          </Animated.View>
          
          <View style={styles.indicators}>
            {FEATURES.map((_, i) => (
              <View key={i} style={[styles.dot, i === activeFeature && styles.dotActive]} />
            ))}
          </View>
        </View>

        <Animated.View style={[styles.footer, { opacity: fadeAnim }]}>
          <OnboardingCta
            label="Get started"
            onPress={handleContinue}
            variant="black"
          />
          <Text style={styles.terms}>
            By continuing you agree to our{"\n"}
            <Text style={styles.termsLink}>Terms & Conditions</Text>
          </Text>
        </Animated.View>
      </View>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "space-between",
    paddingTop: 40,
    paddingBottom: 20,
  },
  header: {
    alignItems: "center",
    gap: 8,
  },
  logoText: {
    color: "#1c1f24",
    fontSize: 48,
    fontFamily: "Inter_900Black",
    letterSpacing: -1,
  },
  tagline: {
    color: "#64748b",
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  featureStage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
  },
  featureCard: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 40,
    padding: 32,
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.15,
    shadowRadius: 30,
    elevation: 10,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    gap: 8,
  },
  featureTitle: {
    color: "#ffffff",
    fontSize: 32,
    fontFamily: "Inter_700Bold",
  },
  featureDesc: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 18,
    fontFamily: "Inter_500Medium",
    lineHeight: 24,
  },
  indicators: {
    flexDirection: "row",
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#e2e8f0",
  },
  dotActive: {
    backgroundColor: "#1c1f24",
    width: 20,
  },
  footer: {
    gap: 20,
  },
  terms: {
    color: "#94a3b8",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  termsLink: {
    color: "#1c1f24",
    textDecorationLine: "underline",
    fontWeight: "600",
  },
});
