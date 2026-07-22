import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  TextInput, ScrollView, Platform
} from 'react-native';
import { useState } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import DateTimePicker from '@react-native-community/datetimepicker';

const formatTime = (date) =>
  date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

const timeToDate = (timeStr) => {
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
};

const INITIAL_FORM = {
  name:              '',
  start_morning:     timeToDate('07:30'),
  end_morning:       timeToDate('12:00'),
  start_afternoon:   timeToDate('13:00'),
  end_afternoon:     timeToDate('17:30'),
};

const AddClassroomModal = ({ visible, onClose, onSubmit }) => {
  const [form, setForm]         = useState(INITIAL_FORM);
  const [errors, setErrors]     = useState({});
  const [picker, setPicker]     = useState(null);

  const set = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: null }));
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim())        e.name        = 'Requis';
    if (form.end_morning   <= form.start_morning)   e.end_morning   = 'Doit être après le début';
    if (form.start_afternoon < form.end_morning)    e.start_afternoon = 'Doit être après la fin du matin';
    if (form.end_afternoon <= form.start_afternoon) e.end_afternoon = 'Doit être après le début de l\'après-midi';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    onSubmit({
      name:             form.name.trim(),
      start_morning:    formatTime(form.start_morning),
      end_morning:      formatTime(form.end_morning),
      start_afternoon:  formatTime(form.start_afternoon),
      end_afternoon:    formatTime(form.end_afternoon),
    });
    setForm(INITIAL_FORM);
    setErrors({});
    onClose();
  };

  const openPicker = (field) => setPicker({ field, value: form[field] });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <View style={s.handle} />

          {/* Header */}
          <View style={s.sheetHeader}>
            <View style={s.hIcon}>
              <MaterialCommunityIcons name="google-classroom" size={22} color="#5b4fcf" />
            </View>
            <View>
              <Text style={s.sheetTitle}>Nouvelle classe</Text>
              <Text style={s.sheetSub}>Remplissez tous les champs obligatoires</Text>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>

            {/* ── General ── */}
            <Text style={s.section}>Général</Text>

            <Field label="Nom de la classe" error={errors.name}>
              <TextInput
                style={[s.input, errors.name && s.inputError]}
                placeholder="e.g. L1"
                placeholderTextColor="#bbb"
                value={form.name}
                onChangeText={v => set('name', v)}
              />
            </Field>

            {/* ── Schedule ── */}
            <Text style={s.section}>Horaires</Text>

            <View style={s.schedBlock}>
              {/* Morning */}
              <View style={s.schedGroup}>
                <View style={s.schedGroupHeader}>
                  <MaterialCommunityIcons name="weather-sunny" size={13} color="#5b4fcf" />
                  <Text style={[s.schedGroupLabel, { color: '#5b4fcf' }]}>Matin</Text>
                </View>
                <View style={s.schedRow}>
                  <TimeButton
                    label="Début"
                    value={form.start_morning}
                    error={errors.start_morning}
                    onPress={() => openPicker('start_morning')}
                  />
                  <MaterialCommunityIcons name="arrow-right" size={14} color="#ccc" />
                  <TimeButton
                    label="Fin"
                    value={form.end_morning}
                    error={errors.end_morning}
                    onPress={() => openPicker('end_morning')}
                  />
                </View>
              </View>

              <View style={s.schedDivider} />

              {/* Afternoon */}
              <View style={s.schedGroup}>
                <View style={s.schedGroupHeader}>
                  <MaterialCommunityIcons name="white-balance-sunny" size={13} color="#1D9E75" />
                  <Text style={[s.schedGroupLabel, { color: '#1D9E75' }]}>Après-midi</Text>
                </View>
                <View style={s.schedRow}>
                  <TimeButton
                    label="Début"
                    value={form.start_afternoon}
                    error={errors.start_afternoon}
                    onPress={() => openPicker('start_afternoon')}
                  />
                  <MaterialCommunityIcons name="arrow-right" size={14} color="#ccc" />
                  <TimeButton
                    label="Fin"
                    value={form.end_afternoon}
                    error={errors.end_afternoon}
                    onPress={() => openPicker('end_afternoon')}
                  />
                </View>
              </View>
            </View>

            {/* ── Actions ── */}
            <TouchableOpacity style={s.confirmBtn} onPress={handleSubmit} activeOpacity={0.85}>
              <MaterialCommunityIcons name="check" size={18} color="#fff" />
              <Text style={s.confirmText}>Ajouter</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
              <Text style={s.cancelText}>Annuler</Text>
            </TouchableOpacity>

          </ScrollView>
        </View>
      </View>

      {/* Native time picker */}
      {picker && (
        <DateTimePicker
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          value={picker.value}
          is24Hour
          onChange={(_, date) => {
            if (date) set(picker.field, date);
            if (Platform.OS === 'android') setPicker(null);
          }}
        />
      )}
      {picker && Platform.OS === 'ios' && (
        <TouchableOpacity style={s.pickerDone} onPress={() => setPicker(null)}>
          <Text style={{ color: '#5b4fcf', fontWeight: '700' }}>Done</Text>
        </TouchableOpacity>
      )}
    </Modal>
  );
};

