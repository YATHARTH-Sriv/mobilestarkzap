import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ms } from '@/lib/responsive';
import { FadeInView, Toast } from '@/components/SharedComponents';
import { PredictHeader } from '@/components/predict/PredictHeader';

const { width } = Dimensions.get('window');

const CATEGORIES = [
  { id: "sports", title: "Sports", icon: "football", color: "#065f46", comingSoon: true },
  { id: "politics", title: "Politics", icon: "flag", color: "#1e3a8a", comingSoon: true },
  { id: "crypto", title: "Crypto", icon: "logo-bitcoin", color: "#5b21b6", comingSoon: true },
  { id: "movies", title: "Movies", icon: "videocam", color: "#991b1b", comingSoon: true },
  { id: "custom", title: "Custom", icon: "create", color: "#ea580c", comingSoon: false },
];

export default function CategoriesScreen() {
  const router = useRouter();
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar style="dark" />
      <PredictHeader 
        title="PolyMarket" 
        subtitle="Prediction Markets" 
        onRefresh={() => showToast("Refreshed")} 
      />
      
      <View style={styles.categoryGrid}>
        {CATEGORIES.map((cat, i) => (
          <FadeInView key={cat.id} delay={i * 50} style={styles.categoryWrapper}>
            <Pressable
              style={[styles.categoryCard, { backgroundColor: cat.color }]}
              onPress={() => {
                if (cat.comingSoon) {
                  showToast("Coming Soon...");
                } else {
                  router.push("/predict/custom");
                }
              }}
            >
              <View style={styles.cardHeader}>
                <Ionicons name={cat.icon as any} size={24} color="rgba(255,255,255,0.6)" />
              </View>
              <Text style={styles.cardTitle}>{cat.title}</Text>
            </Pressable>
          </FadeInView>
        ))}
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
  categoryGrid: {
    padding: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 16,
  },
  categoryWrapper: {
    width: (width - 48) / 2,
    aspectRatio: 1.2,
  },
  categoryCard: {
    flex: 1,
    borderRadius: 24,
    padding: 20,
    justifyContent: "space-between",
  },
  cardHeader: {
    alignSelf: "flex-end",
  },
  cardTitle: {
    color: "#fff",
    fontSize: ms(16),
    fontFamily: "Inter_700Bold",
  },
});
