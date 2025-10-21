import React from "react";
import { Modal, View, StyleSheet, Text, Pressable, Dimensions } from "react-native";
import { colors } from "../theme/colors";
import { fonts, fontSize } from "../theme/typography";

const { height } = Dimensions.get("window");
const SHEET_RADIUS = 28;

type Props = {
  visible: boolean;
  title: string;
  description: string;
  canEnter?: boolean;
  onEnter?: () => void;
  onClose: () => void;
};

export default function BuildingSheet({
  visible,
  title,
  description,
  canEnter,
  onEnter,
  onClose,
}: Props) {
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.desc}>{description}</Text>

          <View style={{ height: 14 }} />

          {canEnter ? (
            <Pressable style={[styles.btn, styles.btnPrimary]} onPress={onEnter}>
              <Text style={[styles.btnLabel, { color: colors.textWhite }]}>Enter Building</Text>
            </Pressable>
          ) : (
            <View style={[styles.btn, styles.btnComingSoon]}>
              <Text style={[styles.btnLabel, { color: "#2a2a2a" }]}>Coming Soon</Text>
            </View>
          )}

          <Pressable style={[styles.btn, styles.btnSecondary]} onPress={onClose}>
            <Text style={[styles.btnLabel, { color: "#5b5b5b" }]}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.15)" },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24 + height * 0.03,
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    backgroundColor: "#e6e6e6",
    borderRadius: 3,
    marginVertical: 10,
  },
  title: { fontFamily: fonts.heading, fontSize: 24, fontWeight: 600, textAlign: "center", color: colors.textBlack, marginBottom: 6 },
  desc: { fontFamily: fonts.body, fontSize: fontSize.body, color: "#4c4c4c", lineHeight: 20 },
  btn: {
    height: 46,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  btnPrimary: { backgroundColor: colors.primaryDark },           // purple
  btnComingSoon: { backgroundColor: colors.secondary },      // yellow
  btnSecondary: { backgroundColor: "rgba(0,0,0,0.06)" },     // grey
  btnLabel: { fontFamily: fonts.body, fontSize: fontSize.body, fontWeight: "600" },
});
