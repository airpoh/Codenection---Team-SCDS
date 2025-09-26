import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiService } from "../services/api";
import { authService } from "../services/auth";
import { useFocusEffect } from "@react-navigation/native";
import { Image } from "expo-image";

import { fonts, fontSize } from "../theme/typography";
import { colors } from "../theme/colors";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import type { ProfileData } from "./ProfileScreen";

type Props = NativeStackScreenProps<RootStackParamList, "Lighthouse">;

const { width } = Dimensions.get("window");
const R = Math.min(width * 0.5, 260);
const AVATAR = require("../../assets/stickers/profile1.png");
const LEAVE = require("../../assets/leave.png");
const STORAGE_KEY = "profile.data";

/* ---------- profile completeness ---------- */
function pctFilled(p?: ProfileData | null): number {
  if (!p) return 0;
  // fields that count toward completeness
  const fields = [
    p.name,
    p.phone,
    p.address,
    p.dob, // ISO string
    p.blood_type,
    p.history,
    p.allergies,
    p.medications,
    p.preferred_clinic,
    p.avatarUri, // let avatar count as a step too
  ];
  const filled = fields.filter((v) => typeof v === "string" && v.trim().length > 0).length;
  return Math.min(100, Math.round((filled / fields.length) * 100));
}

export default function LighthouseScreen({ navigation }: Props) {
  // typesafe-enough helper to avoid TS complaints
  const goRoot = (name: keyof RootStackParamList, params?: Record<string, any>) => {
    const parent = (navigation as any).getParent?.();
    if (parent) (parent as any).navigate(name as any, params);
    else (navigation as any).navigate(name as any, params);
  };
  const goIsland = () => (navigation as any).navigate("Tabs", { screen: "Island" });

  const [address, setAddress] = useState(
    "Xiamen University Malaysia, Jalan Sunsuria, Bandar Sunsuria, 43900 Sepang, Selangor, Malaysia"
  );
  const [editVisible, setEditVisible] = useState(false);
  const [draft, setDraft] = useState(address);

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [progress, setProgress] = useState(0);

  const loadProfile = useCallback(async () => {
    try {
      // Try to load profile from backend first
      const token = await authService.getAccessToken();
      let profileData: ProfileData | null = null;

      if (token) {
        try {
          const response = await apiService.getUserProfile(token);
          if (response.success && response.user) {
            profileData = {
              name: response.user.name || "",
              email: response.user.email || "",
              avatarUri: response.user.avatar_url,
              // These fields need to be fetched from a medical profile endpoint or stay local
              phone: "",
              address: "",
              mood: "",
              blood_type: "",
              history: "",
              allergies: "",
              medications: "",
              preferred_clinic: "",
              dob: "",
              coins: 0,
              streak: 0,
              challenges: 0
            };
          }
        } catch (error) {
          console.log('Failed to load profile from backend:', error);
        }
      }

      // Load local profile data and merge with backend data
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      const localProfile: ProfileData | null = stored ? JSON.parse(stored) : null;

      // Merge: backend data takes precedence for basic info, local data for medical info
      const finalProfile = localProfile ? {
        ...localProfile,
        ...(profileData && {
          name: profileData.name,
          email: profileData.email,
          avatarUri: profileData.avatarUri || localProfile.avatarUri
        })
      } : profileData;

      setProfile(finalProfile);
      setProgress(pctFilled(finalProfile));
    } catch {
      setProfile(null);
      setProgress(0);
    }
  }, []);

  // initial load
  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // refresh when returning to this screen
  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  // load saved address
  useEffect(() => {
    (async () => {
      try {
        const a = await AsyncStorage.getItem("lh_address");
        if (a) {
          setAddress(a);
          setDraft(a);
        }
      } catch {}
    })();
  }, []);

  const saveAddress = async () => {
    const clean = draft.trim();
    if (clean.length) {
      setAddress(clean);
      try {
        await AsyncStorage.setItem("lh_address", clean);
      } catch {}
    }
    setEditVisible(false);
  };

  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () =>
    Animated.spring(scale, { toValue: 0.97, friction: 6, useNativeDriver: true }).start();
  const pressOut = () =>
    Animated.spring(scale, { toValue: 1, friction: 6, useNativeDriver: true }).start();

  return (
    <LinearGradient colors={["#ECE6FF", "#FFEEDA"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        {/* Leave (to Island) */}
        <View style={styles.headerBar}>
          <View style={{ width: 28 }} />
          <Text style={styles.headerTitle}> </Text>
          <TouchableOpacity onPress={goIsland} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Image source={LEAVE} style={{ width: 24, height: 24 }} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
          <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Are you in an emergency?</Text>
              <Text style={styles.sub}>Tap in case of emergency</Text>
            </View>

            {/* SOS */}
            <Animated.View style={{ transform: [{ scale }] }}>
              <TouchableOpacity
                activeOpacity={0.92}
                onPressIn={pressIn}
                onPressOut={pressOut}
                onPress={() => goRoot("LighthouseSOS")}
                style={styles.sosWrap}
              >
                <View style={styles.ringOuter} />
                <View style={styles.ringInner} />
                <View style={styles.sosInner}>
                  <Text style={styles.sosText}>SOS</Text>
                </View>
              </TouchableOpacity>
            </Animated.View>

            {/* Address card */}
            <View style={styles.addrCard}>
              <View style={styles.addrLeft}>
                <Image source={AVATAR} style={styles.avatar} contentFit="cover" />
                <View style={{ marginLeft: 10, flex: 1 }}>
                  <Text style={styles.addrLabel}>Your current address</Text>
                  <Text style={styles.addrValue}>{address}</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.changeBtn} onPress={() => setEditVisible(true)}>
                <Text style={styles.changeText}>Change</Text>
              </TouchableOpacity>
            </View>

            {/* Preparedness — now dynamic */}
            <View style={styles.prepRow}>
              <Text style={styles.prepText}>You are {progress}% prepared for emergency</Text>
              <TouchableOpacity onPress={() => goRoot("ProfileSettings", { profile })}>
                <Text style={[styles.prepText, { opacity: 0.55 }]}>Finish setting up</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.prepTrack}>
              <View style={[styles.prepFill, { width: `${progress}%` }]} />
            </View>

            {/* Tiles (no chevrons) */}
            <View style={styles.tilesRow}>
              <Tile label="Resources & Support" icon="lifebuoy" onPress={() => goRoot("LighthouseResources")} />
              <Tile label="Trusted Contacts" icon="account-group-outline" onPress={() => goRoot("LighthouseTrusted")} />
            </View>

            {/* Medical Card */}
            <View style={{ marginTop: 18 }}>
              <MedicalCard profile={profile} />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Edit Address Modal */}
      <Modal visible={editVisible} transparent animationType="slide" onRequestClose={() => setEditVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.select({ ios: "padding", android: undefined })} style={styles.modalWrap}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setEditVisible(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Edit Address</Text>
            <TextInput
              value={draft}
              onChangeText={(t) => setDraft(t)}
              multiline
              numberOfLines={4}
              placeholder="Enter your full address"
              placeholderTextColor="rgba(0,0,0,0.35)"
              style={styles.input}
            />
            <View style={styles.sheetBtns}>
              <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => setEditVisible(false)}>
                <Text style={[styles.btnText, { color: "#111" }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={saveAddress}>
                <Text style={[styles.btnText, { color: "#fff" }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </LinearGradient>
  );
}

/* ------------ Medical Card ------------- */
function MedicalCard({ profile }: { profile: ProfileData | null }) {
  const avatarSource =
    profile?.avatarUri ? { uri: profile.avatarUri } : { uri: "https://i.pravatar.cc/300?img=12" };

  const Row = ({ label, value }: { label: string; value?: string }) => (
    <View style={mc.row}>
      <Text style={mc.rowLabel}>{label}</Text>
      <View style={mc.rowField}>
        <Text style={mc.rowValue}>{value?.trim() ? value : "—"}</Text>
      </View>
    </View>
  );

  const formatDate = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear()}`;
  };
  const calcAge = (iso?: string) => {
    if (!iso) return undefined;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return undefined;
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const month = now.getMonth() - d.getMonth();
    if (month < 0 || (month === 0 && now.getDate() < d.getDate())) age--;
    return age;
  };
  const dobLabel = profile?.dob ? `${formatDate(profile.dob)}  (${calcAge(profile.dob)} yrs)` : undefined;

  return (
    <LinearGradient colors={["#FFEAD2", "#E8D8FF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={mc.card}>
      <Text style={mc.title}>Medical Card</Text>
      <View style={mc.avatarWrap}>
        <Image source={avatarSource} style={mc.avatar} />
      </View>
      <Row label="Full Name" value={profile?.name} />
      <Row label="Date of Birth / Age" value={dobLabel} />
      <Row label="Blood Type" value={profile?.blood_type} />
      <Row label="Allergies" value={profile?.allergies} />
      <Row label="Existing Conditions" value={profile?.history} />
      <Row label="Current Medications" value={profile?.medications} />
      <Row label="Preferred Clinic / Hospital" value={profile?.preferred_clinic} />
      <Row label="Home Address" value={profile?.address} />
      <Row label="Emergency Phone" value={profile?.phone} />
    </LinearGradient>
  );
}

/* ------------ Small tile ------------- */
function Tile({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={tileStyles.card} activeOpacity={0.92} onPress={onPress}>
      <View style={tileStyles.iconWrap}>
        <MaterialCommunityIcons name={icon} size={22} color="#5E54F7" />
      </View>
      <Text numberOfLines={2} style={tileStyles.label}>
        {label}
      </Text>
      {/* chevron intentionally removed */}
    </TouchableOpacity>
  );
}

/* ------------ Styles ------------- */
const styles = StyleSheet.create({
  fill: { flex: 1 },

  headerBar: {
    paddingTop: 6,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { color: "transparent" },

  container: { flex: 1, paddingHorizontal: 16, paddingBottom: 18, paddingTop: 10 },
  header: { paddingTop: 8, alignItems: "center", marginBottom: 8 },
  title: { fontFamily: fonts.heading, fontSize: 24, color: "#111", textAlign: "center" },
  sub: {
    marginTop: 6,
    fontFamily: fonts.body,
    fontSize: fontSize.body,
    color: "rgba(0,0,0,0.6)",
    textAlign: "center",
  },

  sosWrap: { alignSelf: "center", marginTop: 10, width: R, height: R, alignItems: "center", justifyContent: "center" },
  ringOuter: { position: "absolute", width: R, height: R, borderRadius: R / 2, backgroundColor: "rgba(255,255,255,0.55)" },
  ringInner: { position: "absolute", width: R * 0.84, height: R * 0.84, borderRadius: (R * 0.84) / 2, backgroundColor: "rgba(255,255,255,0.85)" },
  sosInner: {
    width: R * 0.68,
    height: R * 0.68,
    borderRadius: (R * 0.68) / 2,
    backgroundColor: "#FF3B30",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#FF3B30",
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 6,
  },
  sosText: { color: "#fff", fontSize: 38, fontFamily: fonts.heading, fontWeight: "700", letterSpacing: 1 },

  addrCard: {
    marginTop: 18,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  addrLeft: { flexDirection: "row", alignItems: "center", flex: 1, paddingRight: 8 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#EDEBFF" },
  addrLabel: { fontFamily: fonts.heading, fontSize: 12, color: "#111" },
  addrValue: { fontFamily: fonts.body, fontSize: 12, color: "rgba(0,0,0,0.75)", marginTop: 2 },
  changeBtn: { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: "#F0EEFF", borderRadius: 10 },
  changeText: { color: "#5E54F7", fontFamily: fonts.body, fontSize: 12 },

  prepRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 14, paddingHorizontal: 2 },
  prepText: { fontFamily: fonts.body, fontSize: 12, color: "rgba(0,0,0,0.65)" },
  prepTrack: { height: 10, marginTop: 6, borderRadius: 8, backgroundColor: "rgba(245,166,35,0.25)", overflow: "hidden" },
  prepFill: { height: "100%", backgroundColor: "#F5A623", borderRadius: 8 },

  tilesRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 12 },

  modalWrap: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.25)" },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    paddingBottom: 22,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 8,
  },
  sheetTitle: { fontFamily: fonts.heading, fontSize: 16, color: "#111", marginBottom: 10 },
  input: {
    minHeight: 90,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: "top",
    fontFamily: fonts.body,
    fontSize: 14,
    backgroundColor: "rgba(0,0,0,0.03)",
  },
  sheetBtns: { flexDirection: "row", justifyContent: "flex-end", marginTop: 12, gap: 12 },
  btn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12 },
  btnGhost: { backgroundColor: "rgba(0,0,0,0.06)" },
  btnPrimary: { backgroundColor: colors.primary },
  btnText: { fontFamily: fonts.heading, fontSize: 14 },
});

const tileStyles = StyleSheet.create({
  card: {
    width: "48%",
    minHeight: 96,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 12,
    paddingBottom: 18,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#E9E6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  label: { marginTop: 10, fontFamily: fonts.heading, fontSize: 13.5, color: "#111", lineHeight: 18 },
});

/* Medical card styles */
const mc = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  title: { fontFamily: fonts.heading, fontSize: 20, color: "#111", textAlign: "center", marginBottom: 12 },
  avatarWrap: { alignItems: "center", marginBottom: 10 },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: "#EEE" },

  row: { marginTop: 10 },
  rowLabel: { color: "#5E54F7", fontFamily: fonts.heading, marginBottom: 6 },
  rowField: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  rowValue: { color: "#111", fontFamily: fonts.body },
});
