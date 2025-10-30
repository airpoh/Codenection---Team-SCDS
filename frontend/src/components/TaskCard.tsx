import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { fonts, fontSize } from "../theme/typography";

type Props = {
  title: string;
  start: Date;
  end: Date;
  colors?: [string, string];
  onDelete?: () => void;
};

function fmtTime(d: Date) {
  try {
    return new Intl.DateTimeFormat("en-MY", {
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  } catch {
    const h = d.getHours();
    const m = d.getMinutes().toString().padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    const hh = ((h + 11) % 12) + 1;
    return `${hh}:${m} ${ampm}`;
  }
}

export default function TaskCard({ title, start, end, colors = ["#EADBF7", "#F3D9A6"], onDelete }: Props) {
  const minutes = Math.max(0, Math.round((+end - +start) / 60000));

  return (
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
      {onDelete ? (
        <View style={styles.header}>
          <Text numberOfLines={2} style={styles.title}>
            {title}
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity onPress={onDelete} style={styles.iconBtn}>
              <MaterialCommunityIcons name="delete" size={18} color="#d32f2f" />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <Text numberOfLines={2} style={styles.title}>
          {title}
        </Text>
      )}

      <View style={styles.row}>
        <View style={[styles.timeBlock, { alignItems: "flex-start" }]}>
          <Text style={[styles.time, { textAlign: "left" }]}>{fmtTime(start)}</Text>
          <Text style={[styles.timeLabel, { textAlign: "left" }]}>Start</Text>
        </View>

        <View style={styles.durationChip}>
          <Text style={styles.durationText}>{minutes} min</Text>
        </View>

        <View style={[styles.timeBlock, { alignItems: "flex-end" }]}>
          <Text style={[styles.time, { textAlign: "right" }]}>{fmtTime(end)}</Text>
          <Text style={[styles.timeLabel, { textAlign: "right" }]}>End</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 30,
    padding: 20,
    marginHorizontal: 15,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 15,
  },
  // ⬇️ Bold the task name
  title: {
    flex: 1,
    fontFamily: fonts.heading,
    fontSize: 20,
    fontWeight: "700",
    color: "#fbf9f9ff",
    marginBottom: 15,
    lineHeight: 20,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginLeft: 8,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  timeBlock: { flex: 1 },
  time: { fontFamily: fonts.heading, fontSize: 14, fontWeight: 600, color: "#fbf9f9ff" },
  timeLabel: {
    marginTop: 5,
    fontFamily: fonts.body,
    fontSize: 14,
    color: "rgba(251, 251, 251, 0.55)",
  },
  durationChip: {
    paddingHorizontal: 20,
    height: 40,
    borderRadius: 30,
    backgroundColor: "rgba(247, 247, 247, 0.21)",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 20,
  },
  durationText: { fontFamily: fonts.body, fontSize: 14, fontWeight: 500, color: "#2d2d2d" },
});
