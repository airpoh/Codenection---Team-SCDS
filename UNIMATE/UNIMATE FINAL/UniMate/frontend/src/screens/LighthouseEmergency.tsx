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
import { apiService } from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import type { MedicalInfo } from "../types/api";

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
  const { isAuthenticated } = useAuth();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [medicalInfo, setMedicalInfo] = useState<MedicalInfo | null>(null);
  const [userName, setUserName] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        // Load trusted contacts from AsyncStorage
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        setContacts(Array.isArray(arr) ? arr : []);

        // Fetch user profile with medical info from backend
        if (isAuthenticated) {
          const profileResponse = await apiService.getUserProfile();
          if (profileResponse.success && profileResponse.user) {
            const user = profileResponse.user;
            setUserName(user.name || "");

            // Extract medical info
            if (user.medical_info) {
              setMedicalInfo(user.medical_info);
            } else if (user.blood_type || user.allergies) {
              // Handle legacy format where medical fields are directly on user object
              setMedicalInfo({
                blood_type: (user as any).blood_type,
                allergies: (user as any).allergies,
                medications: (user as any).medications,
                medical_history: (user as any).medical_history,
                emergency_conditions: (user as any).emergency_conditions,
                preferred_clinic: (user as any).preferred_clinic,
              });
            }
          }
        }
      } catch (e) {
        console.warn("load emergency data error", e);
      }
    })();
  }, [isAuthenticated]);

  const headerTitle = useMemo(
    () => (type ? `Emergency
- ${type} -`: "Emergency"),
    [type]
  );

  const prefilledMessage = useMemo(
    () => {
      let message = `⚠️ EMERGENCY\n`;
      message += `Type: ${type || "Unknown"}\n`;
      message += `From: ${userName || "UniMate User"}\n\n`;
      message += `I need help. Please contact me as soon as you can.\n`;

      // Add medical card information if available
      if (medicalInfo) {
        message += `\n📋 MEDICAL INFORMATION:\n`;

        if (medicalInfo.blood_type) {
          message += `🩸 Blood Type: ${medicalInfo.blood_type}\n`;
        }

        if (medicalInfo.allergies) {
          message += `⚠️ Allergies: ${medicalInfo.allergies}\n`;
        }

        if (medicalInfo.medications) {
          message += `💊 Medications: ${medicalInfo.medications}\n`;
        }

        if (medicalInfo.emergency_conditions) {
          message += `🏥 Emergency Conditions: ${medicalInfo.emergency_conditions}\n`;
        }

        if (medicalInfo.preferred_clinic) {
          message += `🏥 Preferred Clinic: ${medicalInfo.preferred_clinic}\n`;
        }
      }

      return encodeURIComponent(message);
    },
    [type, userName, medicalInfo]
  );

  const sanitizeForWhatsApp = (phone: string) => {
    // WhatsApp expects an international number without leading zeros/spaces/dashes
    // Format: country code + phone number (e.g., 60123456789 for Malaysia)
    let cleaned = phone.trim().replace(/[^\d+]/g, ""); // Remove all except digits and +

    // If starts with +, remove it (WhatsApp doesn't need + in the URL)
    if (cleaned.startsWith('+')) {
      cleaned = cleaned.substring(1);
    }

    // If it's a local Malaysian number starting with 0, replace it with country code 60
    if (cleaned.startsWith('0')) {
      cleaned = '60' + cleaned.substring(1);
    }

    console.log('WhatsApp number formatted:', phone, '→', cleaned);
    return cleaned;
  };

  const openWhatsApp = async (phone: string, contactName: string) => {
    const formattedNumber = sanitizeForWhatsApp(phone);

    // Validate that we have a number
    if (!formattedNumber || formattedNumber.length < 10) {
      Alert.alert(
        "Invalid Phone Number",
        `The phone number "${phone}" appears to be invalid. Please update the contact with a valid phone number including country code.`
      );
      return;
    }

    // Decode message for preview
    const messagePreview = decodeURIComponent(prefilledMessage);
    const previewLength = 200; // Show first 200 characters
    const truncatedPreview = messagePreview.length > previewLength
      ? messagePreview.substring(0, previewLength) + "..."
      : messagePreview;

    // Show confirmation alert with message preview
    Alert.alert(
      "Send Emergency Message",
      `You are about to send an emergency message to ${contactName}.\n\nMessage preview:\n\n${truncatedPreview}\n\n${medicalInfo ? "⚕️ This message includes your medical card information." : ""}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send via WhatsApp",
          onPress: async () => {
            // WhatsApp URL format: wa.me/{country_code}{phone_number}?text={message}
            const whatsappUrl = `https://wa.me/${formattedNumber}?text=${prefilledMessage}`;

            console.log('Opening WhatsApp URL:', whatsappUrl);

            try {
              const canOpen = await Linking.canOpenURL(whatsappUrl);
              if (canOpen) {
                await Linking.openURL(whatsappUrl);
              } else {
                Alert.alert(
                  "WhatsApp Not Available",
                  "WhatsApp is not installed on this device. Please install WhatsApp or use the Call option."
                );
              }
            } catch (e) {
              console.error('WhatsApp error:', e);
              Alert.alert(
                "Unable to Open WhatsApp",
                `Could not open WhatsApp. Error: ${e instanceof Error ? e.message : 'Unknown error'}`
              );
            }
          },
        },
      ]
    );
  };

  const sanitizeForCall = (phone: string) => {
    // Format phone number for tel: URL (international format with +)
    let cleaned = phone.trim().replace(/[^\d+]/g, "");

    // Ensure it has + prefix for international format
    if (!cleaned.startsWith('+')) {
      // If starts with 0, it's a local Malaysian number
      if (cleaned.startsWith('0')) {
        cleaned = '+60' + cleaned.substring(1);
      } else if (!cleaned.startsWith('60')) {
        // If no country code at all, add Malaysia
        cleaned = '+60' + cleaned;
      } else {
        // Already has 60, just add +
        cleaned = '+' + cleaned;
      }
    }

    console.log('Call number formatted:', phone, '→', cleaned);
    return cleaned;
  };

  const callNumber = async (phone: string) => {
    const formattedNumber = sanitizeForCall(phone);
    const url = Platform.select({
      ios: `telprompt:${formattedNumber}`,
      android: `tel:${formattedNumber}`
    })!;

    try {
      const can = await Linking.canOpenURL(url);
      if (can) {
        await Linking.openURL(url);
      } else {
        Alert.alert("Cannot place call", "Calling is not supported on this device.");
      }
    } catch (e) {
      console.error('Call error:', e);
      Alert.alert("Call failed", "We couldn't start the call.");
    }
  };

  const renderItem = ({ item }: { item: Contact }) => (
    <View style={styles.card}>
      <View style={styles.cardLeft}>
        <View style={styles.avatar}>
          <MaterialCommunityIcons name="account" size={25} color="#ffb400" />
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
          style={[styles.actionBtn, { backgroundColor: "#73ae52" }]}
          onPress={() => openWhatsApp(item.phone, item.name)}
          activeOpacity={0.9}
        >
          <MaterialCommunityIcons name="whatsapp" size={18} color="#fbf1d7" />
          <Text style={[styles.actionText, { color: "#fbf1d7" }]}>WhatsApp</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: "#fbf1d7" }]}
          onPress={() => callNumber(item.phone)}
          activeOpacity={0.9}
        >
          <MaterialCommunityIcons name="phone" size={18} color="#73ae52" />
          <Text style={[styles.actionText, { color: "#73ae52" }]}>Call</Text>
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
        colors={["#fbf1d7", "#73ae52"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGrad}
      >
        <Text style={styles.title}>{headerTitle}</Text>
        <Text style={styles.caption}>Choose your trusted contact to notify</Text>
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
  fill: { flex: 1, backgroundColor: "#f8f8f8ff" },

  headerGrad: {
    paddingHorizontal: 25,
    paddingTop: 30,
    paddingBottom: 30,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  caption: { fontFamily: fonts.body, fontSize: 14, color: "rgba(0, 0, 0, 0.95)", marginTop: 4, textAlign: "center"},
  title: { fontFamily: fonts.heading, fontSize: 30, fontWeight:600, color: "#116a23ff", textAlign: "center"},

  card: {
    backgroundColor: "#fff",
    borderRadius: 30,
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
    borderRadius: 20,
    backgroundColor: "#006a57",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  name: { fontFamily: fonts.heading, fontSize: 20, fontWeight:500, color: "#111" },
  phone: { marginTop: 2, fontFamily: fonts.body, fontSize: 14, color: "rgba(0,0,0,0.65)" },

  chip: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#ffb400",
    borderRadius: 30,
    marginTop: 6,
  },
  chipText: { fontSize: 14, fontWeight:500, color: "#006a57", fontFamily: fonts.body },

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
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 30,
  },
  actionText: { fontFamily: fonts.heading, fontSize: 12, fontWeight:500 },

  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 40, paddingHorizontal: 20 },
  emptyText: { marginTop: 10, textAlign: "center", color: "rgba(0,0,0,0.55)", fontFamily: fonts.body, fontSize: 12 },
  emptyBtn: { marginTop: 10, backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  emptyBtnText: { color: "#fff", fontFamily: fonts.heading },

  bottomBar: { padding: 16, paddingTop: 0 },
  backBtn: {
    alignSelf: "center",
    backgroundColor: "#006a57",
    paddingHorizontal: 25,
    paddingVertical: 10,
    borderRadius: 20,
  },
  backText: { color: "#ffb400", fontFamily: fonts.heading },
});
