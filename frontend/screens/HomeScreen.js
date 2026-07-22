import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, StatusBar, SafeAreaView, ActivityIndicator, Alert
} from 'react-native';
import { useState, useEffect, use } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import useUserStore from "../stores/useUserStore";
import AddClassroomModal from '../components/AddClassroomModal';
import Toast from 'react-native-toast-message';
import api from "../utils/api";

const HomeScreen = ({ navigation }) => {

  const fetchClassrooms = async () => {
    try {
      setLoading(true);
      const res = await api.get('/getclassrooms');
      if (res.data.status === 'success') {
        setClassrooms(res.data.classrooms);
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
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClassrooms();
  }, []);

  const fullname = useUserStore((s) => s.fullname);
  const initials = fullname
    ? fullname.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : 'ME';

  const [classrooms, setClassrooms] = useState([]);

  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (form) => {
    try {
     const res = await api.post('/addclassroom', form); 
      if (res.data.status === 'success') {
        Toast.show({
          type: 'success',
          text1: '✅ SUCCÈS!',
          text2: res.data.message,
          position: 'top',
        });
        
        if (form.name.trim()) {
          setClassrooms(prev => [
            ...prev,
            { id: Date.now(), name: form.name.trim(), students: 0, room: 'TBD' },
          ]);
        }
      setModalVisible(false);
      } else if (res.data.status === 'error') {
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
        if (err.status === 422) {
            const { message, field } = err.response.data;
            Toast.show({
                type: 'error',
                text1: '❌ DONNÉES INVALIDES!',
                text2: '❌ '+ message,
                position: 'top',
            });
        }
    } finally {
        setLoading(false);
    }
  };

  const renderClassroom = ({ item }) => {
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.75}
        onPress={() => navigation.navigate('Classroom', { classroom: item })}
      >
        <View style={styles.cardIconWrap}>
          <MaterialCommunityIcons name="google-classroom" size={20} color="#5b4fcf" />
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName}>{item.name}</Text>
          {item.start_morning && (
            <View style={styles.scheduleRow}>
              <MaterialCommunityIcons name="weather-sunny" size={11} color="#f59e0b" />
              <Text style={styles.scheduleText}>{item.start_morning} – {item.end_morning}</Text>
              <MaterialCommunityIcons name="weather-sunset" size={11} color="#6366f1" style={{ marginLeft: 6 }} />
              <Text style={styles.scheduleText}>{item.start_afternoon} – {item.end_afternoon}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          onPress={() => {
            Alert.alert(
              "Confirmer la suppression",
              `Êtes-vous sûr de vouloir supprimer la classe "${item.name}" ?`,
              [
                { text: "Annuler", style: "cancel" },
                { text: "Supprimer", style: "destructive", onPress: async () => {
                    setLoading(true);
                    try {
                      const res = await api.delete(`/deleteclassroom/${item.id}`);
                      if (res.data.status === 'success') {
                        Toast.show({ type: 'success', text1: '✅ SUCCÈS!', text2: res.data.message, position: 'top' });
                        setClassrooms(prev => prev.filter(c => c.id !== item.id));
                      } else {
                        Toast.show({ type: 'error', text1: '❌ ERREUR!', text2: res.data.message, position: 'top' });
                      }
                    } catch (err) {
                      if (err.status === 530 || err.status === 502) {
                        Toast.show({ type: 'error', text1: '❌ SERVEUR INDISPONIBLE!', text2: '❌ Veuillez réessayer ultérieurement!', position: 'top' });
                      }
                    } finally {
                      setLoading(false);
                    }
                  }
                },
              ]
            );
          }}
          style={{ padding: 6 }}
        >
          <MaterialCommunityIcons name="delete" size={18} color="#e74c3c" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#5b4fcf" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.fullname}>{fullname}</Text>
          </View>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        </View>

        <View style={styles.classInfoRow}>
          <Text style={styles.classValue}>{classrooms.length}</Text>
          <Text style={styles.classLabel}>Classe{classrooms.length > 1 ? 's' : ''}</Text>
        </View>
      </View>

      {/* ── Body ── */}
      <View style={styles.body}>
        <Text style={styles.sectionLabel}>LES CLASSES</Text>

        {/* Add button */}
        <TouchableOpacity
          style={styles.addButton}
          activeOpacity={0.85}
          onPress={() => setModalVisible(true)}
        >
          <View style={styles.addIconWrap}>
            <MaterialCommunityIcons name="plus" size={20} color="#fff" />
          </View>
          <Text style={styles.addButtonText}>Ajouter une classe</Text>
          <MaterialCommunityIcons name="arrow-right" size={18} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>

        { loading && (
          <View style={{ marginTop: 50, alignItems: 'center', gap: 8 }}>
            <ActivityIndicator size="large" color="#5b4fcf" />
            <Text style={{ color: '#999', fontSize: 14 }}>Chargement en cours...</Text>
          </View>
        )}

        { !loading &&
          <FlatList
            data={classrooms}
            renderItem={renderClassroom}
            keyExtractor={item => item.id.toString()}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 20 }}
            refreshing={loading}
            onRefresh={fetchClassrooms}
            ListEmptyComponent={() => (
              <View style={{ marginTop: 50, alignItems: 'center', gap: 8 }}>
                <MaterialCommunityIcons name="school" size={48} color="#ccc" />
                <Text style={{ color: '#999', fontSize: 14 }}>Aucune classe trouvée</Text>
              </View>
            )}
          />
        }
      </View>

      {/* ── Modal ── */}
      <AddClassroomModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSubmit={handleSubmit}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#5b4fcf',
  },

  /* Header */
  header: {
    backgroundColor: '#5b4fcf',
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 32,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  fullname: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  classInfoRow: {
    alignItems: 'center',
    marginTop: 0,
  },
  classValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  classLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },

  /* Body */
  body: {
    flex: 1,
    backgroundColor: '#f4f6fb',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -16,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#aaa',
    letterSpacing: 0.8,
    marginBottom: 14,
  },

  /* Add button */
  addButton: {
    backgroundColor: '#5b4fcf',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  addIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },

  /* Classroom card */
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ececec',
  },
  cardInfo: {
    flex: 1,
  },
  cardName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a2e',
  },

  /* Modal */
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
  },
  modalHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  input: {
    backgroundColor: '#f4f6fb',
    borderRadius: 14,
    padding: 14,
    fontSize: 15,
    color: '#1a1a2e',
    borderWidth: 1.5,
    borderColor: '#ececec',
    marginBottom: 14,
  },
  confirmBtn: {
    backgroundColor: '#5b4fcf',
    borderRadius: 14,
    padding: 15,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  confirmBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelBtn: {
    alignItems: 'center',
    padding: 10,
  },
  cancelText: {
    color: '#5b4fcf',
    fontSize: 15,
    fontWeight: '500',
  },
  cardIconWrap: {
  width: 38,
  height: 38,
  borderRadius: 10,
  backgroundColor: '#ede9fe',
  justifyContent: 'center',
  alignItems: 'center',
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
  },
  scheduleText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
});

export default HomeScreen;