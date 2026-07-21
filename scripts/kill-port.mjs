import { execSync } from 'child_process';

/**
 * Free a TCP port (Windows + Unix). Ignores errors if nothing is listening.
 */
export function killPort(port) {
  if (!port || port < 1) return;

  try {
    if (process.platform === 'win32') {
      let out = '';
      try {
        out = execSync(`netstat -ano | findstr ":${port}"`, {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch {
        return;
      }
      const pids = new Set();
      for (const line of out.split('\n')) {
        if (!/LISTENING/i.test(line)) continue;
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
        } catch {
          /* already gone */
        }
      }
      return;
    }

    execSync(`lsof -ti tcp:${port} | xargs -r kill -9`, {
      stdio: 'ignore',
      shell: true,
    });
  } catch {
    /* port already free */
  }
}
