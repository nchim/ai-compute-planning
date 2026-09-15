export { CopilotRail } from "./CopilotRail";
export { createCopilot, DEFAULT_MODEL, emptySnapshot, type Copilot, type CopilotEvent, type CopilotOptions, type CopilotSnapshot } from "./client";
export { EngineProvider, useEngine } from "./engineContext";
export { loadTranscript, saveTranscript, trimTranscript, type Transcript } from "./history";
export { registerCopilot, sendCopilot } from "./registry";
export { createTools, type ToolEvent } from "./tools";
