// src/components/CompletionModal.tsx
import React from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import { fonts } from "../theme/typography";
import { colors } from "../theme/colors";

const { width } = Dimensions.get("window");

type Props = {
  visible: boolean;
  title?: string;
  onClaim: () => void;
  onClose: () => void;
};

export default function CompletionModal({ visible, title = "Challenge Complete", onClaim, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.tickWrap}>
            <Text style={styles.tick}>✅</Text>
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>Congratulations — you have finished the challenge. Click claim button to collect coins, it will automatically return to homepage, do not spam it.</Text>

          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, styles.claim]} onPress={onClaim}>
              <Text style={styles.claimText}>Claim</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.btn, styles.close]} onPress={onClose}>
              <Text style={styles.closeText}>Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(17,17,17,0.6)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  card: {
    width: Math.min(480, width - 40),
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 22,
    alignItems: "center",
  },
  tickWrap: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: "rgba(110, 200, 120, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  tick: { fontSize: 36 },
  title: { fontFamily: fonts.heading, fontSize: 20, fontWeight: 600, color: "#111", marginBottom: 6, textAlign: "center" },
  subtitle: { fontFamily: fonts.body, fontSize: 14, fontWeight: 500, color: "rgba(0,0,0,0.6)", textAlign: "center", marginBottom: 18 },

  actions: { flexDirection: "row", width: "100%", justifyContent: "space-between" },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  claim: { backgroundColor: colors.secondary, marginRight: 8 },
  close: { backgroundColor: "#F3F3F4", marginLeft: 8 },

  claimText: { color: "#fff", fontFamily: fonts.heading },
  closeText: { color: "#333", fontFamily: fonts.body },
});
