// Démarre toutes les sources réelles. En mode démo, seuls les nuages (publics) tournent.
import { join } from "node:path";
import { createClouds } from "./clouds.js";

const DATA = join(import.meta.dir, "../../data");

export function startSources(config, { mock }) {
  const clouds = createClouds(config, DATA);
  clouds.source.start();
  if (mock) return { clouds };

  return { clouds };
}
