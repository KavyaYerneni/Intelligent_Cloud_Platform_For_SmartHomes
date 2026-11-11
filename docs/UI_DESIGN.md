# UI design: EchoNest

What the interface is for, and the reasons behind its look. Written before the redesign was built, then updated to match what shipped.

## Subject, audience, job

**Subject:** a safety-monitoring console for a community of senior homes.
**Audience:** cloud operators, IoT technicians, house owners/family, responders (and the course reviewers watching the demo).
**Primary job:** answer *which house needs me right now, and what do I do about it* in one glance, then let each role act without leaving the screen.

## Constraints taken from the designs

- Component 1 §5.1: navy header, light workspace, teal healthy, gold warning, coral critical, visible text labels, high-contrast focus. Map is the primary work area; a house table is the non-map alternative.
- System Design 5.5: severity uses text **and** a consistent visual cue, never color alone. Destructive actions confirm and explain the effect. Every live panel shows its last successful update and a disconnected state.
- Component 3 §5.1: alert queue is priority-first; detail separates evidence, confidence, lifecycle history and actions.
- Component 2 §5.1: house/room tree plus searchable device table; inline validation; capability chips; confirmation for archive and commands.

## Tokens

| Token | Value | Use |
|---|---|---|
| Navy | `#12283B` | Sidebar, primary buttons, selected states |
| Canvas | `#F1F4F6` | Workspace background |
| Surface | `#FFFFFF` | Panels |
| Line | `#DCE3E8` | Hairline borders (no drop shadows on panels) |
| Ink / Ink-2 | `#142636` / `#536576` | Text / secondary text |
| Teal | `#0A7A73` | Healthy, online, resolved |
| Gold | `#9A6510` text, `#D99B2B` mark | Degraded, pending, in progress |
| Coral | `#B9412F` text, `#D45A45` mark | Critical, high, house in alert |
| Slate | `#5B6878` | Offline, archived, neutral |

**Type:** Manrope (headings, large numbers) and DM Sans (interface text), the team's original pairing. Scale 12 / 13 / 14 / 16 / 20 / 26 / 34 px. Body text in dense views is 14 px; nothing below 12 px. Sentence case everywhere, including table headers; no all-caps labels.

## The one bold element

**The attention rail on the overview.** Instead of opening with four identical number cards, the dashboard leads with a ranked list of houses that need someone, each written as a plain sentence: *"Smoke alarm in the Kitchen, critical, 2 min ago."* Healthy houses collapse into a single "all clear" line. Counts become a quiet strip. Everything else on the page stays restrained so this reads first.

## Status language

Each status shows a **label, a shape, and a color**, so it reads in grayscale and for color-blind viewers:

| Shape | Meaning | Examples |
|---|---|---|
| Filled dot | Good / done | Online, Healthy, Resolved, Acknowledged command |
| Triangle | Needs action | Critical, High, House in alert |
| Half-filled circle | In progress / partial | Degraded, Provisioning, Investigating, Pending write |
| Ring | Not reporting, or not picked up yet | Offline device, Active (unacknowledged) alert |
| Square | Ended / inert | Archived, Expired, Quarantined |

## Layout

```
┌────────┬──────────────────────────────────────────────────────────┐
│ EchoNest │ Page title            House: [All ▾]     ● Live 10:42:05 │
│        ├──────────────────────────────────────────────────────────┤
│ nav    │  page content (max 1440 px)                              │
│        │                                                          │
│ user   │                         drawers slide in from the right │
└────────┴──────────────────────────────────────────────────────────┘
```

| Screen | Structure |
|---|---|
| Overview | Attention rail + map, count strip, house table + recent activity. House drawer on selection. |
| Houses & devices | Room tree, device table with server-side filters, device drawer with tabs (Overview, Configuration, Commands, Credential). |
| Alerts | Split view: priority queue on the left; detail with lifecycle stepper, actions, evidence, history, notifications. |
| Data operations | Health strip, query bar with time presets, results table, event drawer; reconciliation and audit as tabs. |
| Simulator | Device and heartbeat controls; event composer with a live preview of the rule outcome from `/catalog`. |

## Things deliberately avoided

Eyebrow labels above headings, middle-dot meta strings, arrows appended to buttons, identical shadowed cards, gradient decoration, browser `prompt()`/`confirm()` dialogs, and raw JSON as the primary display (raw JSON remains available behind "Show raw record").
