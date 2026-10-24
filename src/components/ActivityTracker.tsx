import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../lib/api";

const HEARTBEAT_MS = 2 * 60 * 1000;

// Reports the signed-in user's current page (on every navigation) and a
// heartbeat every 2 minutes while the tab is visible, so Manajemen Pengguna
// can show last activity. Failures are ignored on purpose: tracking must
// never get in the user's way.
export default function ActivityTracker() {
  const { pathname } = useLocation();

  useEffect(() => {
    api.post("/api/activity/ping", { path: pathname }).catch(() => {});
  }, [pathname]);

  useEffect(() => {
    const beat = () => {
      if (document.visibilityState === "visible") {
        api.post("/api/activity/ping", { path: window.location.pathname, heartbeat: true }).catch(() => {});
      }
    };
    const timer = window.setInterval(beat, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", beat);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
  }, []);

  return null;
}
