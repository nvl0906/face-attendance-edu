import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, Image } from 'react-native';
import useUserStore from "../stores/useUserStore";
import useThemeStore from "../stores/useThemeStore";
import * as SecureStore from 'expo-secure-store';

const SettingsScreen = ({ navigation }) => {
  const { fullname, username, isinstitution, profile, setProfile } = useUserStore();
  const primaryColor = useThemeStore((s) => s.primaryColor);

  const handleLogout = async () => {
    await SecureStore.deleteItemAsync("token");
    setProfile(null);
    navigation.reset({
      index: 0,
      routes: [{ name: "SignIn" }],
    });
  };

  const initials = fullname
    ? fullname.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '??';

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <StatusBar barStyle="light-content" />

      {/* Hero Header */}
      <View style={[styles.hero, { backgroundColor: primaryColor }]}>
        <View style={styles.heroOverlay} />
        <Text style={styles.heroTitle}>Paramètres</Text>
        <View style={styles.avatarWrapper}>
          {profile ? (
            <Image
              source={{ uri: profile }}
              style={styles.avatarImage}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.avatar, { borderColor: primaryColor }]}>
              <Text style={[styles.avatarText, { color: primaryColor }]}>{initials}</Text>
            </View>
          )}
          <Text style={styles.heroName}>{fullname}</Text>
          <View style={styles.badgePill}>
            <Text style={[styles.badgeText, { color: primaryColor }]}>
              {isinstitution ? '🏛 Établissement' : '🎓 Étudiant'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.body}>

        {/* Profile Card */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>PROFIL</Text>
          <View style={styles.row}>
            <View style={styles.rowIcon}><Text style={styles.icon}>👤</Text></View>
            <View style={styles.rowContent}>
              <Text style={styles.rowSub}>Nom complet</Text>
              <Text style={styles.rowMain}>{fullname}</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <View style={styles.rowIcon}><Text style={styles.icon}>🔖</Text></View>
            <View style={styles.rowContent}>
              <Text style={styles.rowSub}>Nom d'utilisateur</Text>
              <Text style={styles.rowMain}>@{username}</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <View style={styles.rowIcon}><Text style={styles.icon}>🏷</Text></View>
            <View style={styles.rowContent}>
              <Text style={styles.rowSub}>Type de compte</Text>
              <Text style={styles.rowMain}>{isinstitution ? 'Établissement' : 'Étudiant'}</Text>
            </View>
          </View>
        </View>

        {/* App Card */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>APPLICATION</Text>
          <TouchableOpacity style={styles.row} activeOpacity={0.7}>
            <View style={styles.rowIcon}><Text style={styles.icon}>🔐</Text></View>
            <View style={styles.rowContent}>
              <Text style={styles.rowMain}>Changer le mot de passe</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.85}
        >
          <Text style={styles.logoutIcon}>⎋</Text>
          <Text style={styles.logoutText}>Se déconnecter</Text>
        </TouchableOpacity>

      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F2F8',
  },

  /* Hero */
  hero: {
    paddingTop: 56,
    paddingBottom: 60,
    alignItems: 'center',
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    overflow: 'hidden',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  heroTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 3,
    color: 'rgba(255,255,255,0.75)',
    textTransform: 'uppercase',
    marginBottom: 20,
  },
  avatarWrapper: {
    alignItems: 'center',
    gap: 8,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#fff',
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    marginBottom: 4,
  },
  avatarText: {
    fontSize: 26,
    fontWeight: '800',
  },
  avatarImage: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 3,
    borderColor: '#fff',
  },
  heroName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  badgePill: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginTop: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },

  /* Body */
  body: {
    padding: 20,
    gap: 16,
    paddingBottom: 40,
  },

  /* Card */
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#94A3B8',
    textTransform: 'uppercase',
    marginBottom: 12,
  },

  /* Row */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 14,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 16,
  },
  rowContent: {
    flex: 1,
    gap: 2,
  },
  rowSub: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  rowMain: {
    fontSize: 15,
    color: '#1E293B',
    fontWeight: '600',
  },
  chevron: {
    fontSize: 22,
    color: '#CBD5E1',
    fontWeight: '300',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginLeft: 50,
  },

  /* Logout */
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 4,
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#FECACA',
    borderRadius: 18,
    paddingVertical: 16,
  },
  logoutIcon: {
    fontSize: 18,
  },
  logoutText: {
    color: '#EF4444',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

});

export default SettingsScreen;