import {
  definePluginDashboardMeta,
  definePluginDependencies,
  definePluginMeta,
} from "@/entrypoints/services/plugins/defines";
import type { PluginManifestExports } from "@/entrypoints/services/plugins/types";
import {
  settingsSchemas,
  settingsStorage,
} from "@/plugins/message-queue/settings";

declare module "@/entrypoints/services/plugins/types" {
  interface PluginsRegistry {
    [meta.id]: typeof manifest;
  }
}

const meta = definePluginMeta({
  id: "messageQueue",
  name: "Message Queue",
  description:
    "Queue follow-up messages while Perplexity is processing a response",
});

const dashboardMeta = definePluginDashboardMeta({
  tags: ["ui"],
  categories: ["queryBox"],
  uiRouteSegment: "message-queue",
});

const dependencies = definePluginDependencies({
  plugins: [
    "domObservers:queryBoxes",
    "domObservers:thread:messageBlocks",
    "spaRouter",
  ],
});

const manifest = {
  meta,
  dashboardMeta,
  dependencies,
  settingsSchemas,
  settingsStorage,
} satisfies PluginManifestExports;

export default manifest;
