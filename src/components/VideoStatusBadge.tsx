import { Badge } from "@/components/ui/badge";

interface VideoStatusBadgeProps {
  hasCaptions: boolean;
}

export function VideoStatusBadge({ hasCaptions }: VideoStatusBadgeProps) {
  if (hasCaptions) {
    return (
      <Badge variant="default" className="bg-green-600 hover:bg-green-700">
        Captions
      </Badge>
    );
  }

  return (
    <Badge variant="secondary">
      Raw
    </Badge>
  );
}
