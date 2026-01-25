/**
 * Take Selector component for comparing and selecting the best take
 */

import { useState, useCallback, useMemo } from "react";
import { Wand2, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TakeCard } from "./TakeCard";
import type { PhraseGroup, Take } from "@/core/takes/similarity";
import type { TakeScore } from "@/core/takes/scoring";
import { cn } from "@/lib/utils";

interface TakeSelectorProps {
  /** The phrase group with all takes */
  phraseGroup: PhraseGroup;
  /** Scores for each take (must match length of phraseGroup.takes) */
  scores: TakeScore[];
  /** Index of the recommended take (highest score) */
  recommendedIndex: number;
  /** Currently selected take index */
  selectedIndex: number;
  /** Callback when a take is selected */
  onSelect: (takeIndex: number) => void;
  /** Callback when auto-select is clicked */
  onAutoSelect: () => void;
  /** Callback when done/confirm is clicked */
  onConfirm: () => void;
  /** Callback to play a take */
  onPlayTake?: (take: Take) => void;
  /** Currently playing take index (-1 if none) */
  playingIndex?: number;
  /** Additional class name */
  className?: string;
}

export function TakeSelector({
  phraseGroup,
  scores,
  recommendedIndex,
  selectedIndex,
  onSelect,
  onAutoSelect,
  onConfirm,
  onPlayTake,
  playingIndex = -1,
  className,
}: TakeSelectorProps) {
  // For mobile: track which take is visible in single-view mode
  const [mobileViewIndex, setMobileViewIndex] = useState(0);

  const handlePrevious = useCallback(() => {
    setMobileViewIndex((prev) =>
      prev > 0 ? prev - 1 : phraseGroup.takes.length - 1
    );
  }, [phraseGroup.takes.length]);

  const handleNext = useCallback(() => {
    setMobileViewIndex((prev) =>
      prev < phraseGroup.takes.length - 1 ? prev + 1 : 0
    );
  }, [phraseGroup.takes.length]);

  const handlePlay = useCallback(
    (take: Take) => {
      onPlayTake?.(take);
    },
    [onPlayTake]
  );

  const selectedScore = useMemo(
    () => scores[selectedIndex],
    [scores, selectedIndex]
  );

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Seleccionar Toma</CardTitle>
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              "{phraseGroup.displayText}"
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {phraseGroup.takeCount} tomas
            </Badge>
            <Badge
              variant={
                selectedIndex === recommendedIndex ? "default" : "outline"
              }
            >
              {selectedIndex === recommendedIndex
                ? "Recomendada seleccionada"
                : `Toma ${selectedIndex + 1} seleccionada`}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-auto p-4">
        {/* Desktop: Grid of all takes */}
        <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {phraseGroup.takes.map((take, index) => (
            <TakeCard
              key={take.index}
              take={take}
              score={scores[index]}
              isRecommended={index === recommendedIndex}
              isSelected={index === selectedIndex}
              isPlaying={index === playingIndex}
              onPlay={() => handlePlay(take)}
              onSelect={() => onSelect(index)}
            />
          ))}
        </div>

        {/* Mobile: Single take view with navigation */}
        <div className="md:hidden">
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="outline"
              size="icon"
              onClick={handlePrevious}
              disabled={phraseGroup.takes.length <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              {mobileViewIndex + 1} de {phraseGroup.takes.length}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={handleNext}
              disabled={phraseGroup.takes.length <= 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <TakeCard
            take={phraseGroup.takes[mobileViewIndex]}
            score={scores[mobileViewIndex]}
            isRecommended={mobileViewIndex === recommendedIndex}
            isSelected={mobileViewIndex === selectedIndex}
            isPlaying={mobileViewIndex === playingIndex}
            onPlay={() => handlePlay(phraseGroup.takes[mobileViewIndex])}
            onSelect={() => onSelect(mobileViewIndex)}
          />

          {/* Dot indicators */}
          <div className="flex justify-center gap-1 mt-4">
            {phraseGroup.takes.map((_, index) => (
              <button
                key={index}
                className={cn(
                  "w-2 h-2 rounded-full transition-colors",
                  index === mobileViewIndex
                    ? "bg-primary"
                    : index === recommendedIndex
                      ? "bg-yellow-400"
                      : "bg-muted-foreground/30"
                )}
                onClick={() => setMobileViewIndex(index)}
              />
            ))}
          </div>
        </div>
      </CardContent>

      <CardFooter className="border-t flex items-center justify-between gap-4 pt-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onAutoSelect}>
            <Wand2 className="h-4 w-4 mr-2" />
            Auto-seleccionar
          </Button>
          <span className="text-sm text-muted-foreground">
            Puntuación: {selectedScore?.total.toFixed(1) ?? "—"}
          </span>
        </div>

        <Button onClick={onConfirm}>
          Usar Toma {selectedIndex + 1}
        </Button>
      </CardFooter>
    </Card>
  );
}

/**
 * Simplified take selector for quick selection without full UI
 */
interface QuickTakeSelectorProps {
  phraseGroup: PhraseGroup;
  scores: TakeScore[];
  recommendedIndex: number;
  selectedIndex: number;
  onSelect: (takeIndex: number) => void;
}

export function QuickTakeSelector({
  phraseGroup,
  scores,
  recommendedIndex,
  selectedIndex,
  onSelect,
}: QuickTakeSelectorProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {phraseGroup.takes.map((_, index) => {
        const score = scores[index];
        const isRecommended = index === recommendedIndex;
        const isSelected = index === selectedIndex;

        return (
          <Button
            key={index}
            size="sm"
            variant={isSelected ? "default" : isRecommended ? "secondary" : "outline"}
            onClick={() => onSelect(index)}
            className={cn(
              "relative",
              isRecommended && !isSelected && "border-yellow-400"
            )}
          >
            {isRecommended && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full" />
            )}
            Toma {index + 1}
            <span className="ml-1 text-xs opacity-70">
              ({score.total.toFixed(0)})
            </span>
          </Button>
        );
      })}
    </div>
  );
}
