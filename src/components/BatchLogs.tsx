/**
 * Batch processing logs viewer with filtering and export
 */

import { useState, useMemo } from "react";
import {
  Download,
  Trash2,
  AlertCircle,
  AlertTriangle,
  Info,
  Filter,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useLogsStore, exportLogsAsJson, exportLogsAsText } from "@/store/logs";
import type { LogEntry, LogLevel, PipelineStep } from "@/types/batch";
import { cn } from "@/lib/utils";

interface BatchLogsProps {
  className?: string;
  videoId?: string;
  maxHeight?: string;
}

const LEVEL_CONFIG: Record<
  LogLevel,
  { icon: typeof Info; className: string; label: string }
> = {
  info: {
    icon: Info,
    className: "text-blue-500",
    label: "Info",
  },
  warn: {
    icon: AlertTriangle,
    className: "text-yellow-500",
    label: "Aviso",
  },
  error: {
    icon: AlertCircle,
    className: "text-red-500",
    label: "Error",
  },
};

const STEP_LABELS: Record<PipelineStep, string> = {
  "silence-detection": "Detección de silencios",
  "segment-generation": "Generación de segmentos",
  cutting: "Corte",
  transcription: "Transcripción",
  rendering: "Renderizado",
};

function formatTimestamp(timestamp: Date | string): string {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return date.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

interface LogItemProps {
  log: LogEntry;
}

function LogItem({ log }: LogItemProps) {
  const config = LEVEL_CONFIG[log.level];
  const Icon = config.icon;
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={cn(
        "border-b border-border/50 py-2 px-3 text-sm",
        log.details && "cursor-pointer hover:bg-muted/50"
      )}
      onClick={() => log.details && setExpanded(!expanded)}
    >
      <div className="flex items-start gap-2">
        <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", config.className)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-muted-foreground text-xs">
              {formatTimestamp(log.timestamp)}
            </span>
            <Badge variant="outline" className="text-xs py-0">
              {log.filename}
            </Badge>
            <Badge variant="secondary" className="text-xs py-0">
              {STEP_LABELS[log.step]}
            </Badge>
          </div>
          <p className="mt-1">{log.message}</p>
          {log.details && expanded && (
            <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto whitespace-pre-wrap">
              {log.details}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

export function BatchLogs({ className, videoId, maxHeight = "400px" }: BatchLogsProps) {
  const { logs, clearLogs, clearLogsForVideo } = useLogsStore();
  const [filter, setFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState<LogLevel | "all">("all");

  const filteredLogs = useMemo(() => {
    let result = logs;

    // Filter by video if specified
    if (videoId) {
      result = result.filter((log) => log.videoId === videoId);
    }

    // Filter by level
    if (levelFilter !== "all") {
      result = result.filter((log) => log.level === levelFilter);
    }

    // Filter by search term
    if (filter) {
      const term = filter.toLowerCase();
      result = result.filter(
        (log) =>
          log.message.toLowerCase().includes(term) ||
          log.filename.toLowerCase().includes(term) ||
          log.details?.toLowerCase().includes(term)
      );
    }

    return result;
  }, [logs, videoId, levelFilter, filter]);

  const counts = useMemo(() => {
    const base = videoId ? logs.filter((l) => l.videoId === videoId) : logs;
    return {
      total: base.length,
      info: base.filter((l) => l.level === "info").length,
      warn: base.filter((l) => l.level === "warn").length,
      error: base.filter((l) => l.level === "error").length,
    };
  }, [logs, videoId]);

  const handleExport = (format: "json" | "text") => {
    if (format === "json") {
      exportLogsAsJson(filteredLogs);
    } else {
      exportLogsAsText(filteredLogs);
    }
  };

  const handleClear = () => {
    if (videoId) {
      clearLogsForVideo(videoId);
    } else {
      clearLogs();
    }
  };

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="border-b py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            Logs {videoId ? "del Video" : "de Procesamiento"}
          </CardTitle>
          <div className="flex items-center gap-2">
            {counts.error > 0 && (
              <Badge variant="destructive">{counts.error} errores</Badge>
            )}
            {counts.warn > 0 && (
              <Badge variant="outline" className="border-yellow-500 text-yellow-500">
                {counts.warn} avisos
              </Badge>
            )}
            <Badge variant="secondary">{counts.total} logs</Badge>
          </div>
        </div>
      </CardHeader>

      <div className="flex items-center gap-2 p-3 border-b">
        <div className="relative flex-1">
          <Filter className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar en logs..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <div className="flex gap-1">
          <Button
            variant={levelFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setLevelFilter("all")}
          >
            Todos
          </Button>
          <Button
            variant={levelFilter === "info" ? "default" : "outline"}
            size="sm"
            onClick={() => setLevelFilter("info")}
          >
            <Info className="h-3 w-3" />
          </Button>
          <Button
            variant={levelFilter === "warn" ? "default" : "outline"}
            size="sm"
            onClick={() => setLevelFilter("warn")}
          >
            <AlertTriangle className="h-3 w-3" />
          </Button>
          <Button
            variant={levelFilter === "error" ? "default" : "outline"}
            size="sm"
            onClick={() => setLevelFilter("error")}
          >
            <AlertCircle className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <CardContent className="flex-1 p-0 overflow-hidden">
        <div
          className="overflow-y-auto"
          style={{ maxHeight }}
        >
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Info className="h-8 w-8 text-muted-foreground/50 mb-2" />
              <p className="text-muted-foreground text-sm">
                {filter || levelFilter !== "all"
                  ? "No hay logs que coincidan con el filtro"
                  : "No hay logs todavía"}
              </p>
            </div>
          ) : (
            filteredLogs.map((log) => <LogItem key={log.id} log={log} />)
          )}
        </div>
      </CardContent>

      {counts.total > 0 && (
        <div className="flex items-center justify-between gap-2 p-3 border-t">
          <Button variant="ghost" size="sm" onClick={handleClear}>
            <Trash2 className="h-4 w-4 mr-2" />
            Limpiar
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport("text")}
            >
              <Download className="h-4 w-4 mr-2" />
              TXT
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport("json")}
            >
              <Download className="h-4 w-4 mr-2" />
              JSON
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
