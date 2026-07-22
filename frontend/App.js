import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SignInScreen from './screens/SignInScreen';
import AuthScreen from './screens/AuthScreen';
import Toast, { BaseToast, ErrorToast } from 'react-native-toast-message';
import { useColorScheme } from "react-native";
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeScreen from './screens/HomeScreen';
import StudentProfileScreen from './screens/StudentProfileScreen';
import HomeStudentScreen from './screens/HomeStudentScreen';
import ClassroomScreen from './screens/ClassroomScreen';
import LiveNewScreen from './screens/LiveNewScreen';
import SettingsScreen from './screens/SettingsScreen';
import useThemeStore from './stores/useThemeStore';
import { MaterialCommunityIcons } from "@expo/vector-icons";
import useUserStore from './stores/useUserStore';

const Stack = createNativeStackNavigator();

const toastConfig = {
  error: (props) => (
    <ErrorToast
      {...props}
      style={{
        borderLeftColor: 'red',
        width: '99%',
        alignSelf: 'center',
        backgroundColor: '#fff',
      }}
      text1Style={{
        fontSize: 11,
        fontWeight: 'bold',
        color: 'red',
      }}
      text2Style={{
        fontSize: 9,
        color: '#000',
      }}
    />
  ),

  success: (props) => (
    <BaseToast
      {...props}
      style={{
        borderLeftColor: 'green',
        width: '99%',
        alignSelf: 'center',
        backgroundColor: '#fff',
      }}
      contentContainerStyle={{ paddingHorizontal: 15 }}
      text1Style={{
        fontSize: 11,
        fontWeight: 'bold',
        color: 'green',
      }}
      text2Style={{
        fontSize: 10,
        color: '#000',
      }}
    />
  ),

  info: (props) => (
    <BaseToast
      {...props}
      style={{
        borderLeftColor: 'yellow',
        width: '90%',
        alignSelf: 'center',
        backgroundColor: '#fff',
      }}
      contentContainerStyle={{ paddingHorizontal: 15 }}
      text1Style={{
        fontSize: 11,
        fontWeight: 'bold',
        color: 'yellow',
      }}
      text2Style={{
        fontSize: 10,
        color: '#000',
      }}
    />
  ),
};

function MainTabs() {
  const isinstitution = useUserStore((s) => s.isinstitution);
  const hasProfile = useUserStore((s) => s.hasProfile);
  const Tab = createBottomTabNavigator();
  const c = useThemeStore((s) => s.primaryColor);
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c,
        tabBarInactiveTintColor: '#727f90ff',
        tabBarLabelStyle: { fontSize: 12 },
        tabBarStyle: { height: 60, paddingBottom: 5, backgroundColor: '#f3f4f6',  borderTopWidth: 1, borderTopColor: '#e2e8f0'},
        animation: 'none',
      }}
      initialRouteName={isinstitution ? "Home" : (hasProfile ? "HomeStudent" : "Student")}
    >
      {isinstitution ? (
        <Tab.Screen name="Home" component={HomeScreen} options={{ title: "Accueil", tabBarIcon: ({ color, size }) => (<MaterialCommunityIcons name="home" size={size} color={color} />)}} />
      ) : (
         hasProfile ? (
          <Tab.Screen name="HomeStudent" component={HomeStudentScreen} options={{ title: "Accueil", tabBarIcon: ({ color, size }) => (<MaterialCommunityIcons name="home" size={size} color={color} />)}} />
        ) : (
          <Tab.Screen name="Student" component={StudentProfileScreen} options={{ title: "Profile", tabBarIcon: ({ color, size }) => (<MaterialCommunityIcons name="account" size={size} color={color} />)}} />
        )
      )}
      <Tab.Screen name="Classroom" component={ClassroomScreen} options={{ title: "Salles", tabBarItemStyle: { display: 'none' }, tabBarIcon: ({ color, size }) => (<MaterialCommunityIcons name="school" size={size} color={color} />)}} />
      <Tab.Screen name="LiveNew" component={LiveNewScreen} options={{ unmountOnBlur: true, title: "LiveNew", tabBarItemStyle: { display: 'none' }, tabBarIcon: ({ color, size }) => (<MaterialCommunityIcons name="school" size={size} color={color} />)}} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: "Paramètres", tabBarIcon: ({ color, size }) => (<MaterialCommunityIcons name="cog" size={size} color={color} />)}} />
    </Tab.Navigator>
  );
  
}

function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Auth">
      <Stack.Screen
        name="Auth"
        component={AuthScreen}
        options={{ unmountOnBlur: true }}
      />
      <Stack.Screen
        name="SignIn"
        component={SignInScreen}
        options={{ unmountOnBlur: true }}
      />
      <Stack.Screen
        name="MainTabs"
        component={MainTabs}
        options={{ unmountOnBlur: true }}
      />
    </Stack.Navigator>
  );
}

export default function App() {
  const scheme = useColorScheme(); 

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <NavigationContainer theme={scheme === "dark" ? DarkTheme : DefaultTheme} >
          <RootNavigator />
        </NavigationContainer>
        <Toast config={toastConfig} />
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}