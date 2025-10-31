import React, { useEffect, useState, useCallback } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  Switch,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useFocusEffect, useRoute, RouteProp } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiService } from "../services/api";
import { useAuth } from "../contexts/AuthContext";

const COIN = require("../../assets/ui/coin.png");

export type ProfileData = {
  avatarUri?: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  mood?: string;
  blood_type?: string;
  history?: string;
  allergies?: string;
  medications?: string;
  preferred_clinic?: string;
  coins?: number;
  streak?: number;
  challenges?: number;
  dob?: string;
};

type ParamList = {
  Profile: { profile?: ProfileData } | undefined;
};

const DEFAULT_PROFILE: ProfileData = {
  name: "Justin Poh",
  email: "dsc2209675@xmu.edu.my",
  coins: 0,
  streak: 0,
  challenges: 0,
  mood: "Thriving",
};

const STORAGE_KEY = "profile.data";

/** ----- Shared Reward Market / Challenge keys ----- */
const K = {
  taskDates: "rm_task_dates", // actionId -> "YYYY-MM-DD"
  challengesToday: "completedChallenges_today", // { date: 'YYYY-MM-DD', items: string[] }
  // Local keys to store streak for convenience:
  loginStreak: "login_streak",
  loginLast: "login_last_date",
};

function todayKey() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
function isYesterdayStr(isoYYYYMMDD: string) {
  const [y, m, d] = isoYYYYMMDD.split("-").map((n) => parseInt(n, 10));
  const last = new Date(y, m - 1, d);
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  return (
    last.getFullYear() === yest.getFullYear() &&
    last.getMonth() === yest.getMonth() &&
    last.getDate() === yest.getDate()
  );
}

