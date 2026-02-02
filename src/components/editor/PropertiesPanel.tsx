import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useEditorUIStore } from "@/store/editor-ui";
import { useWorkspaceStore, useScript } from "@/store/workspace";
import { parseScript } from "@/core/script/parser";
import { SegmentProperties } from "./SegmentProperties";
import { CaptionProperties } from "./CaptionProperties";
import { PreselectionLogs } from "@/components/PreselectionLogs";
import { cn } from "@/lib/utils";
import {
  FileText,
  ScrollText,
  Settings2,
  X,
  CheckCircle2,
  AlertTriangle,
  PanelRightClose,
} from "lucide-react";
import type { SubtitlePage } from "@/core/captions/group-into-pages";
import type { Caption } from "@/core/script/align";
import type { PreselectionLog } from "@/core/preselection";

interface PropertiesPanelProps {
  videoId: string;
  preselectionLog: PreselectionLog | null;
  captionPages: SubtitlePage[];
  captions: Caption[];
  onSeekTo: (ms: number) => void;
  onEditCaption: (captionIndex: number, newText: string) => void;
  onEditCaptionTime: (captionIndex: number, startMs: number, endMs: number) => void;
  onShowLog?: (segmentId: string) => void;
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors",
        active
          ? "border-b-2 border-primary text-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

export function PropertiesPanel({
  videoId,
  preselectionLog,
  captionPages,
  captions,
  onSeekTo,
  onEditCaption,
  onEditCaptionTime,
  onShowLog,
}: PropertiesPanelProps) {
  const selection = useEditorUIStore((s) => s.selection);
  const tab = useEditorUIStore((s) => s.propertiesPanelTab);
  const setTab = useEditorUIStore((s) => s.setPropertiesPanelTab);
  const setOpen = useEditorUIStore((s) => s.setPropertiesPanelOpen);

  const scriptState = useScript(videoId);
  const setScript = useWorkspaceStore((s) => s.setScript);
  const clearScript = useWorkspaceStore((s) => s.clearScript);

  const hasSelection = selection !== null;

  // Determine what to show
  const showAuto = tab === "auto" && hasSelection;
  const showScript = tab === "script" || (tab === "auto" && !hasSelection);
  const showLogs = tab === "logs";

  return (
    <aside className="hidden md:flex md:flex-col w-[320px] flex-shrink-0 border-l bg-background min-h-0">
      {/* Tabs + close */}
      <div className="flex items-center justify-between border-b flex-shrink-0">
        <div className="flex bg-muted/20">
          {hasSelection && (
            <TabButton active={tab === "auto"} onClick={() => setTab("auto")}>
              <Settings2 className="w-3.5 h-3.5" />
              Propiedades
            </TabButton>
          )}
          <TabButton active={showScript && !showLogs} onClick={() => setTab("script")}>
            <FileText className="w-3.5 h-3.5" />
            Script
            {scriptState?.rawScript ? (
              <CheckCircle2 className="w-3 h-3 text-green-500" />
            ) : (
              <AlertTriangle className="w-3 h-3 text-yellow-500" />
            )}
          </TabButton>
          {preselectionLog && (
            <TabButton active={showLogs} onClick={() => setTab("logs")}>
              <ScrollText className="w-3.5 h-3.5" />
              Logs
            </TabButton>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 mr-2"
          onClick={() => setOpen(false)}
        >
          <PanelRightClose className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-subtle">
        {/* Auto: show properties based on selection */}
        {showAuto && selection?.type === "segment" && (
          <SegmentProperties
            videoId={videoId}
            selection={selection}
            onSeekTo={onSeekTo}
            onShowLog={onShowLog}
          />
        )}

        {showAuto && selection?.type === "caption" && (
          <CaptionProperties
            selection={selection}
            captionPages={captionPages}
            captions={captions}
            onSeekTo={onSeekTo}
            onEditCaption={onEditCaption}
            onEditCaptionTime={onEditCaptionTime}
          />
        )}

        {/* Script tab */}
        {showScript && !showLogs && (
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Guion original</h3>
              {scriptState?.rawScript && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => clearScript(videoId)}
                  className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                >
                  <X className="w-3 h-3 mr-1" />
                  Limpiar
                </Button>
              )}
            </div>
            <Textarea
              placeholder="Pega aqui tu guion original..."
              value={scriptState?.rawScript ?? ""}
              onChange={(e) => setScript(videoId, e.target.value)}
              className="min-h-[200px] text-xs font-mono resize-y"
            />
            {scriptState?.rawScript &&
              (() => {
                const parsed = parseScript(scriptState.rawScript);
                const zoomCount = parsed.markers.filter(
                  (m) => m.type === "zoom"
                ).length;
                const highlightCount = parsed.markers.filter(
                  (m) => m.type === "highlight"
                ).length;
                return (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{scriptState.rawScript.length} chars</span>
                    {zoomCount > 0 && (
                      <Badge
                        variant="secondary"
                        className="text-xs h-4 px-1.5"
                      >
                        {zoomCount} zoom{zoomCount !== 1 ? "s" : ""}
                      </Badge>
                    )}
                    {highlightCount > 0 && (
                      <Badge
                        variant="secondary"
                        className="text-xs h-4 px-1.5"
                      >
                        {highlightCount} highlight
                        {highlightCount !== 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                );
              })()}
          </div>
        )}

        {/* Logs tab */}
        {showLogs && preselectionLog && (
          <div className="p-3 h-full">
            <PreselectionLogs
              log={preselectionLog}
              onSeekTo={(seconds) => onSeekTo(seconds * 1000)}
            />
          </div>
        )}
      </div>
    </aside>
  );
}
