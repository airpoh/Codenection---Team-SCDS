// src/screens/ProfileSettings.tsx
import React, { useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  TextInput,
  Platform,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialCommunityIcons } from "@expo/vector-icons";

const STORAGE_KEY = "profile.data";

/** ----- Reward Market keys (shared) ----- */
const K = {
  coins: "rm_coins_total",
  todayEarned: "rm_today_earned",
  taskDates: "rm_task_dates", // actionId -> "YYYY-MM-DD"
};

function todayKey() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Award an earn action once per day and stamp today. */
async function awardEarnOncePerDay(
  actionId: "set_mood_today",
  points: number
) {
  const [coinsStr, earnedStr, mapStr] = await Promise.all([
    AsyncStorage.getItem(K.coins),
    AsyncStorage.getItem(K.todayEarned),
    AsyncStorage.getItem(K.taskDates),
  ]);

  const coins = coinsStr ? Number(coinsStr) : 0;
  const earned = earnedStr ? Number(earnedStr) : 0;
  const map: Record<string, string> = mapStr ? JSON.parse(mapStr) : {};

  const today = todayKey();
  if (map[actionId] === today) return; // already granted today

  map[actionId] = today;

  await AsyncStorage.multiSet([
    [K.coins, String(coins + points)],
    [K.todayEarned, String(earned + points)],
    [K.taskDates, JSON.stringify(map)],
  ]);
}

export type ProfileData = {
  avatarUri?: string;
  name: string;
  email: string; // read-only
  phone?: string;
  address?: string;
  mood?: string;
  blood_type?: string;
  history?: string;
  allergies?: string;
  medications?: string;
  preferred_clinic?: string;
  dob?: string; // ISO date string
};

type RouteParams = { profile?: ProfileData };

const MOODS = ["Thriving", "Good", "Okay", "Stressed", "Tired", "Down", "SOS"];

