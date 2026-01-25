/**
 * Take Selection step component for the pipeline
 *
 * Displays detected repeated phrases and allows user to select the best take
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import { Wand2, AlertCircle, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TakeSelector, QuickTakeSelector } from "./TakeSelector";
import { useWorkspaceStore } from "@/store/workspace";
import type { PhraseGroup } from "@/core/takes/similarity";
import type { TakeScore } from "@/core/takes/scoring";
import { scoreGroupSimple } from "@/core/takes/scoring";
import { cn } from "@/lib/utils";

interface TakeSelectionStepProps {
  /** Video ID */
  videoId: string;
  /** Detected phrase groups with potential repeated takes */
  phraseGroups: PhraseGroup[];
  /** Whether the step is complete */
  isComplete: boolean;
  /** Additional class name */
  className?: string;
}

interface GroupWithScores {
  group: PhraseGroup;
  scores: TakeScore[];
  recommendedIndex: number;
}

export function TakeSelectionStep({
  videoId,
  phraseGroups,
  isComplete,
  className,
}: TakeSelectionStepProps) {
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  // Store state
  const takeSelections = useWorkspaceStore((state) => state.takeSelections[videoId]);
  const setTakeSelection = useWorkspaceStore((state) => state.setTakeSelection);
  const setAllTakeSelections = useWorkspaceStore((state) => state.setAllTakeSelections);
  const config = useWorkspaceStore((state) => state.pipelineConfig);
  const setPipelineConfig = useWorkspaceStore((state) => state.setPipelineConfig);

  // Filter to only repeated phrases
  const repeatedGroups = useMemo(
    () => phraseGroups.filter((g) => g.hasMultipleTakes),
    [phraseGroups]
  );

  // Score all groups
  const groupsWithScores = useMemo<GroupWithScores[]>(() => {
    return repeatedGroups.map((group) => {
      const { scores, bestTakeIndex } = scoreGroupSimple(group);
      return {
        group,
        scores,
        recommendedIndex: bestTakeIndex,
      };
    });
  }, [repeatedGroups]);

  // Get current selections (memoized to avoid re-renders)
  const currentSelections = useMemo(
    () => takeSelections?.selections || {},
    [takeSelections?.selections]
  );

  // Check if all groups have selections
  const allSelected = useMemo(() => {
    return repeatedGroups.every((g) => g.id in currentSelections);
  }, [repeatedGroups, currentSelections]);

  // Count how many groups have selections
  const selectedCount = useMemo(() => {
    return repeatedGroups.filter((g) => g.id in currentSelections).length;
  }, [repeatedGroups, currentSelections]);

  // Auto-select all recommended takes
  const handleAutoSelectAll = useCallback(() => {
    const selections: Record<string, number> = {};
    for (const { group, recommendedIndex } of groupsWithScores) {
      selections[group.id] = recommendedIndex;
    }
    setAllTakeSelections(videoId, selections, true);
  }, [videoId, groupsWithScores, setAllTakeSelections]);

  // Handle auto-select on mount if enabled
  useEffect(() => {
    if (config.autoSelectTakes && repeatedGroups.length > 0 && !allSelected) {
      handleAutoSelectAll();
    }
  }, [config.autoSelectTakes, repeatedGroups.length, allSelected, handleAutoSelectAll]);

  // Handle individual take selection
  const handleSelectTake = useCallback(
    (groupId: string, takeIndex: number) => {
      setTakeSelection(videoId, groupId, takeIndex);
    },
    [videoId, setTakeSelection]
  );

  // Toggle expanded group
  const toggleExpanded = useCallback((groupId: string) => {
    setExpandedGroupId((prev) => (prev === groupId ? null : groupId));
  }, []);

  // No repeated phrases detected
  if (repeatedGroups.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="py-8">
          <div className="flex flex-col items-center justify-center text-center gap-4">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <div>
              <h3 className="font-medium text-lg">Sin frases repetidas</h3>
              <p className="text-sm text-muted-foreground mt-1">
                No se detectaron frases repetidas en este video.
                Puedes continuar al siguiente paso.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header with stats and auto-select toggle */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-sm font-medium">
                  {repeatedGroups.length} frase{repeatedGroups.length !== 1 ? "s" : ""} repetida{repeatedGroups.length !== 1 ? "s" : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {selectedCount} de {repeatedGroups.length} seleccionadas
                </p>
              </div>
              {isComplete && (
                <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">
                  Completado
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-4">
              {/* Auto-select toggle */}
              <div className="flex items-center gap-2">
                <Switch
                  id="auto-select"
                  checked={config.autoSelectTakes}
                  onCheckedChange={(checked: boolean) =>
                    setPipelineConfig({ autoSelectTakes: checked })
                  }
                />
                <Label htmlFor="auto-select" className="text-sm">
                  Auto-seleccionar
                </Label>
              </div>

              {/* Auto-select all button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleAutoSelectAll}
                disabled={allSelected && takeSelections?.autoSelected}
              >
                <Wand2 className="h-4 w-4 mr-2" />
                Seleccionar mejores
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Phrase groups list */}
      <div className="space-y-3">
        {groupsWithScores.map(({ group, scores, recommendedIndex }) => {
          const selectedIndex = currentSelections[group.id] ?? -1;
          const isExpanded = expandedGroupId === group.id;
          const hasSelection = selectedIndex >= 0;

          return (
            <Collapsible
              key={group.id}
              open={isExpanded}
              onOpenChange={() => toggleExpanded(group.id)}
            >
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-sm font-medium truncate">
                            "{group.displayText}"
                          </CardTitle>
                          <Badge variant="secondary" className="shrink-0">
                            {group.takeCount} tomas
                          </Badge>
                        </div>
                        {hasSelection && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Toma {selectedIndex + 1} seleccionada
                            {selectedIndex === recommendedIndex && " (recomendada)"}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 ml-4">
                        {hasSelection ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        ) : (
                          <AlertCircle className="h-5 w-5 text-yellow-500" />
                        )}
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <CardContent className="pt-0 pb-4">
                    {/* Quick selector for collapsed view */}
                    <div className="mb-4">
                      <QuickTakeSelector
                        phraseGroup={group}
                        scores={scores}
                        recommendedIndex={recommendedIndex}
                        selectedIndex={selectedIndex >= 0 ? selectedIndex : 0}
                        onSelect={(index) => handleSelectTake(group.id, index)}
                      />
                    </div>

                    {/* Full take selector */}
                    <TakeSelector
                      phraseGroup={group}
                      scores={scores}
                      recommendedIndex={recommendedIndex}
                      selectedIndex={selectedIndex >= 0 ? selectedIndex : 0}
                      onSelect={(index) => handleSelectTake(group.id, index)}
                      onAutoSelect={() => handleSelectTake(group.id, recommendedIndex)}
                      onConfirm={() => {
                        if (selectedIndex < 0) {
                          handleSelectTake(group.id, recommendedIndex);
                        }
                        toggleExpanded(group.id);
                      }}
                      className="border-0 shadow-none"
                    />
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })}
      </div>

      {/* Warning if not all selected */}
      {!allSelected && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Selecciona una toma para cada frase repetida o usa "Seleccionar mejores"
            para continuar.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
