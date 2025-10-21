import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import TaskCard from "../components/TaskCard";
import ReminderCard from "../components/ReminderCard";
import CalendarOverview, { TaskItem } from "../components/CalendarOverview";
import { fonts, fontSize } from "../theme/typography";
import { colors } from "../theme/colors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiService } from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import { parseISO, startOfDay } from "date-fns";

// custom pickers
import CustomDatePicker from "../components/CustomDatePicker";
import CustomTimePicker from "../components/CustomTimePicker";

type Tab = "tasks" | "reminders";
type ViewMode = "today" | "calendar";
type FormType = "task" | "reminder";

type ReminderItem = {
  id: string;
  title: string;
  at: Date;
  colors: [string, string];
};

/** ---- Reward Market shared keys (per-day stamping) ---- */
const K = {
  coins: "rm_coins_total",
  todayEarned: "rm_today_earned",
  taskDates: "rm_task_dates", // actionId -> "YYYY-MM-DD"
};

function todayKey() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Award an earn action once per day and mark it as completed for today. */
async function awardEarnOncePerDay(
  actionId: "login" | "add_task" | "add_reminder",
  points: number
) {
  const [coinsStr, earnedStr, mapStr] = await Promise.all([
    AsyncStorage.getItem(K.coins),
    AsyncStorage.getItem(K.todayEarned),
    AsyncStorage.getItem(K.taskDates),
  ]);

  const coins = coinsStr ? Number(coinsStr) : 0;
  const earned = earnedStr ? Number(earnedStr) : 0;
  const map: Record<string, string> = mapStr ? JSON.parse(mapStr) : {};

  const today = todayKey();
  if (map[actionId] === today) return; // already awarded today

  map[actionId] = today;

  await AsyncStorage.multiSet([
    [K.coins, String(coins + points)],
    [K.todayEarned, String(earned + points)],
    [K.taskDates, JSON.stringify(map)],
  ]);
}