export default function ProfileSettings() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const initial: ProfileData = useMemo(
    () =>
      (route.params as RouteParams)?.profile ?? {
        name: "",
        email: "",
        mood: "Thriving",
      },
    [route.params]
  );

  const [avatarUri, setAvatarUri] = useState<string | undefined>(initial.avatarUri);
  const [mood, setMood] = useState<string>(initial.mood ?? "Thriving");
  const [name, setName] = useState<string>(initial.name ?? "");
  const [email] = useState<string>(initial.email ?? "");
  const [phone, setPhone] = useState<string>(initial.phone ?? "");
  const [address, setAddress] = useState<string>(initial.address ?? "");
  const [bloodType, setBloodType] = useState<string>(initial.blood_type ?? "");
  const [history, setHistory] = useState<string>(initial.history ?? "");
  const [allergies, setAllergies] = useState<string>(initial.allergies ?? "");
  const [medications, setMedications] = useState<string>(initial.medications ?? "");
  const [preferredClinic, setPreferredClinic] = useState<string>(initial.preferred_clinic ?? "");

  // DOB state + picker
  const [dobISO, setDobISO] = useState<string | undefined>(initial.dob);
  const [showDOB, setShowDOB] = useState(false);

  const pickAvatar = async () => {
    const res = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (res.status !== "granted") return;
    const img = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: true,
    });
    if (!img.canceled) setAvatarUri(img.assets[0].uri);
  };

  const onPickDOB = (e: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === "android") setShowDOB(false);
    if (date) setDobISO(date.toISOString());
  };

  const onSave = async () => {
    const merged: ProfileData = {
      avatarUri,
      name,
      email,
      phone,
      address,
      mood,
      blood_type: bloodType,
      history,
      allergies,
      medications,
      preferred_clinic: preferredClinic,
      dob: dobISO,
    };

    try {
      // Persist profile fields
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      // ✅ Earn: Set the mood today (+5) — once per day
      await awardEarnOncePerDay("set_mood_today", 5);
    } catch {}

    // Go back to Profile tab (also pass updated profile so UI is instant)
    navigation.navigate("Tabs", {
      screen: "Profile",
      params: { profile: merged },
    } as any);
  };

  // helpers
  const isFilled = (v?: string) => !!v && v.trim().length > 0;
  const tickColor = (filled: boolean) => (filled ? "#6F49B8" : "#F5A623");

  const formatDOB = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear()}`;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F5F5F7" }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile Settings</Text>
        </View>

        {/* Avatar */}
        <View style={{ paddingHorizontal: 20, marginTop: -10, alignItems: "center" }}>
          <View style={styles.avatarWrap}>
            <Image
              source={avatarUri ? { uri: avatarUri } : { uri: "https://i.pravatar.cc/300?img=12" }}
              style={styles.avatar}
            />
            <TouchableOpacity style={styles.editAvatar} onPress={pickAvatar}>
              <MaterialCommunityIcons name="pencil" size={16} color="#522E92" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ paddingHorizontal: 20 }}>
          {/* Mood chips */}
          <Text style={styles.sectionHeading}>Mood</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 4, gap: 10 }}>
            {MOODS.map((m) => {
              const active = m === mood;
              return (
                <TouchableOpacity
                  key={m}
                  style={[styles.moodChip, active && styles.moodChipActive]}
                  onPress={() => setMood(m)}
                >
                  <Text style={[styles.moodChipText, active && styles.moodChipTextActive]}>{m}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Basic info */}
          <Field label="Name" value={name} onChangeText={setName} editable filled={isFilled(name)} />
          <Field label="Student Email" value={email} editable={false} filled={isFilled(email)} />
          <Field label="Phone No" value={phone} onChangeText={setPhone} editable keyboardType="phone-pad" filled={isFilled(phone)} />

          {/* Birthday picker row */}
          <TouchableOpacity activeOpacity={0.9} onPress={() => setShowDOB(true)} style={{ marginTop: 12 }}>
            <Text style={styles.label}>Birthday</Text>
            <View style={styles.inputWrap}>
              <Text style={[styles.input, { paddingVertical: 12 }]}>{formatDOB(dobISO) || "Select date"}</Text>
              <View style={[styles.tick, { backgroundColor: "#F2EDF9", borderRadius: 14 }]}>
                <MaterialCommunityIcons name="check" size={16} color={tickColor(isFilled(dobISO))} />
              </View>
            </View>
          </TouchableOpacity>

          {/* Address */}
          <Field label="Home Address" value={address} onChangeText={setAddress} editable multiline filled={isFilled(address)} />

          {/* Medical */}
          <Text style={[styles.sectionHeading, { marginTop: 16 }]}>Medical Conditions</Text>
          <Field label="Blood Type" value={bloodType} onChangeText={setBloodType} editable filled={isFilled(bloodType)} />
          <Field label="All Medical History" value={history} onChangeText={setHistory} editable filled={isFilled(history)} />
          <Field label="All Allergies" value={allergies} onChangeText={setAllergies} editable filled={isFilled(allergies)} />
          <Field label="All Medications" value={medications} onChangeText={setMedications} editable filled={isFilled(medications)} />
          <Field label="Preferred Clinic/Hospital" value={preferredClinic} onChangeText={setPreferredClinic} editable filled={isFilled(preferredClinic)} />

          {/* Save */}
          <TouchableOpacity style={styles.saveBtn} onPress={onSave} activeOpacity={0.9}>
            <Text style={styles.saveBtnText}>Save Settings</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* iOS keeps the picker visible; Android we show it as a one-off dialog */}
      {showDOB && (
        <DateTimePicker
          value={dobISO ? new Date(dobISO) : new Date(2000, 0, 1)}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          onChange={onPickDOB}
          maximumDate={new Date()}
        />
      )}
    </SafeAreaView>
  );
}

/* ------------------ Reusable Field ------------------ */
function Field({
  label,
  value,
  onChangeText,
  editable = true,
  multiline = false,
  keyboardType = "default",
  filled = false,
}: {
  label: string;
  value: string;
  onChangeText?: (t: string) => void;
  editable?: boolean;
  multiline?: boolean;
  keyboardType?: "default" | "numeric" | "phone-pad" | "email-address";
  filled?: boolean;
}) {
  const tickColor = filled ? "#6F49B8" : "#F5A623";
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        <TextInput
          style={[styles.input, multiline && { height: 72, textAlignVertical: "top" }]}
          value={value}
          onChangeText={onChangeText}
          editable={editable}
          multiline={multiline}
          keyboardType={keyboardType}
          placeholder={editable ? `Enter ${label}` : undefined}
          placeholderTextColor="rgba(0,0,0,0.35)"
        />
        <View style={styles.tick}>
          <MaterialCommunityIcons name="check" size={16} color={tickColor} />
        </View>
      </View>
    </View>
  );
}

/* ------------------ Styles ------------------ */
const styles = StyleSheet.create({
  header: {
    backgroundColor: "#D6C6FF",
    height: 132,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 18,
  },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#1B1B1B" },

  avatarWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: "hidden",
    borderWidth: 4,
    borderColor: "#FFFFFF",
    backgroundColor: "#EEE",
  },
  avatar: { width: "100%", height: "100%" },
  editAvatar: {
    position: "absolute",
    right: 6,
    bottom: 6,
    backgroundColor: "#EAD9FF",
    borderRadius: 12,
    padding: 6,
    borderWidth: 1,
    borderColor: "#D7C4FF",
    zIndex: 2,
    elevation: 4,
  },

  sectionHeading: { marginTop: 18, fontWeight: "800", fontSize: 16, color: "#1B1B1B" },
  moodChip: { backgroundColor: "#ECE6F8", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  moodChipActive: { backgroundColor: "#F2D999" },
  moodChipText: { color: "#5C4B9A", fontWeight: "700" },
  moodChipTextActive: { color: "#3E2A0A" },

  label: { color: "#6F6F6F", marginBottom: 6, marginTop: 10 },
  inputWrap: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderColor: "#EAE6F5",
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  input: { flex: 1, fontSize: 16, color: "#1B1B1B" },
  tick: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F2EDF9",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },

  saveBtn: { marginTop: 18, marginBottom: 12, backgroundColor: "#EAD9FF", borderRadius: 22, paddingVertical: 14, alignItems: "center" },
  saveBtnText: { color: "#3E2A5A", fontWeight: "800", fontSize: 16 },
});
