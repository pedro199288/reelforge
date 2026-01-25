import { Skeleton } from "@/components/ui/skeleton";

interface VideoSidebarSkeletonProps {
  count?: number;
}

export function VideoSidebarSkeleton({ count = 4 }: VideoSidebarSkeletonProps) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-3 rounded-lg border border-transparent">
          <Skeleton className="h-4 w-3/4 mb-2" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-1 flex-1" />
            <Skeleton className="h-3 w-8" />
          </div>
        </div>
      ))}
    </div>
  );
}
