// src/components/CircleStickersImage.tsx
import React from "react";
import { Dimensions, StyleSheet } from "react-native";
import { Image } from "expo-image";

const { width, height } = Dimensions.get("window");

type Item = {
  src: any;            // require("...gif" | png | webp)
  angleDeg: number;    // 0° = right, 90° = down
  size?: number;
  alpha?: number;
  rotateDeg?: number;
};

type Props = {
  cx?: number;         // center x as fraction of screen width
  cy?: number;         // center y as fraction of screen height
  radiusW?: number;    // radius as fraction of screen width
  items: Item[];
};

export default function CircleStickersImage({
  cx = 0.5,
  cy = 0.47,
  radiusW = 0.32,
  items,
}: Props) {
  const cxPx = width * cx;
  const cyPx = height * cy;
  const r = width * radiusW;

  return (
    <>
      {items.map((it, i) => {
        const rad = (it.angleDeg * Math.PI) / 180;
        const size = it.size ?? 48;
        const x = Math.round(cxPx + r * Math.cos(rad) - size / 2);
        const y = Math.round(cyPx + r * Math.sin(rad) - size / 2);

        return (
          <Image
            key={i}
            source={it.src}
            style={[
              styles.img,
              {
                left: x,
                top: y,
                width: size,
                height: size,
                opacity: it.alpha ?? 1,
                transform: [{ rotate: `${it.rotateDeg ?? 0}deg` }],
              },
            ]}
            contentFit="contain"
          />
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  img: { position: "absolute" },
});
