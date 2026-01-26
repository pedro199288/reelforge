/**
 * Card component for displaying a single take with score and controls
 */

import { Play, Pause, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { Take } from "@/core/takes/similarity";
import type { TakeScore } from "@/core/takes/scoring";

interface TakeCardProps {
  /** The take data */
  take: Take;
  /** Score for this take */
  score: TakeScore;
  /** Whether this is the recommended (highest scoring) take */
  isRecommended: boolean;
  /** Whether this take is currently selected */
  isSelected: boolean;
  /** Whether audio is currently playing for this take */
  isPlaying: boolean;
  /** Callback when play button is clicked */
  onPlay: () => void;
  /** Callback when card is selected */
  onSelect: () => void;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const tenths = Math.floor((ms % 1000) / 100);
  return `${seconds}.${tenths}s`;
}

function getScoreColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-yellow-600";
  return "text-red-600";
}

function getScoreLabel(score: number): string {
  if (score >= 80) return "Excelente";
  if (score >= 60) return "Bueno";
  if (score >= 40) return "Regular";
  return "Bajo";
}

export function TakeCard({
  take,
  score,
  isRecommended,
  isSelected,
  isPlaying,
  onPlay,
  onSelect,
}: TakeCardProps) {
  return (
    <Card
      className={cn(
        "relative cursor-pointer transition-all hover:shadow-md",
        isSelected && "ring-2 ring-primary",
        isRecommended && !isSelected && "ring-1 ring-yellow-400"
      )}
      onClick={onSelect}
    >
      {/* Recommended badge */}
      {isRecommended && (
        <div className="absolute -top-2 -right-2 z-10">
          <Badge className="bg-yellow-500 text-yellow-950 gap-1">
            <Star className="h-3 w-3 fill-current" />
            Recomendada
          </Badge>
        </div>
      )}

      <CardContent className="p-4">
        {/* Header with take number and duration */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="font-medium">Toma {take.index + 1}</span>
            <Badge variant="outline">{formatDuration(take.durationMs)}</Badge>
          </div>
          <Button
            size="icon"
            variant={isPlaying ? "default" : "outline"}
            className="h-8 w-8"
            onClick={(e) => {
              e.stopPropagation();
              onPlay();
            }}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Score bar */}
        <div className="space-y-1 mb-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Puntuación</span>
            <span className={cn("font-medium", getScoreColor(score.total))}>
              {score.total.toFixed(1)}
            </span>
          </div>
          <Progress value={score.total} className="h-2" />
          <p className={cn("text-xs", getScoreColor(score.total))}>
            {getScoreLabel(score.total)}
          </p>
        </div>

        {/* Score breakdown */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Claridad</span>
            <span>{Math.round(score.breakdown.clarity)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Fluidez</span>
            <span>{Math.round(score.breakdown.fluency)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Energía</span>
            <span>{Math.round(score.breakdown.energy)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Duración</span>
            <span>{Math.round(score.breakdown.duration)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Confianza</span>
            <span>{Math.round(score.breakdown.whisperConfidence)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Completitud</span>
            <span>{Math.round(score.breakdown.completeness)}</span>
          </div>
        </div>

        {/* Similarity indicator */}
        <div className="mt-3 pt-3 border-t">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Similitud</span>
            <span>{(take.similarity * 100).toFixed(0)}%</span>
          </div>
        </div>

        {/* Selection indicator */}
        <div
          className={cn(
            "mt-3 h-8 flex items-center justify-center rounded-md text-sm font-medium transition-colors",
            isSelected
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          )}
        >
          {isSelected ? "Seleccionada" : "Clic para seleccionar"}
        </div>
      </CardContent>
    </Card>
  );
}