export default function ProfileScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<ParamList, "Profile">>();
  const { token, user } = useAuth(); // Use AuthContext instead of authService

  const [profile, setProfile] = useState<ProfileData>(DEFAULT_PROFILE);
  const [shareLocation, setShareLocation] = useState(false);
  const [dailyReminder, setDailyReminder] = useState(false);

  // Load + derive coins, streak, challenges (today)
  const loadDerived = useCallback(async () => {
    try {
      // Initialize with empty profile data (don't use DEFAULT_PROFILE to avoid showing wrong user data)
      let next: ProfileData = {
        name: "",
        email: "",
        coins: 0,
        streak: 0,
        challenges: 0,
        mood: "Thriving",
      };

      // Try to load profile from backend if authenticated
      if (token) {
        try {
          console.log('[ProfileScreen] Loading profile from backend...');
          // Fetch user profile from backend
          const profileResponse = await apiService.getUserProfile();
          console.log('[ProfileScreen] Profile response:', { success: profileResponse.success, hasUser: !!profileResponse.user });

          if (profileResponse.success && profileResponse.user) {
            const user = profileResponse.user;
            const medicalInfo = user.medical_info || {};

            next = {
              name: user.name || "",
              email: user.email || "",
              avatarUri: user.avatar_url,
              phone: user.phone || "",
              address: user.address || "",
              mood: user.current_mood || "Thriving",
              blood_type: medicalInfo.blood_type || "",
              history: medicalInfo.medical_history || "",
              allergies: medicalInfo.allergies || "",
              medications: medicalInfo.medications || "",
              preferred_clinic: medicalInfo.preferred_clinic || "",
              dob: user.date_of_birth || "",
              coins: 0,
              streak: 0,
              challenges: 0
            };
            console.log('[ProfileScreen] Profile loaded successfully:', next.name, next.email);
          } else {
            console.warn('[ProfileScreen] Failed to load profile:', profileResponse.error);
          }
        } catch (error) {
          console.error('[ProfileScreen] Error loading profile from backend:', error);
        }
      } else {
        console.warn('[ProfileScreen] No auth token found, using empty profile');
      }

      // Fetch coins from backend API instead of AsyncStorage
      if (token) {
        try {
          const pointsResponse = await apiService.getUserPoints();
          if (pointsResponse.success && pointsResponse.points) {
            next.coins = pointsResponse.points.total_points || 0;
            console.log('[ProfileScreen] Loaded coins from backend:', next.coins);
          }
        } catch (error) {
          console.log('[ProfileScreen] Failed to load coins from backend:', error);
        }
      }

      // Load local data to supplement backend data
      const [pStr, datesStr, chTodayStr, streakStr, lastStr] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY),
        AsyncStorage.getItem(K.taskDates),
        AsyncStorage.getItem(K.challengesToday),
        AsyncStorage.getItem(K.loginStreak),
        AsyncStorage.getItem(K.loginLast),
      ]);

      // Save backend profile to local storage (don't merge with old data)
      if (next.name && next.email) {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      }

      // Challenges — fetch from backend API
      if (token) {
        try {
          const challengesResponse = await apiService.getChallenges();
          if (challengesResponse.success) {
            next.challenges = challengesResponse.completed_today || 0;
            console.log('[ProfileScreen] Loaded challenges from backend:', next.challenges);
          }
        } catch (error) {
          console.log('[ProfileScreen] Failed to load challenges from backend:', error);
          // Fallback to AsyncStorage
          const chObj: { date?: string; items?: string[] } = chTodayStr ? JSON.parse(chTodayStr) : {};
          const items = Array.isArray(chObj.items) ? chObj.items : [];
          const isTodayList = chObj.date === todayKey();
          next.challenges = isTodayList ? items.length : 0;
        }
      } else {
        // No token, use AsyncStorage fallback
        const chObj: { date?: string; items?: string[] } = chTodayStr ? JSON.parse(chTodayStr) : {};
        const items = Array.isArray(chObj.items) ? chObj.items : [];
        const isTodayList = chObj.date === todayKey();
        next.challenges = isTodayList ? items.length : 0;
      }

      // Streak — consecutive login days based on rm_task_dates.login
      const dates: Record<string, string> = datesStr ? JSON.parse(datesStr) : {};
      const today = todayKey();
      const lastLogin = dates["login"]; // last day user earned login today
      let streak = streakStr ? Number(streakStr) : 0;
      let last = lastStr || "";

      if (lastLogin === today) {
        // User has logged in today (per-day earn)
        if (last !== today) {
          // Only update once per day
          if (last && isYesterdayStr(last)) streak = Math.max(1, streak + 1);
          else streak = 1;
          last = today;
          await AsyncStorage.multiSet([
            [K.loginStreak, String(streak)],
            [K.loginLast, last],
          ]);
        }
      }
      next.streak = streak;

      setProfile(next);
    } catch (e) {
      // fallback: nothing
    }
  }, [token]); // Add token dependency so it reloads when user logs in

  useFocusEffect(
    useCallback(() => {
      loadDerived();
    }, [loadDerived])
  );

  // Also accept updated profile via route params (for instant UI)
  useEffect(() => {
    if (route.params?.profile) {
      setProfile((p) => ({ ...p, ...route.params!.profile! }));
    }
  }, [route.params]);

  const pickAvatar = async () => {
    const res = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (res.status !== "granted") return;
    const img = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
    });
    if (!img.canceled) {
      const uri = img.assets[0].uri;

      // Try to upload to backend first
      if (token) {
        try {
          // Create form data for avatar upload
          const formData = new FormData();
          formData.append('file', {
            uri: uri,
            type: 'image/jpeg',
            name: 'avatar.jpg',
          } as any);

          const uploadResponse = await apiService.uploadAvatar(token, formData);
          if (uploadResponse.success && uploadResponse.avatar_url) {
            // Backend upload successful, use backend URL
            const next = { ...profile, avatarUri: uploadResponse.avatar_url };
            setProfile(next);
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            return;
          }
        } catch (error) {
          console.log('Backend avatar upload failed, using local URI:', error);
        }
      }

      // Fallback to local storage if backend fails or no token
      const next = { ...profile, avatarUri: uri };
      setProfile(next);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F5F5F7" }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        {/* Header gradient */}
        <LinearGradient colors={["#D6C6FF", "#B493FF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header} />

        {/* Card stack */}
        <View style={{ marginTop: -90, paddingHorizontal: 20 }}>
          {/* Avatar + name block */}
          <View style={styles.profileCard}>
            <View style={{ alignItems: "center", marginTop: -60 }}>
              <View style={styles.avatarWrap}>
                <Image
                  source={profile.avatarUri ? { uri: profile.avatarUri } : { uri: "https://i.pravatar.cc/300?img=12" }}
                  style={styles.avatar}
                />
                <TouchableOpacity style={styles.editAvatar} onPress={pickAvatar}>
                  <MaterialCommunityIcons name="pencil" size={16} color="#522E92" />
                </TouchableOpacity>
              </View>

              {/* Mood pill */}
              {profile.mood ? (
                <View style={styles.moodPill}>
                  <Text style={{ fontWeight: "700", color: "#3E2A0A" }}>{profile.mood}</Text>
                </View>
              ) : null}

              <Text style={styles.name}>{profile.name}</Text>
              <Text style={styles.email}>{profile.email}</Text>

              {/* Stats row + View My Rewards */}
              <View style={styles.stats}>
                <View style={styles.statItem}>
                  <Text style={styles.statIcon}>🔥</Text>
                  <Text style={styles.statValue}>{profile.streak ?? 0}</Text>
                  <Text style={styles.statLabel}>Day Streak</Text>
                </View>
                <View style={styles.statItem}>
                  <Image source={COIN} style={{ width: 18, height: 18, marginBottom: 4 }} />
                  <Text style={styles.statValue}>{profile.coins ?? 0}</Text>
                  <Text style={styles.statLabel}>Coins</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statIcon}>🚀</Text>
                  <Text style={styles.statValue}>{profile.challenges ?? 0}</Text>
                  <Text style={styles.statLabel}>Challenges</Text>
                </View>
              </View>

              <TouchableOpacity style={styles.myRewardsBtn} onPress={() => navigation.navigate("MyRewards")} activeOpacity={0.9}>
                <MaterialCommunityIcons name="store" size={18} color="#3E2A5A" />
                <Text style={styles.myRewardsText}>View My Rewards</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* GENERAL */}
          <Text style={styles.sectionTitle}>GENERAL</Text>

          {/* Profile Settings row */}
          <TouchableOpacity style={styles.row} onPress={() => navigation.navigate("ProfileSettings", { profile })} activeOpacity={0.8}>
            <View style={styles.rowLeft}>
              <View style={styles.rowIcon}>
                <MaterialCommunityIcons name="account" size={18} color="#FFFFFF" />
              </View>
              <Text style={styles.rowText}>Profile Settings</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Log out */}
          <TouchableOpacity style={[styles.row, { marginBottom: 16 }]} activeOpacity={0.8} onPress={() => navigation.navigate("Startup")}>
            <View style={styles.rowLeft}>
              <View style={styles.rowIcon}>
                <MaterialCommunityIcons name="logout" size={18} color="#FFFFFF" />
              </View>
              <Text style={styles.rowText}>Log out</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { height: 180, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  profileCard: {
    backgroundColor: "#6F49B8",
    borderRadius: 28,
    paddingBottom: 20,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
  },
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
  moodPill: {
    marginTop: 10,
    backgroundColor: "#F2D999",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  name: { color: "#FFFFFF", fontSize: 28, fontWeight: "800", marginTop: 10 },
  email: { color: "#E9E1FF", marginTop: 2 },
  stats: {
    marginTop: 16,
    backgroundColor: "#5F3EAD",
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statItem: { alignItems: "center", justifyContent: "center", width: "33%" },
  statIcon: { fontSize: 16, marginBottom: 4 },
  statValue: { color: "#FFFFFF", fontWeight: "800", fontSize: 16 },
  statLabel: { color: "#E9E1FF", fontSize: 12, marginTop: 2 },
  myRewardsBtn: { marginTop: 12, backgroundColor: "#EAD9FF", borderRadius: 22, paddingVertical: 10, paddingHorizontal: 16, flexDirection: "row", gap: 8 },
  myRewardsText: { color: "#3E2A5A", fontWeight: "800" },
  sectionTitle: { marginTop: 18, marginBottom: 10, color: "#1B1B1B", fontWeight: "800", fontSize: 16 },
  row: {
    backgroundColor: "#6F49B8",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#8262C7",
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { color: "#FFFFFF", fontWeight: "700" },
});
