import { Ionicons } from "@expo/vector-icons";
import { usePrivy } from "@privy-io/expo";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { shortenAddress } from "@/lib/http";
import { searchPaymentUsers, type PaymentUser } from "@/lib/payments";

export default function SendScreen() {
  const { getAccessToken } = usePrivy();
  const router = useRouter();

  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState<PaymentUser[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = useCallback(
    async (query: string) => {
      setSearchInput(query);
      const normalized = query.trim();
      if (normalized.length < 2) {
        setSearchResults([]);
        return;
      }

      setSearching(true);
      try {
        const users = await searchPaymentUsers(getAccessToken, normalized, 10);
        setSearchResults(users);
      } catch (err) {
        console.error("Search failed", err);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    },
    [getAccessToken]
  );

  const openPayment = (recipient: string) => {
    router.push({
      pathname: "../payments/[username]" as any,
      params: { username: recipient },
    });
  };

  const looksLikeAddress = (val: string) => /^0x[a-fA-F0-9]{40,64}$/.test(val.trim());

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1c1f24" />
        </Pressable>
        <Text style={styles.headerTitle}>Send</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrap}>
          <Ionicons name="search-outline" size={20} color="#9ca3af" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search username or paste address"
            placeholderTextColor="#9ca3af"
            value={searchInput}
            onChangeText={handleSearch}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searching && <ActivityIndicator size="small" color="#10b981" />}
        </View>
      </View>

      <FlatList
        data={searchResults}
        keyExtractor={(item) => item.privyUserId}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={() => {
          if (searchInput.trim().length > 0 && !searching) {
            if (looksLikeAddress(searchInput)) {
              return (
                <Pressable style={styles.userRow} onPress={() => openPayment(searchInput.trim())}>
                  <View style={styles.avatarPlaceholder}>
                    <Ionicons name="wallet-outline" size={24} color="#6b7280" />
                  </View>
                  <View style={styles.userInfo}>
                    <Text style={styles.username}>Send to address</Text>
                    <Text style={styles.address}>{shortenAddress(searchInput.trim())}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#d1d5db" />
                </Pressable>
              );
            }
            return (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No users found</Text>
              </View>
            );
          }
          return (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Start typing to find someone</Text>
            </View>
          );
        }}
        renderItem={({ item }) => (
          <Pressable style={styles.userRow} onPress={() => openPayment(item.walletAddress)}>
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarChar}>{item.username.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.username}>@{item.username}</Text>
              <Text style={styles.address}>{shortenAddress(item.walletAddress)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#d1d5db" />
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1c1f24",
    fontFamily: "Inter_600SemiBold",
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  searchInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 56,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: "#1c1f24",
    fontFamily: "Inter_500Medium",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#e5e7eb",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  avatarChar: {
    fontSize: 18,
    fontWeight: "700",
    color: "#4b5563",
    fontFamily: "Inter_600SemiBold",
  },
  userInfo: {
    flex: 1,
  },
  username: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1c1f24",
    fontFamily: "Inter_600SemiBold",
  },
  address: {
    fontSize: 14,
    color: "#6b7280",
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  emptyState: {
    paddingVertical: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    color: "#9ca3af",
    fontFamily: "Inter_500Medium",
  },
});
