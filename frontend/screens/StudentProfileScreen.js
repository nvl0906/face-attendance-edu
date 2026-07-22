import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Image, Alert, ActivityIndicator, SafeAreaView, StatusBar
} from 'react-native';
import { useState, useCallback, useEffect } from 'react';
import * as ImagePicker from 'expo-image-picker';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import useUserStore from '../stores/useUserStore';
import api from '../utils/api';
import * as SecureStore from 'expo-secure-store';
import * as ImageManipulator from 'expo-image-manipulator';

const StudentProfileScreen = ({ navigation }) => {
  const fullname = useUserStore((s) => s.fullname);
  const username = useUserStore((s) => s.username);
  const setProfile = useUserStore((s) => s.setProfile);

  const [photoUri, setPhotoUri] = useState(null);
  const [status,   setStatus]   = useState('idle'); // 'idle'|'uploading'|'done'|'error'
  const [errorMsg, setErrorMsg] = useState('');

  const initials = fullname
    ? fullname.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : '??';

    const handleLogout = async () => {
      await SecureStore.deleteItemAsync("token");
      navigation.reset({
      index: 0,
      routes: [{ name: "SignIn" }],
      });
    };

  /* ── get profile ── */
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await api.get('/getprofile');
        if (res.data?.profile) {
          setPhotoUri(res.data.profile);
          setProfile(res.data.profile);
        }
      } catch (err) {
        console.error('Failed to fetch profile:', err);
      }
    };
    fetchProfile();
  }, []);

  /* ── Photo picker ── */
  const pickPhoto = useCallback(async (source = 'library') => {
    const isCamera = source === 'camera';

    const { status: perm } = isCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (perm !== 'granted') {
      Alert.alert(
        'Permission nécessaire',
        isCamera ? 'Veuillez autoriser l\'accès à la caméra.' : 'Veuillez autoriser l\'accès à la bibliothèque photo.',
      );
      return;
    }

    const result = isCamera
      ? await ImagePicker.launchCameraAsync({
          allowsEditing: true,
          aspect:        [1, 1],
          quality:       0.5,        // was 0.9 — too large, crashes bridge
          cameraType:    ImagePicker.CameraType.front,  // use enum, not string
          base64:        false,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes:    ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect:        [1, 1],
          quality:       0.5,
          base64:        false,
        });

    if (!result.canceled) {
      const uri = result.assets?.[0]?.uri;
      if (uri) {
        // Resize to max 800px — camera photos are often 3000+ px wide
        const resized = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 800 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
        );
        setPhotoUri(resized.uri);
      }
      setStatus('idle');
      setErrorMsg('');
    }
  }, []);

  const showPickerOptions = () => {
    Alert.alert('Choisir la source de la photo', undefined, [
      { text: 'Prendre un selfie',       onPress: () => pickPhoto('camera')  },
      { text: 'Choisir dans la bibliothèque', onPress: () => pickPhoto('library') },
      { text: 'Annuler', style: 'cancel' },
    ]);
  };

  /* ── Submit ── */
  const handleSave = async () => {
    if (!photoUri) {
      Alert.alert('Photo de profil requise', 'Veuillez sélectionner ou prendre une photo pour continuer.');
      return;
    }

    setStatus('uploading');
    setErrorMsg('');

    try {
      const ext = photoUri.split('.').pop() ?? 'jpg';

      const formData = new FormData();
      formData.append('file', {
        uri:  photoUri,
        name: `photo.${ext}`,
        type: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
      });

      await api.post('/setup-profile', formData);

      setStatus('done');
      Alert.alert('Photo de profil!', 'Photo de profil enregistré avec succès. Veuillez vous reconnecter à nouveau.', [
        { text: 'Continuer', onPress: () => handleLogout() },
      ]);
    } catch (err) {
      setStatus('error');
      const detail = err.response?.data?.detail;
      setErrorMsg(
        typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
          ? detail.map(d => d.msg).join(', ')
          : 'Something went wrong. Please try again.',
      );
    }
  };

  /* ── Derived state ── */
  const isUploading = status === 'uploading';
  const isDone      = status === 'done';
  const isError     = status === 'error';

  const CHIP = {
    done:    { bg: '#e1f5ee', dot: '#1D9E75', label: '#085041', val: '#1D9E75', text: 'Fait'    },
    ready:   { bg: '#eeeaff', dot: '#5b4fcf', label: '#3C3489', val: '#5b4fcf', text: 'Prêt'   },
    pending: { bg: '#faeeda', dot: '#BA7517', label: '#633806', val: '#BA7517', text: 'En attente' },
    error:   { bg: '#fcebeb', dot: '#E24B4A', label: '#791F1F', val: '#E24B4A', text: 'Échoué'  },
  };

  const chips = [
    { label: 'Photo de profil',   chip: isDone ? 'done' : photoUri ? 'ready' : 'pending' },
    { label: 'Reconnaissance faciale', chip: isDone ? 'done' : isError  ? 'error' : 'pending' },
  ];

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#5b4fcf" />

      {/* ── Header ── */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Compléter votre profil</Text>
          <Text style={s.headerSub}>Une photo définit votre avatar et votre reconnaissance faciale</Text>
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Avatar ── */}
        <View style={s.avatarWrap}>
          <TouchableOpacity style={s.avatarRing} onPress={showPickerOptions} activeOpacity={0.8}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={s.avatarImg} />
            ) : (
              <Text style={s.avatarInitials}>{initials}</Text>
            )}
            <View style={s.avatarEditBadge}>
              <MaterialCommunityIcons name="camera" size={13} color="#fff" />
            </View>
          </TouchableOpacity>
          <Text style={s.avatarName}>{fullname}</Text>
          <Text style={s.avatarUsername}>@{username}</Text>
        </View>

        {/* ── Status chips ── */}
        <View style={s.statusRow}>
          {chips.map(({ label, chip }) => {
            const c = CHIP[chip];
            return (
              <View key={label} style={[s.chip, { backgroundColor: c.bg }]}>
                <View style={[s.chipDot, { backgroundColor: c.dot }]} />
                <View>
                  <Text style={[s.chipLabel, { color: c.label }]}>{label}</Text>
                  <Text style={[s.chipVal,   { color: c.val   }]}>{c.text}</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* ── Account info card ── */}
        <View style={s.card}>
          <SectionTitle icon="account-circle" iconBg="#eeeaff" iconColor="#5b4fcf" title="Informations sur le compte" />
          <InfoRow icon="badge-account" iconBg="#eeeaff" label="Nom complet" value={fullname} />
          <InfoRow icon="at"            iconBg="#f4f6fb" label="Nom d'utilisateur"  value={`@${username}`} />
        </View>

        {/* ── Photo card ── */}
        <View style={s.card}>
          <SectionTitle icon="face-man-shimmer" iconBg="#eeeaff" iconColor="#5b4fcf" title="Photo de profil et reconnaissance faciale" />

          <View style={s.infoNotice}>
            <MaterialCommunityIcons name="information-outline" size={15} color="#5b4fcf" />
            <Text style={s.infoNoticeText}>
              Cette photo sera utilisée pour votre avatar et pour la reconnaissance faciale lors de l'entrée en classe. Assurez-vous que votre visage est bien visible, avec un bon éclairage et sans accessoires comme des lunettes de soleil.
            </Text>
          </View>

          {photoUri ? (
            <View style={s.previewWrap}>
              <Image source={{ uri: photoUri }} style={s.photoPreview} />
              <TouchableOpacity
                style={s.retakeBtn}
                onPress={showPickerOptions}
                disabled={isUploading}
              >
                <MaterialCommunityIcons name="camera-retake" size={14} color="#5b4fcf" />
                <Text style={s.retakeText}>Remplacer la photo</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={s.uploadZone} onPress={showPickerOptions} activeOpacity={0.8}>
              <View style={s.uploadIconCircle}>
                <MaterialCommunityIcons name="face-man-shimmer" size={32} color="#5b4fcf" />
              </View>
              <Text style={s.uploadTitle}>Ajouter votre photo</Text>
              <Text style={s.uploadSub}>
                Prends un selfie ou choisissez dans votre bibliothèque.{'\n'}
                Assurez-vous que votre visage est bien visible et éclairé.
              </Text>
              <View style={s.uploadBtnRow}>
                <View style={[s.uploadBtn, { backgroundColor: '#5b4fcf' }]}>
                  <MaterialCommunityIcons name="camera" size={15} color="#fff" />
                  <Text style={s.uploadBtnText}>Selfie</Text>
                </View>
                <View style={[s.uploadBtn, { backgroundColor: '#1D9E75' }]}>
                  <MaterialCommunityIcons name="image" size={15} color="#fff" />
                  <Text style={s.uploadBtnText}>Bibliothèque</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}

          {/* Inline feedback */}
          {isUploading && (
            <View style={s.feedbackRow}>
              <ActivityIndicator size="small" color="#5b4fcf" />
              <Text style={s.feedbackText}>Téléchargement et détection du visage…</Text>
            </View>
          )}
          {isError && (
            <View style={[s.feedbackRow, s.feedbackError]}>
              <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#E24B4A" />
              <Text style={[s.feedbackText, { color: '#E24B4A' }]}>{errorMsg}</Text>
            </View>
          )}
          {isDone && (
            <View style={[s.feedbackRow, s.feedbackSuccess]}>
              <MaterialCommunityIcons name="check-circle-outline" size={16} color="#1D9E75" />
              <Text style={[s.feedbackText, { color: '#1D9E75' }]}>Visage enregistré avec succès</Text>
            </View>
          )}
        </View>

        {/* ── Save button ── */}
        <TouchableOpacity
          style={[s.saveBtn, (isUploading || isDone) && s.saveBtnDisabled]}
          onPress={handleSave}
          disabled={isUploading || isDone}
          activeOpacity={0.85}
        >
          {isUploading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <MaterialCommunityIcons
                name={isDone ? 'check-bold' : 'content-save-check'}
                size={20} color="#fff"
              />
              <Text style={s.saveBtnText}>{isDone ? 'Profil enregistré!' : 'Enregistrer le profil'}</Text>
            </>
          )}
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
};

/* ── Sub-components ── */

const SectionTitle = ({ icon, iconBg, iconColor, title }) => (
  <View style={s.sectionTitle}>
    <View style={[s.sectionIcon, { backgroundColor: iconBg }]}>
      <MaterialCommunityIcons name={icon} size={14} color={iconColor} />
    </View>
    <Text style={s.sectionTitleText}>{title.toUpperCase()}</Text>
  </View>
);

const InfoRow = ({ icon, iconBg, label, value, valueColor = '#1a1a2e' }) => (
  <View style={s.infoRow}>
    <View style={[s.infoIcon, { backgroundColor: iconBg }]}>
      <MaterialCommunityIcons name={icon} size={16} color="#888" />
    </View>
    <View>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={[s.infoValue, { color: valueColor }]}>{value}</Text>
    </View>
  </View>
);

/* ── Styles ── */
const s = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: '#5b4fcf' },
  scroll:        { flex: 1, backgroundColor: '#f4f6fb' },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 40 },

  header: {
    backgroundColor: '#5b4fcf',
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 18, paddingTop: 30, paddingBottom: 20
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  headerSub:   { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 1 },

  avatarWrap:     { alignItems: 'center', marginTop: 2, marginBottom: 16 },
  avatarRing: {
    width: 96, height: 96, borderRadius: 48,
    borderWidth: 3, borderColor: '#5b4fcf',
    backgroundColor: '#eeeaff',
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  avatarImg:       { width: 90, height: 90, borderRadius: 45 },
  avatarInitials:  { fontSize: 30, fontWeight: '700', color: '#5b4fcf' },
  avatarEditBadge: {
    position: 'absolute', bottom: 3, right: 2,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#5b4fcf', borderWidth: 2, borderColor: '#f4f6fb',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarName:     { fontSize: 17, fontWeight: '700', color: '#1a1a2e', marginTop: 8 },
  avatarUsername: { fontSize: 12, color: '#999', marginTop: 2 },

  statusRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  chip: {
    flex: 1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  chipDot:   { width: 7, height: 7, borderRadius: 4 },
  chipLabel: { fontSize: 11, fontWeight: '700' },
  chipVal:   { fontSize: 10, marginTop: 1 },

  card: {
    backgroundColor: '#fff', borderRadius: 16,
    padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#ececec',
  },
  sectionTitle:     { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 },
  sectionIcon:      { width: 22, height: 22, borderRadius: 6, justifyContent: 'center', alignItems: 'center' },
  sectionTitleText: { fontSize: 11, fontWeight: '700', color: '#aaa', letterSpacing: 0.6 },

  infoNotice: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: '#eeeaff', borderRadius: 10, padding: 10, marginBottom: 14,
  },
  infoNoticeText: { fontSize: 12, color: '#3C3489', lineHeight: 17, flex: 1 },

  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  infoIcon:  { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  infoLabel: { fontSize: 11, color: '#aaa' },
  infoValue: { fontSize: 13, fontWeight: '600', marginTop: 1 },

  previewWrap:  { alignItems: 'center', gap: 10 },
  photoPreview: { width: 130, height: 130, borderRadius: 16 },
  retakeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#eeeaff', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12,
  },
  retakeText: { fontSize: 13, color: '#5b4fcf', fontWeight: '600' },

  uploadZone: {
    borderWidth: 2, borderStyle: 'dashed', borderColor: '#c8c2f5',
    borderRadius: 14, padding: 20, alignItems: 'center', gap: 6, backgroundColor: '#f7f5ff',
  },
  uploadIconCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#eeeaff', justifyContent: 'center', alignItems: 'center', marginBottom: 4,
  },
  uploadTitle:   { fontSize: 14, fontWeight: '700', color: '#5b4fcf' },
  uploadSub:     { fontSize: 11, color: '#999', textAlign: 'center', lineHeight: 16 },
  uploadBtnRow:  { flexDirection: 'row', gap: 10, marginTop: 6 },
  uploadBtn: {
    borderRadius: 10, paddingVertical: 8, paddingHorizontal: 18,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  uploadBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  feedbackRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#f4f6fb', borderRadius: 10, padding: 10, marginTop: 12,
  },
  feedbackError:   { backgroundColor: '#fcebeb' },
  feedbackSuccess: { backgroundColor: '#e1f5ee' },
  feedbackText:    { fontSize: 13, color: '#5b4fcf', flex: 1 },

  saveBtn: {
    backgroundColor: '#5b4fcf', borderRadius: 14, padding: 15,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 8,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText:     { color: '#fff', fontSize: 15, fontWeight: '700' },
});

export default StudentProfileScreen;