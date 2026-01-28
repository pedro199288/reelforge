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
import { GlucoseMetabolismExplainer } from "./remotion-compositions/GlucoseMetabolism";
import { MuscleContractionExplainer } from "./remotion-compositions/MuscleContraction";
import { TrainingPeriodizationExplainer } from "./remotion-compositions/TrainingPeriodization";
import { HeartRateZonesExplainer } from "./remotion-compositions/HeartRateZones";
import { SleepCyclesExplainer } from "./remotion-compositions/SleepCycles";
import { MacroBreakdownExplainer } from "./remotion-compositions/MacroBreakdown";
import { ExerciseBreakdownExplainer } from "./remotion-compositions/ExerciseBreakdown";
import {
  CountdownTimerDemo,
  StatCardDemo,
  QuoteOverlayDemo,
} from "./remotion-compositions/ui";

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
        <Composition
          id="GlucoseMetabolism"
          component={GlucoseMetabolismExplainer}
          durationInFrames={1020}
          fps={30}
          width={1080}
          height={1920}
          defaultProps={{
            language: "es",
            showEnzymes: true,
          }}
        />
        <Composition
          id="MuscleContraction"
          component={MuscleContractionExplainer}
          durationInFrames={1020}
          fps={30}
          width={1080}
          height={1920}
          defaultProps={{
            language: "es",
          }}
        />
        <Composition
          id="TrainingPeriodization"
          component={TrainingPeriodizationExplainer}
          durationInFrames={930}
          fps={30}
          width={1080}
          height={1920}
          defaultProps={{
            language: "es",
          }}
        />
        <Composition
          id="HeartRateZones"
          component={HeartRateZonesExplainer}
          durationInFrames={900}
          fps={30}
          width={1080}
          height={1920}
          defaultProps={{
            language: "es",
            maxHR: 190,
          }}
        />
        <Composition
          id="SleepCycles"
          component={SleepCyclesExplainer}
          durationInFrames={900}
          fps={30}
          width={1080}
          height={1920}
          defaultProps={{
            language: "es",
          }}
        />
        <Composition
          id="MacroBreakdown"
          component={MacroBreakdownExplainer}
          durationInFrames={870}
          fps={30}
          width={1080}
          height={1920}
          defaultProps={{
            language: "es",
            totalCalories: 2500,
            proteinGrams: 180,
            carbGrams: 280,
            fatGrams: 80,
          }}
        />
        <Composition
          id="ExerciseBreakdown"
          component={ExerciseBreakdownExplainer}
          durationInFrames={900}
          fps={30}
          width={1080}
          height={1920}
          defaultProps={{
            language: "es",
          }}
        />
      </Folder>
      <Folder name="ui-components">
        <Composition
          id="CountdownTimer"
          component={CountdownTimerDemo}
          durationInFrames={330}
          fps={30}
          width={1080}
          height={1920}
        />
        <Composition
          id="StatCard"
          component={StatCardDemo}
          durationInFrames={180}
          fps={30}
          width={1080}
          height={1920}
        />
        <Composition
          id="QuoteOverlay"
          component={QuoteOverlayDemo}
          durationInFrames={180}
          fps={30}
          width={1080}
          height={1920}
        />
      </Folder>
    </>
  );
};
