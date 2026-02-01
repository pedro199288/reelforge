import * as React from "react";
import { TooltipContent } from "@/components/ui/tooltip";
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
        <kbd className="pointer-events-none inline-flex h-5 items-center rounded border border-white/20 bg-white/10 px-1.5 font-mono text-[10px] font-medium leading-none">
          {formatShortcut(shortcut)}
        </kbd>
      </span>
    </TooltipContent>
  );
}

export { ShortcutTooltipContent };
