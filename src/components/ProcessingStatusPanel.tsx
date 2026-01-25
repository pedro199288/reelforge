import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CheckCircle2,
  Circle,
  Loader2,
  AlertCircle,
  Volume2,
  Scissors,
  FileText,
  Film,
  LayoutGrid,
  Star,
} from "lucide-react";

export type ProcessingStatus = "pending" | "processing" | "completed" | "error";

export interface ProcessingStepInfo {
  key: string;
  label: string;
  status: ProcessingStatus;
  completedAt?: Date;
  error?: string;
}

interface ProcessingStatusPanelProps {
  steps: ProcessingStepInfo[];
  compact?: boolean;
}

const STEP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  raw: Film,
  silences: Volume2,
  segments: LayoutGrid,
  cut: Scissors,
  captions: FileText,
  "take-selection": Star,
  rendered: Film,
};

const STATUS_CONFIG: Record<
  ProcessingStatus,
  {
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    bgColor: string;
    borderColor: string;
    label: string;
  }
> = {
  pending: {
    icon: Circle,
    color: "text-muted-foreground",
    bgColor: "bg-muted/50",
    borderColor: "border-muted",
    label: "Pendiente",
  },
  processing: {
    icon: Loader2,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    label: "Procesando",
  },
  completed: {
    icon: CheckCircle2,
    color: "text-green-600",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
    label: "Completado",
  },
  error: {
    icon: AlertCircle,
    color: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    label: "Error",
  },
};

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Ahora mismo";
  if (diffMins < 60) return `Hace ${diffMins} min`;
  if (diffHours < 24) return `Hace ${diffHours}h`;
  if (diffDays < 7) return `Hace ${diffDays}d`;
  return date.toLocaleDateString();
}

function ProcessingStepBadge({
  step,
  compact,
}: {
  step: ProcessingStepInfo;
  compact?: boolean;
}) {
  const config = STATUS_CONFIG[step.status];
  const StatusIcon = config.icon;
  const StepIcon = STEP_ICONS[step.key] || Film;

  const badge = (
    <Badge
      variant="outline"
      className={`
        ${config.bgColor} ${config.borderColor} ${config.color}
        flex items-center gap-1.5 px-2 py-1
        ${step.status === "processing" ? "animate-pulse" : ""}
      `}
    >
      <StepIcon className="w-3 h-3" />
      {!compact && <span className="text-xs font-medium">{step.label}</span>}
      <StatusIcon
        className={`w-3 h-3 ${step.status === "processing" ? "animate-spin" : ""}`}
      />
    </Badge>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <div className="font-medium">{step.label}</div>
          <div className={config.color}>{config.label}</div>
          {step.completedAt && (
            <div className="text-muted-foreground mt-1">
              {formatRelativeTime(step.completedAt)}
            </div>
          )}
          {step.error && (
            <div className="text-red-500 mt-1 max-w-[200px]">{step.error}</div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ProcessingStatusPanel({
  steps,
  compact = false,
}: ProcessingStatusPanelProps) {
  const completedCount = steps.filter((s) => s.status === "completed").length;
  const hasErrors = steps.some((s) => s.status === "error");
  const isProcessing = steps.some((s) => s.status === "processing");

  return (
    <div className="space-y-3">
      {/* Summary header */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Estado del procesado</span>
        <div className="flex items-center gap-2">
          {isProcessing && (
            <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200">
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              Procesando
            </Badge>
          )}
          {hasErrors && (
            <Badge variant="destructive" className="text-xs">
              <AlertCircle className="w-3 h-3 mr-1" />
              Errores
            </Badge>
          )}
          {!isProcessing && !hasErrors && (
            <span className="text-xs text-muted-foreground">
              {completedCount}/{steps.length} completados
            </span>
          )}
        </div>
      </div>

      {/* Step badges */}
      <div className="flex flex-wrap gap-2">
        {steps.map((step) => (
          <ProcessingStepBadge key={step.key} step={step} compact={compact} />
        ))}
      </div>
    </div>
  );
}

// Compact inline version for video list items
export function ProcessingStatusInline({
  steps,
}: {
  steps: ProcessingStepInfo[];
}) {
  const completedCount = steps.filter((s) => s.status === "completed").length;
  const totalCount = steps.length;
  const hasErrors = steps.some((s) => s.status === "error");
  const isProcessing = steps.some((s) => s.status === "processing");

  if (isProcessing) {
    return (
      <div className="flex items-center gap-1.5 text-blue-600">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span className="text-xs">Procesando...</span>
      </div>
    );
  }

  if (hasErrors) {
    return (
      <div className="flex items-center gap-1.5 text-red-600">
        <AlertCircle className="w-3.5 h-3.5" />
        <span className="text-xs">Error</span>
      </div>
    );
  }

  if (completedCount === totalCount) {
    return (
      <div className="flex items-center gap-1.5 text-green-600">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span className="text-xs">Completo</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-muted-foreground">
      <div className="flex -space-x-1">
        {steps.slice(0, 4).map((step) => {
          const Icon = STATUS_CONFIG[step.status].icon;
          const color = STATUS_CONFIG[step.status].color;
          return (
            <div
              key={step.key}
              className={`w-4 h-4 rounded-full bg-background flex items-center justify-center ${color}`}
            >
              <Icon className="w-2.5 h-2.5" />
            </div>
          );
        })}
      </div>
      <span className="text-xs">
        {completedCount}/{totalCount}
      </span>
    </div>
  );
}
