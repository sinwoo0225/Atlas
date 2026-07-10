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

AI & automation setup — installing from the Store also installs the automation commands atlas-cli (shell) and atlas-mcp (MCP), exposed everywhere on your terminal PATH. To use it with Claude Code, run atlas-cli skill install once: the usage-guide skill is installed to ~/.claude/skills/atlas, so whichever project you open Claude Code in, a request like "use atlas-cli to …" automatically applies the gather-context / targeted-filter / update-status workflow (use --force to update). To let an AI agent call it directly as MCP tools, register it once with claude mcp add --scope user atlas atlas-mcp. All of this is optional — the app works out of the box with no setup.

It suits anyone who wants a lightweight single-user tool, prefers to keep data off the cloud, and likes to see a whole portfolio of projects on one screen.

## Features (bullets)
- Project hub — card list + dashboard (overview, budget, members, D-day, recent activity), with custom free-text "category"
- My work (unified to-dos) — open tasks & issues across projects plus personal to-dos on one screen, recurring & one-click done
- Project retrospective — compare completed projects (burn-up S-curve, slippage, issue density, avg resolution time)
- WBS + Gantt + Kanban — hierarchical task tree, milestones, status (Planned·Waiting·In progress·Done·Suspended)/priority, multi-assignee, Kanban board (group by status·assignee, drag to change status), linked work info & repos
- Issue tracking — status (Open/In progress/Resolved/Closed) × priority, inline edits in the table
- Meetings — internal/external, attendees, decisions, discussion, action items; auto Markdown export
- Change log — impact level, daily chart, links to related docs and meetings
- Work info — Markdown / file / link / Git repo types plus tagging (repo commit graph)
- Project map — relationship graph (radial / timeline layouts, minimap)
- Integrated monitoring — cross-project summary charts + assignee × deadline heatmap
- Notifications — toasts for approaching deadlines & a daily work summary, with a bell-icon panel (shown even when minimized)
- Global search — Ctrl+K command palette to instantly find tasks, issues, meetings, and notes across projects
- Menu favorites — pin frequently used project & integrated menus and specific monitoring tabs to the top of the sidebar
- Worklog — weekly Done / Plan / Issues journal, Markdown export
- Resources — people & equipment, autocomplete source for WBS assignees
- External automation & AI — query & update via atlas-cli / MCP, one-line Claude Code skill install (atlas-cli skill install)
- Automatic backup — periodic zip of all data to a folder you choose, with retention
- Korean / English UI toggle + dark/light + custom color theme
- Local storage (SQLite + file folders), no account, no remote server

## What's new in this version
- Custom project "category" — register any category via free text + autocomplete, instead of a fixed list
- New "Suspended" status for Schedule/WBS — mark stopped/won't-continue work; excluded from progress metrics (completion %, burn-up, overdue) but still shown on the board, list, and Gantt
- Schedule/WBS tree collapse state is remembered per project (persists across reloads and project switches)
- Meeting-summary Claude Code skill (/atlas-meeting-summary) — reads a stored meeting and auto-fills its summary, decisions, and action items
- Much better Markdown rendering across the app — tables, checklists, strikethrough, autolinks, safe HTML such as `<br/>`, single-newline line breaks, and code-block syntax highlighting
- External links in Markdown open in your default browser
- Taller work-log preview; renamed 'Default author name' to 'My identity'

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
