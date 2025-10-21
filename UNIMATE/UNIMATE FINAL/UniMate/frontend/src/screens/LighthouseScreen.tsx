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
import { useAuth } from "../contexts/AuthContext";
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
  const { isAuthenticated } = useAuth();

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
      let profileData: ProfileData | null = null;

      if (isAuthenticated) {
        try {
          console.log('Fetching profile, isAuthenticated:', isAuthenticated);
          const response = await apiService.getUserProfile();
          console.log('Backend profile response:', JSON.stringify(response, null, 2));
          console.log('response.success:', response.success);
          console.log('response.user exists:', !!response.user);

          if (response.success && response.user) {
            // Map backend response to frontend ProfileData structure
            const user = response.user;
            const medicalInfo = user.medical_info || {};

            profileData = {
              name: user.name || "",
              email: user.email || "",
              avatarUri: user.avatar_url,
              phone: user.phone || "",
              address: user.address || "",
              mood: user.current_mood || "",
              blood_type: medicalInfo.blood_type || "",
              history: medicalInfo.medical_history || "",
              allergies: medicalInfo.allergies || "",
              medications: medicalInfo.medications || "",
              preferred_clinic: medicalInfo.preferred_clinic || "",
              dob: user.date_of_birth ? new Date(user.date_of_birth).toISOString() : "",
              coins: 0,  // TODO: Fetch from rewards API
              streak: 0,  // TODO: Fetch from challenges API
              challenges: 0  // TODO: Fetch from challenges API
            };
            console.log('Mapped profile data:', JSON.stringify(profileData, null, 2));
          } else {
            console.log('Profile fetch unsuccessful or no user data');
            console.log('Error:', response.error);
          }
        } catch (error) {
          console.log('Failed to load profile from backend:', error);
          console.error(error);
        }
      } else {
        console.log('Not authenticated, skipping profile fetch');
      }

      // Backend data always takes full precedence - don't merge with old cached data
      // Save the fresh backend data to AsyncStorage
      if (profileData) {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(profileData));
      }

      setProfile(profileData);
      setProgress(pctFilled(profileData));
      console.log('Final profile set:', JSON.stringify(profileData, null, 2));
    } catch {
      setProfile(null);
      setProgress(0);
    }
  }, [isAuthenticated]);

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
    <LinearGradient
      colors={["#ebe2e2ca", "#ebe2e2ca"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.fill}
    >
      <SafeAreaView style={styles.fill}>
        {/* Top bar */}
        <View style={styles.headerBar}>
          <View style={{ width: 28 }} />
          <Text style={styles.headerTitle}> </Text>
          <TouchableOpacity onPress={goIsland} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}>
            <Image source={LEAVE} style={{ width: 25, height: 25 }} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
          <View style={styles.container}>
            {/* prompt */}
            <View style={styles.header}>
              <Text style={styles.title}>Are you in an emergency?</Text>
              <Text style={styles.sub}>Press the SOS button for helps</Text>
            </View>

            {/* SOS Button (restyled, same logic) */}
            <Animated.View style={{ transform: [{ scale }] }}>
              <TouchableOpacity
                activeOpacity={0.92}
                onPressIn={pressIn}
                onPressOut={pressOut}
                onPress={() => goRoot("LighthouseSOS")}
                style={styles.sosWrap}
              >
                {/* layered pulse rings */}
                <View style={styles.ringOuter} />
                <View style={styles.ringInner} />
                <LinearGradient
                  colors={["#ed8787ff", "#b61d12dc"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.sosInner}
                >
                  <Text style={styles.sosText}>SOS</Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>

            {/* Address card */}
            <View style={styles.addrCard}>
              <View style={styles.addrLeft}>
                <Image source={AVATAR} style={styles.avatar} contentFit="cover" />
                <View style={{ marginLeft: 10, flex: 1 }}>
                  <Text style={styles.addrLabel}>Current Address</Text>
                  <Text style={styles.addrValue}>{address}</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.changeBtn} onPress={() => setEditVisible(true)}>
                <Text style={styles.changeText}>Change</Text>
              </TouchableOpacity>
            </View>

            {/* Preparedness */}
            <View style={styles.prepRow}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <MaterialCommunityIcons name="shield-check" size={16} color="#da4a4aff" />
                <Text style={styles.prepText}>Emergency readiness</Text>
              </View>
              <Text style={[styles.prepText, { opacity: 0.55 }]}>{progress}%</Text>
            </View>
            <View style={styles.prepTrack}>
              <View style={[styles.prepFill, { width: `${progress}%` }]} />
            </View>
            <TouchableOpacity
              onPress={() => goRoot("ProfileSettings", { profile })}
              style={styles.finishSetupBtn}
              activeOpacity={0.9}
            >
              <Text style={styles.finishSetupText}>Finish setting up</Text>
            </TouchableOpacity>

            {/* Quick tiles (visual-only refresh) */}
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

      {/* Edit Address Modal (unchanged logic) */}
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
              placeholderTextColor="rgba(90, 84, 84, 1)"
              style={styles.input}
            />
            <View style={styles.sheetBtns}>
              <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => setEditVisible(false)}>
                <Text style={[styles.btnText, { color: "#242323ff" }]}>Cancel</Text>
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

