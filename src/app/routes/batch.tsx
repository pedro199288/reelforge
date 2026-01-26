import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { BatchQueue } from "@/components/BatchQueue";
import { BatchDropZone } from "@/components/BatchDropZone";
import { BatchLogs } from "@/components/BatchLogs";
import { useBatchStore } from "@/store/batch";
import { useBatchProcessor } from "@/hooks/useBatchProcessor";
import { requestNotificationPermission } from "@/lib/notifications";
import type { Video } from "@/components/VideoList";

interface VideoManifest {
  videos: Video[];
}

export const Route = createFileRoute("/batch")({
  component: BatchPage,
});

function BatchPage() {
  const [availableVideos, setAvailableVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  const { addToQueue, setMaxParallel, setGlobalConfig, globalConfig, maxParallel, queue } =
    useBatchStore();

  const {
    startProcessing,
    stopProcessing,
    pauseProcessing,
    resumeProcessing,
  } = useBatchProcessor();

  // Load available videos
  useEffect(() => {
    fetch("/videos.manifest.json")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load video manifest");
        return res.json() as Promise<VideoManifest>;
      })
      .then((data) => {
        setAvailableVideos(data.videos);
        setLoading(false);
      })
      .catch((err) => {
        setLoading(false);
        toast.error("Error loading videos", {
          description: err.message,
        });
      });
  }, []);

  // Request notification permission on mount
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  const handleAddVideos = useCallback(() => {
    // Filter out videos already in queue
    const queuedIds = new Set(queue.map((item) => item.videoId));
    const videosToAdd = availableVideos.filter((v) => !queuedIds.has(v.id));

    if (videosToAdd.length === 0) {
      toast.info("Todos los videos ya están en la cola");
      return;
    }

    addToQueue(
      videosToAdd.map((v) => ({
        videoId: v.id,
        filename: v.filename,
      }))
    );

    toast.success(`${videosToAdd.length} videos añadidos a la cola`);
  }, [availableVideos, queue, addToQueue]);

  const handleDropVideos = useCallback(
    (files: File[]) => {
      // In a real implementation, this would upload the files
      // For now, we'll just show a toast
      toast.info(`${files.length} archivos recibidos`, {
        description: "La carga de archivos será implementada próximamente",
      });
    },
    []
  );

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Procesamiento por Lotes</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Procesa múltiples videos en paralelo
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowLogs(!showLogs)}>
              {showLogs ? "Ocultar Logs" : "Ver Logs"}
            </Button>
            <Button variant="outline" onClick={() => setShowSettings(!showSettings)}>
              {showSettings ? "Ocultar Config" : "Configuración"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Queue */}
          <div className="lg:col-span-2 space-y-6">
            {/* Drop Zone */}
            <BatchDropZone onFilesDropped={handleDropVideos} />

            {/* Queue */}
            <BatchQueue
              className="min-h-[400px]"
              onAddVideos={handleAddVideos}
              onOpenSettings={() => setShowSettings(true)}
              onStartProcessing={startProcessing}
              onPauseProcessing={pauseProcessing}
              onResumeProcessing={resumeProcessing}
              onStopProcessing={stopProcessing}
            />
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Settings Panel */}
            {showSettings && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Configuración</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Max Parallel */}
                  <div className="space-y-2">
                    <Label>Videos en paralelo: {maxParallel}</Label>
                    <Slider
                      value={[maxParallel]}
                      min={1}
                      max={4}
                      step={1}
                      onValueChange={([value]) =>
                        setMaxParallel(value as 1 | 2 | 3 | 4)
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Más videos en paralelo = más uso de CPU/memoria
                    </p>
                  </div>

                  {/* Threshold dB */}
                  <div className="space-y-2">
                    <Label>Umbral de silencio: {globalConfig.silence.thresholdDb} dB</Label>
                    <Slider
                      value={[globalConfig.silence.thresholdDb]}
                      min={-60}
                      max={-20}
                      step={1}
                      onValueChange={([value]) =>
                        setGlobalConfig({ silence: { ...globalConfig.silence, thresholdDb: value } })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Nivel de audio considerado silencio
                    </p>
                  </div>

                  {/* Min Duration */}
                  <div className="space-y-2">
                    <Label>
                      Duración mínima: {globalConfig.silence.minDurationSec}s
                    </Label>
                    <Slider
                      value={[globalConfig.silence.minDurationSec]}
                      min={0.1}
                      max={2}
                      step={0.1}
                      onValueChange={([value]) =>
                        setGlobalConfig({ silence: { ...globalConfig.silence, minDurationSec: value } })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Mínimo de segundos para detectar silencio
                    </p>
                  </div>

                  {/* Padding */}
                  <div className="space-y-2">
                    <Label>Padding: {globalConfig.silence.paddingSec}s</Label>
                    <Slider
                      value={[globalConfig.silence.paddingSec]}
                      min={0}
                      max={0.5}
                      step={0.01}
                      onValueChange={([value]) =>
                        setGlobalConfig({ silence: { ...globalConfig.silence, paddingSec: value } })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Espacio extra antes/después de cada corte
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Available Videos */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Videos Disponibles</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-muted-foreground text-sm">Cargando...</p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      {availableVideos.length} videos en la biblioteca
                    </p>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={handleAddVideos}
                      disabled={
                        availableVideos.length === 0 ||
                        availableVideos.length === queue.length
                      }
                    >
                      Añadir todos a la cola
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Estado</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">En cola</p>
                    <p className="text-2xl font-bold">
                      {queue.filter((i) => i.status === "pending").length}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Procesando</p>
                    <p className="text-2xl font-bold">
                      {queue.filter((i) => i.status === "processing").length}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Completados</p>
                    <p className="text-2xl font-bold text-green-600">
                      {queue.filter((i) => i.status === "completed").length}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Errores</p>
                    <p className="text-2xl font-bold text-red-600">
                      {queue.filter((i) => i.status === "error").length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Logs Panel */}
        {showLogs && (
          <div className="mt-6">
            <BatchLogs maxHeight="300px" />
          </div>
        )}
      </div>
    </div>
  );
}
