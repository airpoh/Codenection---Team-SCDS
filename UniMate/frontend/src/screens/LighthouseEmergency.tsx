// src/screens/LighthouseEmergency.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useNavigation, useRoute } from "@react-navigation/native";

// Reuse your theme if available
import { colors } from "../theme/colors";
import { fonts } from "../theme/typography";

type Contact = {
  id: string;
  name: string;
  phone: string;
  relation?: string;
};

type RouteParams = {
  type?: string; // emergency type chosen on LighthouseSelectScreen
};

const STORAGE_KEY = "trusted_contacts_v1";

export default function LighthouseEmergency() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { type } = (route.params as RouteParams) || {};

  const [contacts, setContacts] = useState<Contact[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        setContacts(Array.isArray(arr) ? arr : []);
      } catch (e) {
        console.warn("load contacts error", e);
      }
    })();
  }, []);

  const headerTitle = useMemo(
    () => (type ? `Emergency: ${type}` : "Emergency"),
    [type]
  );

  const prefilledMessage = useMemo(
    () =>
      encodeURIComponent(
        `⚠️ EMERGENCY\nType: ${type || "Unknown"}\n` +
          `I need help. Please contact me as soon as you can.`
      ),
    [type]
  );

  const sanitizeForWhatsApp = (phone: string) => {
    // WhatsApp expects an international number without leading zeros/spaces.
    // We'll just keep digits and + sign. (User should store with country code)
    const trimmed = phone.trim();
    const keep = trimmed.replace(/[^\d+]/g, "");
    return keep;
  };

  const openWhatsApp = async (phone: string) => {
    const p = sanitizeForWhatsApp(phone);
    const appUrl = `whatsapp://send?phone=${p}&text=${prefilledMessage}`;
    const webUrl = `https://wa.me/${encodeURIComponent(p)}?text=${prefilledMessage}`;

    try {
      const supported = await Linking.canOpenURL(appUrl);
      if (supported) {
        await Linking.openURL(appUrl);
      } else {
        await Linking.openURL(webUrl);
      }
    } catch (e) {
      Alert.alert("Unable to open WhatsApp", "Please check that WhatsApp is installed.");
    }
  };

  const callNumber = async (phone: string) => {
    const url = Platform.select({ ios: `telprompt:${phone}`, android: `tel:${phone}` })!;
    try {
      const can = await Linking.canOpenURL(url);
      if (can) {
        await Linking.openURL(url);
      } else {
        Alert.alert("Cannot place call", "Calling is not supported on this device.");
      }
    } catch (e) {
      Alert.alert("Call failed", "We couldn't start the call.");
    }
  };

  const renderItem = ({ item }: { item: Contact }) => (
    <View style={styles.card}>
      <View style={styles.cardLeft}>
        <View style={styles.avatar}>
          <MaterialCommunityIcons name="account" size={22} color="#8E6AD6" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.phone}>{item.phone}</Text>
          {!!item.relation && (
            <View style={styles.chip}>
              <Text style={styles.chipText}>{item.relation}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: "#25D36620" }]}
          onPress={() => openWhatsApp(item.phone)}
          activeOpacity={0.9}
        >
          <MaterialCommunityIcons name="whatsapp" size={18} color="#25D366" />
          <Text style={[styles.actionText, { color: "#128C7E" }]}>WhatsApp</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: "#0B804320" }]}
          onPress={() => callNumber(item.phone)}
          activeOpacity={0.9}
        >
          <MaterialCommunityIcons name="phone" size={18} color="#0B8043" />
          <Text style={[styles.actionText, { color: "#0B8043" }]}>Call</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const empty = (
    <View style={styles.empty}>
      <MaterialCommunityIcons name="account-group" size={46} color="rgba(0,0,0,0.25)" />
      <Text style={styles.emptyText}>
        No trusted contacts yet. Add some in “Trusted Contacts”.
      </Text>
      <TouchableOpacity
        onPress={() => navigation.navigate("LighthouseTrustedContacts")}
        style={styles.emptyBtn}
        activeOpacity={0.9}
      >
        <Text style={styles.emptyBtnText}>Manage Contacts</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.fill}>
      {/* Header gradient */}
      <LinearGradient
        colors={["#E9E2FF", "#FBE9D6"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGrad}
      >
        <Text style={styles.caption}>Please choose who to notify</Text>
        <Text style={styles.title}>{headerTitle}</Text>
      </LinearGradient>

      <FlatList
        contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        data={contacts}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        ListEmptyComponent={empty}
      />

      {/* Bottom bar back to types */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.9}
        >
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

/* ---------------- Styles ---------------- */

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#F6F6F8" },

  headerGrad: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 18,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  caption: { fontFamily: fonts.body, fontSize: 12, color: "rgba(0,0,0,0.6)" },
  title: { fontFamily: fonts.heading, fontSize: 22, color: "#111", marginTop: 4 },

  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardLeft: { flexDirection: "row", alignItems: "center" },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#EFE6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  name: { fontFamily: fonts.heading, fontSize: 14, color: "#111" },
  phone: { marginTop: 2, fontFamily: fonts.body, fontSize: 12, color: "rgba(0,0,0,0.65)" },

  chip: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "rgba(142,106,214,0.12)",
    borderRadius: 10,
    marginTop: 6,
  },
  chipText: { fontSize: 11, color: "#6E46C7", fontFamily: fonts.body },

  actions: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  actionText: { fontFamily: fonts.heading, fontSize: 12 },

  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 40, paddingHorizontal: 20 },
  emptyText: { marginTop: 10, textAlign: "center", color: "rgba(0,0,0,0.55)", fontFamily: fonts.body, fontSize: 12 },
  emptyBtn: { marginTop: 10, backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  emptyBtnText: { color: "#fff", fontFamily: fonts.heading },

  bottomBar: { padding: 16, paddingTop: 0 },
  backBtn: {
    alignSelf: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 14,
  },
  backText: { color: "#fff", fontFamily: fonts.heading },
});
