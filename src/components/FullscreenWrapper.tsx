import { useEffect, useCallback, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface FullscreenWrapperProps {
  isFullscreen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  className?: string;
}

/**
 * Wrapper component that expands content to fullscreen using a CSS overlay.
 * Uses consistent DOM structure to prevent re-mounting of children.
 */
export function FullscreenWrapper({
  isFullscreen,
  onClose,
  children,
  title,
  className,
}: FullscreenWrapperProps) {
  // Handle ESC key to close fullscreen
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape" && isFullscreen) {
        onClose();
      }
    },
    [isFullscreen, onClose]
  );

  useEffect(() => {
    if (isFullscreen) {
      document.addEventListener("keydown", handleKeyDown);
      // Prevent body scroll when fullscreen is open
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isFullscreen, handleKeyDown]);

  // Always render the same structure to prevent re-mounting children
  // Use "contents" display when not fullscreen to make wrapper invisible to layout
  return (
    <div
      className={cn(
        // When not fullscreen, use "contents" to be invisible to layout
        !isFullscreen && "contents",
        // Fullscreen styles
        isFullscreen && [
          "fixed inset-0 z-50 bg-background",
          "flex flex-col",
          "animate-in fade-in-0 duration-200",
        ],
        className
      )}
    >
      {/* Header - only visible in fullscreen */}
      {isFullscreen && (
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30 flex-shrink-0">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
            title="Cerrar pantalla completa (ESC)"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
      )}

      {/* Content wrapper - use "contents" when not fullscreen */}
      <div className={cn(!isFullscreen && "contents", isFullscreen && "flex-1 overflow-auto p-4")}>
        {children}
      </div>
    </div>
  );
}
