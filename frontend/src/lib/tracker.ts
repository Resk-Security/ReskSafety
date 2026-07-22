const API_BASE = "";

let visitorId: string | null = localStorage.getItem("resk_visitor_id");
if (!visitorId) {
  visitorId = crypto.randomUUID();
  localStorage.setItem("resk_visitor_id", visitorId);
}

const seen = new Set<string>();

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return Math.abs(h).toString(36);
}

export function track(event: string, data?: Record<string, unknown>) {
  const key = `${event}:${JSON.stringify(data || {})}`;
  if (seen.has(key)) return;
  seen.add(key);

  const payload = {
    visitor_id: visitorId,
    event,
    data: { ...data, url: location.href, referrer: document.referrer || null, screen: `${window.innerWidth}x${window.innerHeight}`, tz: Intl.DateTimeFormat().resolvedOptions().timeZone },
    ts: new Date().toISOString(),
  };

  navigator.sendBeacon?.(`${API_BASE}/api/track`, JSON.stringify(payload)) ||
    fetch(`${API_BASE}/api/track`, { method: "POST", body: JSON.stringify(payload), headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
}

export function trackPage() {
  track("page_view", { path: location.pathname, title: document.title });
}

export function getVisitorId() {
  return visitorId;
}
