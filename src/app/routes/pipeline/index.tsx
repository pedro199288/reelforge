import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/pipeline/")({
  component: PipelineIndexPage,
});

function PipelineIndexPage() {
  return (
    <Card className="flex-1 flex items-center justify-center">
      <CardContent className="py-12 text-center">
        <div className="text-muted-foreground mb-2">
          Selecciona un video para ver su pipeline
        </div>
        <p className="text-sm text-muted-foreground/70">
          Haz clic en un video de la lista para ver y ejecutar los pasos del pipeline
        </p>
      </CardContent>
    </Card>
  );
}
