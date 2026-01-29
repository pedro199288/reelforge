/**
 * Script Coverage Map Component
 *
 * Visualizes the coverage of script lines by segments.
 * Shows which lines are covered, missing, and by which segments.
 */
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Check, X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PreselectedSegment } from "@/core/preselection/types";

interface ScriptCoverageMapProps {
  /** Script text (newline-separated lines) */
  script: string;
  /** Preselected segments with coverage info */
  segments: PreselectedSegment[];
  /** Covered script lines (1-indexed) */
  coveredLines?: number[];
  /** Missing script lines (1-indexed) */
  missingLines?: number[];
  /** Callback when a line is clicked */
  onLineClick?: (lineNumber: number) => void;
  /** Maximum height for the container */
  maxHeight?: string;
}

interface LineInfo {
  lineNumber: number;
  text: string;
  isCovered: boolean;
  coveringSegments: PreselectedSegment[];
}

export function ScriptCoverageMap({
  script,
  segments,
  coveredLines = [],
  missingLines = [],
  onLineClick,
  maxHeight = "400px",
}: ScriptCoverageMapProps) {
  // Parse script into lines
  const lines = useMemo(() => {
    return script
      .split("\n")
      .map((text) => text.trim())
      .filter((text) => text.length > 0);
  }, [script]);

  // Build coverage info for each line
  const lineInfos: LineInfo[] = useMemo(() => {
    return lines.map((text, index) => {
      const lineNumber = index + 1;

      // Find segments that cover this line
      const coveringSegments = segments.filter(
        (seg) => seg.coversScriptLines?.includes(lineNumber) && seg.enabled
      );

      // Check if covered
      const isCovered =
        coveredLines.length > 0
          ? coveredLines.includes(lineNumber)
          : coveringSegments.length > 0;

      return {
        lineNumber,
        text,
        isCovered,
        coveringSegments,
      };
    });
  }, [lines, segments, coveredLines]);

  // Calculate stats
  const stats = useMemo(() => {
    const total = lineInfos.length;
    const covered = lineInfos.filter((l) => l.isCovered).length;
    const missing = total - covered;
    const percentage = total > 0 ? Math.round((covered / total) * 100) : 0;

    return { total, covered, missing, percentage };
  }, [lineInfos]);

  return (
    <div className="space-y-3">
      {/* Stats header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Cobertura del Guion</span>
          <Badge
            variant={stats.percentage === 100 ? "default" : "secondary"}
            className={cn(
              stats.percentage === 100 && "bg-green-500",
              stats.percentage < 50 && "bg-red-500",
              stats.percentage >= 50 && stats.percentage < 100 && "bg-yellow-500"
            )}
          >
            {stats.percentage}%
          </Badge>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Check className="w-3 h-3 text-green-500" />
            {stats.covered} cubiertas
          </span>
          {stats.missing > 0 && (
            <span className="flex items-center gap-1">
              <X className="w-3 h-3 text-red-500" />
              {stats.missing} sin cubrir
            </span>
          )}
        </div>
      </div>

      {/* Lines list */}
      <div
        className="rounded-md border divide-y overflow-y-auto"
        style={{ maxHeight }}
      >
        <TooltipProvider>
          {lineInfos.map((info) => (
            <div
              key={info.lineNumber}
              className={cn(
                "flex items-start gap-3 px-3 py-2 text-sm transition-colors",
                info.isCovered
                  ? "bg-green-50 dark:bg-green-950/20"
                  : "bg-red-50 dark:bg-red-950/20",
                onLineClick && "cursor-pointer hover:bg-accent"
              )}
              onClick={() => onLineClick?.(info.lineNumber)}
            >
              {/* Status icon */}
              <div className="flex-shrink-0 pt-0.5">
                {info.isCovered ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                )}
              </div>

              {/* Line number */}
              <span className="flex-shrink-0 w-6 text-muted-foreground font-mono text-xs pt-0.5">
                L{info.lineNumber}
              </span>

              {/* Line text */}
              <span
                className={cn(
                  "flex-1 break-words",
                  !info.isCovered && "text-muted-foreground"
                )}
              >
                {info.text}
              </span>

              {/* Covering segments badges */}
              {info.coveringSegments.length > 0 && (
                <div className="flex-shrink-0 flex items-center gap-1">
                  {info.coveringSegments.slice(0, 3).map((seg) => (
                    <Tooltip key={seg.id}>
                      <TooltipTrigger asChild>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs",
                            seg.contentType === "best_take" &&
                              "border-green-500 text-green-700",
                            seg.contentType === "alternative_take" &&
                              "border-yellow-500 text-yellow-700"
                          )}
                        >
                          {seg.id.slice(0, 4)}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-xs">
                        <div className="space-y-1">
                          <div className="font-medium">
                            Segmento {seg.id}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {seg.reason}
                          </div>
                          <div className="text-xs">
                            Score: {seg.score} | Tipo: {seg.contentType}
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                  {info.coveringSegments.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{info.coveringSegments.length - 3}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          ))}
        </TooltipProvider>
      </div>

      {/* Missing lines warning */}
      {missingLines.length > 0 && (
        <div className="flex items-center gap-2 p-2 rounded-md bg-yellow-50 dark:bg-yellow-950/20 text-sm">
          <AlertTriangle className="w-4 h-4 text-yellow-600" />
          <span className="text-yellow-700 dark:text-yellow-400">
            {missingLines.length} linea(s) del guion no tienen cobertura:
            {" "}
            {missingLines.slice(0, 5).map((l) => `L${l}`).join(", ")}
            {missingLines.length > 5 && ` y ${missingLines.length - 5} mas`}
          </span>
        </div>
      )}
    </div>
  );
}
