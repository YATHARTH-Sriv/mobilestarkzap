import { Ionicons } from "@expo/vector-icons";
import { usePrivy } from "@privy-io/expo";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
    useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { shortenAddress } from "@/lib/http";
import {
    fetchRecentPaymentContacts,
    searchPaymentUsers,
    type PaymentUser,
    type RecentPaymentContact,
} from "@/lib/payments";
import { fetchMyProfile } from "@/lib/profile";

const FALLBACK_USERNAME = "there";

/** Rotating palette so each avatar gets a distinct orange-spectrum colour */
const AVATAR_COLORS = [
  "#F5A623", // warm amber
  "#E8753A", // burnt orange
  "#F0C040", // golden
  "#E85D3A", // deep orange-red
  "#F5A623",
  "#D96832",
  "#F0C040",
  "#E85D3A",
] as const;

function normalizeUsername(username: string | null | undefined): string {
  const trimmed = (username ?? "").trim();
  if (!trimmed) {
    return FALLBACK_USERNAME;
  }

  return trimmed;
}

function looksLikeWalletAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{10,}$/.test(value);
}

export default function HomeScreen() {
  const { getAccessToken } = usePrivy();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const [username, setUsername] = useState(FALLBACK_USERNAME);
  const [refreshingProfile, setRefreshingProfile] = useState(false);
  const [recentContacts, setRecentContacts] = useState<RecentPaymentContact[]>(
    [],
  );
  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState<PaymentUser[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [openingThreadFor, setOpeningThreadFor] = useState<string | null>(null);

  const resolveUsername = useCallback(async (): Promise<string> => {
    const payload = await fetchMyProfile(getAccessToken);
    return normalizeUsername(payload.profile?.username);
  }, [getAccessToken]);

  const loadRecentContacts = useCallback(async () => {
    try {
      const contacts = await fetchRecentPaymentContacts(getAccessToken, 8);
      setRecentContacts(contacts);
    } catch {
      setRecentContacts([]);
    }
  }, [getAccessToken]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function loadData() {
        try {
          const [nextUsername] = await Promise.all([
            resolveUsername(),
            loadRecentContacts(),
          ]);

          if (!cancelled) {
            setUsername(nextUsername);
          }
        } catch {
          if (!cancelled) {
            setUsername(FALLBACK_USERNAME);
          }
        }
      }

      void loadData();

      return () => {
        cancelled = true;
      };
    }, [resolveUsername, loadRecentContacts]),
  );

  const refreshHome = useCallback(async () => {
    setRefreshingProfile(true);
    try {
      const [nextUsername] = await Promise.all([
        resolveUsername(),
        loadRecentContacts(),
      ]);
      setUsername(nextUsername);
    } catch {
      setUsername(FALLBACK_USERNAME);
    } finally {
      setRefreshingProfile(false);
    }
  }, [resolveUsername, loadRecentContacts]);

  const searchUsers = useCallback(
    async (query: string) => {
      const normalized = query.trim();
      if (normalized.length < 2) {
        setSearchResults([]);
        return;
      }

      setSearchingUsers(true);
      try {
        const users = await searchPaymentUsers(getAccessToken, normalized, 8);
        setSearchResults(users);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchingUsers(false);
      }
    },
    [getAccessToken],
  );

  const openPaymentThread = useCallback(
    (recipient: string) => {
      if (!recipient) {
        return;
      }

      setOpeningThreadFor(recipient);
      router.push({
        pathname: "../payments/[username]",
        params: { username: recipient },
      });

      setTimeout(() => {
        setOpeningThreadFor(null);
      }, 500);
    },
    [router],
  );

  /* ── responsive helpers ─────────────────────────────────── */
  const compact = width < 375;
  const medium = width >= 375 && width < 414;

  const avatarSize = compact ? 56 : medium ? 62 : 68;
  const avatarFontSize = compact ? 13 : 15;
  const contactNameSize = compact ? 12 : 14;

  const normalizedSearchInput = searchInput.trim();
  const showSendToWalletRow =
    looksLikeWalletAddress(normalizedSearchInput) &&
    !searchingUsers &&
    searchResults.length === 0;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.contentWrap}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshingProfile}
            onRefresh={() => {
              void refreshHome();
            }}
            tintColor="#08a844"
          />
        }
      >
        {/* ── Welcome ─────────────────────────────────── */}
        <View style={styles.welcomeRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.homeWelcomeLabel}>Welcome</Text>
            <Text style={styles.homeUsername} numberOfLines={1}>
              {username}
            </Text>
          </View>

          <Pressable
            style={styles.refreshButton}
            onPress={() => {
              void refreshHome();
            }}
          >
            <Ionicons name="refresh" size={18} color="#8e9196" />
          </Pressable>
        </View>

        {/* ── Send Money Card ────────────────────────── */}
        <View style={styles.sendCard}>
          <View style={styles.sendHeaderRow}>
            <View style={styles.sendIconWrap}>
              <Ionicons name="paper-plane-outline" size={22} color="#fff" />
            </View>

            <View style={styles.sendHeaderTextWrap}>
              <Text style={styles.sendTitle}>Send Money</Text>
              <Text style={styles.sendSubtitle}>Quick transfer to wallet</Text>
            </View>
          </View>

          <View style={styles.searchInputWrap}>
            <TextInput
              value={searchInput}
              onChangeText={(value) => {
                setSearchInput(value);
                void searchUsers(value);
              }}
              placeholder="Enter wallet address or search"
              placeholderTextColor="rgba(255,255,255,0.65)"
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {searchingUsers ? (
            <ActivityIndicator
              size="small"
              color="#eefaf0"
              style={styles.searchLoader}
            />
          ) : null}

          {searchResults.length > 0 ? (
            <View style={styles.searchResultsWrap}>
              {searchResults.map((result) => (
                <Pressable
                  key={result.privyUserId}
                  style={styles.searchResultRow}
                  onPress={() => {
                    setSearchInput(result.username);
                    setSearchResults([]);
                    openPaymentThread(result.walletAddress);
                  }}
                >
                  <Text style={styles.searchResultName}>
                    @{result.username}
                  </Text>
                  <Text style={styles.searchResultWallet}>
                    {shortenAddress(result.walletAddress)}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {showSendToWalletRow ? (
            <View style={styles.searchResultsWrap}>
              <Pressable
                style={styles.searchResultRow}
                onPress={() => {
                  openPaymentThread(normalizedSearchInput);
                }}
              >
                <View style={styles.walletSendRowTextWrap}>
                  <Text style={styles.searchResultName}>Send to wallet</Text>
                  <Text style={styles.searchResultWallet}>
                    {shortenAddress(normalizedSearchInput)}
                  </Text>
                </View>
                <Ionicons name="arrow-forward" size={16} color="#dff3e2" />
              </Pressable>
            </View>
          ) : null}
        </View>

        {/* ── Recent Contacts ────────────────────────── */}
        <Text style={styles.sectionTitle}>Recent</Text>

        {recentContacts.length === 0 ? (
          <View style={styles.emptyRecentCard}>
            <Text style={styles.emptyRecentTitle}>No recent people yet</Text>
            <Text style={styles.emptyRecentBody}>
              Your direct payment contacts will appear here.
            </Text>
          </View>
        ) : (
          <FlatList
            data={recentContacts}
            keyExtractor={(item) => `${item.username}-${item.walletAddress}`}
            horizontal
            scrollEnabled
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.recentListRow}
            renderItem={({ item, index }) => {
              const initials = looksLikeWalletAddress(item.username)
                ? item.walletAddress.slice(2, 4).toUpperCase()
                : item.username.slice(0, 2).toUpperCase();

              const avatarBg = AVATAR_COLORS[index % AVATAR_COLORS.length];

              return (
                <Pressable
                  style={[styles.recentContactItem, { width: avatarSize + 14 }]}
                  onPress={() => {
                    openPaymentThread(item.walletAddress);
                  }}
                >
                  <View
                    style={[
                      styles.recentContactAvatar,
                      {
                        width: avatarSize,
                        height: avatarSize,
                        borderRadius: avatarSize / 2,
                        backgroundColor: avatarBg,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.recentContactInitials,
                        { fontSize: avatarFontSize },
                      ]}
                    >
                      {initials}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.recentContactName,
                      { fontSize: contactNameSize },
                    ]}
                    numberOfLines={1}
                  >
                    {item.username}
                  </Text>
                  {item.isExternal ? (
                    <Text style={styles.externalContactTag}>External</Text>
                  ) : null}
                </Pressable>
              );
            }}
          />
        )}

        {/* ── Quick Actions ──────────────────────────── */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>

        <View style={styles.quickActionsRow}>
          <Pressable
            style={styles.quickActionCard}
            onPress={() => {
              if (recentContacts[0]?.walletAddress) {
                openPaymentThread(recentContacts[0].walletAddress);
                return;
              }

              if (searchInput.trim().length > 0) {
                openPaymentThread(searchInput.trim());
              }
            }}
          >
            <View style={styles.quickActionIconWrapPrimary}>
              <Ionicons name="paper-plane-outline" size={22} color="#f27a1a" />
            </View>
            <Text style={styles.quickActionTitle}>Send</Text>
            <Text style={styles.quickActionBody}>Transfer crypto</Text>
          </Pressable>

          <Pressable
            style={styles.quickActionCard}
            onPress={() => {
              if (recentContacts[0]?.walletAddress) {
                openPaymentThread(recentContacts[0].walletAddress);
              }
            }}
          >
            <View style={styles.quickActionIconWrapSecondary}>
              <Ionicons name="add" size={24} color="#d4920a" />
            </View>
            <Text style={styles.quickActionTitle}>Receive</Text>
            <Text style={styles.quickActionBody}>Get crypto</Text>
          </Pressable>
        </View>

        {openingThreadFor ? (
          <Text style={styles.navigationHint}>
            Opening{" "}
            {looksLikeWalletAddress(openingThreadFor)
              ? shortenAddress(openingThreadFor)
              : `@${openingThreadFor}`}
            ...
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ─────────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
  /* ── scaffold ──────────────────────────────────────────── */
  screen: {
    flex: 1,
    backgroundColor: "#faf9f7",
  },
  scroll: {
    flex: 1,
  },
  contentWrap: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 100,
    gap: 18,
  },

  /* ── welcome row ───────────────────────────────────────── */
  welcomeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginTop: 4,
  },
  homeWelcomeLabel: {
    color: "#1a1d22",
    fontFamily: "Inter_600SemiBold",
    fontSize: 30,
    letterSpacing: -0.3,
  },
  homeUsername: {
    color: "#6b6e74",
    fontFamily: "Inter_500Medium",
    fontSize: 18,
    lineHeight: 26,
    marginTop: 2,
  },
  refreshButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    marginTop: 6,
  },

  /* ── send money card ───────────────────────────────────── */
  sendCard: {
    backgroundColor: "#2daa57",
    borderRadius: 24,
    padding: 20,
    gap: 14,
    shadowColor: "#1b7a39",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  sendHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  sendIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  sendHeaderTextWrap: {
    flex: 1,
    gap: 2,
  },
  sendTitle: {
    color: "#ffffff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 20,
    letterSpacing: -0.2,
  },
  sendSubtitle: {
    color: "rgba(255,255,255,0.78)",
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
  searchInputWrap: {
    height: 52,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "rgba(0,0,0,0.25)",
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  searchInput: {
    color: "#ffffff",
    fontFamily: "Inter_500Medium",
    fontSize: 15,
  },
  searchLoader: {
    marginTop: 2,
  },
  searchResultsWrap: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
    backgroundColor: "rgba(255,255,255,0.15)",
    overflow: "hidden",
  },
  searchResultRow: {
    minHeight: 46,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.14)",
  },
  searchResultName: {
    color: "#f2fbf4",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  searchResultWallet: {
    color: "rgba(255,255,255,0.65)",
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  walletSendRowTextWrap: {
    flex: 1,
    gap: 1,
  },

  /* ── section ───────────────────────────────────────────── */
  sectionTitle: {
    color: "#1e2126",
    fontFamily: "Inter_600SemiBold",
    fontSize: 20,
    letterSpacing: -0.15,
    marginTop: 4,
  },

  /* ── empty recent ──────────────────────────────────────── */
  emptyRecentCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e8e8e8",
    backgroundColor: "#ffffff",
    minHeight: 80,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  emptyRecentTitle: {
    color: "#24272c",
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  emptyRecentBody: {
    color: "#8c9097",
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },

  /* ── recent contacts grid ──────────────────────────────── */
  recentListRow: {
    paddingRight: 8,
    marginBottom: 16,
  },
  recentContactItem: {
    alignItems: "center",
    gap: 6,
    marginRight: 18,
  },
  recentContactAvatar: {
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  recentContactInitials: {
    color: "#ffffff",
    fontFamily: "Inter_600SemiBold",
  },
  recentContactName: {
    color: "#3f4349",
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  externalContactTag: {
    marginTop: 1,
    color: "#7a5d1e",
    backgroundColor: "#f8eabf",
    paddingHorizontal: 6,
    borderRadius: 8,
    overflow: "hidden",
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    lineHeight: 14,
  },

  /* ── quick actions ─────────────────────────────────────── */
  quickActionsRow: {
    flexDirection: "row",
    gap: 12,
  },
  quickActionCard: {
    flex: 1,
    minHeight: 130,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#ebebeb",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 16,
  },
  quickActionIconWrapPrimary: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#fff0e0",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  quickActionIconWrapSecondary: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#fdf5d8",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  quickActionTitle: {
    color: "#23262b",
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
  },
  quickActionBody: {
    color: "#8c9097",
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },

  /* ── misc ──────────────────────────────────────────────── */
  navigationHint: {
    color: "#8c9097",
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    marginTop: 2,
  },
});