function useTodayInfo() {
  const [now, setNow] = useState(new Date());

  // Update time to sync with local clock
  useEffect(() => {
    // Immediate update on mount to eliminate latency
    setNow(new Date());

    // Calculate milliseconds until next minute
    const currentTime = new Date();
    const msUntilNextMinute = 60000 - (currentTime.getSeconds() * 1000 + currentTime.getMilliseconds());

    // Set timeout to update at the start of next minute
    const timeout = setTimeout(() => {
      setNow(new Date());

      // Then update every minute
      const interval = setInterval(() => {
        setNow(new Date());
      }, 60000);

      return () => clearInterval(interval);
    }, msUntilNextMinute);

    return () => clearTimeout(timeout);
  }, []);

  const dayName = new Intl.DateTimeFormat("en-MY", { weekday: "long" }).format(now);
  const time = new Intl.DateTimeFormat("en-MY", {
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
  const day = now.getDate();
  const month = new Intl.DateTimeFormat("en-MY", { month: "short" })
    .format(now)
    .toUpperCase();
  return { dayName, time, day, month, now };
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function combineDateAndTime(date: Date, time: Date) {
  const d = new Date(date);
  d.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return d;
}
function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const TASK_PALETTES: [string, string][] = [
  ["#FBD5BD", "#463699"],
  ["#463699", "#262335"],
  ["#EEAA11", "#BB3381"],
  ["#EEAA11", "#3F1D50"],
  ["#F09410", "#BC430D"],
  ["#9448B0", "#001C3D"],
];

const REM_PALETTES: [string, string][] = [
  ["#EFC87D", "#4F531F"],
  ["#EFC87D", "#4F531F"],
  ["#4F531F", "#341C02"],
  ["#BC430D", "#241705"],
  ["#F2B635", "#4B5D16"],
  ["#CB6F4A", "#AB4F41"],
];

export default function CalendarScreen() {
  const { dayName, time, day, month, now } = useTodayInfo();
  const year = now.getFullYear();
  const { isAuthenticated } = useAuth();

  // Load tasks from backend
  const loadTasks = async () => {
    if (isAuthenticated) {
      try {
        const response = await apiService.getTasks();
        if (response.success && response.tasks) {
          // Transform backend tasks to frontend format, filter out completed tasks
          const backendTasks = response.tasks
            .filter((task: any) => !task.is_completed) // ✅ Only show incomplete tasks
            .map((task: any, index: number) => {
              // Backend sends starts_at and ends_at, NOT due_date!
              let startTime = task.starts_at ? parseISO(task.starts_at) : new Date();
              let endTime = task.ends_at ? parseISO(task.ends_at) : new Date();

              return {
                id: task.id,
                title: task.title,
                start: startTime, // ✅ Now using correct field
                end: endTime,     // ✅ Now using correct field
                colors: TASK_PALETTES[index % TASK_PALETTES.length],
              };
            });
          // Merge with existing tasks instead of replacing
          setTasks((prevTasks) => {
            const backendIds = new Set(backendTasks.map(t => t.id));
            const localOnly = prevTasks.filter(t => !backendIds.has(t.id));
            return [...backendTasks, ...localOnly];
          });
        }
      } catch (error) {
        console.log('Failed to load tasks from backend:', error);
        // Keep hardcoded tasks as fallback
      }
    }
  };

  // Load reminders from backend
  const loadReminders = async () => {
    if (isAuthenticated) {
      try {
        const response = await apiService.getReminders();
        if (response.success && response.reminders) {
          console.log('[CalendarScreen] Loaded reminders from backend:', response.reminders.length);
          // Transform backend reminders to frontend format
          const backendReminders = response.reminders.map((reminder: any, index: number) => ({
            id: reminder.id,
            title: reminder.title,
            at: reminder.reminder_time ? parseISO(reminder.reminder_time) : new Date(), // Fix: Use parseISO for reliable UTC parsing
            colors: REM_PALETTES[index % REM_PALETTES.length],
          }));
          // Merge with existing reminders instead of replacing
          setReminders((prevReminders) => {
            const backendIds = new Set(backendReminders.map(r => r.id));
            const localOnly = prevReminders.filter(r => !backendIds.has(r.id));
            return [...backendReminders, ...localOnly];
          });
        } else {
          console.log('[CalendarScreen] No reminders from backend, error:', response.error);
        }
      } catch (error) {
        console.log('[CalendarScreen] Failed to load reminders from backend:', error);
        // Keep hardcoded reminders as fallback
      }
    }
  };

  const [tasks, setTasks] = useState<TaskItem[]>([]);

  const [reminders, setReminders] = useState<ReminderItem[]>([]);

  const [taskColorIdx, setTaskColorIdx] = useState(6);
  const [remColorIdx, setRemColorIdx] = useState(2);

  const remaining = tasks.filter((t) => {
    const now = new Date();
    const isToday = sameDay(t.start, now);
    const hasEnded = t.end < now;
    return isToday && !hasEnded;
  }).length;

  const [view, setView] = useState<ViewMode>("today");
  const [tab, setTab] = useState<Tab>("tasks");

  const [chooserVisible, setChooserVisible] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [formType, setFormType] = useState<FormType>("task");

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date(now));
  const [startTime, setStartTime] = useState(new Date(now));
  const [endTime, setEndTime] = useState(new Date(now.getTime() + 30 * 60000));
  const [remTime, setRemTime] = useState(new Date(now));
  const [remindMinutesBefore, setRemindMinutesBefore] = useState("30"); // Default 30 minutes

  // custom modal flags
  const [pickDateOpen, setPickDateOpen] = useState(false);
  const [pickStartOpen, setPickStartOpen] = useState(false);
  const [pickEndOpen, setPickEndOpen] = useState(false);
  const [pickRemOpen, setPickRemOpen] = useState(false);

  // Load data from backend when component mounts and refresh periodically
  useEffect(() => {
    loadTasks();
    loadReminders();

    // Refresh tasks every 2 minutes to get latest completion status
    const refreshInterval = setInterval(() => {
      loadTasks();
      loadReminders();
    }, 120000); // 2 minutes

    return () => clearInterval(refreshInterval);
  }, []);

  function closeForm() {
    setFormVisible(false);
    setTitle("");
    setRemindMinutesBefore("30"); // Reset to default
  }

  function openChooser() {
    setChooserVisible(true);
  }

  function startForm(type: FormType) {
    setFormType(type);
    setTitle("");
    const fresh = new Date();
    setDate(fresh);
    setStartTime(fresh);
    setEndTime(new Date(fresh.getTime() + 30 * 60000));
    setRemTime(fresh);
    setChooserVisible(false);
    setFormVisible(true);
  }

  async function deleteTask(taskId: string) {
    if (isAuthenticated) {
      try {
        const result = await apiService.deleteTask(taskId);
        if (result.success) {
          // Remove from local state
          setTasks((prev) => prev.filter((t) => t.id !== taskId));
        } else {
          console.log('Failed to delete task:', result.error);
          // Still remove locally for offline support
          setTasks((prev) => prev.filter((t) => t.id !== taskId));
        }
      } catch (error) {
        console.log('Error deleting task:', error);
        // Still remove locally
        setTasks((prev) => prev.filter((t) => t.id !== taskId));
      }
    } else {
      // No token, just remove locally
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    }
  }

  async function deleteReminder(reminderId: string) {
    if (isAuthenticated) {
      try {
        const result = await apiService.deleteReminder(reminderId);
        if (result.success) {
          // Remove from local state
          setReminders((prev) => prev.filter((r) => r.id !== reminderId));
        } else {
          console.log('Failed to delete reminder:', result.error);
          // Still remove locally for offline support
          setReminders((prev) => prev.filter((r) => r.id !== reminderId));
        }
      } catch (error) {
        console.log('Error deleting reminder:', error);
        // Still remove locally
        setReminders((prev) => prev.filter((r) => r.id !== reminderId));
      }
    } else {
      // No token, just remove locally
      setReminders((prev) => prev.filter((r) => r.id !== reminderId));
    }
  }


  async function addItem() {
    if (!title.trim()) return;

    if (formType === "task") {
      const start = combineDateAndTime(date, startTime);
      const endRaw = combineDateAndTime(date, endTime);
      const end = endRaw <= start ? new Date(start.getTime() + 30 * 60000) : endRaw;

      // Create task in backend first
      if (isAuthenticated) {
        try {
          // Backend expects starts_at and ends_at, not due_date!
          const taskData = {
            title,
            notes: "", // Optional notes field
            starts_at: start.toISOString(), // ✅ Correct field name
            ends_at: end.toISOString(),     // ✅ Correct field name
            priority: "medium" as const,
            remind_minutes_before: parseInt(remindMinutesBefore) || 30 // ✅ Add reminder field
          };

          const response = await apiService.createTask(taskData);
          if (response.success && response.task) {
            // Add to local state with backend data
            const pair = TASK_PALETTES[taskColorIdx % TASK_PALETTES.length];
            setTaskColorIdx((i) => i + 1);

            const newTask = {
              id: response.task!.id,
              title: response.task!.title,
              start,
              end,
              colors: pair
            };
            console.log('[CalendarScreen] Adding task:', {
              title: newTask.title,
              start: newTask.start.toISOString(),
              end: newTask.end.toISOString(),
              startLocal: newTask.start.toString(),
              now: now.toString(),
              sameDay: sameDay(newTask.start, now)
            });
            setTasks((prev) => [...prev, newTask]);
          } else {
            console.log('Failed to create task in backend:', response.error);
            // Fallback to local task creation
            const pair = TASK_PALETTES[taskColorIdx % TASK_PALETTES.length];
            setTaskColorIdx((i) => i + 1);
            setTasks((prev) => [
              ...prev,
              { id: "t" + Date.now(), title, start, end, colors: pair },
            ]);
          }
        } catch (error) {
          console.log('Error creating task:', error);
          // Fallback to local task creation
          const pair = TASK_PALETTES[taskColorIdx % TASK_PALETTES.length];
          setTaskColorIdx((i) => i + 1);
          setTasks((prev) => [
            ...prev,
            { id: "t" + Date.now(), title, start, end, colors: pair },
          ]);
        }
      } else {
        // No token, fallback to local task creation
        const pair = TASK_PALETTES[taskColorIdx % TASK_PALETTES.length];
        setTaskColorIdx((i) => i + 1);
        setTasks((prev) => [
          ...prev,
          { id: "t" + Date.now(), title, start, end, colors: pair },
        ]);
      }

      // ✅ Award Reward Market: Add a task (+5), once per day
      await awardEarnOncePerDay("add_task", 5);

      if (sameDay(start, new Date())) {
        setView("today");
        setTab("tasks");
      } else {
        setView("calendar");
      }
    } else {
      const at = combineDateAndTime(date, remTime);

      // Create reminder in backend first
      if (isAuthenticated) {
        try {
          const reminderData = {
            title,
            description: "",
            reminder_time: at.toISOString(),
            repeat_type: "once" as const
          };

          const response = await apiService.createReminder(reminderData);
          if (response.success && response.reminder) {
            // Add to local state with backend data
            const pair = REM_PALETTES[remColorIdx % REM_PALETTES.length];
            setRemColorIdx((i) => i + 1);
            setReminders((prev) => [
              ...prev,
              {
                id: response.reminder!.id,
                title: response.reminder!.title,
                at,
                colors: pair
              },
            ]);
          } else {
            console.log('Failed to create reminder in backend:', response.error);
            // Fallback to local reminder creation
            const pair = REM_PALETTES[remColorIdx % REM_PALETTES.length];
            setRemColorIdx((i) => i + 1);
            setReminders((prev) => [
              ...prev,
              { id: "r" + Date.now(), title, at, colors: pair },
            ]);
          }
        } catch (error) {
          console.log('Error creating reminder:', error);
          // Fallback to local reminder creation
          const pair = REM_PALETTES[remColorIdx % REM_PALETTES.length];
          setRemColorIdx((i) => i + 1);
          setReminders((prev) => [
            ...prev,
            { id: "r" + Date.now(), title, at, colors: pair },
          ]);
        }
      } else {
        // No token, fallback to local reminder creation
        const pair = REM_PALETTES[remColorIdx % REM_PALETTES.length];
        setRemColorIdx((i) => i + 1);
        setReminders((prev) => [
          ...prev,
          { id: "r" + Date.now(), title, at, colors: pair },
        ]);
      }

      // ✅ Optional: Add a reminder awards once per day (+10)
      await awardEarnOncePerDay("add_reminder", 10);

      if (sameDay(at, new Date())) {
        setView("today");
        setTab("reminders");
      } else {
        setView("calendar");
      }
    }
    closeForm();
  }

  return (
    <SafeAreaView style={styles.fill}>
      <ScrollView
        contentContainerStyle={styles.container}
        bounces
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={["#fefdffff", "#d4b9f3ff"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.headerCard}
        >
          {/* Switcher + add */}
          <View style={styles.segment}>
            <TouchableOpacity
              onPress={() => setView("today")}
              style={[styles.segmentPill, view === "today" && styles.segmentPillActive]}
            >
              <Text
                style={[styles.segmentText, view === "today" && styles.segmentTextActive]}
              >
                Today
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setView("calendar")}
              style={[styles.segmentPill, view === "calendar" && styles.segmentPillActive]}
            >
              <Text
                style={[styles.segmentText, view === "calendar" && styles.segmentTextActive]}
              >
                Calendar
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.addBtn} onPress={openChooser}>
              <MaterialCommunityIcons
                name="plus-circle-outline"
                size={40}
                color="#8F75D6"
              />
            </TouchableOpacity>
          </View>

          {view === "today" && (
            <>
              <View style={styles.headerRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dayName}>{dayName}</Text>
                  <Text style={styles.bigDay}>{day}</Text>
                  <Text style={styles.bigMonth}>{month}</Text>
                </View>

                <View style={styles.vDivider} />

                <View style={{ flex: 1, paddingLeft: 14 }}>
                  <Text style={styles.rightTime}>{time}</Text>
                  <Text style={styles.rightSub}>MALAYSIA</Text>
                  <View style={{ height: 10 }} />
                  <Text style={styles.rightTime}>{remaining} Tasks</Text>
                  <Text style={styles.rightSub}>Remaining</Text>
                </View>
              </View>

              <View style={styles.innerCard}>
                <View style={styles.innerTabs}>
                  <TouchableOpacity
                    onPress={() => setTab("tasks")}
                    style={[styles.innerTabPill, tab === "tasks" && styles.innerTabActive]}
                  >
                    <Text
                      style={[
                        styles.innerTabText,
                        tab === "tasks" && styles.innerTabTextActive,
                      ]}
                    >
                      Today Tasks
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setTab("reminders")}
                    style={[
                      styles.innerTabPill,
                      tab === "reminders" && styles.innerTabActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.innerTabText,
                        tab === "reminders" && styles.innerTabTextActive,
                      ]}
                    >
                      Reminders
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}
        </LinearGradient>

        {view === "today" ? (
          tab === "tasks" ? (
            <View style={{ marginTop: 12 }}>
              {(() => {
                const now = new Date(); // Get fresh current date and time
                const todayTasks = tasks.filter((t) => {
                  const isToday = sameDay(t.start, now);
                  const hasEnded = t.end < now; // Check if task has already ended
                  const shouldShow = isToday && !hasEnded;
                  console.log('[CalendarScreen] Filter task:', {
                    title: t.title,
                    start: t.start.toString(),
                    end: t.end.toString(),
                    now: now.toString(),
                    isToday,
                    hasEnded,
                    shouldShow
                  });
                  return shouldShow;
                });
                console.log('[CalendarScreen] Today tasks count:', todayTasks.length);
                return todayTasks.map((t) => (
                  <TaskCard
                    key={t.id}
                    title={t.title}
                    start={t.start}
                    end={t.end}
                    colors={(t.colors || TASK_PALETTES[0]) as [string, string]}
                    onDelete={() => deleteTask(t.id)}
                  />
                ));
              })()}
            </View>
          ) : (
            <View style={{ marginTop: 12 }}>
              {(() => {
                // Fix: Show today's AND future reminders, not just today
                const startOfToday = startOfDay(new Date());
                return reminders
                  .filter((r) => r.at >= startOfToday) // Show reminders from today onwards
                  .map((r) => (
                  <ReminderCard
                    key={r.id}
                    title={r.title}
                    at={r.at}
                    colors={(r.colors || REM_PALETTES[0]) as [string, string]}
                    onDelete={() => deleteReminder(r.id)}
                  />
                ));
              })()}
            </View>
          )
        ) : (
          <CalendarOverview tasks={tasks} reminders={reminders} />
        )}

        <View style={{ height: 90 }} />
      </ScrollView>

      {/* CHOOSER */}
      <Modal
        transparent
        visible={chooserVisible}
        animationType="fade"
        onRequestClose={() => setChooserVisible(false)}
      >
        <View style={styles.backdrop} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Add new</Text>
          <View style={styles.choiceRow}>
            <TouchableOpacity
              style={styles.choiceBtn}
              onPress={() => startForm("task")}
            >
              <MaterialCommunityIcons
                name="calendar-clock"
                size={25}
                color="#282525ff"
              />
              <Text style={styles.choiceText}>Task</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.choiceBtn}
              onPress={() => startForm("reminder")}
            >
              <MaterialCommunityIcons name="bell" size={25} color="#282525ff" />
              <Text style={styles.choiceText}>Reminder</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.cancelLink}
            onPress={() => setChooserVisible(false)}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* FORM */}
      {formVisible && !pickDateOpen && !pickStartOpen && !pickEndOpen && !pickRemOpen && (
        <Modal
          transparent
          visible={true}
          animationType="none"
        >
          <View style={styles.backdrop} />
          <View style={styles.formCard}>
          <LinearGradient colors={["#ffeebfff", "#fbdc53ff"]} style={styles.formHeader}>
            <Text style={styles.formTitle}>{formType === "task" ? "Add Task" : "Add Reminder"}</Text>
          </LinearGradient>

          <Text style={styles.label}>Title</Text>
          <TextInput
            placeholder={formType === "task" ? "e.g., Study Session" : "e.g., Take Medicine"}
            placeholderTextColor="rgba(0,0,0,0.35)"
            value={title}
            onChangeText={setTitle}
            style={styles.input}
          />

          {formType === "task" && (
            <>
              <Text style={[styles.label, { marginTop: 12 }]}>Date</Text>
              <TouchableOpacity style={styles.fieldBtn} onPress={() => setPickDateOpen(true)}>
                <MaterialCommunityIcons name="calendar" size={18} color="#333" />
                <Text style={styles.fieldText}>
                  {new Intl.DateTimeFormat("en-MY", { day: "numeric", month: "short", year: "numeric" }).format(date)}
                </Text>
              </TouchableOpacity>
            </>
          )}

          {formType === "task" ? (
            <>
              <View style={styles.timeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Start</Text>
                  <TouchableOpacity style={styles.fieldBtn} onPress={() => setPickStartOpen(true)}>
                    <MaterialCommunityIcons name="clock-outline" size={20} color="#333" />
                    <Text style={styles.fieldText}>
                      {new Intl.DateTimeFormat("en-MY", { hour: "numeric", minute: "2-digit" }).format(startTime)}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={{ width: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>End</Text>
                  <TouchableOpacity style={styles.fieldBtn} onPress={() => setPickEndOpen(true)}>
                    <MaterialCommunityIcons name="clock-time-five-outline" size={20} color="#333" />
                    <Text style={styles.fieldText}>
                      {new Intl.DateTimeFormat("en-MY", { hour: "numeric", minute: "2-digit" }).format(endTime)}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={[styles.label, { marginTop: 12 }]}>Remind me before (minutes)</Text>
              <TextInput
                placeholder="e.g., 30"
                placeholderTextColor="rgba(0,0,0,0.35)"
                value={remindMinutesBefore}
                onChangeText={setRemindMinutesBefore}
                keyboardType="numeric"
                style={styles.input}
              />
            </>
          ) : (
            <>
              <Text style={[styles.label, { marginTop: 12 }]}>Date</Text>
              <TouchableOpacity style={styles.fieldBtn} onPress={() => setPickDateOpen(true)}>
                <MaterialCommunityIcons name="calendar" size={18} color="#333" />
                <Text style={styles.fieldText}>
                  {new Intl.DateTimeFormat("en-MY", { day: "numeric", month: "short", year: "numeric" }).format(date)}
                </Text>
              </TouchableOpacity>

              <Text style={[styles.label, { marginTop: 12 }]}>Time</Text>
              <TouchableOpacity style={styles.fieldBtn} onPress={() => setPickRemOpen(true)}>
                <MaterialCommunityIcons name="alarm" size={18} color="#333" />
                <Text style={styles.fieldText}>
                  {new Intl.DateTimeFormat("en-MY", { hour: "numeric", minute: "2-digit" }).format(remTime)}
                </Text>
              </TouchableOpacity>
            </>
          )}

          <View style={styles.actionsRow}>
            <TouchableOpacity style={[styles.pillBtn, { backgroundColor: "#eee" }]} onPress={closeForm}>
              <Text style={[styles.pillText, { color: "#333" }]}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.pillBtn, { backgroundColor: colors.secondary }]} onPress={addItem}>
              <Text style={[styles.pillText, { color: "#fff" }]}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>
        </Modal>
      )}

      {/* CUSTOM PICKERS - Rendered outside form modal */}
      <CustomDatePicker
        visible={pickDateOpen}
        initialDate={date}
        onCancel={() => setPickDateOpen(false)}
        onConfirm={(d) => {
          setDate(d);
          setPickDateOpen(false);
        }}
      />

      <CustomTimePicker
        visible={pickStartOpen}
        initialTime={startTime}
        onCancel={() => setPickStartOpen(false)}
        onConfirm={(t) => {
          setStartTime(t);
          setPickStartOpen(false);
        }}
      />

      <CustomTimePicker
        visible={pickEndOpen}
        initialTime={endTime}
        onCancel={() => setPickEndOpen(false)}
        onConfirm={(t) => {
          setEndTime(t);
          setPickEndOpen(false);
        }}
      />

      <CustomTimePicker
        visible={pickRemOpen}
        initialTime={remTime}
        onCancel={() => setPickRemOpen(false)}
        onConfirm={(t) => {
          setRemTime(t);
          setPickRemOpen(false);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#F3F3F4" },
  container: { paddingBottom: 16 },
  headerCard: {
    marginHorizontal: 12,
    borderRadius: 26,
    padding: 16,
    paddingBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  segment: { flexDirection: "row", alignItems: "center" },
  segmentPill: {
    height: 35,
    borderRadius: 30,
    paddingHorizontal: 20,
    marginRight: 8,
    backgroundColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  segmentPillActive: { backgroundColor: "#fff" },
  segmentText: { fontFamily: fonts.body, fontSize: 20, fontWeight: 600, color: "rgba(0,0,0,0.6)" },
  segmentTextActive: { color: "#111" },
  addBtn: { marginLeft: "auto" },

  headerRow: { flexDirection: "row", alignItems: "center", marginTop: 15 },
  dayName: { fontSize: 20, color: "rgba(0,0,0,0.6)", marginBottom: 10, fontStyle: "italic" },
  bigDay: { fontFamily: fonts.heading, fontSize: 45, fontWeight: "700", color: "#111", lineHeight: 55, marginTop: -6 },
  bigMonth: { fontFamily: fonts.heading, fontSize: 45, color: "#111", letterSpacing: 2, marginTop: -6, fontWeight: "700" },
  vDivider: { width: 3, alignSelf: "stretch", backgroundColor: "rgba(47, 43, 43, 0.94)", marginHorizontal: 10 },

  rightTime: { fontFamily: fonts.heading, fontSize: 20, fontWeight:600, color: "#111" },
  rightSub: { fontStyle: "italic", fontSize: 14, color: "rgba(0,0,0,0.55)", marginTop: 2, letterSpacing: 0.2 },

  innerCard: { backgroundColor: "#fff", borderRadius: 30, paddingHorizontal: 10, paddingVertical: 10, marginTop: 20 },
  innerTabs: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  innerTabPill: { height: 40, borderRadius: 30, paddingHorizontal: 30, backgroundColor: "rgba(0,0,0,0.06)", alignItems: "center", justifyContent: "center" },
  innerTabActive: { backgroundColor: colors.primaryDark },
  innerTabText: { fontFamily: fonts.body, fontSize: 14, fontWeight:700, color: "rgba(0,0,0,0.65)" },
  innerTabTextActive: { color: "#fff" },

  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.25)" },
  sheet: {
    position: "absolute",
    left: 20,
    right: 20,
    top: 350,
    borderRadius: 30,
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 30,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  sheetTitle: { fontFamily: fonts.heading, fontSize: 20, fontWeight: 600, marginBottom: 20, color: "#222", textAlign:"center"},
  choiceRow: { flexDirection: "row", gap: 15 },
  choiceBtn: {
    flex: 1,
    height: 50,
    borderRadius: 30,
    backgroundColor: colors.secondary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  choiceText: { fontFamily: fonts.body, fontSize: 14, fontWeight: 600, color: "#282525ff" },
  cancelLink: { marginTop: 12, alignSelf: "center" },
  cancelText: { fontFamily: fonts.body, marginTop: 10, fontSize: 14, fontWeight: 600, color: colors.secondary },

  formCard: {
    position: "absolute",
    left: 14,
    right: 14,
    top: 100,
    bottom: 120,
    backgroundColor: "#fff",
    borderRadius: 30,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 9,
    padding: 15,
  },
  formHeader: { borderRadius: 30, padding: 15, marginBottom: 20 },
  formTitle: { fontFamily: fonts.heading, fontSize: 20, fontWeight: 700, color: "#211a1aff", textAlign: "center" },
  label: { fontFamily: fonts.body, fontSize: 14, fontWeight: 600, color: "rgba(0,0,0,0.6)", marginBottom: 10 },
  input: {
    height: 45,
    borderRadius: 20,
    paddingHorizontal: 20,
    backgroundColor: "rgba(0,0,0,0.06)",
    fontFamily: fonts.body,
    fontWeight: 500,
    fontSize: 14,
    color: "#111",
  },
  fieldBtn: {
    height: 45,
    borderRadius: 20,
    paddingHorizontal: 20,
    backgroundColor: "rgba(0,0,0,0.06)",
    fontWeight: 500,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  fieldText: { fontFamily: fonts.body, fontSize: 14, fontWeight: 500, color: "#111" },
  timeRow: { flexDirection: "row", marginTop: 15 },
  actionsRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 30 },
  pillBtn: {
    flex: 1,
    height: 40,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 6,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  pillText: { fontFamily: fonts.heading, fontSize: 14, fontWeight: 600 },
});
