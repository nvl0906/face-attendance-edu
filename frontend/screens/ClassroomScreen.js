import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  Image, ActivityIndicator, SafeAreaView, StatusBar, Keyboard, Alert
} from 'react-native';
import { useState, useEffect, useCallback, useRef } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import api from '../utils/api';
import Toast from 'react-native-toast-message';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import axios from 'axios';

/* ── helpers ── */
const getInitials = (name = '') =>
  name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

const AVATAR_COLORS = ['#eeeaff', '#e1f5ee', '#faeeda', '#fbeaf0', '#e6f1fb'];
const avatarBg = (name = '') =>
  AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];

const toMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
};


const compareTime = (t1) => {
  const now  = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes();
  const GRACE = 5

  if (currentTime >= (toMinutes(t1.start_morning)-GRACE) && currentTime <= (toMinutes(t1.end_morning)+GRACE)) return true;
  if (currentTime >= (toMinutes(t1.start_afternoon)-GRACE) && currentTime <= (toMinutes(t1.end_afternoon)+GRACE)) return true;
  return false;
};

const ClassroomScreen = ({ route, navigation }) => {
  const { classroom } = route.params; // { id, name }

  /* ── classroom students ── */
  const [students,        setStudents]        = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [loading, setLoading] = useState(false);

  /* ── search ── */
  const [query,         setQuery]         = useState('');
  const [searching,     setSearching]     = useState(false);
  const [searchResults, setSearchResults] = useState(null); // null = no search yet
  const [searchError,   setSearchError]   = useState('');

  /* ── adding ── */
  const [addingId, setAddingId] = useState(null); // student id being added

  const searchTimeout = useRef(null);
  
  /* ── download and share Excel ── */
    //Download excel
  const downloadAndShare = async () => {
    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) throw new Error("Utilisateur non authentifié.");

      const fileName = "tmi_presence.xlsx";
      const fileUri = FileSystem.cacheDirectory + fileName;

      // Axios GET request with token
      const BACKEND_URL = "https://attendance.samtech.qzz.io"
      const response = await axios.post(
        `${BACKEND_URL}/download`,
        {
          classroom_id: classroom.id,
          classroom_name: classroom.name,
        } ,
        {
          responseType: "arraybuffer", // binary data
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      // Convert ArrayBuffer -> base64 manually (no Buffer!)
      const base64Data = btoa(
        new Uint8Array(response.data)
          .reduce((data, byte) => data + String.fromCharCode(byte), "")
      );

      // Save file to cache using legacy write
      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Share file if available
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          dialogTitle: "Partager la feuille de présence",
          UTI: "com.microsoft.excel.xlsx",
        });
      } else {
          Toast.show({
            type: 'error',
            text1: '❌ Partage non disponible!',
            text2: '❌ Impossible de partager ce fichier sur cet appareil!',
            position: 'top',
          });
      }
    } catch (err) {
        if (err.status === 530 || err.status === 502) {
          Toast.show({
            type: 'error',
            text1: '❌ SERVEUR INDISPONIBLE!',
            text2: '❌ Veuillez réessayer ultérieurement!',
            position: 'top',
          });
        }
    } finally {
      setLoading(false);
    }
  };

  /* ── fetch students of this classroom ── */
  const fetchStudents = async () => {
    setLoadingStudents(true);
    try {
      const { data } = await api.get(`/classroom/${classroom.id}`);
      setStudents(data);
    } catch {
      setStudents([]);
    } finally {
      setLoadingStudents(false);
    }
  }

  useEffect(() => {
    fetchStudents();
  }, []);

  /* ── debounced search ── */
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (!query.trim()) {
      setSearchResults(null);
      setSearchError('');
      return;
    }

    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      setSearchError('');
      try {
        const { data } = await api.get('/search', { params: { q: query.trim() } });
        setSearchResults(data);
      } catch (err) {
        const detail = err.response?.data?.detail;
        setSearchError(typeof detail === 'string' ? detail : 'Aucun résultat trouvé');
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 500);

    return () => clearTimeout(searchTimeout.current);
  }, [query]);

  /* ── add student to classroom ── */
  const handleAdd = async (student) => {
    setAddingId(student.id);
    try {
      await api.patch(`/${student.id}/assign-classroom`, null, {
        params: { classroom_id: classroom.id },
      });
      // Optimistically add to list and clear search
      setStudents(prev => [...prev, student].sort((a, b) => a.fullname.localeCompare(b.fullname)));
      setQuery('');
      setSearchResults(null);
      Keyboard.dismiss();
    } catch (err) {
      const detail = err.response?.data?.detail;
      setSearchError(typeof detail === 'string' ? detail : 'Could not add student');
    } finally {
      setAddingId(null);
    }
  };

  const clearSearch = () => {
    setQuery('');
    setSearchResults(null);
    setSearchError('');
    Keyboard.dismiss();
  };

  /* ── render a classroom student row ── */
  const renderStudent = ({ item, index }) => (
    <View style={s.studentRow}>
      <View style={s.studentLeft}>
        <View style={s.rankBadge}>
          <Text style={s.rankText}>{index + 1}</Text>
        </View>
        {item.profile ? (
          <Image source={{ uri: item.profile }} style={s.studentAvatar} />
        ) : (
          <View style={[s.studentAvatarFallback, { backgroundColor: avatarBg(item.fullname) }]}>
            <Text style={s.studentInitials}>{getInitials(item.fullname)}</Text>
          </View>
        )}
        <View>
          <Text style={s.studentName}>{item.fullname}</Text>
          <Text style={s.studentUsername}>@{item.username}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={{ padding: 6 }}
        onPress={() => {
          Alert.alert(
            'Confirmer la suppression',
            `Êtes-vous sûr de vouloir supprimer "${item.fullname}" de "${classroom.name}" ?`,
            [
              { text: 'Annuler', style: 'cancel' },
              {
                text: 'Supprimer',
                style: 'destructive',
                onPress: async () => {
                  try {
                    setLoadingStudents(true);
                    const res = await api.delete(`/unassign-student/${item.id}`);
                    if (res.data.status === 'success') {
                      Toast.show({
                        type: 'success',
                        text1: '✅ SUCCÈS!',
                        text2: res.data.message,
                        position: 'top',
                      });
                      setStudents(prev => prev.filter(s => s.id !== item.id));
                    } else {
                      Toast.show({
                        type: 'error',
                        text1: '❌ ERREUR!',
                        text2: res.data.message,
                        position: 'top',
                      });
                    }
                  } catch (err) {
                    if (err.status === 530 || err.status === 502) {
                      Toast.show({
                        type: 'error',
                        text1: '❌ SERVEUR INDISPONIBLE!',
                        text2: '❌ Veuillez réessayer ultérieurement!',
                        position: 'top',
                      });
                    }
                  } finally {
                    setLoadingStudents(false);
                  }
                },
              },
            ]
          );
        }}
      >
        <MaterialCommunityIcons name="delete" size={18} color="#e74c3c" />
      </TouchableOpacity>
    </View>
  );

  /* ── render a search result row ── */
  const renderSearchResult = (item) => {
    const alreadyIn = students.some(s => s.id === item.id);
    const isAdding  = addingId === item.id;

    return (
      <View key={item.id} style={s.searchResultRow}>
        <View style={s.studentLeft}>
          {item.profile ? (
            <Image source={{ uri: item.profile }} style={s.studentAvatar} />
          ) : (
            <View style={[s.studentAvatarFallback, { backgroundColor: avatarBg(item.fullname) }]}>
              <Text style={s.studentInitials}>{getInitials(item.fullname)}</Text>
            </View>
          )}
          <View>
            <Text style={s.studentName}>{item.fullname}</Text>
            <Text style={s.studentUsername}>@{item.username}</Text>
          </View>
        </View>

        {alreadyIn ? (
          <View style={s.alreadyBadge}>
            <MaterialCommunityIcons name="check" size={12} color="#1D9E75" />
            <Text style={s.alreadyText}>Ajouté</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[s.addBtn, isAdding && s.addBtnDisabled]}
            onPress={() => handleAdd(item)}
            disabled={isAdding || !!item.classroom_id}
            activeOpacity={0.8}
          >
            {isAdding ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <MaterialCommunityIcons name="plus" size={14} color="#fff" />
                <Text style={s.addBtnText}>Ajouter</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const showSearch = query.trim().length > 0;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#5b4fcf" />

      {/* ── Header ── */}
      <View style={s.header}>
        <View style={s.headerTop}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <MaterialCommunityIcons name="arrow-left" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={s.headerTitle}>{classroom.name}</Text>
          </View>
          <View style={s.headerBadge}>
            <MaterialCommunityIcons name="google-classroom" size={18} color="#fff" />
          </View>
        </View>

        <View style={s.studentCountRow}>
          <Text style={s.studentCountValue}>{loadingStudents ? '-' : students.length}</Text>
          <Text style={s.studentCountLabel}>Étudiant{loadingStudents ? '' : students.length > 1 ? 's' : ''}</Text>
        </View>
      </View>

      {/* ── Body ── */}
      <View style={s.body}>

        {/* Live Button */}
        { compareTime(classroom) && students.length > 0 && (
        <View style={s.liveButtonWrap}>
          <TouchableOpacity style={s.liveButton} onPress={() => navigation.navigate('LiveNew', { classroom })} activeOpacity={0.8}>
            <MaterialCommunityIcons name="video" size={18} color="#fff" />
            <Text style={s.liveButtonText}>Démarrer la présence</Text>
            <MaterialCommunityIcons name="arrow-right" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
        )}

        
        {/* Excel Button */}
        <View style={s.downloadButtonWrap}>
          <TouchableOpacity style={s.downloadButton} onPress={downloadAndShare} activeOpacity={0.8}>
            {loading && <ActivityIndicator color="#fff" />}
            {!loading && <MaterialCommunityIcons name="download" size={18} color="#fff" />}
            {!loading && <Text style={s.downloadButtonText}>Excel</Text>}
          </TouchableOpacity>
        </View>

        {/* Search bar */}
        <View style={s.searchWrap}>
          <View style={s.searchBar}>
            <MaterialCommunityIcons name="magnify" size={18} color="#aaa" style={{ marginRight: 6 }} />
            <TextInput
              style={s.searchInput}
              placeholder="Rechercher des étudiants à ajouter..."
              placeholderTextColor="#bbb"
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={clearSearch} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialCommunityIcons name="close-circle" size={16} color="#ccc" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── Search results panel ── */}
        {showSearch && (
          <View style={s.searchPanel}>
            {searching ? (
              <View style={s.searchFeedback}>
                <ActivityIndicator size="small" color="#5b4fcf" />
                <Text style={s.searchFeedbackText}>Recherche en cours...</Text>
              </View>
            ) : searchError ? (
              <View style={s.searchFeedback}>
                <MaterialCommunityIcons name="account-search-outline" size={16} color="#aaa" />
                <Text style={[s.searchFeedbackText, { color: '#aaa' }]}>{searchError}</Text>
              </View>
            ) : searchResults && searchResults.length > 0 ? (
              <>
                <Text style={s.searchResultsLabel}>
                  {searchResults.length} résultat{searchResults.length !== 1 ? 's' : ''}
                </Text>
                {searchResults.map(renderSearchResult)}
              </>
            ) : null}
          </View>
        )}

        {/* ── Students list ── */}
        {!showSearch && (
          <>
            <Text style={s.sectionLabel}>ETUDIANTS</Text>
            {loadingStudents ? (
              <View style={s.centered}>
                <ActivityIndicator size="large" color="#5b4fcf" />
                <Text style={{ color: '#999', fontSize: 14 }}>Chargement en cours...</Text>
              </View>
            ) : students.length === 0 ? (
              <View style={s.emptyWrap}>
                <View style={s.emptyIcon}>
                  <MaterialCommunityIcons name="account-group-outline" size={36} color="#c8c2f5" />
                </View>
                <Text style={s.emptyTitle}>Aucun étudiant trouvé</Text>
                <Text style={s.emptySub}>Cherchez des étudiants pour les ajouter à cette classe.</Text>
              </View>
            ) : (
              <FlatList
                data={students}
                renderItem={renderStudent}
                keyExtractor={item => item.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 30 }}
                refreshing={loadingStudents}
                onRefresh={fetchStudents}
                ItemSeparatorComponent={() => <View style={s.separator} />}
              />
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
};

/* ── Styles ── */
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#5b4fcf' },

  header: {
    backgroundColor: '#5b4fcf',
    paddingHorizontal: 18,
    paddingTop: 30,
    paddingBottom: 24,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 25, fontWeight: '700', color: '#fff' },
  headerBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  studentCountRow: {
    alignItems: 'center',
  },
  studentCountValue: { fontSize: 28, fontWeight: '700', color: '#fff' },
  studentCountLabel: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },

  body: {
    flex: 1, backgroundColor: '#f4f6fb',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 16, paddingHorizontal: 16,
  },

  /* Search */
  searchWrap: { marginBottom: 12 },
  searchBar: {
    backgroundColor: '#fff', borderRadius: 14,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: '#ececec',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#1a1a2e', paddingVertical: 0 },

  /* Search panel */
  searchPanel: {
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1, borderColor: '#ececec',
    marginBottom: 14, overflow: 'hidden',
  },
  searchFeedback: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 14,
  },
  searchFeedbackText: { fontSize: 13, color: '#5b4fcf' },
  searchResultsLabel: {
    fontSize: 11, fontWeight: '700', color: '#aaa',
    letterSpacing: 0.5, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4,
  },
  searchResultRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: '#f5f5f5',
  },

  /* Section label */
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#aaa',
    letterSpacing: 0.7, marginBottom: 10,
  },

  /* Student rows */
  studentRow: {
    backgroundColor: '#fff', borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 12,
  },
  studentLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  separator:   { height: 8 },

  rankBadge: {
    width: 22, height: 22, borderRadius: 6,
    backgroundColor: '#f4f6fb',
    justifyContent: 'center', alignItems: 'center',
  },
  rankText: { fontSize: 11, fontWeight: '700', color: '#aaa' },

  studentAvatar: { width: 40, height: 40, borderRadius: 20 },
  studentAvatarFallback: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
  },
  studentInitials: { fontSize: 14, fontWeight: '700', color: '#5b4fcf' },
  studentName:     { fontSize: 14, fontWeight: '600', color: '#1a1a2e' },
  studentUsername: { fontSize: 11, color: '#999', marginTop: 1 },

  /* Add / already badges */
  addBtn: {
    backgroundColor: '#5b4fcf', borderRadius: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 6, paddingHorizontal: 12,
  },
  addBtnDisabled: { opacity: 0.6 },
  addBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  alreadyBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#e1f5ee', borderRadius: 8,
    paddingVertical: 6, paddingHorizontal: 10,
  },
  alreadyText: { fontSize: 12, fontWeight: '700', color: '#1D9E75' },

  /* Live Button */
  liveButtonWrap: { alignItems: 'center', marginVertical: 10 },
  liveButton: {
    backgroundColor: '#ff4757',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  liveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  /* Download Button */
  downloadButtonWrap: { alignItems: 'center', marginVertical: 10 },
  downloadButton: {
    backgroundColor: '#24af2dff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  downloadButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  /* Empty & loading */
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 50 },
  emptyWrap: { alignItems: 'center', marginTop: 60, gap: 8 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 24,
    backgroundColor: '#eeeaff',
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a2e' },
  emptySub:   { fontSize: 13, color: '#aaa', textAlign: 'center' },
});

export default ClassroomScreen;