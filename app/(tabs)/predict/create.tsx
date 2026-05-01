import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { usePrivy } from '@privy-io/expo';
import { ms } from '@/lib/responsive';
import { createMarket } from '@/lib/api/prediction';
import { Toast } from '@/components/SharedComponents';
import { PredictHeader } from '@/components/predict/PredictHeader';

const DEADLINES = [
  { label: "2M", value: 120 },
  { label: "1H", value: 3600 },
  { label: "24H", value: 86400 },
  { label: "1W", value: 604800 },
];

export default function CreateMarketScreen() {
  const router = useRouter();
  const { getAccessToken } = usePrivy();
  const [loading, setLoading] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [selectedDeadline, setSelectedDeadline] = useState(DEADLINES[0]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
  };

  const handleCreateMarket = async () => {
    if (!createTitle.trim()) return showToast("Enter a question");
    setLoading(true);
    try {
      const res = await createMarket(getAccessToken, createTitle, selectedDeadline.value);
      const newId = res.predictedMarketId;
      // showToast(`Market Created! ID: ${newId}`);
      // In native navigation, we might want to go back or to the detail
      router.replace(`/predict/${newId}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to create market");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <PredictHeader 
        title="Create Market" 
        subtitle="Peer-to-Peer Betting" 
        showBack 
      />
      
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.formView}>
        <View style={styles.formCard}>
          <Text style={styles.formHeaderTitle}>Create Custom Market</Text>
          <Text style={styles.formHeaderSub}>Define the question and set a deadline for resolution.</Text>
          
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Will it rain tomorrow?"
              placeholderTextColor="#9ca3af"
              value={createTitle}
              onChangeText={setCreateTitle}
              multiline
            />
          </View>

          <Text style={styles.inputLabel}>Resolution Deadline</Text>
          <View style={styles.deadlineRow}>
            {DEADLINES.map((d) => (
              <Pressable
                key={d.label}
                style={[styles.deadlinePill, selectedDeadline.label === d.label && styles.deadlinePillActive]}
                onPress={() => setSelectedDeadline(d)}
              >
                <Text style={[styles.deadlineText, selectedDeadline.label === d.label && styles.deadlineTextActive]}>
                  {d.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable style={styles.primaryButton} onPress={handleCreateMarket} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Create Market</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Toast message={toastMsg} visible={toastVisible} onHide={() => setToastVisible(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  formView: {
    flex: 1,
    padding: 20,
  },
  formCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: "#f3f4f6",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 4,
  },
  formHeaderTitle: {
    fontSize: ms(18),
    fontFamily: "Inter_700Bold",
    color: "#1c1f24",
    marginBottom: 8,
  },
  formHeaderSub: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#6b7280",
    marginBottom: 24,
    lineHeight: 20,
  },
  inputWrap: {
    backgroundColor: "#f9fafb",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#f3f4f6",
    marginBottom: 20,
  },
  textInput: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: "#1c1f24",
    minHeight: 60,
    textAlignVertical: "top",
  },
  inputLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#374151",
    marginBottom: 12,
  },
  deadlineRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 32,
  },
  deadlinePill: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  deadlinePillActive: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#1c1f24",
  },
  deadlineText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#6b7280",
  },
  deadlineTextActive: {
    color: "#1c1f24",
  },
  primaryButton: {
    backgroundColor: "#1c1f24",
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
});
