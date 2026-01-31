import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import {
  CheckCircle2,
  Circle,
  Loader2,
  AlertCircle,
  Play,
  RotateCcw,
  FastForward,
} from "lucide-react";
import type { PipelineStep, ProcessProgress, StepStatus } from "@/types/pipeline";
import { cn } from "@/lib/utils";

interface PipelineStepCardProps {
  stepKey: PipelineStep;
  label: string;
  description: string;
  status: StepStatus;
  isProcessing: boolean;
  isAnyProcessing: boolean;
  canExecute: boolean;
  missingDeps: PipelineStep[];
  progress: ProcessProgress | null;
  isExecutable?: boolean;
  showExecuteUntil?: boolean;
  onExecute: () => void;
  onExecuteUntil: () => void;
  children?: ReactNode;
}

function StatusIcon({ status, isProcessing }: { status: StepStatus; isProcessing: boolean }) {
  if (isProcessing) {
    return <Loader2 className="w-4 h-4 animate-spin text-blue-600" />;
  }
  switch (status) {
    case "completed":
      return <CheckCircle2 className="w-4 h-4 text-green-600" />;
    case "error":
      return <AlertCircle className="w-4 h-4 text-red-600" />;
    default:
      return <Circle className="w-4 h-4 text-muted-foreground" />;
  }
}

function StatusBadge({ status, isProcessing }: { status: StepStatus; isProcessing: boolean }) {
  if (isProcessing) {
    return (
      <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-300">
        Ejecutando
      </Badge>
    );
  }
  switch (status) {
    case "completed":
      return (
        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300">
          Completado
        </Badge>
      );
    case "error":
      return (
        <Badge variant="destructive" className="text-xs">
          Error
        </Badge>
      );
    default:
      return null;
  }
}

export function PipelineStepCard({
  stepKey,
  label,
  description,
  status,
  isProcessing,
  isAnyProcessing,
  canExecute,
  missingDeps,
  progress,
  isExecutable = true,
  showExecuteUntil = true,
  onExecute,
  onExecuteUntil,
  children,
}: PipelineStepCardProps) {
  return (
    <AccordionItem value={stepKey}>
      <AccordionTrigger className="py-3 px-1 hover:no-underline">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <StatusIcon status={status} isProcessing={isProcessing} />
          <span className="text-sm font-medium truncate">{label}</span>
          <StatusBadge status={status} isProcessing={isProcessing} />
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-1">
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{description}</p>

          {/* Progress bar during execution */}
          {isProcessing && progress && (
            <div className="p-3 border rounded-lg bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                <span className="text-xs font-medium text-blue-700 dark:text-blue-300 truncate flex-1">
                  {progress.message}
                </span>
                <Badge
                  variant="outline"
                  className="text-xs text-blue-600 border-blue-300 flex-shrink-0"
                >
                  {progress.progress}%
                </Badge>
              </div>
              <Progress value={progress.progress} className="h-1.5" />
            </div>
          )}

          {/* Config slot */}
          {children}

          {/* Action buttons */}
          {isExecutable && (
            <div className="flex items-center gap-2">
              {!canExecute && missingDeps.length > 0 && !isAnyProcessing && (
                <span className="text-xs text-muted-foreground mr-auto">
                  Requiere: {missingDeps.join(", ")}
                </span>
              )}
              <div className={cn("flex items-center gap-2", canExecute && "ml-auto")}>
                {showExecuteUntil && (
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      onExecuteUntil();
                    }}
                    disabled={isProcessing || isAnyProcessing}
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs h-7"
                  >
                    {isAnyProcessing && !isProcessing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Ejecutando...
                      </>
                    ) : (
                      <>
                        <FastForward className="w-3.5 h-3.5" />
                        Hasta aqui
                      </>
                    )}
                  </Button>
                )}
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    onExecute();
                  }}
                  disabled={!canExecute || isProcessing || isAnyProcessing}
                  variant={status === "completed" ? "outline" : "default"}
                  size="sm"
                  className="gap-1.5 text-xs h-7"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Ejecutando...
                    </>
                  ) : status === "completed" ? (
                    <>
                      <RotateCcw className="w-3.5 h-3.5" />
                      Re-ejecutar
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      Ejecutar
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
