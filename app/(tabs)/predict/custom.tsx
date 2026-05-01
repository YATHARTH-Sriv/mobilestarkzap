import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ms } from '@/lib/responsive';
import { FadeInView, Toast } from '@/components/SharedComponents';
import { PredictHeader } from '@/components/predict/PredictHeader';

export default function CustomMenuScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <PredictHeader 
        title="Custom Markets" 
        subtitle="Peer-to-Peer Betting" 
        showBack 
      />
      
      <View style={styles.menuContainer}>
        <FadeInView delay={0} style={styles.menuWrapper}>
          <Pressable 
            style={[styles.menuCard, { backgroundColor: "#ea580c" }]} 
            onPress={() => router.push("/predict/create")}
          >
            <View style={styles.cardHeader}>
              <Ionicons name="add" size={24} color="rgba(255,255,255,0.6)" />
            </View>
            <Text style={styles.cardTitle}>Create Market</Text>
          </Pressable>
        </FadeInView>
        
        <FadeInView delay={100} style={styles.menuWrapper}>
          <Pressable 
            style={[styles.menuCard, { backgroundColor: "#5b21b6" }]} 
            onPress={() => router.push("/predict/join")}
          >
            <View style={styles.cardHeader}>
              <Ionicons name="enter-outline" size={24} color="rgba(255,255,255,0.6)" />
            </View>
            <Text style={styles.cardTitle}>Enter Market</Text>
          </Pressable>
        </FadeInView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  menuContainer: {
    padding: 20,
    gap: 16,
    flexDirection: "row",
  },
  menuWrapper: {
    flex: 1,
    aspectRatio: 1.2,
  },
  menuCard: {
    flex: 1,
    borderRadius: 24,
    padding: 20,
    justifyContent: "space-between",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
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
