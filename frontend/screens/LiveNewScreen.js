import { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useIsFocused } from '@react-navigation/core';
import Toast from 'react-native-toast-message';
import * as SecureStore from 'expo-secure-store';
import useUserStore from '../stores/useUserStore';
import api from '../utils/api';
import { useCameraDevice, Camera, useFrameProcessor, useCameraPermission } from 'react-native-vision-camera';
import { useFaceDetector } from 'react-native-vision-camera-face-detector';
import { Worklets } from 'react-native-worklets-core';

/* ── helpers ─────────────────────────────────────────────────────────────── */

const toMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
};

const getCheckType = (classroom) => {
  const now  = new Date();
  const curr = now.getHours() * 60 + now.getMinutes();
  const GRACE = 5;
  const windows = [
    { type: 'morning_in',    pivot: toMinutes(classroom.start_morning)   },
    { type: 'morning_out',   pivot: toMinutes(classroom.end_morning)     },
    { type: 'afternoon_in',  pivot: toMinutes(classroom.start_afternoon) },
    { type: 'afternoon_out', pivot: toMinutes(classroom.end_afternoon)   },
  ];
  for (const { type, pivot } of windows) {
    if (curr >= pivot - GRACE && curr <= pivot + GRACE) return type;
  }
  let nearest = windows[0], minDist = Infinity;
  for (const w of windows) {
    const dist = Math.abs(curr - w.pivot);
    if (dist < minDist) { minDist = dist; nearest = w; }
  }
  return nearest.type;
};

const formatTime = (date) =>
  date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