/* ── Small sub-components ── */

const Field = ({ label, error, children, style }) => (
  <View style={[{ marginBottom: 10 }, style]}>
    <Text style={s.label}>{label}</Text>
    {children}
    {error && (
      <View style={s.errorRow}>
        <MaterialCommunityIcons name="alert-circle-outline" size={12} color="#E24B4A" />
        <Text style={s.errorText}>{error}</Text>
      </View>
    )}
  </View>
);

const TimeButton = ({ label, value, error, onPress }) => (
  <TouchableOpacity
    style={[s.timePill, error && s.timePillError]}
    onPress={onPress}
    activeOpacity={0.75}
  >
    <Text style={s.timeLabel}>{label}</Text>
    <Text style={s.timeValue}>{formatTime(value)}</Text>
  </TouchableOpacity>
);

/* ── Styles ── */
const s = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 36,
    maxHeight: '92%',
  },
  handle: {
    width: 36, height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 18,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18,
  },
  hIcon: {
    width: 38, height: 38, borderRadius: 11,
    backgroundColor: '#eeeaff',
    justifyContent: 'center', alignItems: 'center',
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#1a1a2e' },
  sheetSub:   { fontSize: 12, color: '#999', marginTop: 1 },

  section:    { fontSize: 11, fontWeight: '700', color: '#aaa', letterSpacing: 0.7, textTransform: 'uppercase', marginTop: 14, marginBottom: 8 },

  label: { fontSize: 12, color: '#666', marginBottom: 4 },
  input: {
    backgroundColor: '#f4f6fb',
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 14,
    color: '#1a1a2e',
    borderWidth: 1.5,
    borderColor: '#ececec',
  },

  placeholder:{ fontSize: 14, color: '#bbb', flex: 1 },
  inputError: { borderColor: '#E24B4A' },
  row:        { flexDirection: 'row', alignItems: 'center' },

  errorRow:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  errorText: { fontSize: 11, color: '#E24B4A' },

  /* Schedule */
  schedBlock: {
    backgroundColor: '#f4f6fb',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#ececec',
    padding: 12,
    marginBottom: 4,
  },
  schedGroup:       { gap: 6 },
  schedGroupHeader: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  schedGroupLabel:  { fontSize: 11, fontWeight: '700' },
  schedDivider:     { height: 1, backgroundColor: '#e8e8e8', marginVertical: 10 },
  schedRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: 6,
  },
  timePill: {
    flex: 1, backgroundColor: '#fff',
    borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: 1, borderColor: '#e0e0e0',
  },
  timePillError: { borderColor: '#E24B4A' },
  timeLabel: { fontSize: 10, color: '#aaa', marginBottom: 2 },
  timeValue: { fontSize: 14, fontWeight: '700', color: '#1a1a2e' },

  /* Buttons */
  confirmBtn: {
    backgroundColor: '#5b4fcf', borderRadius: 14,
    padding: 14, flexDirection: 'row',
    justifyContent: 'center', alignItems: 'center',
    gap: 8, marginTop: 18,
  },
  confirmText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancelBtn:   { alignItems: 'center', padding: 10 },
  cancelText:  { color: '#5b4fcf', fontSize: 14, fontWeight: '500' },
  pickerDone: {
    backgroundColor: '#fff', padding: 14,
    alignItems: 'center', borderTopWidth: 1, borderColor: '#ececec',
  },
});

export default AddClassroomModal;