import React from "react";
import { Dimensions, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "../theme/colors";

const { width, height } = Dimensions.get("window");

type Item = {
  name: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  angleDeg: number; // 0deg = right, 90 = down (screen coords)
  size?: number;
  alpha?: number;
};

type Props = {
  /** center as fraction of screen (0..1) */
  cx?: number;
  cy?: number;
  /** radius as fraction of screen width */
  radiusW?: number;
  items: Item[];
};

export default function CircleStickers({
  cx = 0.5,
  cy = 0.47,
  radiusW = 0.34,
  items,
}: Props) {
  const cxPx = width * cx;
  const cyPx = height * cy;
  const r = width * radiusW;

  return (
    <>
      {items.map((it, idx) => {
        const rad = (it.angleDeg * Math.PI) / 180;
        const x = cxPx + r * Math.cos(rad);
        const y = cyPx + r * Math.sin(rad);
        const size = it.size ?? 48;

        return (
          <MaterialCommunityIcons
            key={`${it.name}-${idx}`}
            name={it.name}
            size={size}
            color={colors.textBlack}
            style={[
              styles.icon,
              {
                left: x - size / 2,
                top: y - size / 2,
                opacity: it.alpha ?? 0.9,
              },
            ]}
          />
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  icon: { position: "absolute" },
});
