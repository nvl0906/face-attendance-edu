import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, StatusBar, SafeAreaView, ActivityIndicator, Image
} from 'react-native';
import { useState, useEffect } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import useUserStore from "../stores/useUserStore";
import Toast from 'react-native-toast-message';
import api from "../utils/api";
import useThemeStore from "../stores/useThemeStore";

const formatDate = (dateStr) => {
  if (!dateStr) return '–';
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
};

const formatHours = (h) => {
  if (h == null) return '–';
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return mins > 0 ? `${hrs}h${String(mins).padStart(2, '0')}` : `${hrs}h`;
};

const getRateColor = (rate) => {
  if (rate == null) return '#94a3b8';
  if (rate >= 90) return '#10b981';
  if (rate >= 70) return '#f59e0b';
  return '#ef4444';
};

const HomeStudentScreen = ({ navigation }) => {
  const c = useThemeStore((s) => s.primaryColor);
  const fullname = useUserStore((s) => s.fullname);
  const initials = fullname
    ? fullname.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : 'ME';

  const { profile, setProfile } = useUserStore();

  const [classroom, setClassroom]           = useState(null);
  const [attendance, setAttendance]         = useState([]);
  const [classroomLoading, setClassroomLoading] = useState(false);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [refreshing, setRefreshing]         = useState(false);

    const fetchProfile = async () => {
        try {
        const res = await api.get('/getprofile');
        if (res.data?.profile) {
            setProfile(res.data.profile);
        }
        } catch (err) {
        console.error('Failed to fetch profile:', err);
        }
    };

  const fetchClassroom = async () => {
    try {
      setClassroomLoading(true);
      const res = await api.get('/getstudentclassroom');
      if (res.data.status === 'success') {
        setClassroom(res.data.classroom);
      } else {
        Toast.show({ type: 'error', text1: '❌ ERREUR!', text2: res.data.message, position: 'top' });
      }
    } catch (err) {
      if (err.status === 530 || err.status === 502)
        Toast.show({ type: 'error', text1: '❌ SERVEUR INDISPONIBLE!', text2: 'Veuillez réessayer ultérieurement!', position: 'top' });
    } finally {
      setClassroomLoading(false);
    }
  };

  const fetchAttendance = async () => {
    // TODO: uncomment when /getstudentattendance is ready
    try {
       setAttendanceLoading(true);
       const res = await api.get('/getstudentattendance');
       if (res.data.status === 'success') setAttendance(res.data.attendance);
     } catch (err) {
       if (err.status === 530 || err.status === 502)
         Toast.show({ type: 'error', text1: '❌ SERVEUR INDISPONIBLE!', text2: 'Veuillez réessayer ultérieurement!', position: 'top' });
     } finally {
       setAttendanceLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchClassroom(), fetchAttendance()]);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchProfile();
    fetchClassroom();
    fetchAttendance();
  }, []);

  // ── Aggregate stats from attendance history ──
  const totalDays    = attendance.length;
  const avgRate      = totalDays > 0
    ? Math.round(attendance.reduce((s, a) => s + (a.total_attendance_rate ?? 0), 0) / totalDays)
    : null;
  const totalLate    = attendance.reduce((s, a) => s + (a.total_late_minutes ?? 0), 0);
  const perfectDays  = attendance.filter(a => (a.total_attendance_rate ?? 0) >= 100).length;

  const renderAttendanceCard = ({ item }) => {
    const rate      = item.total_attendance_rate ?? 0;
    const rateColor = getRateColor(rate);
    const isLate    = (item.total_late_minutes ?? 0) > 0;

    return (
      <>
        { !attendanceLoading && (
          <View style={styles(c).attendanceCard}>
            {/* Left: date + hours */}
            <View style={styles(c).attendanceLeft}>
              <Text style={styles(c).attendanceDate}>{formatDate(item.attendance_date)}</Text>
              <View style={styles(c).hoursRow}>
                <MaterialCommunityIcons name="clock-outline" size={13} color="#94a3b8" />
                <Text style={styles(c).hoursText}>
                  {formatHours(item.total_hours)}
                  <Text style={styles(c).hoursExpected}> / {formatHours(item.expected_total_hours)}</Text>
                </Text>
              </View>
              {isLate && (
                <View style={styles(c).lateBadge}>
                  <MaterialCommunityIcons name="clock-alert-outline" size={11} color="#f59e0b" />
                  <Text style={styles(c).lateText}>{item.total_late_minutes} min retard</Text>
                </View>
              )}
            </View>

            {/* Right: circular rate */}
            <View style={styles(c).attendanceRight}>
              <View style={[styles(c).rateCircle, { borderColor: rateColor }]}>
                <Text style={[styles(c).rateValue, { color: rateColor }]}>{Math.round(rate)}%</Text>
              </View>
            </View>
          </View>
        )}
      </>
    );
  };

  return (
    <SafeAreaView style={styles(c).safe}>
      <StatusBar barStyle="light-content" backgroundColor="#5b4fcf" />

      {/* ── Header — outside FlatList so it bleeds full width ── */}
      <View style={styles(c).header}>
        <View style={styles(c).headerTop}>
          <View>
            <Text style={styles(c).fullname}>{fullname}</Text>
          </View>
          <TouchableOpacity
            style={styles(c).avatar}
            onPress={() => navigation.navigate('Settings')}
            activeOpacity={0.85}
          >
            {profile ? (
              <Image source={{ uri: profile }} style={styles(c).avatarImage} resizeMode="cover" />
            ) : (
              <Text style={styles(c).avatarText}>{initials}</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles(c).statsRow}>
          <View style={styles(c).statItem}>
            <Text style={styles(c).statValue}>{avgRate !== null ? `${avgRate}%` : '–'}</Text>
            <Text style={styles(c).statLabel}>Taux moy.</Text>
          </View>
          <View style={styles(c).statDivider} />
          <View style={styles(c).statItem}>
            <Text style={styles(c).statValue}>{perfectDays}</Text>
            <Text style={styles(c).statLabel}>Jour{perfectDays > 1 ? 's' : ''} parfait{perfectDays > 1 ? 's' : ''}</Text>
          </View>
          <View style={styles(c).statDivider} />
          <View style={styles(c).statItem}>
            <Text style={styles(c).statValue}>{totalLate > 0 ? `${totalLate}m` : '0'}</Text>
            <Text style={styles(c).statLabel}>Retard total</Text>
          </View>
        </View>
      </View>
      
      <FlatList
        data={attendance}
        keyExtractor={(_, i) => i.toString()}
        showsVerticalScrollIndicator={false}
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerStyle={styles(c).bodyContainer}
        renderItem={renderAttendanceCard}
        ListHeaderComponent={
          <>
            {/* ── Classroom card ── */}
            <Text style={styles(c).sectionLabel}>MA CLASSE</Text>

            {classroomLoading && (
              <View style={styles(c).centered}>
                <ActivityIndicator size="large" color={c} />
                <Text style={styles(c).loadingText}>Chargement...</Text>
              </View>
            )}

            {!classroomLoading && !classroom && (
              <View style={styles(c).centered}>
                <MaterialCommunityIcons name="school-outline" size={48} color="#ccc" />
                <Text style={styles(c).emptyText}>Aucune classe assignée</Text>
              </View>
            )}

            {!classroomLoading && classroom && (
              <TouchableOpacity
                style={styles(c).classroomCard}
                activeOpacity={0.75}
              >
                <View style={styles(c).classroomCardLeft}>
                  <View style={styles(c).cardIconWrap}>
                    <MaterialCommunityIcons name="google-classroom" size={24} color={c} />
                  </View>
                  <View>
                    <Text style={styles(c).classroomName}>{classroom.name}</Text>
                    {classroom.department_name && (
                      <Text style={styles(c).classroomSub}>{classroom.department_name}</Text>
                    )}
                    {classroom.start_morning && (
                      <View style={styles(c).scheduleRow}>
                        <MaterialCommunityIcons name="weather-sunny" size={11} color="#f59e0b" />
                        <Text style={styles(c).scheduleText}>
                          {classroom.start_morning} – {classroom.end_morning}
                        </Text>
                        <MaterialCommunityIcons name="weather-sunset" size={11} color="#6366f1" style={{ marginLeft: 8 }} />
                        <Text style={styles(c).scheduleText}>
                          {classroom.start_afternoon} – {classroom.end_afternoon}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            )}

            <Text style={styles(c).sectionLabel}>HISTORIQUE DE PRÉSENCE</Text>

            {attendanceLoading && (
              <View style={styles(c).centered}>
                <ActivityIndicator size="small" color="#5b4fcf" />
                <Text style={styles(c).loadingText}>Chargement...</Text>
              </View>
            )}

            {!attendanceLoading && attendance.length === 0 && (
              <View style={styles(c).centered}>
                <MaterialCommunityIcons name="calendar-blank-outline" size={48} color="#ccc" />
                <Text style={styles(c).emptyText}>Aucun historique disponible</Text>
              </View>
            )}
          </>
        }
      />
    </SafeAreaView>
  );
};

const styles = (primaryColor) => StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: primaryColor,
  },

  /* Header */
  header: {
    backgroundColor: primaryColor,
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 28,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  fullname: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  /* Stats */
  statsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 10,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  statValue: {
    fontSize: 19,
    fontWeight: '800',
    color: '#fff',
  },
  statLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginVertical: 4,
  },

  /* Body */
  bodyContainer: {
    backgroundColor: '#f4f6fb',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    flexGrow: 1,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#aaa',
    letterSpacing: 1,
    marginBottom: 12,
  },
  centered: {
    alignItems: 'center',
    paddingVertical: 30,
    gap: 8,
  },
  loadingText: { color: '#999', fontSize: 13 },
  emptyText:   { color: '#bbb', fontSize: 14 },

  /* Classroom card */
  classroomCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#ececec',
    shadowColor: '#5b4fcf',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  classroomCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  cardIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 13,
    backgroundColor: '#ede9fe',
    justifyContent: 'center',
    alignItems: 'center',
  },
  classroomName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  classroomSub: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 5,
  },
  scheduleText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },

  attendanceCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ececec',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  attendanceLeft: {
    gap: 4,
    flex: 1,
  },
  attendanceDate: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a2e',
    textTransform: 'capitalize',
  },
  hoursRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  hoursText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  hoursExpected: {
    fontWeight: '400',
    color: '#94a3b8',
  },
  lateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  lateText: {
    fontSize: 11,
    color: '#f59e0b',
    fontWeight: '600',
  },
  attendanceRight: {
    marginLeft: 12,
  },
  rateCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2.5,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  rateValue: {
    fontSize: 12,
    fontWeight: '800',
  },
});

export default HomeStudentScreen;