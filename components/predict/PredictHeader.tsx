import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ms } from '@/lib/responsive';
import { SpinningRefreshIcon } from '@/components/SharedComponents';

interface PredictHeaderProps {
  title: string;
  subtitle: string;
  showBack?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  onBack?: () => void;
}

export function PredictHeader({ title, subtitle, showBack, refreshing = false, onRefresh, onBack }: PredictHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  return (
    <View style={styles.header}>
      {showBack ? (
        <Pressable 
          onPress={handleBack} 
          style={styles.backBtn}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
        >
          <Ionicons name="chevron-back" size={24} color="#1c1f24" />
        </Pressable>
      ) : (
        <View style={styles.headerIcon}>
          <Ionicons name="trending-up" size={24} color="#1c1f24" />
        </View>
      )}
      <View style={styles.headerText}>
        <Text style={styles.headerTitle}>{title}</Text>
        <Text style={styles.headerSubtitle}>{subtitle}</Text>
      </View>
      {onRefresh && (
        <Pressable 
          onPress={onRefresh} 
          style={styles.refreshBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          disabled={refreshing}
        >
          <SpinningRefreshIcon isRefreshing={refreshing} size={20} color="#1c1f24" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    backgroundColor: "#fff",
    zIndex: 100,
    elevation: 4,
  },
  backBtn: {
    marginRight: ms(12),
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerIcon: {
    marginRight: ms(12),
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: "#1c1f24",
  },
  headerSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#6b7280",
    marginTop: 2,
  },
  refreshBtn: {
    width: ms(40),
    height: ms(40),
    borderRadius: ms(20),
    backgroundColor: "#f9fafb",
    alignItems: "center",
    justifyContent: "center",
  },
});
