// src/screens/LighthouseTrustedContactsScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
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

type Contact = {
  id: string;
  name: string;
  phone: string;
  relation: string;
};

const STORAGE_KEY = "trusted_contacts_v1";
const LEAVE = require("../../assets/leave.png");

export default function LighthouseTrustedContactsScreen() {
  const navigation = useNavigation<any>();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);

  const nameRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const relationRef = useRef<TextInput>(null);

  // local draft state for modal
  const [draftName, setDraftName] = useState("");
  const [draftPhone, setDraftPhone] = useState("");
  const [draftRelation, setDraftRelation] = useState("");

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
    setDraftRelation("");
    setSheetVisible(true);
    setTimeout(() => nameRef.current?.focus(), 80);
  };

  const openEdit = (c: Contact) => {
    setEditing(c);
    setDraftName(c.name);
    setDraftPhone(c.phone);
    setDraftRelation(c.relation);
    setSheetVisible(true);
    setTimeout(() => nameRef.current?.focus(), 80);
  };

  const onSave = () => {
    const name = draftName.trim();
    const phone = draftPhone.trim();
    const relation = draftRelation.trim();
    if (!name || !phone) {
      Alert.alert("Missing info", "Please fill at least name and phone.");
      return;
    }

    if (editing) {
      const next = contacts.map((c) =>
        c.id === editing.id ? { ...c, name, phone, relation } : c
      );
      saveContacts(next);
    } else {
      const id = `c_${Date.now()}`;
      saveContacts([{ id, name, phone, relation }, ...contacts]);
    }
    setSheetVisible(false);
  };

  const onDelete = (id: string) => {
    Alert.alert("Remove contact", "Are you sure you want to remove this contact?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => saveContacts(contacts.filter((c) => c.id !== id)),
      },
    ]);
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

      <View style={styles.cardActions}>
        {/* Call button removed */}
        <TouchableOpacity style={styles.iconBtn} onPress={() => openEdit(item)}>
          <MaterialCommunityIcons name="pencil" size={18} color="#333" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={() => onDelete(item.id)}>
          <MaterialCommunityIcons name="trash-can-outline" size={18} color="#C62828" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const empty = useMemo(
    () => (
      <View style={styles.empty}>
        <MaterialCommunityIcons name="account-group" size={46} color="rgba(0,0,0,0.25)" />
        <Text style={styles.emptyText}>
          Add your parents, close friends or guardians so you can reach them quickly.
        </Text>
      </View>
    ),
    []
  );

  return (
    <SafeAreaView style={styles.fill}>
      {/* Top bar with leave button (back to Lighthouse) */}
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

      {/* Header gradient */}
      <LinearGradient
        colors={["#E9E2FF", "#FBE9D6"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGrad}
      >
        <Text style={styles.title}>Trusted Contacts</Text>
        <Text style={styles.subtitle}>People you can reach quickly in an emergency</Text>
      </LinearGradient>

      <FlatList
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        data={contacts}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        ListEmptyComponent={empty}
      />

      {/* Add button */}
      <TouchableOpacity style={styles.fab} onPress={openAdd} activeOpacity={0.9}>
        <MaterialCommunityIcons name="plus" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Add/Edit modal */}
      <Modal visible={sheetVisible} transparent animationType="slide" onRequestClose={() => setSheetVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.select({ ios: "padding", android: undefined })}
          style={styles.modalWrap}
        >
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setSheetVisible(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editing ? "Edit Contact" : "New Contact"}</Text>

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
              returnKeyType="next"
              onSubmitEditing={() => relationRef.current?.focus()}
            />

            <Text style={[styles.label, { marginTop: 10 }]}>Relationship</Text>
            <TextInput
              ref={relationRef}
              value={draftRelation}
              onChangeText={setDraftRelation}
              placeholder="Mother / Father / Friend"
              style={styles.input}
              placeholderTextColor="rgba(0,0,0,0.35)"
              returnKeyType="done"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => setSheetVisible(false)}>
                <Text style={[styles.btnText, { color: "#111" }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={onSave}>
                <Text style={[styles.btnText, { color: "#fff" }]}>{editing ? "Save" : "Add"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#F6F6F8" },

  topBar: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  headerGrad: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 22,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  title: { fontFamily: fonts.heading, fontSize: 22, color: "#111" },
  subtitle: { marginTop: 6, fontFamily: fonts.body, fontSize: 12, color: "rgba(0,0,0,0.6)" },

  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardLeft: { flex: 1, flexDirection: "row", alignItems: "center" },
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

  cardActions: { flexDirection: "row", alignItems: "center" },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: "#F3F1FA",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },

  fab: {
    position: "absolute",
    right: 18,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
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
  modalTitle: { fontFamily: fonts.heading, fontSize: 18, color: "#111", marginBottom: 10 },
  label: { fontFamily: fonts.body, fontSize: 12, color: "#333", marginBottom: 6 },
  input: {
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.06)",
    paddingHorizontal: 12,
    fontFamily: fonts.body,
    color: "#111",
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
  btnPrimary: { backgroundColor: colors.primary, marginLeft: 10 },
  btnGhost: { backgroundColor: "rgba(0,0,0,0.06)" },
  btnText: { fontFamily: fonts.heading, fontSize: 14 },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 40, paddingHorizontal: 20 },
  emptyText: { marginTop: 10, textAlign: "center", color: "rgba(0,0,0,0.55)", fontFamily: fonts.body, fontSize: 12 },
});
