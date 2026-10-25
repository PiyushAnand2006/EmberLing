import React, { useState } from "react";
import { useApp } from "../state";
import type { ProviderInfo } from "../types";
import { IconCheck, IconSparkles } from "../components/Icons";
import { Orby } from "../components/Brand";

function StepProviders({ onDone }: { onDone: () => void }) {
  const { providers, settings, setSettings, toast } = useApp();
  const [selected, setSelected] = useState<string>(providers.find((p) => p.id === "groq")?.id || providers[0]?.id || "");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const provider = providers.find((p) => p.id === selected);

  const finish = async () => {
    if (provider && apiKey.trim()) {
      setSettings((s) => ({
        ...s,
        providers: { ...s.providers, [provider.id]: { apiKey: apiKey.trim(), model: model || provider.models[0]?.id || "" } },
        activeProvider: provider.id,
        onboardingDone: true,
      }));
      toast(`${provider.name} connected`);
    } else {
      setSettings((s) => ({ ...s, onboardingDone: true }));
    }
    onDone();
  };

  const test = async () => {
    if (!provider) return;
    setTesting(true);
    setTestResult(null);
    const res = await window.emberling.providers.test({ providerId: provider.id, apiKey: apiKey.trim(), model });
    setTestResult({ ok: res.ok, msg: res.ok ? `Works: "${res.sample || ""}"` : res.error || "failed" });
    setTesting(false);
  };

  return (
    <div style={{ maxWidth: 560, width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 10, filter: "drop-shadow(0 0 26px rgba(245, 78, 0, 0.28))" }}>
        <Orby size={96} mood="joy" />
      </div>
      <h2 style={{ textAlign: "center", margin: "0 0 6px" }}>Meet Emberling</h2>
      <div className="sub" style={{ textAlign: "center", marginBottom: 22, fontSize: 14, color: "var(--cursor-text-tertiary)" }}>
        A desktop agent that runs commands, edits files, searches the web and remembers what matters — powered by a free API key of your choice.
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 16 }}>
        {providers
          .filter((p) => p.id !== "custom")
          .map((p: ProviderInfo) => (
            <button
              key={p.id}
              className="chip-btn"
              style={selected === p.id ? { borderColor: "var(--cursor-accent)", color: "var(--cursor-text-primary)" } : { padding: "7px 14px" }}
              onClick={() => {
                setSelected(p.id);
                setModel("");
                setTestResult(null);
              }}
            >
              {selected === p.id && <IconCheck size={12} />}
              {p.name}
            </button>
          ))}
      </div>
      {provider && (
        <div style={{ display: "grid", gap: 8, marginBottom: 6 }}>
          <input className="text-input" type="password" placeholder={`Paste your free ${provider.name} API key`} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          <select className="text-input" value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="">{provider.models[0]?.name || "Default model"}</option>
            {provider.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} — {m.note}
              </option>
            ))}
          </select>
          {provider.keyUrl && (
            <div style={{ fontSize: 12, color: "var(--cursor-text-tertiary)", textAlign: "center" }}>
              Grab a free key at{" "}
              <a href={provider.keyUrl} target="_blank" rel="noreferrer" style={{ color: "var(--cursor-blue)" }}>
                {provider.keyUrl}
              </a>
            </div>
          )}
          {testResult && (
            <div style={{ fontSize: 12, color: testResult.ok ? "var(--cursor-green)" : "var(--cursor-danger)", wordBreak: "break-all" }}>{testResult.msg}</div>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 18 }}>
        <button className="btn" onClick={test} disabled={testing || !apiKey.trim()}>
          {testing ? "Testing…" : "Test key"}
        </button>
        <button className="btn primary" onClick={finish}>
          <IconSparkles size={13} /> Start chatting
        </button>
      </div>
      <button className="btn subtle" style={{ margin: "14px auto 0", display: "flex" }} onClick={finish}>
        Skip for now
      </button>
    </div>
  );
}

export function Onboarding() {
  const { navigate } = useApp();
  return (
    <div className="empty-state" style={{ paddingTop: 60 }}>
      <StepProviders onDone={() => navigate({ kind: "chat" })} />
    </div>
  );
}
