import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  Platform,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import DateTimePicker, {
  DateTimePickerEvent,
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";

type CommonProps = {
  visible?: boolean;
  open?: boolean;

  value?: Date;
  time?: Date;
  initialTime?: Date;

  /** iOS only (Android clock ignores minuteInterval) */
  minuteInterval?: 1 | 5 | 10 | 15 | 30;

  onClose?: () => void;
  onCancel?: () => void;
  onConfirm: (time: Date) => void;

  title?: string;
};

export default function CustomTimePicker(props: CommonProps) {
  const {
    visible,
    open,
    value,
    time,
    initialTime,
    minuteInterval = 1,
    onClose,
    onCancel,
    onConfirm,
    title = "Pick a time",
  } = props;

  const isVisible = (visible ?? open) ?? false;
  const starting = useMemo(
    () => value ?? time ?? initialTime ?? new Date(),
    [value, time, initialTime]
  );
  const [temp, setTemp] = useState<Date>(starting);

  useEffect(() => {
    if (isVisible) setTemp(starting);
  }, [starting, isVisible]);

  // ANDROID: use the native Material dialog (clock)
  const openedRef = useRef(false);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    if (!isVisible || openedRef.current) return;

    openedRef.current = true;

    DateTimePickerAndroid.open({
      value: starting,
      mode: "time",
      display: "clock", // Material-style clock like your good screenshot
      onChange: (ev: DateTimePickerEvent, d?: Date) => {
        openedRef.current = false;
        if (ev.type === "set" && d) {
          onConfirm(d);
        } else {
          if (onCancel) onCancel();
          else if (onClose) onClose();
        }
      },
    });
  }, [isVisible, starting, onCancel, onClose, onConfirm]);

  // If Android, render nothing (dialog is handled imperatively)
  if (Platform.OS === "android") return null;

  // ---- iOS bottom sheet (unchanged) ----
  const handleDismiss = () => {
    if (onCancel) onCancel();
    else if (onClose) onClose();
  };

  const handleConfirm = () => onConfirm(temp);

  if (!isVisible) return null;

  return (
    <Modal
      visible
      animationType="slide"
      transparent
      onRequestClose={handleDismiss}
      presentationStyle="overFullScreen"
    >
      <View style={styles.fullContainer}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleDismiss} />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable onPress={handleConfirm} style={styles.doneBtn}>
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          </View>

          <DateTimePicker
            value={temp}
            mode="time"
            display="spinner"
            minuteInterval={minuteInterval}
            onChange={(_: DateTimePickerEvent, d?: Date) => d && setTemp(d)}
            style={styles.iosPicker}
            textColor="#000"
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fullContainer: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.59)" },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingBottom: 50,
  },
  sheetHeader: {
    paddingHorizontal: 25,
    paddingTop: 20,
    paddingBottom: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  sheetTitle: { fontSize: 20, fontWeight: "700", color: "#000" },
  doneBtn: {
    height: 35,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 30,
    backgroundColor: "#E89C3C",
  },
  doneText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  iosPicker: { alignSelf: "center", height: 200 },
});
