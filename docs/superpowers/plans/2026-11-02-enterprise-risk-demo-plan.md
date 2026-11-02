# Enterprise Risk Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a locally runnable competition demo for a dual-entry enterprise compliance risk inspection system.

**Architecture:** A dependency-free single-page web app uses local HTML, CSS, and JavaScript modules. A small in-memory store represents companies, inspection runs, risks, alerts, reports, and assistant messages; UI actions mutate that store and rerender the active view. The integration boundary is represented by normalized SearchPro/MCP-shaped records so a real backend can replace demo adapters later.

**Tech Stack:** HTML5, CSS3, vanilla JavaScript modules, Lucide icons via inline icon font fallback-free SVG-free text symbols, local static server for delivery.

---

### Task 1: Create the shell and navigation

**Files:**
- Create: `index.html`
- Create: `app.js`
- Create: `styles.css`

- [ ] **Step 1: Add the semantic app shell** with a fixed sidebar, top bar, main content region, toast region, and evidence drawer mount point.
- [ ] **Step 2: Add the navigation state** for dashboard, companies, inspections, risks, alerts, reports, assistant, and settings.
- [ ] **Step 3: Add responsive layout tokens** for a 1440px desktop demo viewport and a narrow layout that collapses the sidebar.
- [ ] **Step 4: Open the page locally** and verify the initial dashboard renders without console errors.

### Task 2: Add demo data and domain state

**Files:**
- Create: `data.js`
- Modify: `app.js`

- [ ] **Step 1: Define normalized entities** for companies, inspection runs, risk events, alerts, reports, and assistant messages.
- [ ] **Step 2: Seed realistic demo data** with 35 monitored companies, a completed weekly run, high/medium/low events, official gov sources, and alert delivery records.
- [ ] **Step 3: Add selectors** for KPI totals, filtered risks, pending alerts, and current run progress.
- [ ] **Step 4: Add mutations** for starting a run, acknowledging an alert, assigning an owner, closing an alert, and generating a report.

### Task 3: Implement dashboard and inspection flow

**Files:**
- Modify: `app.js`
- Modify: `styles.css`

- [ ] **Step 1: Render dashboard KPIs, trend bars, risk distribution, recent risk table, and six-stage flow.**
- [ ] **Step 2: Implement “运行本周期巡检”** with a 6-step timed simulation that updates progress, logs, completion rate, and toast feedback.
- [ ] **Step 3: Render inspection task list and detail panel** including per-company query states and a retry action.
- [ ] **Step 4: Verify that a run changes dashboard metrics and preserves the report and alert links.**

### Task 4: Implement companies, risks, alerts, and reports views

**Files:**
- Modify: `app.js`
- Modify: `styles.css`

- [ ] **Step 1: Render the company ledger** with search, status filters, selection checkboxes, bulk run action, and import affordance.
- [ ] **Step 2: Render risks** with level/type/source filters and evidence drawer interactions.
- [ ] **Step 3: Render alerts** with tabs for pending, acknowledged, ignored, and closed; wire confirm, assign, note, and close actions.
- [ ] **Step 4: Render reports** with report cards, preview modal, copy action, and download action.

### Task 5: Implement the AI assistant and settings

**Files:**
- Modify: `app.js`
- Modify: `styles.css`

- [ ] **Step 1: Render assistant conversation history and quick prompts.**
- [ ] **Step 2: Implement a simulated Agent response** that shows four query chips, gov source chips, structured risk result, and follow-up actions.
- [ ] **Step 3: Implement settings toggles/selects** for cadence, freshness, alert channels, and demo/real mode.
- [ ] **Step 4: Verify assistant actions can open an evidence record and add an alert without losing the current conversation.**

### Task 6: Run visual and functional QA

**Files:**
- Modify: `styles.css`
- Modify: `app.js`

- [ ] **Step 1: Run the app through a local static server.**
- [ ] **Step 2: Check desktop and narrow viewport screenshots for overflow, overlap, and readable tables.**
- [ ] **Step 3: Exercise the full competition demo path** from dashboard run through alert confirmation and report preview.
- [ ] **Step 4: Fix any visual or interaction defects found during the walkthrough.**
