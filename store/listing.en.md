<!--
Microsoft Store listing (English / en-US market). Copy each section into the matching
Partner Center "Store listing" field.
Field limits (ref): Description ≤10,000 chars · Features ≤20 items (≤200 chars each) ·
Search terms ≤7 (≤30 chars each) · Short description ≤1,000 chars ·
Screenshots ≥1366×768 PNG (1–10).
Screenshots = `store/screenshots-en/*.png` (English UI).
Privacy policy URL = your existing GitHub Pages PRIVACY page URL (required).
-->

# Atlas — Project Manager (en-US)

## Display name
Atlas-Project Manager

## Short description (summary)
A local-first desktop app to manage schedules, issues, meetings, change logs, and notes across multiple projects — no account, all data stays on your PC.

## Description
Atlas is a Windows desktop app for one person to manage multiple projects at a glance. Organize schedules (WBS & Gantt), issues, meeting minutes, change logs, work info (documents, links, Git repos), and resources per project, and watch every project from one integrated monitoring view.

It is local-first: all data lives in a SQLite database and per-project file folders on your own PC. No sign-up, no remote server. You can move the data folder anywhere — point it at a synced folder (e.g. OneDrive) or an external drive for off-site backup and multi-device use.

Meetings are auto-exported as human-readable Markdown (compatible with Obsidian and other tools), and the project map visualizes the relationships between WBS items, issues, meetings, change logs, and notes as a graph. Dark/light plus a 12-color custom theme, and a Korean/English UI toggle, are included. You can also automate it: query and update your data from external tools and AI agents through atlas-cli, an MCP server, and a Claude Code skill.

It suits anyone who wants a lightweight single-user tool, prefers to keep data off the cloud, and likes to see a whole portfolio of projects on one screen.

## Features (bullets)
- Project hub — card list + dashboard (overview, budget, members, D-day, recent activity)
- My work (unified to-dos) — open tasks & issues across projects plus personal to-dos on one screen, recurring & one-click done
- Project retrospective — compare completed projects (burn-up S-curve, slippage, issue density, avg resolution time)
- WBS + Gantt chart — hierarchical task tree, milestones, status/priority, multi-assignee, linked work info & repos
- Issue tracking — status (Open/In progress/Resolved/Closed) × priority, inline edits in the table
- Meetings — internal/external, attendees, decisions, discussion, action items; auto Markdown export
- Change log — impact level, daily chart, links to related docs and meetings
- Work info — Markdown / file / link / Git repo types plus tagging (repo commit graph)
- Project map — relationship graph (radial / timeline layouts, minimap)
- Integrated monitoring — cross-project summary charts + assignee × deadline heatmap
- Global search — Ctrl+K command palette to instantly find tasks, issues, meetings, and notes across projects
- Worklog — weekly Done / Plan / Issues journal, Markdown export
- Resources — people & equipment, autocomplete source for WBS assignees
- External automation — query & update via atlas-cli / MCP, AI integration via a Claude Code skill
- Automatic backup — periodic zip of all data to a folder you choose, with retention
- Korean / English UI toggle + dark/light + custom color theme
- Local storage (SQLite + file folders), no account, no remote server

## What's new in this version
- My work (unified to-dos) — open tasks & issues across projects plus personal to-dos on one screen, recurring & one-click done
- Project retrospective — compare completed projects (burn-up S-curve, schedule slippage, issue density, avg resolution time)
- Planned vs. actual dates — actual completion date tracked for tasks/issues/projects (existing schedule kept as "planned")
- Personal to-dos stay yours — on a shared remote server, others' personal to-dos never appear, even in the "All" view
- Redesigned sidebar — Main/Insights/Manage groups + an icon rail with an expandable menu to save vertical space while in a project

## License (EULA)
Under the provided End User License Agreement (EULA), this app may be used for **both personal and commercial (business) purposes**. The license is granted upon acquiring the app (currently free); the **usage scope stays the same** even if pricing or discounts apply later. It does not include source code, redistribution, or resale rights.
Note: Register the full EULA (repo `EULA.md`) in Partner Center's "Custom license terms/EULA" field so it applies instead of the standard (personal, non-commercial) terms. Without it, this statement has no effect.

## Search terms (keywords)
project management, WBS, gantt chart, meeting notes, issue tracker, local-first, productivity

## Category
Productivity

## Certification note — runFullTrust justification
Atlas is a standard Win32 desktop app that reads and writes a SQLite database and project files directly in a user-chosen local folder (e.g. Documents, an external drive, or a synced folder). The `runFullTrust` capability is required for this local file access. It uses no remote server and no user account; data stays only on the user's device.

## Age rating
No objectionable content — rated for everyone (productivity tool).
