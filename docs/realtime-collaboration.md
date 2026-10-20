# DevSync real-time collaboration

## What is implemented

- **Per-keystroke sync:** CodeMirror edits are written to a shared Yjs text document and broadcast through the project Socket.IO connection.
- **Cursor and selection sharing:** the CodeMirror/Yjs binding publishes remote selections and cursor locations through Yjs Awareness.
- **Presence:** the backend publishes a live, de-duplicated list of connected project members.
- **CRDT conflict resolution:** Yjs updates merge concurrent edits and tolerate duplicate or out-of-order update delivery.
- **Operational Transformation (OT):** stale whole-file snapshots are converted into text operations and transformed against newer operations before applying. Simultaneous inserts have deterministic ordering.
- **Automatic merge and persistence:** Yjs updates and plain file contents are debounced into MongoDB; plain fileTree remains available to the existing preview/run workflow.

## Run and test

Install dependencies in frontend/ and backend/. Run npm run build in frontend/ and npm test in backend/.

The OT regression tests are in backend/tests/operationalTransform.test.js.
