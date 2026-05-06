import { useState } from "react";
import { TrainingTabs, RulesTab, PromptTab, SandboxTab, type TrainingTab } from "../components/training";

export default function TrainingPage() {
  const [tab, setTab] = useState<TrainingTab>("rules");

  return (
    <div className="flex flex-col h-full">
      <TrainingTabs current={tab} onChange={setTab} />
      <div className="flex-1 overflow-auto bg-slate-50">
        {tab === "rules" && <RulesTab />}
        {tab === "prompt" && <PromptTab />}
        {tab === "sandbox" && <SandboxTab />}
      </div>
    </div>
  );
}
