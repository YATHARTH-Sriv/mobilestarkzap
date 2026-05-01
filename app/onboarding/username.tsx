import { Ionicons } from "@expo/vector-icons";
import { usePrivy } from "@privy-io/expo";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
    Animated,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableWithoutFeedback,
    View,
    useWindowDimensions,
} from "react-native";

import { OnboardingCta } from "@/components/onboarding-cta";
import { OnboardingFrame } from "@/components/onboarding-frame";
import { fetchMyProfile, setMyUsername } from "@/lib/profile";

export default function UsernameScreen() {
  const { user, getAccessToken } = usePrivy();
  const { width } = useWindowDimensions();
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!user) {
        router.replace("./welcome");
        return;
      }

      try {
        const payload = await fetchMyProfile(getAccessToken);
        if (cancelled) return;

        if (payload.profile?.onboardingCompleted) {
          router.replace("/(tabs)");
          return;
        }

        if (payload.profile?.username) {
          setUsername(payload.profile.username);
          router.replace("./wallet");
        }
      } catch (profileError) {
        if (!cancelled) {
          setError("Failed to load profile");
        }
      }
    }

    void bootstrap();
    return () => { cancelled = true; };
  }, [user, getAccessToken]);

  async function submitUsername() {
    const nextUsername = username.trim();
    if (!nextUsername) {
      setError("Pick a username to continue");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setStatus("Saving username...");
      await setMyUsername(getAccessToken, nextUsername);
      setStatus("Username saved");
      router.replace("./wallet");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save username");
      setStatus("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <OnboardingFrame>
      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            bounces={false}
            showsVerticalScrollIndicator={false}
          >
            <Animated.View style={[styles.centeredContent, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepText}>Step 1 of 2</Text>
              </View>
              
              <View style={styles.headerText}>
                <Text style={styles.title}>What is your{'\n'}name?</Text>
                <Text style={styles.subtitle}>Pick a unique username for your Zen account.</Text>
              </View>

              <View style={[styles.inputContainer, isFocused && styles.inputContainerFocused]}>
                <View style={styles.inputLabelRow}>
                  <Text style={styles.inputLabel}>USERNAME</Text>
                  <Ionicons name="at-outline" size={14} color="#00c2ff" />
                </View>
                <View style={styles.inputRow}>
                  <TextInput
                    value={username}
                    onChangeText={setUsername}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    placeholder="e.g. Satoshi"
                    placeholderTextColor="#4b5563"
                    style={styles.input}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={() => void submitUsername()}
                  />
                  {username.length > 0 && (
                    <Pressable onPress={() => setUsername("")}>
                      <Ionicons name="close-circle" size={20} color="#4b5563" />
                    </Pressable>
                  )}
                </View>
              </View>

              {status ? <Text style={styles.statusText}>{status}</Text> : null}
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </Animated.View>

            <View style={styles.ctaContainer}>
              <OnboardingCta
                label="Continue"
                onPress={submitUsername}
                disabled={submitting || !username.trim()}
                variant="green"
              />
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  keyboardAvoiding: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "space-between",
    paddingTop: 40,
  },
  centeredContent: {
    alignItems: "center",
    gap: 32,
  },
  stepBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  stepText: {
    color: "#64748b",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
  },
  headerText: {
    alignItems: "center",
    gap: 8,
  },
  title: {
    color: "#1c1f24",
    fontSize: 40,
    lineHeight: 46,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  subtitle: {
    color: "#64748b",
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    paddingHorizontal: 40,
  },
  inputContainer: {
    width: "100%",
    backgroundColor: "#f8fafc",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  inputContainerFocused: {
    borderColor: "#1c1f24",
    backgroundColor: "#ffffff",
  },
  inputLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  inputLabel: {
    color: "#94a3b8",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  input: {
    flex: 1,
    color: "#1c1f24",
    fontSize: 24,
    fontFamily: "Inter_600SemiBold",
    padding: 0,
  },
  statusText: {
    color: "#10b981",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  errorText: {
    color: "#ef4444",
    fontSize: 14,
    textAlign: "center",
    fontFamily: "Inter_500Medium",
  },
  ctaContainer: {
    paddingBottom: 40,
  },
});
