import { Ionicons } from "@expo/vector-icons";
import { usePrivy } from "@privy-io/expo";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
    Keyboard,
    KeyboardAvoidingView,
    Platform,
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
import { ONBOARDING_COLORS } from "@/lib/onboarding-theme";
import { fetchMyProfile, setMyUsername } from "@/lib/profile";

export default function UsernameScreen() {
  const { user, getAccessToken } = usePrivy();
  const { width, height } = useWindowDimensions();
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const compactWidth = width <= 375;
  const compactHeight = height <= 760;
  const topPadding = compactHeight ? 126 : 168;
  const titleSize = compactWidth ? 44 : 52;
  const fieldMinHeight = compactWidth ? 78 : 86;

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!user) {
        router.replace("./welcome");
        return;
      }

      try {
        const payload = await fetchMyProfile(getAccessToken);
        if (cancelled) {
          return;
        }

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
          const message =
            profileError instanceof Error
              ? profileError.message
              : "Failed to load profile";
          setError(message);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
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
      const message =
        saveError instanceof Error
          ? saveError.message
          : "Failed to save username";
      setError(message);
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
            <View style={[styles.centeredContent, { paddingTop: topPadding }]}>
              <View
                style={[
                  styles.stepBadge,
                  compactWidth ? styles.stepBadgeCompact : undefined,
                ]}
              >
                <Text
                  style={[
                    styles.stepText,
                    compactWidth ? styles.stepTextCompact : undefined,
                  ]}
                >
                  Step 1/2
                </Text>
              </View>
              <Text style={[styles.title, { fontSize: titleSize }]}>
                Set Username
              </Text>

              <View style={[styles.inputWrap, { minHeight: fieldMinHeight }]}>
                <Ionicons
                  name="person-outline"
                  size={compactWidth ? 24 : 26}
                  color="#8a8d93"
                />
                <TextInput
                  value={username}
                  onChangeText={setUsername}
                  placeholder="JohnCena"
                  placeholderTextColor="#92959b"
                  style={[
                    styles.input,
                    compactWidth ? styles.inputCompact : undefined,
                  ]}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={() => {
                    void submitUsername();
                  }}
                />
              </View>

              {status ? <Text style={styles.statusText}>{status}</Text> : null}
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </View>

            <View style={styles.ctaContainer}>
              <OnboardingCta
                label="Go Ahead"
                onPress={submitUsername}
                disabled={submitting}
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
  },
  centeredContent: {
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 26,
  },
  ctaContainer: {
    paddingHorizontal: 0,
    paddingBottom: 80,
    paddingTop: 24,
  },
  stepBadge: {
    minHeight: 50,
    minWidth: 170,
    paddingHorizontal: 22,
    borderRadius: 25,
    backgroundColor: ONBOARDING_COLORS.softGray,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: {
    color: "#2e2f33",
    fontSize: 20,
    fontWeight: "700",
  },
  stepBadgeCompact: {
    minHeight: 46,
    minWidth: 158,
  },
  stepTextCompact: {
    fontSize: 18,
  },
  title: {
    color: "#06070a",
    fontWeight: "800",
  },
  inputWrap: {
    width: "100%",
    minHeight: 86,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: ONBOARDING_COLORS.inputBorder,
    backgroundColor: "#f5f5f5",
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 18,
  },
  input: {
    flex: 1,
    color: ONBOARDING_COLORS.textPrimary,
    fontSize: 42 / 2,
    fontWeight: "500",
  },
  inputCompact: {
    fontSize: 19,
  },
  statusText: {
    color: ONBOARDING_COLORS.textSecondary,
    fontSize: 13,
  },
  errorText: {
    color: "#bd3f3f",
    fontSize: 13,
    textAlign: "center",
  },
});
