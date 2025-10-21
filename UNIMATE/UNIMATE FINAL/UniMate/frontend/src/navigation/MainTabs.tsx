// src/navigation/MainTabs.tsx
import React from "react";
import { View, Pressable, StyleSheet, Image, ImageSourcePropType } from "react-native";
import {
  createBottomTabNavigator,
  BottomTabBarProps,
} from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import CalendarScreen from "../screens/CalendarScreen";
import IslandScreen from "../screens/IslandScreen";
import ProfileScreen from "../screens/ProfileScreen";

export type TabParamList = {
  Calendar: undefined;
  Island: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

export default function MainTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Island"
      screenOptions={{ headerShown: false }}
      tabBar={(props: BottomTabBarProps) => <PillTabBar {...props} />}
    >
      <Tab.Screen name="Calendar" component={CalendarScreen} />
      <Tab.Screen name="Island" component={IslandScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function PillTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  const icons: Record<keyof TabParamList, ImageSourcePropType> = {
    Calendar: require("../../assets/ui/calendar.png"),
    Island: require("../../assets/ui/island.png"),
    Profile: require("../../assets/ui/profile.png"),
  };

  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom || 8 }]}>
      <View style={styles.pill}>
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;

          const onPress = () => {
            const e = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !e.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable key={route.key} onPress={onPress} style={styles.item}>
              <Image
                source={icons[route.name as keyof TabParamList]}
                // Do NOT pass tintColor — shows original PNG colors.
                style={styles.icon}
                resizeMode="contain"
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
  },
  pill: {
    backgroundColor: "#fff",
    height: 62,
    borderRadius: 32,
    width: "88%",
    marginHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: -2 },
    shadowRadius: 12,
    elevation: 6,
  },
  item: { width: 64, alignItems: "center", justifyContent: "center" },
  icon: { width: 26, height: 26 },
});
