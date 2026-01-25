import { useState, useCallback, type DragEvent, type ReactNode } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface DropZoneProps {
  onFilesDropped: (files: File[]) => void;
  accept?: string[];
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
}

const VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
];

export function DropZone({
  onFilesDropped,
  accept = VIDEO_MIME_TYPES,
  children,
  className,
  disabled = false,
}: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) setIsDragging(true);
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set dragging to false if we're leaving the dropzone entirely
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) setIsDragging(true);
    },
    [disabled]
  );

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (disabled) return;

      const files = Array.from(e.dataTransfer.files).filter((file) =>
        accept.some((type) => {
          if (type.endsWith("/*")) {
            return file.type.startsWith(type.replace("/*", "/"));
          }
          return file.type === type;
        })
      );

      if (files.length > 0) {
        onFilesDropped(files);
      }
    },
    [onFilesDropped, accept, disabled]
  );

  return (
    <div
      className={cn(
        "relative transition-all duration-200",
        isDragging && !disabled && "ring-2 ring-primary ring-offset-2 rounded-lg",
        className
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}
      {isDragging && !disabled && (
        <div className="absolute inset-0 bg-primary/10 backdrop-blur-sm rounded-lg flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-background/90 rounded-lg p-6 shadow-lg text-center">
            <Upload className="h-12 w-12 mx-auto mb-2 text-primary" />
            <p className="text-lg font-medium">Drop videos here</p>
            <p className="text-sm text-muted-foreground">
              Supported: MP4, WebM, MOV, AVI, MKV
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default DropZone;
