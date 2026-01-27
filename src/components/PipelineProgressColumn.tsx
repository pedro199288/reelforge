import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  ProcessingStatusPanelVertical,
  type ProcessingStepInfo,
} from "@/components/ProcessingStatusPanel";
import { Loader2 } from "lucide-react";

interface ProcessProgress {
  step: string;
  progress: number;
  message: string;
}

interface PipelineProgressColumnProps {
  videoTitle: string | null;
  progressPercent: number;
  stepInfoList: ProcessingStepInfo[];
  activeTab: string;
  onStepClick: (step: string) => void;
  isProcessing?: boolean;
  processProgress?: ProcessProgress | null;
}

export function PipelineProgressColumn({
  videoTitle,
  progressPercent,
  stepInfoList,
  activeTab,
  onStepClick,
  isProcessing,
  processProgress,
}: PipelineProgressColumnProps) {
  if (!videoTitle) {
    return (
      <Card className="h-full flex items-center justify-center">
        <CardContent className="py-6 text-center">
          <p className="text-sm text-muted-foreground">
            Selecciona un video
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      <CardHeader className="pb-2 flex-none space-y-3">
        <CardTitle className="text-sm truncate" title={videoTitle}>
          {videoTitle}
        </CardTitle>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Progreso</span>
            <Badge variant="outline" className="text-xs">
              {progressPercent}%
            </Badge>
          </div>
          <Progress value={progressPercent} className="h-1.5" />
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto pt-2">
        {/* Auto-process indicator */}
        {isProcessing && processProgress && (
          <div className="mb-4 p-2 rounded-md bg-green-50 border border-green-200">
            <div className="flex items-center gap-2 text-xs text-green-700">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span className="font-medium truncate">{processProgress.message}</span>
            </div>
            <Progress value={processProgress.progress} className="h-1 mt-1.5" />
          </div>
        )}

        <ProcessingStatusPanelVertical
          steps={stepInfoList}
          activeStep={activeTab}
          onStepClick={onStepClick}
        />
      </CardContent>
    </Card>
  );
}
