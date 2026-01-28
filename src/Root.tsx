import "./index.css";
import { Composition, Folder, staticFile } from "remotion";
import {
  CaptionedVideo,
  calculateCaptionedVideoMetadata,
  captionedVideoSchema,
} from "./remotion-compositions/CaptionedVideo";
import { Tutorial } from "./remotion-compositions/Tutorial";
import { KrebsCycleExplainer } from "./remotion-compositions/KrebsCycle";
import { ProgressiveOverloadGraphsExplainer } from "./remotion-compositions/ProgressiveOverload";

// Each <Composition> is an entry in the sidebar!

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Folder name="remotion-compositions">
        <Composition
          id="CaptionedVideo"
          component={CaptionedVideo}
          calculateMetadata={calculateCaptionedVideoMetadata}
          schema={captionedVideoSchema}
          width={1080}
          height={1920}
          defaultProps={{
            src: staticFile("videos/Errores empezando gimnasio.mp4"),
            // src: staticFile("videos/sample-video.mp4"),
          }}
        />
        {/* Tutorial interactivo para aprender Remotion paso a paso */}
        <Composition
          id="Tutorial"
          component={Tutorial}
          durationInFrames={150}
          fps={30}
          width={1080}
          height={1920}
        />
        <Composition
          id="KrebsCycle"
          component={KrebsCycleExplainer}
          durationInFrames={930}
          fps={30}
          width={1080}
          height={1920}
          defaultProps={{
            language: "es",
            showEnzymes: true,
          }}
        />
        <Composition
          id="ProgressiveOverload"
          component={ProgressiveOverloadGraphsExplainer}
          durationInFrames={600}
          fps={30}
          width={1080}
          height={1920}
          defaultProps={{
            fontFamily: "TheBoldFont",
          }}
        />
      </Folder>
    </>
  );
};
