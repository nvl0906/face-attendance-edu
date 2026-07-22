import { useState, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, ImageBackground} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { jwtDecode } from 'jwt-decode';
import useUserStore from "../stores/useUserStore";


const AuthScreen = ({ navigation }) => {
  const setUsername = useUserStore((s) => s.setUsername);
  const setIsinstitution = useUserStore((s) => s.setIsinstitution);
  const setFullname = useUserStore((s) => s.setFullname);
  const setUserid = useUserStore((s) => s.setUserid);
  const setHasProfile = useUserStore((s) => s.setHasProfile);

  const [loading, setLoading] = useState(true);


  const getPayloadFromToken = async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) return null;

      const decoded = jwtDecode(token);
      return decoded;
    } catch (error) {
      console.error('Token decode error:', error);
      return null;
    }
  };

  useEffect(() => {
    const checkToken = async () => {
      setLoading(true);
      try {
        const payload = await getPayloadFromToken();

        if (payload) {
          setUserid(payload.userid);
          setIsinstitution(payload.is_institution);
          setFullname(payload.fullname);
          setUsername(payload.username);
          setHasProfile(payload.hasProfile);
          navigation.reset({ 
            index: 0, 
            routes: [{ name: "MainTabs" }] 
          });
        } else {
          navigation.reset({ 
            index: 0, 
            routes: [{ name: "SignIn" }] 
          });
        }
      } catch (error) {
        console.error("Erreur", error);
      } finally {
        setLoading(false);
      }
    };
    checkToken();
  }, []);

  return (
    <ImageBackground
      source={require("../assets/icon.png")}
      style={styles.background}
      resizeMode="cover"
    >
      {/* Dark overlay */}
      <View style={styles.overlay}>
        <View style={styles.container}>
          {loading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#60a5fa" />
              <Text style={styles.loadingText}>Chargement en cours...</Text>
            </View>
          )}
        </View>
      </View>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
 background: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingContainer: {
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#e5e7eb",
    fontWeight: "500",
  },
});

export default AuthScreen;