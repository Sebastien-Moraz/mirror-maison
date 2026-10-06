// État des serveurs par ping ICMP (commande système, pas besoin de droits root).

/** État suivant d'un hôte : « down » seulement après `threshold` échecs consécutifs. */
export function nextHostState(prev = { status: "unknown", failures: 0 }, ok, threshold = 2) {
  if (ok) return { status: "up", failures: 0 };
  const failures = prev.failures + 1;
  return { status: failures >= threshold ? "down" : prev.status, failures };
}

export async function ping(host, timeoutSec = 2) {
  const proc = Bun.spawn(["ping", "-n", "-c", "1", "-W", String(timeoutSec), host], { stdout: "ignore", stderr: "ignore" });
  return (await proc.exited) === 0;
}

export function hostsFetcher(config) {
  const states = new Map();
  return async () => {
    const results = await Promise.all(config.hosts.map((h) => ping(h.host)));
    return config.hosts.map((h, i) => {
      const s = nextHostState(states.get(h.name), results[i], config.thresholds.hostDownAfter);
      states.set(h.name, s);
      return { name: h.name, status: s.status };
    });
  };
}
