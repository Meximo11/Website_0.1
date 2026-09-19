# BrainDump

**Write first. Organize later.**

BrainDump is a local-first concept for a visual operating system for thoughts. Instead of forcing structure during capture, the app starts with a living knowledge graph and turns unstructured notes into connected thoughts, projects, and next actions.

## What is implemented

The current V1 prototype is a zero-build static app that runs directly in the browser:

- interactive neural brain map with animated connections and particles
- core spaces for School, Coding, Personal, and Ideas
- selectable thoughts with a detail panel, progress, tasks, notes, deadlines, and connections
- brain dump composer with sentence-based thought counting
- local thought count persistence through `localStorage`
- search with `⌘ K`, zoom controls, mouse-wheel zoom, and drag-to-explore map movement
- Neural / Clusters views, history states, active filters, and Focus mode
- “Next best move” modal to reduce decision overload
- AI suggestion preview with explicit review / ignore behavior
- responsive layout for a compact tablet / mobile view
- local-storage status shown as a first-class privacy affordance

## Run locally

No dependencies are required. Serve the repository with any static server, for example:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Product direction

The most important product principle is **capture before organization**. AI should remain a quiet tool that suggests groups, relations, tasks, and summaries; the user always approves changes. The next product layer would add a real graph data model, IndexedDB persistence, import/export, undoable AI suggestions, and optional local inference through Ollama or LM Studio.
