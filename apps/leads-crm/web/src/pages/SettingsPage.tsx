import { useState } from "react";
import {
  SettingsTabs, type SettingsTab,
  PipelineConfig, InstancesConfig, BanksConfig,
} from "../components/settings";

export default function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>("pipeline");

  return (
    <div className="flex flex-col h-full">
      <SettingsTabs current={tab} onChange={setTab} />
      <div className="flex-1 overflow-auto bg-slate-50 p-6">
        <div className="max-w-5xl mx-auto">
          {tab === "pipeline" && <PipelineConfig />}
          {tab === "instances" && <InstancesConfig />}
          {tab === "banks" && <BanksConfig />}
        </div>
      </div>
    </div>
  );
}
