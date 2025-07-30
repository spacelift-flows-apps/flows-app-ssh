import { type AppBlock } from "@slflows/sdk/v1";
import { NodeSSH } from "node-ssh";

export default {
  name: "Host Metadata",
  description: "Retrieves and exposes host metadata as signals.",
  category: "Host Info",
  config: {
    host: {
      name: "Host",
      description: "Hostname or IP address to connect to.",
      type: "string",
      required: true,
    },
    port: {
      name: "Port",
      description: "SSH port for this connection.",
      type: "number",
      required: true,
      default: 22,
    },
    username: {
      name: "Username",
      description: "Override the default SSH username for this connection.",
      type: "string",
      required: false,
    },
  },
  signals: {
    hostname: {
      name: "Hostname",
      description: "The hostname of the remote system.",
    },
    osType: {
      name: "OS Type",
      description: "Operating system type (e.g., 'linux', 'darwin').",
    },
    osRelease: {
      name: "OS Release",
      description: "OS version/release information.",
    },
    architecture: {
      name: "Architecture",
      description: "System architecture (e.g., 'x86_64').",
    },
    uptime: {
      name: "Uptime",
      description: "System uptime in seconds.",
    },
    loadAverage: {
      name: "Load Average",
      description: "Load average with 1, 5, and 15 minute values.",
    },
    memoryTotal: {
      name: "Memory Total",
      description: "Total memory in bytes.",
    },
    memoryFree: {
      name: "Memory Free",
      description: "Free memory in bytes.",
    },
  },
  async onSync(input) {
    const { privateKey, username: defaultUsername } = input.app.config;
    const { host, port, username } = input.block.config;

    if (!privateKey) {
      return {
        newStatus: "failed",
        customStatusDescription: "SSH private key not configured in the app.",
      };
    }

    const finalUsername = username || defaultUsername;
    if (!finalUsername) {
      return {
        newStatus: "failed",
        customStatusDescription:
          "Username must be specified either in app config or block config.",
      };
    }

    const ssh = new NodeSSH();

    try {
      await ssh.connect({
        host,
        username: finalUsername,
        port,
        privateKey,
      });

      // Gather system metadata
      const hostname = await ssh.execCommand("hostname");
      const osType = await ssh.execCommand("uname -s");
      const osRelease = await ssh.execCommand("uname -r");
      const architecture = await ssh.execCommand("uname -m");
      const uptime = await ssh.execCommand(
        "cat /proc/uptime 2>/dev/null || uptime",
      );

      // Get load average
      let loadAverage = { "1min": 0, "5min": 0, "15min": 0 };
      try {
        const loadResult = await ssh.execCommand(
          "cat /proc/loadavg 2>/dev/null || uptime | grep -o 'load average[s]*: [0-9.]*[, ]*[0-9.]*[, ]*[0-9.]*' | sed 's/load average[s]*: //'",
        );
        if (loadResult.code === 0 && loadResult.stdout) {
          const loads = loadResult.stdout.trim().split(/[, ]+/).map(parseFloat);
          if (loads.length >= 3) {
            loadAverage = {
              "1min": loads[0] || 0,
              "5min": loads[1] || 0,
              "15min": loads[2] || 0,
            };
          }
        }
      } catch (e) {
        console.warn("Failed to get load average:", e);
      }

      // Get memory information
      let memoryTotal = 0;
      let memoryFree = 0;
      try {
        const memResult = await ssh.execCommand(
          "cat /proc/meminfo 2>/dev/null || vm_stat",
        );
        if (memResult.code === 0 && memResult.stdout) {
          // Parse Linux /proc/meminfo
          const memTotalMatch = memResult.stdout.match(
            /MemTotal:\s+(\d+)\s+kB/,
          );
          const memFreeMatch = memResult.stdout.match(/MemFree:\s+(\d+)\s+kB/);
          const memAvailMatch = memResult.stdout.match(
            /MemAvailable:\s+(\d+)\s+kB/,
          );

          if (memTotalMatch) {
            memoryTotal = parseInt(memTotalMatch[1]) * 1024; // Convert KB to bytes
          }
          if (memAvailMatch) {
            memoryFree = parseInt(memAvailMatch[1]) * 1024; // Prefer MemAvailable over MemFree
          } else if (memFreeMatch) {
            memoryFree = parseInt(memFreeMatch[1]) * 1024;
          }
        }
      } catch (e) {
        console.warn("Failed to get memory info:", e);
      }

      // Parse uptime in seconds
      let uptimeSeconds = 0;
      try {
        if (uptime.code === 0 && uptime.stdout) {
          // Try to parse /proc/uptime first (more reliable)
          const procUptimeMatch = uptime.stdout.match(/^(\d+\.\d+)/);
          if (procUptimeMatch) {
            uptimeSeconds = parseFloat(procUptimeMatch[1]);
          } else {
            // Fallback to parsing uptime command output
            const uptimeMatch = uptime.stdout.match(
              /up\s+(?:(\d+)\s+days?,\s*)?(?:(\d+):(\d+),?)?/,
            );
            if (uptimeMatch) {
              const days = parseInt(uptimeMatch[1] || "0");
              const hours = parseInt(uptimeMatch[2] || "0");
              const minutes = parseInt(uptimeMatch[3] || "0");
              uptimeSeconds = days * 86400 + hours * 3600 + minutes * 60;
            }
          }
        }
      } catch (e) {
        console.warn("Failed to parse uptime:", e);
      }

      return {
        signalUpdates: {
          hostname: hostname.code === 0 ? hostname.stdout.trim() : "",
          osType: osType.code === 0 ? osType.stdout.trim().toLowerCase() : "",
          osRelease: osRelease.code === 0 ? osRelease.stdout.trim() : "",
          architecture:
            architecture.code === 0 ? architecture.stdout.trim() : "",
          uptime: uptimeSeconds,
          loadAverage,
          memoryTotal,
          memoryFree,
        },
        newStatus: "ready",
      };
    } catch (error: any) {
      return {
        newStatus: "failed",
        customStatusDescription: `Failed to connect to host: ${error.message}`,
      };
    } finally {
      ssh.dispose();
    }
  },
} satisfies AppBlock;
