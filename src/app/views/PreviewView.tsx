import { VideoPlayer } from "@/components/VideoPlayer";

const VIDEO_SRC = "/sample-video.mp4";

export const PreviewView: React.FC = () => {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        gap: 16,
      }}
    >
      <h2 style={{ margin: 0, fontSize: 18, color: "#888" }}>
        Preview del Video
      </h2>
      <VideoPlayer src={VIDEO_SRC} width={360} height={640} />
      <p style={{ color: "#666", fontSize: 14 }}>
        Para renderizar el video final, abre{" "}
        <a
          href="http://localhost:3001"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#2563eb" }}
        >
          Remotion Studio
        </a>
      </p>
    </div>
  );
};
