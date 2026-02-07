import { useCurrentFrame, useVideoConfig } from "remotion";
import type { TimelineItem } from "@/types/editor";
import { getAnimationStyle } from "@/lib/animation-styles";

interface AnimatedItemProps {
  item: TimelineItem;
  children: React.ReactNode;
}

export function AnimatedItem({ item, children }: AnimatedItemProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Audio items don't have visual animations
  if (item.type === "audio") return <>{children}</>;

  const style = getAnimationStyle(
    frame,
    item.durationInFrames,
    fps,
    item.animations
  );

  if (Object.keys(style).length === 0) return <>{children}</>;

  return (
    <div style={{ width: "100%", height: "100%", ...style }}>
      {children}
    </div>
  );
}
