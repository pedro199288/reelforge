import * as React from "react";
import { TooltipContent } from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";
import { formatShortcut } from "@/lib/keyboard";

interface ShortcutTooltipContentProps
  extends React.ComponentProps<typeof TooltipContent> {
  shortcut: string;
}

function ShortcutTooltipContent({
  shortcut,
  children,
  ...props
}: ShortcutTooltipContentProps) {
  return (
    <TooltipContent {...props}>
      <span className="flex items-center gap-2">
        <span>{children}</span>
        <Kbd>{formatShortcut(shortcut)}</Kbd>
      </span>
    </TooltipContent>
  );
}

export { ShortcutTooltipContent };
