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
  /** show/hide — support both names to keep calls simple */
  visible?: boolean;
  open?: boolean;

  /** value sources (any one works) */
  value?: Date;
  date?: Date;
  initialDate?: Date;

  minimumDate?: Date;
  maximumDate?: Date;

  /** handlers (both names supported; only onConfirm is required) */
  onClose?: () => void;
  onCancel?: () => void;
  onConfirm: (date: Date) => void;

  title?: string;
};

export default function CustomDatePicker(props: CommonProps) {
  const {
    visible,
    open,
    value,
    date,
    initialDate,
    minimumDate,
    maximumDate,
    onClose,
    onCancel,
    onConfirm,
    title = "Pick a date",
  } = props;

  const isVisible = (visible ?? open) ?? false;
  const starting = useMemo(
    () => value ?? date ?? initialDate ?? new Date(),
    [value, date, initialDate]
  );
  const [temp, setTemp] = useState<Date>(starting);

  useEffect(() => {
    if (isVisible) setTemp(starting);
  }, [starting, isVisible]);

  // ANDROID: use the native Material dialog (calendar)
  const openedRef = useRef(false);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    if (!isVisible || openedRef.current) return;

    openedRef.current = true;

    DateTimePickerAndroid.open({
      value: starting,
      mode: "date",
      display: "calendar",
      minimumDate,
      maximumDate,
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
    // parent should flip visible -> false after this callback fires
  }, [isVisible, starting, minimumDate, maximumDate, onCancel, onClose, onConfirm]);

  // If Android, we render nothing (dialog is handled imperatively)
  if (Platform.OS === "android") return null;

  // ---- iOS bottom sheet (unchanged) ----
  const handleDismiss = () => {
    if (onCancel) onCancel();
    else if (onClose) onClose();
  };

  const handleConfirm = () => onConfirm(temp);

  if (!isVisible) return null;

  // iOS bottom sheet with spinner
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
            mode="date"
            display="spinner"
            minimumDate={minimumDate}
            maximumDate={maximumDate}
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
