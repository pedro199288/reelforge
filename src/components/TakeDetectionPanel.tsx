import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useScript, useWorkspaceStore, useTakeSelections } from "@/store/workspace";
import { parseScript } from "@/core/script/parser";
import {
  detectTakes,
  getSelectedTakes,
  getSelectedDuration,
  type Take,
  type TakeGroup,
  type TakeDetectionResult,
} from "@/core/script/takes";
import type { Caption } from "@/core/script/align";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface TakeDetectionPanelProps {
  videoId: string;
  captions: Caption[];
  onSeekTo?: (ms: number) => void;
  onSelectTake?: (sentenceIndex: number, takeId: string) => void;
}

function formatTime(ms: number): string {
  const seconds = ms / 1000;
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(1);
  return mins > 0 ? `${mins}:${secs.padStart(4, "0")}` : `${secs}s`;
}

function formatDuration(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

export function TakeDetectionPanel({
  videoId,
  captions,
  onSeekTo,
  onSelectTake,
}: TakeDetectionPanelProps) {
  const scriptState = useScript(videoId);
  const storedSelections = useTakeSelections(videoId);
  const setTakeSelection = useWorkspaceStore((s) => s.setTakeSelection);
  const setAllTakeSelections = useWorkspaceStore((s) => s.setAllTakeSelections);
  const [result, setResult] = useState<TakeDetectionResult | null>(null);

  const rawScript = scriptState?.rawScript ?? "";

  // Get selected takes from store or default to first take per group
  const selectedTakes = useMemo(() => {
    const map = new Map<number, string>();
    if (storedSelections?.selections) {
      for (const [key, takeIndex] of Object.entries(storedSelections.selections)) {
        const sentenceIndex = parseInt(key, 10);
        if (!isNaN(sentenceIndex) && result) {
          const group = result.groups.find((g) => g.sentence.index === sentenceIndex);
          if (group && group.takes[takeIndex]) {
            map.set(sentenceIndex, group.takes[takeIndex].id);
          }
        }
      }
    }
    // Fill in defaults for any groups not in store
    if (result) {
      for (const group of result.groups) {
        if (!map.has(group.sentence.index) && group.takes.length > 0) {
          map.set(group.sentence.index, group.takes[0].id);
        }
      }
    }
    return map;
  }, [storedSelections, result]);

  // Parse script to get clean text
  const scriptText = useMemo(() => {
    if (!rawScript.trim()) return "";
    const parsed = parseScript(rawScript);
    return parsed.text;
  }, [rawScript]);

  const handleDetect = useCallback(() => {
    if (!scriptText || captions.length === 0) {
      toast.error("No hay script o captions para analizar");
      return;
    }

    const detectionResult = detectTakes(scriptText, captions);
    setResult(detectionResult);

    // Initialize selected takes in store (first take for each group)
    const initialSelection: Record<string, number> = {};
    for (const group of detectionResult.groups) {
      if (group.takes.length > 0) {
        initialSelection[group.sentence.index.toString()] = 0;
      }
    }
    setAllTakeSelections(videoId, initialSelection, true);

    if (detectionResult.sentencesWithRepetitions === 0) {
      toast.info("Analisis completado", {
        description: "No se encontraron repeticiones en este video",
      });
    } else {
      toast.success("Repeticiones detectadas", {
        description: `${detectionResult.sentencesWithRepetitions} oracion(es) con multiples tomas`,
      });
    }
  }, [scriptText, captions, videoId, setAllTakeSelections]);

  const handleSelectTake = useCallback(
    (sentenceIndex: number, takeId: string) => {
      // Find the take index for the selected take
      if (result) {
        const group = result.groups.find((g) => g.sentence.index === sentenceIndex);
        if (group) {
          const takeIndex = group.takes.findIndex((t) => t.id === takeId);
          if (takeIndex !== -1) {
            setTakeSelection(videoId, sentenceIndex.toString(), takeIndex);
          }
        }

        // Update the result to reflect selection
        const updatedGroups = result.groups.map((g) => {
          if (g.sentence.index === sentenceIndex) {
            return {
              ...g,
              takes: g.takes.map((take) => ({
                ...take,
                selected: take.id === takeId,
              })),
            };
          }
          return g;
        });
        setResult({ ...result, groups: updatedGroups });
      }

      onSelectTake?.(sentenceIndex, takeId);
    },
    [result, videoId, setTakeSelection, onSelectTake]
  );

  const handleSeekToTake = useCallback(
    (take: Take) => {
      onSeekTo?.(take.startMs);
    },
    [onSeekTo]
  );

  // Calculate stats for selected takes
  const selectedStats = useMemo(() => {
    if (!result) return null;
    const takes = getSelectedTakes(result);
    return {
      count: takes.length,
      duration: getSelectedDuration(result),
    };
  }, [result]);

  // Group sentences by whether they have repetitions
  const { withRepetitions, withoutRepetitions } = useMemo(() => {
    if (!result) return { withRepetitions: [], withoutRepetitions: [] };
    return {
      withRepetitions: result.groups.filter((g) => g.hasRepetitions),
      withoutRepetitions: result.groups.filter((g) => !g.hasRepetitions),
    };
  }, [result]);

  return (
    <div className="space-y-4">
      {/* Detection Controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">
            Deteccion de Tomas Repetidas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!scriptText ? (
            <Alert>
              <AlertDescription>
                Primero importa un guion en el panel de Script.
              </AlertDescription>
            </Alert>
          ) : captions.length === 0 ? (
            <Alert>
              <AlertDescription>
                No hay captions disponibles. Ejecuta primero el paso de
                Captions.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Compara el guion con la transcripcion para encontrar frases que
                se dijeron multiples veces.
              </p>
              <Button onClick={handleDetect}>
                <SearchIcon className="w-4 h-4 mr-2" />
                Detectar Repeticiones
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <>
          {/* Summary */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Resumen</span>
                    <Badge variant="secondary">
                      {result.totalSentences} oraciones
                    </Badge>
                    <Badge variant="secondary">{result.totalTakes} tomas</Badge>
                    {result.sentencesWithRepetitions > 0 && (
                      <Badge variant="default" className="bg-amber-500">
                        {result.sentencesWithRepetitions} con repeticiones
                      </Badge>
                    )}
                  </div>
                  {selectedStats && (
                    <p className="text-xs text-muted-foreground">
                      Seleccionadas: {selectedStats.count} tomas •{" "}
                      {formatDuration(selectedStats.duration)} total
                    </p>
                  )}
                </div>
                <ConfidenceBadge confidence={result.overallConfidence} />
              </div>
            </CardContent>
          </Card>

          {/* Sentences with Repetitions */}
          {withRepetitions.length > 0 && (
            <Card className="border-amber-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <RepeatIcon className="w-4 h-4 text-amber-500" />
                  Oraciones con Multiples Tomas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Accordion type="multiple" className="w-full">
                  {withRepetitions.map((group) => (
                    <TakeGroupItem
                      key={group.sentence.index}
                      group={group}
                      selectedTakeId={selectedTakes.get(group.sentence.index)}
                      onSelectTake={handleSelectTake}
                      onSeekTo={handleSeekToTake}
                    />
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          )}

          {/* Sentences without Repetitions */}
          {withoutRepetitions.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <CheckIcon className="w-4 h-4 text-green-500" />
                  Oraciones Unicas ({withoutRepetitions.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Accordion type="multiple" className="w-full">
                  {withoutRepetitions.map((group) => (
                    <TakeGroupItem
                      key={group.sentence.index}
                      group={group}
                      selectedTakeId={selectedTakes.get(group.sentence.index)}
                      onSelectTake={handleSelectTake}
                      onSeekTo={handleSeekToTake}
                      collapsed
                    />
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

interface TakeGroupItemProps {
  group: TakeGroup;
  selectedTakeId?: string;
  onSelectTake: (sentenceIndex: number, takeId: string) => void;
  onSeekTo: (take: Take) => void;
  collapsed?: boolean;
}

function TakeGroupItem({
  group,
  selectedTakeId,
  onSelectTake,
  onSeekTo,
  collapsed,
}: TakeGroupItemProps) {
  const { sentence, takes, hasRepetitions } = group;

  return (
    <AccordionItem value={`sentence-${sentence.index}`}>
      <AccordionTrigger className="hover:no-underline">
        <div className="flex items-center gap-2 flex-1 text-left">
          <Badge
            variant={hasRepetitions ? "default" : "outline"}
            className={cn(
              "text-xs shrink-0",
              hasRepetitions && "bg-amber-500"
            )}
          >
            {takes.length}x
          </Badge>
          <span className="text-sm truncate">{sentence.text}</span>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-2 pl-2">
          {takes.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No se encontro esta oracion en la transcripcion
            </p>
          ) : (
            takes.map((take, idx) => (
              <TakeItem
                key={take.id}
                take={take}
                index={idx + 1}
                isSelected={selectedTakeId === take.id}
                onSelect={() => onSelectTake(sentence.index, take.id)}
                onSeekTo={() => onSeekTo(take)}
              />
            ))
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

interface TakeItemProps {
  take: Take;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onSeekTo: () => void;
}

function TakeItem({ take, index, isSelected, onSelect, onSeekTo }: TakeItemProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 p-2 rounded border cursor-pointer transition-colors",
        isSelected
          ? "border-primary bg-primary/5"
          : "border-transparent bg-muted/50 hover:bg-muted"
      )}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2 shrink-0">
        <div
          className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium",
            isSelected
              ? "bg-primary text-primary-foreground"
              : "bg-muted-foreground/20"
          )}
        >
          {index}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={(e) => {
            e.stopPropagation();
            onSeekTo();
          }}
        >
          <PlayIcon className="w-3 h-3" />
        </Button>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{take.transcribedText}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono">
            {formatTime(take.startMs)} - {formatTime(take.endMs)}
          </span>
          <span>({formatDuration(take.durationMs)})</span>
        </div>
      </div>

      <Badge
        variant="outline"
        className={cn(
          "shrink-0 text-xs",
          take.confidence >= 0.8
            ? "border-green-300 text-green-700"
            : take.confidence >= 0.5
            ? "border-yellow-300 text-yellow-700"
            : "border-red-300 text-red-700"
        )}
      >
        {Math.round(take.confidence * 100)}%
      </Badge>
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const percent = Math.round(confidence * 100);
  const variant =
    percent >= 80 ? "default" : percent >= 50 ? "secondary" : "destructive";

  return <Badge variant={variant}>{percent}% confianza</Badge>;
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function RepeatIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}
