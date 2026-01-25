import { VideoPlayer } from "@/components/VideoPlayer";

const VIDEO_SRC = "/sample-video.mp4";

export const PreviewView: React.FC = () => {
  return (
    <div className="h-full flex flex-col items-center justify-center p-6 gap-4">
      <h2 className="m-0 text-lg text-muted-foreground">
        Preview del Video
      </h2>
      <VideoPlayer src={VIDEO_SRC} width={360} height={640} />
      <p className="text-muted-foreground text-sm">
        Para renderizar el video final, abre{" "}
        <a
          href="http://localhost:3001"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          Remotion Studio
        </a>
      </p>
    </div>
  );
};