const formatDate = (date) =>
  date.toLocaleDateString('fr-FR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });

const CHECK_TYPE_LABELS = {
  morning_in:    { label: 'Matin',      icon: 'weather-sunny',         color: 'green' },
  morning_out:   { label: 'Matin',      icon: 'weather-sunny-off',     color: 'red'   },
  afternoon_in:  { label: 'Après-midi', icon: 'weather-partly-cloudy', color: 'green' },
  afternoon_out: { label: 'Après-midi', icon: 'weather-night',         color: 'red'   },
};

const LOOP_TICK_MS        = 1000;

/* ── component ───────────────────────────────────────────────────────────── */

export default function LiveNewScreen({ route }) {
  const username      = useUserStore((s) => s.username);
  const { classroom } = route.params || {};

  const [facing, setFacing] = useState('front');
  const [users,  setUsers]  = useState([]);
  const [torch,  setTorch]  = useState(false);
  const [now,    setNow]    = useState(new Date());

  const ws           = useRef(null);
  const cameraRef    = useRef(null);
  const facePresent  = useRef(false);
  const isConnecting = useRef(false);
  const faceDebounce = useRef(null);
  const usersClearTimer = useRef(null);

  const isFocused  = useIsFocused();
  const navigation = useNavigation();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device    = useCameraDevice(facing);
  const checkType = getCheckType(classroom);
  const checkMeta = CHECK_TYPE_LABELS[checkType] ?? CHECK_TYPE_LABELS.morning_in;

  /* ── face detector ── */
  const { detectFaces, stopListeners } = useFaceDetector({
    performanceMode:    'accurate',
    landmarkMode:       'none',
    classificationMode: 'none',
    contourMode:        'none',
    minFaceSize:        0.25,
    trackingEnabled:    true,
  });

  const onFacesJS = useRef(
    Worklets.createRunOnJS((count) => {
      facePresent.current = count > 0;

      if (count === 0) {
        // Clear users after 3s of no face — gives time to read the chip
        if (!usersClearTimer.current) {
          usersClearTimer.current = setTimeout(() => {
            setUsers([]);
            usersClearTimer.current = null;
          }, 1000);
        }
      } else {
        // Face reappeared — cancel the pending clear
        if (usersClearTimer.current) {
          clearTimeout(usersClearTimer.current);
          usersClearTimer.current = null;
        }
      }
    })
  ).current;

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    const faces = detectFaces(frame);
    onFacesJS(faces.length);
  }, [detectFaces, onFacesJS]);

  /* ── permission ── */
  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, []);

  /* ── clock tick ── */
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(tick);
  }, []);

  /* ── cleanup ── */
  useEffect(() => {
    return () => {
      stopListeners();
      if (faceDebounce.current) clearTimeout(faceDebounce.current);
      if (usersClearTimer.current) clearTimeout(usersClearTimer.current);
    };
  }, []);

  const fetchEmbeddings = async (silent = false) => {
    try {
      const resp = await api.post('/embeddings', {
        class_id:   classroom.id,
        class_name: classroom.name,
      });
      if (resp.data.status === 'success') {
        if (!silent) {
          Toast.show({
            type:           'success',
            text1:          'Préparation terminée',
            text2:          `${resp.data.loaded} visage(s) chargé(s)`,
            position:       'top',
            visibilityTime: 3000,
          });
        }
      } else {
        if (!silent)
          Toast.show({ type: 'error', text1: 'Erreur préparation', text2: resp.data.message, position: 'top', visibilityTime: 5000 });
      }
    } catch {
      if (!silent) {
        Toast.show({ type: 'error', text1: 'Erreur inattendue', position: 'top', visibilityTime: 3000 });
        navigation.goBack();
      }
    }
  };

  // First focus — show toast and goBack on error (silent = false)
  // Subsequent focuses — refresh quietly (silent = true)
  const isFirstFocus = useRef(true);

  useEffect(() => {
    if (!isFocused) return;
    fetchEmbeddings(!isFirstFocus.current);
    isFirstFocus.current = false;
  }, [isFocused]);

  /* ── Keep WS open for entire screen focus lifetime, auto-reconnect on drop ── */
  useEffect(() => {
    if (!isFocused) return;

    let reconnectTimer = null;
    let cancelled      = false;

    const openSocket = async () => {
      if (cancelled) return;
      if (isConnecting.current) return;
      isConnecting.current = true;

      if (ws.current && ws.current.readyState !== WebSocket.CLOSED) {
        ws.current.close();
      }

      const token = await SecureStore.getItemAsync('token');
      if (!token || cancelled) { isConnecting.current = false; return; }

      ws.current = new WebSocket(`wss://attendance.samtech.qzz.io/recognize?token=${token}`);

      ws.current.onopen = () => {
        isConnecting.current = false;
        console.log('🔌 WebSocket connected');
      };

      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const { status, message, users: matched } = data;
          if (status === 'success') {
            setUsers(matched || []);
          } else if (status === 'error') {
            Toast.show({ type: 'error', text1: '❌ ' + message, position: 'top', visibilityTime: 5000 });
            navigation.navigate('Home');
          }
        } catch (e) {
          console.error('❌ Failed to parse WS message:', e);
        }
      };

      ws.current.onerror = (e) => {
        isConnecting.current = false;
        console.error('❌ WebSocket error:', e.message);
      };

      ws.current.onclose = (e) => {
        isConnecting.current = false;
        console.log('🔌 WebSocket closed — code:', e.code, 'reason:', e.reason);

        // 1000 = clean close (navigated away) — don't reconnect
        // 1006 = abnormal drop — reconnect after 2s
        if (e.code !== 1000 && !cancelled) {
          console.log('🔄 Reconnecting in 1s...');
          reconnectTimer = setTimeout(openSocket, 1000);
        }
      };
    };

    openSocket();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws.current?.close();
    };
  }, [isFocused]);

  /* ── Capture loop — runs while focused, gated by facePresent + throttle ── */
  useEffect(() => {
    if (!isFocused) return;

    const isSendingRef  = { current: false };

    const interval = setInterval(async () => {
      if (!facePresent.current)                      return;
      if (isSendingRef.current)                      return;
      if (!cameraRef.current)                        return;
      if (ws.current?.readyState !== WebSocket.OPEN) return;

      isSendingRef.current = true;

      try {
        const snapshot = await cameraRef.current.takeSnapshot({
          quality: 35, skipMetadata: true,
        });

        if (ws.current?.readyState !== WebSocket.OPEN) return;

        ws.current.send(JSON.stringify({
          class:        `${username}_${classroom.name}`,
          class_id:     `${username}_${classroom.name}_id`,
          classroom_id: classroom.id,
        }));

        const response = await fetch(`file://${snapshot.path}`);
        const blob     = await response.blob();
        ws.current.send(blob);

        console.log(`📤 Frame sent, size: ${blob.size} bytes`);
      } catch (e) {
        console.error('❌ Frame capture error:', e.message);
      } finally {
        isSendingRef.current = false;
      }
    }, LOOP_TICK_MS);

    return () => clearInterval(interval);
  }, [isFocused]);

  /* ── render ── */
  if (!hasPermission) {
    return (
      <SafeAreaView style={s.container}>
        <Text style={{ color: '#fff', textAlign: 'center', marginTop: 40 }}>
          Permission caméra refusée
        </Text>
      </SafeAreaView>
    );
  }

  if (!device) {
    return (
      <SafeAreaView style={s.container}>
        <Text style={{ color: '#fff', textAlign: 'center', marginTop: 40 }}>
          Caméra non disponible
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>

      {isFocused && device && (
        <View style={s.cameraContainer}>
          <Camera
            ref={cameraRef}
            style={s.camera}
            device={device}
            isActive={true}
            frameProcessor={frameProcessor}
            torch={torch ? 'on' : 'off'}
            enableZoomGesture={true}
            photo={true}
          />
        </View>
      )}

      <View style={s.overlay} pointerEvents="none" />

      <View style={s.infoBar}>
        <View style={s.dateBlock}>
          <Text style={s.dateText}>{formatDate(now)}</Text>
          <Text style={s.timeText}>{formatTime(now)}</Text>
        </View>
        <View style={[s.checkPill, {
          backgroundColor: checkMeta.color + '22',
          borderColor:     checkMeta.color + '66',
        }]}>
          <MaterialCommunityIcons name={checkMeta.icon} size={14} color={checkMeta.color} />
          <Text style={[s.checkPillText, { color: checkMeta.color }]}>{checkMeta.label}</Text>
        </View>
      </View>

      <View style={s.usersWrap} pointerEvents="none">
        {users.map((name, idx) => (
          <View key={idx} style={s.userChip}>
            <MaterialCommunityIcons name="check-circle" size={16} color="#1D9E75" />
            <Text style={s.userChipText}>{name}</Text>
          </View>
        ))}
      </View>

      <View style={s.topControls}>
        <TouchableOpacity style={s.ctrlBtn} onPress={() => navigation.navigate('Classroom', { classroom })}>
          <MaterialCommunityIcons name="close" size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={s.ctrlBtn} onPress={() => setTorch(v => !v)}>
          <MaterialCommunityIcons name={torch ? 'flashlight' : 'flashlight-off'} size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={s.ctrlBtn} onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}>
          <MaterialCommunityIcons name="camera-flip" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

/* ── styles ── */
const s = StyleSheet.create({
  container:       { flex: 1, paddingTop: 10, backgroundColor: '#000' },
  cameraContainer: { width: '100%', aspectRatio: 3 / 4, overflow: 'hidden', borderRadius: 12 },
  camera:          { flex: 1 },
  overlay:         { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  infoBar:         { position: 'absolute', top: 80, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 },
  dateBlock:       { gap: 2 },
  dateText:        { color: '#fff', fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
  timeText:        { color: 'rgba(255,255,255,0.7)', fontSize: 11 },
  checkPill:       { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  checkPillText:   { fontSize: 12, fontWeight: '700' },
  usersWrap:       { position: 'absolute', bottom: 200, left: 16, right: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', zIndex: 10 },
  userChip:        { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(29,158,117,0.85)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  userChipText:    { color: '#fff', fontWeight: '700', fontSize: 14 },
  topControls:     { position: 'absolute', top: 30, left: 5, flexDirection: 'row', gap: 10, zIndex: 10 },
  ctrlBtn:         { backgroundColor: '#00000088', padding: 10, borderRadius: 30 },
});