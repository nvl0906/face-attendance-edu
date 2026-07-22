export default {
  expo: {
    name: "PrésenSia",
    slug: "face-attendance-edu",
    owner: "naval1170",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "dark",
    newArchEnabled: true,
    splash: {
      image: "./assets/icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.naval1170.presensia"
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/icon.png",
        backgroundColor: "#ffffff"
      },
      edgeToEdgeEnabled: true,
      package: "com.naval1170.presensia"
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    plugins: [
      "@react-native-community/datetimepicker",
      [
        "expo-image-picker",
        {
          "cameraPermissionText": "Autoriser $(PRODUCT_NAME) à accéder à votre caméra pour prendre une photo de profil.",
          "photosPermissionText": "Autoriser $(PRODUCT_NAME) à accéder à vos photos pour sélectionner une photo de profil."
        }
      ],
      [
        "react-native-vision-camera",
        {
          "cameraPermissionText": "Autoriser $(PRODUCT_NAME) à accéder à votre caméra.",
          "enableMicrophonePermission": false,
        }
      ],
      [
        "expo-build-properties",
        {
          android: {
            minSdkVersion: 26,
            enableProguardInReleaseBuilds: true,
            enableShrinkResourcesInReleaseBuilds: true,
            useLegacyPackaging: true,
          },
        },
      ],
    ],
    extra: {
      eas: {
        projectId: "c4689acf-c001-4e61-8326-fa69f93967bf"
      }
    }
  }
};