import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, TextInput, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ms } from '@/lib/responsive';
import { Toast } from '@/components/SharedComponents';
import { PredictHeader } from '@/components/predict/PredictHeader';

export default function JoinMarketScreen() {
  const router = useRouter();
  const [joinId, setJoinId] = useState("");
  const [loading, setLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
  };

  const handleJoinMarket = async () => {
    if (!joinId.trim()) return showToast("Enter Market ID");
    router.push(`/predict/${joinId}`);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <PredictHeader 
        title="Join Market" 
        subtitle="Peer-to-Peer Betting" 
        showBack 
      />
      
      <View style={styles.formView}>
        <View style={styles.formCard}>
          <Text style={styles.formHeaderTitle}>Join Market</Text>
          <Text style={styles.formHeaderSub}>Enter the unique Market ID shared with you.</Text>
          
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. 1"
              placeholderTextColor="#9ca3af"
              value={joinId}
              onChangeText={setJoinId}
              keyboardType="number-pad"
            />
          </View>

          <Pressable style={styles.primaryButton} onPress={handleJoinMarket} disabled={loading}>
             {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Join</Text>}
          </Pressable>
        </View>
      </View>

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
    padding: 20,
    maxWidth: 600,
    alignSelf: "center" as const,
    width: "100%" as unknown as number,
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
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 4,
    ...(Platform.OS === "web" ? { outlineStyle: "none" as any } : {}),
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
