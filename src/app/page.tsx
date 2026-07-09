"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { BuildPlan, BuildStep } from "@/lib/types";
import { applyTrustPipeline } from "@/lib/trust";
import { listPlans, savePlan, newPlanId, touchPlan, deletePlan } from "@/lib/storage";
import demoPlan from "@/data/sat-line.json";

const DEMO_PROJECTS = [
  {
    plan: demoPlan as unknown as BuildPlan,
    tagline: "Solar-powered WiFi clock with temp display",
    tags: "ESP32-C3 · OLED · Solar · Bamboo",
    highlights: ["3D layers", "ERC wiring check", "Step diagrams"],
  },
];

/** UI labels for the real pipeline layers (see src/lib/pipeline/run.ts). */
const LOADING_STAGES = [
  { layer: 1, icon: "🛡", label: "Checking for hazards" },
  { layer: 2, icon: "🧭", label: "Framing the goal" },
  { layer: 3, icon: "📋", label: "Finding every part" },
  { layer: 4, icon: "📚", label: "Checking the catalog" },
  { layer: 5, icon: "✍️", label: "Writing your steps" },
  { layer: 6, icon: "✅", label: "Safety & trust checks" },
];

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<"url" | "text">("text");
  const [loading, setLoading] = useState(false);
  const [activeLayer, setActiveLayer] = useState(1);
  const [error, setError] = useState("");
  const [savedPlans, setSavedPlans] = useState<BuildPlan[]>([]);

  const refresh = useCallback(() => {
    setSavedPlans(listPlans());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openSession = useCallback(
    (p: BuildPlan) => {
      const trusted = applyTrustPipeline({
        ...p,
        id: p.id || newPlanId(),
      });
      savePlan(trusted);
      touchPlan(trusted.id);
      router.push(`/build/${trusted.id}`);
    },
    [router]
  );

  const handleBuild = async (input: { url?: string; description?: string }) => {
    setLoading(true);
    setError("");
    setActiveLayer(1);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      // Pre-flight validation errors come back as plain JSON with a non-2xx status.
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to generate build plan");
      }

      // Success streams newline-delimited JSON: {type:"progress"|"done"|"error"}.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalPlan: BuildPlan | null = null;
      let streamError: string | null = null;

      const handleLine = (raw: string) => {
        const line = raw.trim();
        if (!line) return;
        let evt: { type?: string; layer?: number; plan?: BuildPlan; error?: string };
        try {
          evt = JSON.parse(line);
        } catch {
          return;
        }
        if (evt.type === "progress" && typeof evt.layer === "number") {
          const layer = evt.layer;
          setActiveLayer((prev) => Math.max(prev, layer));
        } else if (evt.type === "done" && evt.plan) {
          finalPlan = evt.plan;
        } else if (evt.type === "error") {
          streamError = evt.error || "Something went wrong";
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          handleLine(buffer.slice(0, nl));
          buffer = buffer.slice(nl + 1);
        }
      }
      handleLine(buffer); // flush a trailing line with no newline

      if (streamError) throw new Error(streamError);
      if (!finalPlan) throw new Error("No plan was returned. Please try again.");

      const plan = applyTrustPipeline({
        ...(finalPlan as BuildPlan),
        id: (finalPlan as BuildPlan).id || newPlanId(),
      } as BuildPlan);
      savePlan(plan);
      touchPlan(plan.id);
      router.push(`/build/${plan.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 mx-auto mb-6 border-4 border-accent/20 border-t-accent rounded-full animate-spin" />
          <h2 className="text-xl font-bold text-text font-serif mb-4">Building your guide</h2>
          <div className="space-y-2 text-left inline-block">
            {LOADING_STAGES.map((stage) => {
              const state =
                activeLayer > stage.layer ? "done" : activeLayer === stage.layer ? "active" : "pending";
              return (
                <p
                  key={stage.layer}
                  className={`text-sm flex items-center gap-2 transition-all duration-500 ${
                    state === "done"
                      ? "text-text-secondary"
                      : state === "active"
                        ? "text-text font-medium"
                        : "text-text-muted/30"
                  }`}
                >
                  <span className="w-4 shrink-0 text-center">
                    {state === "done" ? "✓" : state === "active" ? stage.icon : "○"}
                  </span>
                  {stage.label}
                </p>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const recentPlans = savedPlans.slice(0, 6);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col justify-center px-6 lg:px-16 py-16">
      <div className="max-w-2xl mx-auto w-full">
        <h1 className="text-[3rem] lg:text-[4rem] leading-[1.05] font-bold tracking-tight text-text mb-4 font-serif">
          What do you
          <br />
          <span className="text-accent">want to build?</span>
        </h1>
        <p className="text-base text-text-secondary mb-8">
          Paste a YouTube link or describe your project. We&apos;ll find every part, price the cart,
          generate code that matches the wiring, show a peelable 3D product model, and unstick you
          when something fails.
        </p>

        <div className="flex gap-1 mb-4">
          {(["text", "url"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                mode === m ? "bg-accent text-white" : "text-text-muted hover:text-text"
              }`}
            >
              {m === "text" ? "Describe it" : "YouTube link"}
            </button>
          ))}
        </div>

        {mode === "text" ? (
          <div className="space-y-4">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="I want to build a solar-powered weather station with an ESP32, a temperature sensor, an OLED display, and a battery..."
              rows={4}
              className="w-full px-5 py-4 bg-surface border border-border-subtle rounded-xl text-base placeholder:text-text-muted/50 focus:border-accent transition-all shadow-card resize-none"
            />
            <button
              onClick={() => description.trim() && handleBuild({ description: description.trim() })}
              disabled={!description.trim()}
              className="w-full px-8 py-4 bg-accent text-white rounded-xl font-semibold btn-spring disabled:opacity-30 cursor-pointer"
            >
              Generate build plan
            </button>
          </div>
        ) : (
          <div className="flex gap-3">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="youtube.com/watch?v=..."
              className="flex-1 px-5 py-4 bg-surface border border-border-subtle rounded-xl text-base placeholder:text-text-muted/50 focus:border-accent transition-all shadow-card"
            />
            <button
              onClick={() => url.trim() && handleBuild({ url: url.trim() })}
              disabled={!url.trim()}
              className="shrink-0 px-8 py-4 bg-accent text-white rounded-xl font-semibold btn-spring disabled:opacity-30 cursor-pointer"
            >
              Go →
            </button>
          </div>
        )}

        {error && (
          <div className="mt-4 p-4 rounded-xl bg-danger-soft border border-danger/20 text-danger text-sm">{error}</div>
        )}

        {/* Capabilities strip */}
        <div className="mt-10 grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            ["🛡", "Safety scan"],
            ["🛒", "Priced cart"],
            ["🧊", "3D layers"],
            ["💻", "Matched code"],
            ["🔧", "Unstick mode"],
          ].map(([icon, label]) => (
            <div
              key={label}
              className="text-center p-3 rounded-xl bg-surface border border-border-subtle text-xs text-text-secondary"
            >
              <div className="text-lg mb-1">{icon}</div>
              {label}
            </div>
          ))}
        </div>

        <div className="mt-12 pt-12 border-t border-border-subtle">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs text-text-muted uppercase tracking-widest font-medium">
              Try the sat-line demo
            </span>
            <span className="flex-1 h-px bg-border" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {DEMO_PROJECTS.map((proj, idx) => (
              <div
                key={idx}
                className="rounded-xl bg-surface border border-border-subtle shadow-card overflow-hidden cursor-pointer hover:border-accent/30 transition-all"
                onClick={() => openSession(proj.plan)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openSession(proj.plan);
                  }
                }}
              >
                <div className="p-4 bg-surface-raised border-b border-border-subtle">
                  <div className="flex items-start justify-between mb-1">
                    <h3 className="text-sm font-semibold text-text font-serif">{proj.plan.title}</h3>
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-warning-soft text-warning shrink-0 ml-2">
                      {proj.plan.difficulty}
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary">{proj.tagline}</p>
                  <p className="text-[11px] text-text-muted mt-1">{proj.tags}</p>
                  {proj.highlights && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {proj.highlights.map((h) => (
                        <span
                          key={h}
                          className="text-[10px] px-1.5 py-0.5 rounded-md bg-accent/10 text-accent font-medium"
                        >
                          {h}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-text-muted">
                    <span>{proj.plan.parts.length} parts</span>
                    <span>·</span>
                    <span>{proj.plan.steps.length} steps</span>
                    <span>·</span>
                    <span>{proj.plan.estimatedTime}</span>
                    <span>·</span>
                    <span className="text-accent font-medium">{proj.plan.estimatedCost}</span>
                  </div>
                </div>
                <div className="p-3 space-y-1.5">
                  {proj.plan.steps.slice(0, 3).map((st: BuildStep) => (
                    <div key={st.stepNumber} className="flex items-start gap-2">
                      <span className="shrink-0 w-4 h-4 rounded-full bg-accent/10 border border-accent/20 text-[9px] text-accent flex items-center justify-center font-mono">
                        {st.stepNumber}
                      </span>
                      <span className="text-xs text-text font-medium truncate">{st.title}</span>
                    </div>
                  ))}
                  <p className="text-[11px] text-accent font-semibold pt-1">
                    Open 3D demo →
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {recentPlans.length > 0 && (
          <div className="mt-8 pt-8 border-t border-border-subtle">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-xs text-text-muted uppercase tracking-widest font-medium">Your builds</span>
              <span className="flex-1 h-px bg-border" />
            </div>
            <div className="space-y-2">
              {recentPlans.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 p-4 rounded-xl bg-surface border border-border-subtle hover:border-accent/30 transition-all"
                >
                  <button onClick={() => openSession(p)} className="flex-1 text-left cursor-pointer min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-text truncate">{p.title}</span>
                      <span className="text-xs text-text-muted shrink-0">{p.estimatedCost}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
                      <span>{p.parts?.length || 0} parts</span>
                      <span>·</span>
                      <span>{p.steps?.length || 0} steps</span>
                      {p.bomEstimate && (
                        <>
                          <span>·</span>
                          <span className="text-accent">
                            ~${Math.round(p.bomEstimate.totalMin)}–${Math.round(p.bomEstimate.totalMax)}
                          </span>
                        </>
                      )}
                    </div>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deletePlan(p.id);
                      refresh();
                    }}
                    className="text-xs text-text-muted hover:text-danger cursor-pointer px-2"
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
