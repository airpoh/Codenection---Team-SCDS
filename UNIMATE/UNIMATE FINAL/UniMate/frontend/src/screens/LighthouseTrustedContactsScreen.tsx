// src/screens/LighthouseTrustedContactsScreen.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useNavigation } from "@react-navigation/native";
import { colors } from "../theme/colors";
import { fonts } from "../theme/typography";
import { apiService } from "../services/api";
import { useAuth } from "../contexts/AuthContext";

type Contact = {
  id: string;
  name: string;
  phone: string;
  relation: string;
};

const STORAGE_KEY = "trusted_contacts_v1";
const LEAVE = require("../../assets/leave.png");

// Backend enum values for relation field
const RELATION_OPTIONS = [
  { label: "Family", value: "family" },
  { label: "Friend", value: "friend" },
  { label: "Roommate", value: "roommate" },
  { label: "Advisor", value: "advisor" },
  { label: "Other", value: "other" },
];

export default function LighthouseTrustedContactsScreen() {
  const navigation = useNavigation<any>();
  const { isAuthenticated, token } = useAuth();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);

  const nameRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);

  // local draft state for modal
  const [draftName, setDraftName] = useState("");
  const [draftPhone, setDraftPhone] = useState("");
  const [draftRelation, setDraftRelation] = useState("");

  useEffect(() => {
    console.log('[LighthouseContacts] useEffect triggered, isAuthenticated:', isAuthenticated, 'hasToken:', !!token);
    loadContacts();
  }, [isAuthenticated, token]);  // Reload when authentication status or token changes

  const loadContacts = async () => {
    console.log('[LighthouseContacts] loadContacts called, isAuthenticated:', isAuthenticated, 'hasToken:', !!token);
    // Try loading from backend first - check for token directly
    const hasAuth = isAuthenticated && !!token;
    if (hasAuth) {
      console.log('[LighthouseContacts] Attempting to load from backend...');
      try {
        const response = await apiService.getTrustedContacts();
        console.log('[LighthouseContacts] Backend response:', { success: response.success, contactCount: response.contacts?.length });
        if (response.success && response.contacts) {
          // Transform backend contacts to frontend format
          const backendContacts = response.contacts.map((contact: any) => ({
            id: contact.id,
            name: contact.name,
            phone: contact.phone,
            relation: contact.relation || "",
          }));
          setContacts(backendContacts);
          // Also save to AsyncStorage for offline access
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(backendContacts));
          console.log('[LighthouseContacts] Loaded', backendContacts.length, 'contacts from backend');
          return;
        } else {
          console.warn('[LighthouseContacts] Backend returned no contacts or failed:', response.error);
        }
      } catch (e) {
        console.warn("[LighthouseContacts] Failed to load contacts from backend:", e);
      }
    } else {
      console.log('[LighthouseContacts] Not authenticated, skipping backend load');
    }

    // Fallback to AsyncStorage
    console.log('[LighthouseContacts] Loading from AsyncStorage...');
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      setContacts(Array.isArray(arr) ? arr : []);
    } catch (e) {
      console.warn("load contacts error", e);
    }
  };

  const saveContacts = async (next: Contact[]) => {
    setContacts(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      console.warn("save contacts error", e);
    }
  };

  const openAdd = () => {
    setEditing(null);
    setDraftName("");
    setDraftPhone("");
    setDraftRelation("family"); // Default to family
    setSheetVisible(true);
    setTimeout(() => nameRef.current?.focus(), 80);
  };

  const openEdit = (c: Contact) => {
    setEditing(c);
    setDraftName(c.name);
    setDraftPhone(c.phone);
    setDraftRelation(c.relation || "family"); // Fallback to family if empty
    setSheetVisible(true);
    setTimeout(() => nameRef.current?.focus(), 80);
  };

  const onSave = async () => {
    const name = draftName.trim();
    const phone = draftPhone.trim();
    const relation = draftRelation.trim();
    if (!name || !phone) {
      Alert.alert("Missing info", "Please fill at least name and phone.");
      return;
    }

    const hasAuth = isAuthenticated && !!token;
    console.log('[LighthouseContacts] onSave called, hasAuth:', hasAuth);

    if (editing) {
      // Update existing contact
      if (hasAuth) {
        console.log('[LighthouseContacts] Updating contact via API:', editing.id);
        try {
          const response = await apiService.updateTrustedContact(editing.id, {
            name,
            phone,
            relation: relation,
          });
          if (response.success) {
            // Update succeeded, reload from backend
            await loadContacts();
          } else {
            console.log("Failed to update contact:", response.error);
            // Fallback to local update
            const next = contacts.map((c) =>
              c.id === editing.id ? { ...c, name, phone, relation } : c
            );
            saveContacts(next);
          }
        } catch (error) {
          console.log("Error updating contact:", error);
          // Fallback to local update
          const next = contacts.map((c) =>
            c.id === editing.id ? { ...c, name, phone, relation } : c
          );
          saveContacts(next);
        }
      } else {
        // No token, update locally
        const next = contacts.map((c) =>
          c.id === editing.id ? { ...c, name, phone, relation } : c
        );
        saveContacts(next);
      }
    } else {
      // Add new contact
      if (hasAuth) {
        console.log('[LighthouseContacts] Adding new contact via API');
        try {
          const response = await apiService.addTrustedContact({
            name,
            phone,
            relation: relation,
          });
          console.log('[LighthouseContacts] Add contact response:', { success: response.success, error: response.error });
          if (response.success) {
            // Add succeeded, reload from backend
            console.log('[LighthouseContacts] Contact added successfully, reloading...');
            await loadContacts();
          } else {
            console.log("[LighthouseContacts] Failed to add contact:", response.error);
            // Fallback to local add
            const id = `c_${Date.now()}`;
            saveContacts([{ id, name, phone, relation }, ...contacts]);
          }
        } catch (error) {
          console.log("Error adding contact:", error);
          // Fallback to local add
          const id = `c_${Date.now()}`;
          saveContacts([{ id, name, phone, relation }, ...contacts]);
        }
      } else {
        // No token, add locally
        const id = `c_${Date.now()}`;
        saveContacts([{ id, name, phone, relation }, ...contacts]);
      }
    }
    setSheetVisible(false);
  };

  const onDelete = async (id: string) => {
    const hasAuth = isAuthenticated && !!token;
    Alert.alert("Remove contact", "Are you sure you want to remove this contact?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          if (hasAuth) {
            console.log('[LighthouseContacts] Deleting contact via API:', id);
            try {
              const response = await apiService.deleteTrustedContact(id);
              if (response.success) {
                // Delete succeeded, reload from backend
                await loadContacts();
              } else {
                console.log("Failed to delete contact:", response.error);
                // Fallback to local delete
                saveContacts(contacts.filter((c) => c.id !== id));
              }
            } catch (error) {
              console.log("Error deleting contact:", error);
              // Fallback to local delete
              saveContacts(contacts.filter((c) => c.id !== id));
            }
          } else {
            // No token, delete locally
            saveContacts(contacts.filter((c) => c.id !== id));
          }
        },
      },
    ]);
  };

  /** ---------- UI (Resources-style) ---------- */

  const Header = () => (
    <LinearGradient
      colors={["#fbf1d7", "#73ae52"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <View style={{ width: 28 }} />
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            onPress={() => navigation.navigate("Lighthouse")}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Image source={LEAVE} style={{ width: 24, height: 24 }} />
          </TouchableOpacity>
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 }}>
          <Text style={styles.heading}>Trusted Contacts</Text>
          <Text style={styles.sub}>
            People you can reach quickly in an emergency
          </Text>
        </View>

        {/* Section container (same shape as Resources screen) */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="account-group" size={30} color="#73ae52" />
            <Text style={styles.sectionTitle}>  Your People</Text>
          </View>

          {/* The list lives here */}
          <FlatList
            contentContainerStyle={{ paddingBottom: 90 }}
            data={contacts}
            keyExtractor={(i) => i.id}
            renderItem={({ item }) => {
              // Find the label for the relation value
              const relationLabel = RELATION_OPTIONS.find(opt => opt.value === item.relation)?.label || item.relation;

              return (
                <ContactCard
                  name={item.name}
                  phone={item.phone}
                  relation={relationLabel}
                  onEdit={() => openEdit(item)}
                  onDelete={() => onDelete(item.id)}
                />
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <MaterialCommunityIcons
                  name="account-plus"
                  size={40}
                  color="rgba(0,0,0,0.25)"
                />
                <Text style={styles.emptyText}>
                  Add your parents, close friends or guardians so you can reach
                  them quickly.
                </Text>
              </View>
            }
          />
        </View>
      </SafeAreaView>
    </LinearGradient>
  );

  return (
    <View style={{ flex: 1 }}>
      <Header />

      {/* Add button (floating) */}
      <TouchableOpacity style={styles.fab} onPress={openAdd} activeOpacity={0.9}>
        <MaterialCommunityIcons name="plus" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Add/Edit modal (logic unchanged) */}
      <Modal
        visible={sheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.select({ ios: "padding", android: undefined })}
          style={styles.modalWrap}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setSheetVisible(false)}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editing ? "Edit Contact" : "New Contact"}
            </Text>

            <Text style={styles.label}>Name</Text>
            <TextInput
              ref={nameRef}
              value={draftName}
              onChangeText={setDraftName}
              placeholder="e.g. Mom"
              style={styles.input}
              placeholderTextColor="rgba(0,0,0,0.35)"
              returnKeyType="next"
              onSubmitEditing={() => phoneRef.current?.focus()}
            />

            <Text style={[styles.label, { marginTop: 10 }]}>Phone</Text>
            <TextInput
              ref={phoneRef}
              value={draftPhone}
              onChangeText={setDraftPhone}
              keyboardType="phone-pad"
              placeholder="0123456789"
              style={styles.input}
              placeholderTextColor="rgba(0,0,0,0.35)"
              returnKeyType="done"
            />

            {/* Relationship: options instead of free text */}
            <Text style={[styles.label, { marginTop: 10 }]}>Relationship</Text>
            <View style={styles.chipsRow}>
              {RELATION_OPTIONS.map((option) => {
                const selected = draftRelation === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setDraftRelation(option.value)}
                    style={[styles.chip, selected && styles.chipSelected]}
                    activeOpacity={0.9}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.btn, styles.btnGhost]}
                onPress={() => setSheetVisible(false)}
              >
                <Text style={[styles.btnText, { color: "#111" }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary]}
                onPress={onSave}
              >
                <Text style={[styles.btnText, { color: "#fff" }]}>
                  {editing ? "Save" : "Add"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

/* ---------- Presentational Card (Resources-style) ---------- */
function ContactCard({
  name,
  phone,
  relation,
  onEdit,
  onDelete,
}: {
  name: string;
  phone: string;
  relation?: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text style={styles.cardTitle}>{name}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
          <MaterialCommunityIcons name="phone" size={20} color="#73ae52" />
          <Text style={styles.cardPhone}>  {phone}</Text>
        </View>
      </View>

      <View style={{ alignItems: "flex-end" }}>
        {/* Right-side "pill" just like Resources screen */}
        <View style={styles.pill}>
          <Text style={styles.pillText}>{relation ? relation : "Contact"}</Text>
        </View>

        <View style={styles.rowBtns}>
          <TouchableOpacity style={styles.iconBtn} onPress={onEdit}>
            <MaterialCommunityIcons name="pencil" size={18} color="#333" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: "#ffe9e8" }]}
            onPress={onDelete}
          >
            <MaterialCommunityIcons name="trash-can-outline" size={18} color="#C62828" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

/* ---------- Styles (mirrors LighthouseResourcesScreen palette) ---------- */
const styles = StyleSheet.create({
  topBar: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  heading: {
    fontFamily: fonts.heading,
    fontSize: 30,
    fontWeight: "700" as any,
    textAlign: "center",
    color: "#111",
  },
  sub: { textAlign: "center", color: "rgba(0,0,0,0.6)", marginTop: 6, fontSize: 14 },

  sectionWrap: {
    flex: 1,
    margin: 16,
    marginTop: 14,
    backgroundColor: "#FFF5E5",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  sectionTitle: { fontFamily: fonts.heading, color: "#73ae52", fontSize: 20, fontWeight: "500" as any },

  // list empty
  emptyBox: { alignItems: "center", paddingVertical: 26, paddingHorizontal: 16 },
  emptyText: { marginTop: 8, textAlign: "center", color: "rgba(0,0,0,0.55)", fontFamily: fonts.body, fontSize: 12 },

  // contact card
  card: {
    marginTop: 10,
    padding: 15,
    borderRadius: 20,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTitle: { fontFamily: fonts.heading, fontSize: 20, fontWeight:500, color: "#111" },
  cardPhone: { fontFamily: fonts.body, color: "#111", fontSize: 14 },

  pill: {
    backgroundColor: "#ffb400",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 30,
    alignSelf: "flex-end",
  },
  pillText: { fontSize: 14, color: "#f1f3f2ff", fontFamily: fonts.body },

  rowBtns: { flexDirection: "row", marginTop: 8, alignSelf: "flex-end" },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: "#eef2f1",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },

  fab: {
    position: "absolute",
    right: 30,
    bottom: 60,
    width: 55,
    height: 55,
    borderRadius: 28,
    backgroundColor: "#ffb400",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },

  // Modal
  modalWrap: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.25)" },
  modalCard: {
    backgroundColor: "#fff",
    padding: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  modalTitle: { fontFamily: fonts.heading, fontSize: 20, fontWeight:500, color: "#111", marginBottom: 20, textAlign: "center"},
  label: { fontFamily: fonts.body, fontSize: 14, fontWeight:500, color: "#333", marginBottom: 10 },
  input: {
    height: 50,
    borderRadius: 30,
    backgroundColor: "rgba(0,0,0,0.06)",
    paddingHorizontal: 15,
    fontFamily: fonts.body,
    color: "#111",
  },

  // chips for relationship selection
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  chipSelected: {
    backgroundColor: "#ffb400",
  },
  chipText: {
    fontFamily: fonts.body,
    color: "#111",
    fontSize: 14,
    fontWeight:500
  },
  chipTextSelected: {
    color: "#fff",
    fontFamily: fonts.heading,
  },

  modalActions: { flexDirection: "row", justifyContent: "flex-end", marginTop: 14 },
  btn: {
    minWidth: 110,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  btnPrimary: { backgroundColor: "#ffb400", marginLeft: 10 },
  btnGhost: { backgroundColor: "rgba(0,0,0,0.06)" },
  btnText: { fontFamily: fonts.heading, fontSize: 14, fontWeight: 500},
});
