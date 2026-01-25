import { useCallback, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface BatchDropZoneProps {
  className?: string;
  onFilesDropped: (files: File[]) => void;
  accept?: string;
}

export function BatchDropZone({
  className,
  onFilesDropped,
  accept = "video/*",
}: BatchDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files).filter((file) =>
        file.type.startsWith("video/")
      );

      if (files.length > 0) {
        onFilesDropped(files);
      }
    },
    [onFilesDropped]
  );

  const handleClick = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = true;
    input.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      if (target.files && target.files.length > 0) {
        const files = Array.from(target.files).filter((file) =>
          file.type.startsWith("video/")
        );
        if (files.length > 0) {
          onFilesDropped(files);
        }
      }
    };
    input.click();
  }, [accept, onFilesDropped]);

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors cursor-pointer",
        isDragOver
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/25 hover:border-muted-foreground/50",
        className
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <Upload
        className={cn(
          "h-10 w-10 mb-4",
          isDragOver ? "text-primary" : "text-muted-foreground/50"
        )}
      />
      <p className="text-sm text-muted-foreground text-center">
        {isDragOver ? (
          "Suelta los videos aquí"
        ) : (
          <>
            Arrastra videos aquí o{" "}
            <span className="text-primary underline">haz clic para seleccionar</span>
          </>
        )}
      </p>
      <p className="text-xs text-muted-foreground/70 mt-2">
        Formatos: MP4, MOV, AVI, MKV, WebM
      </p>
    </div>
  );
}
