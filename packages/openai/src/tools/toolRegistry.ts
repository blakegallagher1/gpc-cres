import {
  allPluginTools,
  cloudflarePluginTools,
  githubPluginTools,
  neptuneFloodTools,
  opsPluginTools,
  vercelPluginTools,
} from "./pluginTools.js";

export const TOOL_REGISTRY = {
  github: githubPluginTools,
  vercel: vercelPluginTools,
  cloudflare: cloudflarePluginTools,
  neptuneFlood: neptuneFloodTools,
  operationsPlugins: opsPluginTools,
  allPluginTools,
} as const;
