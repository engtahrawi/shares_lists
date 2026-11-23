'use strict';
// Deadline reminders while the app is running: a notification at 9:00 on the chosen day before the
// deadline. Mirrors savemind/src/main/java/com/abdallah/savemind/Reminders.java.

const MAX_TIMER = 2147000000; // setTimeout limit (about 24.8 days); longer waits re-check later

function fireTime(link) {
  if (link.deadline_at == null) return -1;
  const days = link.remind_days || 0;
  if (days <= 0 || link.reminded || link.archived) return -1;
  if (link.deadline_at <= Date.now()) return -1;
  const d = new Date(link.deadline_at);
  d.setDate(d.getDate() - days);
  d.setHours(9, 0, 0, 0);
  return d.getTime();
}

function daysLeft(deadline) {
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(deadline); b.setHours(0, 0, 0, 0);
  return Math.round((b - a) / 86400000);
}

class Reminders {
  /** @param notify function(title, body, linkId) that shows a notification */
  constructor(store, notify) {
    this.store = store;
    this.notify = notify;
    this.timers = new Map();
  }

  schedule(link) {
    if (!link) return;
    const old = this.timers.get(link.id);
    if (old) clearTimeout(old);
    this.timers.delete(link.id);
    const at = fireTime(link);
    if (at < 0) return;
    const wait = Math.max(0, at - Date.now());
    const t = setTimeout(() => {
      this.timers.delete(link.id);
      if (wait > MAX_TIMER) { this.schedule(this.store.getLink(link.id)); return; }
      this.fire(link.id);
    }, Math.min(wait, MAX_TIMER));
    this.timers.set(link.id, t);
  }

  scheduleAll() {
    for (const l of this.store.pendingReminders()) this.schedule(l);
  }

  cancel(linkId) {
    const t = this.timers.get(linkId);
    if (t) clearTimeout(t);
    this.timers.delete(linkId);
  }

  fire(linkId) {
    const l = this.store.getLink(linkId);
    if (!l || l.reminded || !(l.remind_days > 0) || l.archived) return;
    if (l.deadline_at == null || l.deadline_at <= Date.now()) return;
    const left = daysLeft(l.deadline_at);
    const when = left <= 0 ? 'Deadline today' : left === 1 ? 'Deadline tomorrow' : 'Deadline in ' + left + ' days';
    this.notify(when, l.title || l.url, linkId);
    this.store.patchLocal(linkId, { reminded: 1 });
  }
}

module.exports = { Reminders, fireTime, daysLeft };
