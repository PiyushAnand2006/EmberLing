// Per-Dotling virtual screen panel — the original's "EA's screen": a dark
// surface showing what the bot's VM is doing, with its Routines (recurring
// tasks) listed beneath. Idle = centered monitor icon; active = "Acting on
// the screen" with the last VM action. Rendered as a right rail on bot chats.
import React, { useEffect, useState } from "react";
import { IconClock } from "./Icons";

type ScreenData = {
  screen?: { ts?: number; tool?: string; cmd?: string; exitCode?: number | null; out?: string; trail?: { ts: number; tool?: string; cmd?: string; out?: string }[] };
  acting?: boolean;
  routines?: { id: string; name: string; enabled: boolean; schedule: string; nextJoin: string | null }[];
};

function MonitorGlyph() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

export function BotScreenPanel({ botId, botName }: { botId: string; botName: string }) {
  const [data, setData] = useState<ScreenData | null>(null);

  useEffect(() => {
    if (!botId) return;
    let off = false;
    const pull = async () => {
      try {
        const res = await window.emberling.botScreen.get(botId);
        if (!off) setData(res);
      } catch {}
    };
    pull();
    const timer = setInterval(pull, 5000);
    return () => {
      off = true;
      clearInterval(timer);
    };
  }, [botId]);

  const acting = !!data?.acting;
  const last = data?.screen?.trail?.[0] || (data?.screen?.cmd ? data.screen : null);

  return (
    <div className="bot-screen-panel">
      {/* virtual screen surface */}
      <div className={`bot-screen-surface${acting ? " acting" : ""}`}>
        {acting && last ? (
          <div className="bot-screen-live">
            <div className="bot-screen-status">Acting on the screen</div>
            <code className="bot-screen-cmd">{last.cmd}</code>
            {last.out ? <pre className="bot-screen-out">{String(last.out).slice(0, 200)}</pre> : null}
          </div>
        ) : (
          <div className="bot-screen-idle">
            <MonitorGlyph />
          </div>
        )}
      </div>
      <div className="bot-screen-caption">{botName}&rsquo;s screen</div>

      {/* routines */}
      <div className="routines-section">
        <div className="routines-header">Routines</div>
        {(data?.routines || []).length === 0 ? (
          <div className="routines-empty">Routines are recurring tasks this Bot runs on a schedule. Ask it in chat to set one up.</div>
        ) : (
          (data?.routines || []).map((r) => (
            <div key={r.id} className={`routine-row${r.enabled ? "" : " off"}`}>
              <IconClock size={13} />
              <div className="routine-body">
                <div className="routine-name">{r.name}</div>
                <div className="routine-schedule">
                  {r.schedule}
                  {r.nextJoin ? <span className="routine-next"> · next {r.nextJoin}</span> : null}
                </div>
              </div>
              <span className={`routine-dot${r.enabled ? " on" : ""}`} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
