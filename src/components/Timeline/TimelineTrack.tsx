import { cn } from "@/lib/utils";

interface TimelineTrackProps {
  name: string;
  height?: number;
  children: React.ReactNode;
  className?: string;
}

export function TimelineTrack({
  name,
  height = 48,
  children,
  className,
}: TimelineTrackProps) {
  return (
    <div className={cn("flex border-b border-border", className)}>
      <div className="w-20 shrink-0 flex items-center px-2 bg-muted/30 border-r border-border">
        <span className="text-xs font-medium text-muted-foreground truncate">
          {name}
        </span>
      </div>
      <div
        className="flex-1 relative overflow-hidden"
        style={{ height }}
      >
        {children}
      </div>
    </div>
  );
}
