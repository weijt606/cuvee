"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { AtlasShell } from "@/components/wine/atlas/AtlasShell";
import { VineyardSidebar } from "@/components/wine/atlas/VineyardSidebar";
import { VineyardControls } from "@/components/wine/atlas/VineyardControls";
import { AnalysisDrawer } from "@/components/wine/atlas/AnalysisDrawer";
import { WorkflowHero } from "@/components/wine/atlas/WorkflowHero";
import { useAnalysisFlow } from "@/lib/hooks/useAnalysisFlow";
import { REGIONS } from "@/lib/wine/regions";
import type {
  AnalyzeInput,
  Region,
  Timeframe,
  UploadMeta,
} from "@/lib/wine/types";

const BordeauxMap = dynamic(
  () =>
    import("@/components/wine/trade/BordeauxMap").then((m) => m.BordeauxMap),
  {
    ssr: false,
    loading: () => <div className="h-full w-full bg-surface-1" />,
  },
);

function defaultTimeframe(): Timeframe {
  const year = new Date().getFullYear();
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

export function VineyardDashboard() {
  const first = REGIONS[0]!;
  const [region, setRegion] = useState<Pick<Region, "id" | "name" | "parent">>({
    id: first.id,
    name: first.name,
    parent: first.parent,
  });
  const [chateau, setChateau] = useState<{ name: string; aoc: string } | null>(null);
  const [timeframe, setTimeframe] = useState(defaultTimeframe);
  const [question, setQuestion] = useState("");
  const [uploads, setUploads] = useState<UploadMeta[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [reportShown, setReportShown] = useState(false);
  const { workflowState, details, result, loading, error, run } = useAnalysisFlow();

  const flowActive = workflowState.orchestrator !== "pending";
  useEffect(() => {
    if (flowActive) setDrawerOpen(true);
  }, [flowActive]);

  function handleRun() {
    setReportShown(false);
    const body: AnalyzeInput = {
      region,
      timeframe,
      persona: "vineyard",
      question: question.trim() || undefined,
      uploads: uploads.length > 0 ? uploads : undefined,
      chateau: chateau?.name,
    };
    void run(body);
  }

  return (
    <AtlasShell
      drawerOpen={drawerOpen}
      onDrawerClose={() => setDrawerOpen(false)}
      drawerLabel={
        result
          ? `${result.region.name} · Analysis`
          : loading
            ? "Agents running"
            : "Analysis"
      }
      drawer={
        result && reportShown ? (
          <AnalysisDrawer result={result} persona="vineyard" />
        ) : flowActive || result ? (
          <WorkflowHero
            state={workflowState}
            details={details}
            hasUploads={uploads.length > 0}
            subject={region.name}
            done={!!result}
            onContinue={() => setReportShown(true)}
          />
        ) : null
      }
      left={<VineyardSidebar value={region.id} onChange={setRegion} />}
      center={
        <BordeauxMap
          selectedChateau={chateau?.name ?? null}
          onChateauSelect={(c) => {
            if (c) {
              setChateau({ name: c.name, aoc: c.aoc });
              setRegion({ id: c.regionId, name: c.regionName, parent: "bordeaux" });
            } else {
              setChateau(null);
            }
          }}
        />
      }
      right={
        <VineyardControls
          region={region}
          timeframe={timeframe}
          onTimeframeChange={setTimeframe}
          uploads={uploads}
          onUploadsChange={setUploads}
          question={question}
          onQuestionChange={setQuestion}
          onRun={handleRun}
          loading={loading}
          error={error}
          hasResult={!!result}
          onShowAnalysis={() => {
            setReportShown(true);
            setDrawerOpen(true);
          }}
        />
      }
    />
  );
}
