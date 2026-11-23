/** True when a campaign's scheduled local date-time is already due. */
export function broadcastScheduleIsDue(scheduleAt: unknown, now = Date.now()): boolean {
    const raw = String(scheduleAt || "").trim();
    if (!raw || raw === "-") return false;
    const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
    const at = Date.parse(normalized);
    return !Number.isNaN(at) && at <= now;
}