/* ------------ Medical Card (UI-only tweaks) ------------- */
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
    <LinearGradient colors={["#ffffffff", "#ffffffff"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={mc.card}>
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

/* ------------ Small tile (UI-only) ------------- */
function Tile({
  label,
  icon,
  onPress,
  fullWidth = false,
}: {
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
  fullWidth?: boolean;
}) {
  return (
    <LinearGradient
      colors={["#ffffffff", "#ffffffff"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[tileStyles.card, fullWidth ? tileStyles.full : undefined]}
    >
      <TouchableOpacity style={tileStyles.touch} activeOpacity={0.92} onPress={onPress}>
        <View style={tileStyles.iconWrap}>
          <MaterialCommunityIcons name={icon} size={22} color="#ffffffff" />
        </View>
        <Text numberOfLines={2} style={tileStyles.label}>
          {label}
        </Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

/* ------------ Styles ------------- */
const styles = StyleSheet.create({
  fill: { flex: 1 },

  headerBar: {
    paddingTop: 20,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { color: "transparent" },

  container: { flex: 1, paddingHorizontal: 16, paddingBottom: 18, paddingTop: 10 },
  header: { paddingTop: 20, alignItems: "center", marginBottom: 6 },
  title: { fontFamily: fonts.heading, fontSize: 30, fontWeight:700, color: "#111", textAlign: "center" },
  sub: {
    marginTop: 6,
    fontFamily: fonts.body,
    fontSize: fontSize.body,
    color: "rgba(97, 88, 88, 0.6)",
    textAlign: "center",
  },

  // SOS
  sosWrap: { alignSelf: "center", marginTop: 12, width: R, height: R, alignItems: "center", justifyContent: "center" },
  ringOuter: {
    position: "absolute",
    width: R,
    height: R,
    borderRadius: R / 2,
    backgroundColor: "rgba(255,255,255,0.55)",
  },
  ringInner: {
    position: "absolute",
    width: R * 0.84,
    height: R * 0.84,
    borderRadius: (R * 0.84) / 2,
    backgroundColor: "rgba(255,255,255,0.85)",
  },
  sosInner: {
    width: R * 0.68,
    height: R * 0.68,
    borderRadius: (R * 0.68) / 2,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#FF3B30",
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 6,
  },
  sosText: { color: "#fff", fontSize: 38, fontFamily: fonts.heading, fontWeight: "700", letterSpacing: 1 },

  // Address card
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
  addrLabel: { fontFamily: fonts.heading, fontSize: 16, fontWeight: 500, color: "#111" },
  addrValue: { fontFamily: fonts.body, fontSize: 14, color: "rgba(0,0,0,0.75)", marginTop: 5 },
  changeBtn: { paddingHorizontal: 15, paddingVertical: 10, backgroundColor: "#cd2525ff", borderRadius: 20 },
  changeText: { color: "#f5f5eeff", fontFamily: fonts.body, fontSize: 14 },

  // Preparedness row
  prepRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 14, paddingHorizontal: 2 },
  prepText: { fontFamily: fonts.body, fontSize: 14, fontWeight:500, color: "rgba(0,0,0,0.75)" },
  prepTrack: {
    height: 10,
    marginTop: 6,
    borderRadius: 8,
    backgroundColor: "rgba(245, 199, 199, 1)",
    overflow: "hidden",
  },
  prepFill: { height: "100%", backgroundColor: "#cd2525ff", borderRadius: 8 },
  finishSetupBtn: {
    alignSelf: "flex-end",
    backgroundColor: "#cd2525ff",
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 8,
  },
  finishSetupText: { color: "#fff", fontFamily: fonts.heading, fontSize: 14 },

  // Quick tiles – wrapped grid
  tilesWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 14,
  },

    // Quick tiles
  tilesRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 14 },

  // Modal sheet
  modalWrap: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0, 0, 0, 0.25)" },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    paddingBottom: 40,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 8,
  },
  sheetTitle: { fontFamily: fonts.heading, fontSize: 20, fontWeight:500, color: "#111", marginBottom: 10 },
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
  btn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20 },
  btnGhost: { backgroundColor: "rgba(0,0,0,0.06)" },
  btnPrimary: { backgroundColor: "#cd2525ff" },
  btnText: { fontFamily: fonts.heading, fontSize: 14 },
});

const tileStyles = StyleSheet.create({
  card: {
    width: "48%",
    borderRadius: 16,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  full: { width: "100%" },
  touch: {
    borderRadius: 16,
    padding: 12,
    paddingBottom: 18,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#cd2525ff",
    alignItems: "center",
    justifyContent: "center",
  },
  label: { marginTop: 10, fontFamily: fonts.heading, fontSize: 14, fontWeight: 600, color: "#111", lineHeight: 18 },
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
  title: { fontFamily: fonts.heading, fontSize: 30, fontWeight:500, color: "#111", textAlign: "center", marginBottom: 12 },
  avatarWrap: { alignItems: "center", marginBottom: 10 },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: "#EEE" },

  row: { marginTop: 10 },
  rowLabel: { color: "#b40f0fff", fontFamily: fonts.heading, marginBottom: 6 },
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
