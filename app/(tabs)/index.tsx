import { Ionicons } from '@expo/vector-icons';
import { usePrivy } from '@privy-io/expo';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { shortenAddress } from '@/lib/http';
import {
  fetchRecentPaymentContacts,
  searchPaymentUsers,
  type PaymentUser,
  type RecentPaymentContact,
} from '@/lib/payments';
import { fetchMyProfile } from '@/lib/profile';

const FALLBACK_USERNAME = 'there';

function normalizeUsername(username: string | null | undefined): string {
  const trimmed = (username ?? '').trim();
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
  const [recentContacts, setRecentContacts] = useState<RecentPaymentContact[]>([]);
  const [searchInput, setSearchInput] = useState('');
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
          const [nextUsername] = await Promise.all([resolveUsername(), loadRecentContacts()]);

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
      const [nextUsername] = await Promise.all([resolveUsername(), loadRecentContacts()]);
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
        pathname: '../payments/[username]',
        params: { username: recipient },
      });

      setTimeout(() => {
        setOpeningThreadFor(null);
      }, 500);
    },
    [router],
  );

  const cardSizing = useMemo(() => {
    const compact = width < 380;

    return {
      minHeight: compact ? 224 : 248,
      radius: compact ? 30 : 34,
      padding: compact ? 20 : 24,
    };
  }, [width]);

  const normalizedSearchInput = searchInput.trim();
  const showSendToWalletRow = looksLikeWalletAddress(normalizedSearchInput) && !searchingUsers && searchResults.length === 0;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
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
        }>
        <View style={styles.topControlsRow}>
          <View style={styles.topSpacer} />
          <Pressable
            style={styles.refreshButton}
            onPress={() => {
              void refreshHome();
            }}>
            <Ionicons name="refresh" size={20} color="#6a6d72" />
          </Pressable>
        </View>

        <View style={styles.welcomeRow}>
          <Text style={styles.homeWelcomeLabel}>Welcome</Text>
          <Text style={styles.homeUsername} numberOfLines={1}>
            {username}
          </Text>
        </View>

        <View
          style={[
            styles.sendCard,
            {
              minHeight: cardSizing.minHeight,
              borderRadius: cardSizing.radius,
              padding: cardSizing.padding,
            },
          ]}>
          <View style={styles.sendHeaderRow}>
            <View style={styles.sendIconWrap}>
              <Ionicons name="paper-plane-outline" size={24} color="#f1f8f2" />
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
              placeholderTextColor="#e3f5e6"
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {searchingUsers ? <ActivityIndicator size="small" color="#eefaf0" style={styles.searchLoader} /> : null}

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
                  }}>
                  <Text style={styles.searchResultName}>@{result.username}</Text>
                  <Text style={styles.searchResultWallet}>{shortenAddress(result.walletAddress)}</Text>
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
                }}>
                <View style={styles.walletSendRowTextWrap}>
                  <Text style={styles.searchResultName}>Send to wallet</Text>
                  <Text style={styles.searchResultWallet}>{shortenAddress(normalizedSearchInput)}</Text>
                </View>
                <Ionicons name="arrow-forward" size={16} color="#dff3e2" />
              </Pressable>
            </View>
          ) : null}
        </View>

        <Text style={styles.sectionTitle}>Recent</Text>

        {recentContacts.length === 0 ? (
          <View style={styles.emptyRecentCard}>
            <Text style={styles.emptyRecentTitle}>No recent people yet</Text>
            <Text style={styles.emptyRecentBody}>Your direct payment contacts will appear here.</Text>
          </View>
        ) : (
          <FlatList
            data={recentContacts}
            keyExtractor={(item) => `${item.username}-${item.walletAddress}`}
            numColumns={4}
            scrollEnabled={false}
            columnWrapperStyle={styles.recentGridRow}
            renderItem={({ item }) => {
              const initials = looksLikeWalletAddress(item.username)
                ? item.walletAddress.slice(2, 4).toUpperCase()
                : item.username.slice(0, 2).toUpperCase();

              return (
                <Pressable
                  style={styles.recentContactItem}
                  onPress={() => {
                    openPaymentThread(item.walletAddress);
                  }}>
                  <View style={styles.recentContactAvatar}>
                    <Text style={styles.recentContactInitials}>{initials}</Text>
                  </View>
                  <Text style={styles.recentContactName} numberOfLines={1}>
                    {item.username}
                  </Text>
                  {item.isExternal ? <Text style={styles.externalContactTag}>External</Text> : null}
                </Pressable>
              );
            }}
          />
        )}

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
            }}>
            <View style={styles.quickActionIconWrapPrimary}>
              <Ionicons name="paper-plane-outline" size={24} color="#ff6a00" />
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
            }}>
            <View style={styles.quickActionIconWrapSecondary}>
              <Ionicons name="add" size={26} color="#d58a00" />
            </View>
            <Text style={styles.quickActionTitle}>Receive</Text>
            <Text style={styles.quickActionBody}>Get crypto</Text>
          </Pressable>
        </View>

        {openingThreadFor ? (
          <Text style={styles.navigationHint}>
            Opening {looksLikeWalletAddress(openingThreadFor) ? shortenAddress(openingThreadFor) : `@${openingThreadFor}`}...
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f5f5f3',
  },
  scroll: {
    flex: 1,
  },
  contentWrap: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 118,
    gap: 16,
  },
  topControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topSpacer: {
    width: 34,
    height: 34,
  },
  refreshButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ececec',
  },
  welcomeRow: {
    gap: 4,
    marginTop: 2,
  },
  homeWelcomeLabel: {
    color: '#1a1d22',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 42 / 2,
  },
  homeUsername: {
    color: '#54585f',
    fontFamily: 'Inter_500Medium',
    fontSize: 23,
    lineHeight: 30,
  },
  sendCard: {
    backgroundColor: '#05ad43',
    borderWidth: 1,
    borderColor: '#02a33f',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
    gap: 12,
  },
  sendHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  sendIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendHeaderTextWrap: {
    flex: 1,
    gap: 2,
  },
  sendTitle: {
    color: '#eff9f1',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 22,
  },
  sendSubtitle: {
    color: '#dcf5e2',
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
  },
  searchInputWrap: {
    minHeight: 76,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#0f2f18',
    backgroundColor: '#06b244',
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  searchInput: {
    color: '#ecf9ef',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
  },
  searchLoader: {
    marginTop: 2,
  },
  searchResultsWrap: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.14)',
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  searchResultRow: {
    minHeight: 50,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.17)',
  },
  searchResultName: {
    color: '#f2fbf4',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
  searchResultWallet: {
    color: '#d5f0dc',
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  },
  walletSendRowTextWrap: {
    flex: 1,
    gap: 1,
  },
  sectionTitle: {
    color: '#1e2126',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 22,
  },
  emptyRecentCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#dddddd',
    backgroundColor: '#f8f8f8',
    minHeight: 90,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  emptyRecentTitle: {
    color: '#24272c',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
  },
  emptyRecentBody: {
    color: '#7a7f87',
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  },
  recentGridRow: {
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  recentContactItem: {
    width: '23%',
    alignItems: 'center',
    gap: 7,
  },
  recentContactAvatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#ffa000',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.09,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  recentContactInitials: {
    color: '#fff8ef',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
  recentContactName: {
    color: '#3f4349',
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
  },
  externalContactTag: {
    marginTop: 1,
    color: '#7a5d1e',
    backgroundColor: '#f8eabf',
    paddingHorizontal: 6,
    borderRadius: 8,
    overflow: 'hidden',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    lineHeight: 14,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  quickActionCard: {
    flex: 1,
    minHeight: 146,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#dddddd',
    backgroundColor: '#f8f8f8',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  quickActionIconWrapPrimary: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#fdebd4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  quickActionIconWrapSecondary: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#f6efcd',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  quickActionTitle: {
    color: '#23262b',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 19,
  },
  quickActionBody: {
    color: '#757981',
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
  },
  navigationHint: {
    color: '#6d7076',
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    marginTop: 2,
  },
});
