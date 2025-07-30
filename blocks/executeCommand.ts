import { type AppBlock, events } from "@slflows/sdk/v1";
import { NodeSSH } from "node-ssh";

export default {
  name: "Execute Command",
  description: "Executes a single command on a remote host via SSH.",
  category: "Execution",
  inputs: {
    default: {
      name: "Execute",
      description: "Execute the specified command on the remote host.",
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
        command: {
          name: "Command",
          description: "The command to execute.",
          type: "string",
          required: true,
        },
        username: {
          name: "Username",
          description: "Override the default SSH username for this connection.",
          type: "string",
          required: false,
        },
        workingDirectory: {
          name: "Working Directory",
          description: "Working directory for the command.",
          type: "string",
          required: false,
        },
      },
      async onEvent(input) {
        const { privateKey, username: defaultUsername } = input.app.config;
        const { host, port, command, username, workingDirectory } =
          input.event.inputConfig;

        if (!privateKey) {
          throw new Error("SSH private key not configured in the app.");
        }

        const finalUsername = username || defaultUsername;
        if (!finalUsername) {
          throw new Error(
            "Username must be specified either in app config or input config.",
          );
        }

        const ssh = new NodeSSH();
        const startTime = Date.now();

        try {
          await ssh.connect({
            host,
            username: finalUsername,
            port,
            privateKey,
          });

          const result = await ssh.execCommand(command, {
            cwd: workingDirectory,
          });

          const duration = Date.now() - startTime;

          await events.emit({
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.code,
            duration,
          });
        } finally {
          ssh.dispose();
        }
      },
    },
  },
  outputs: {
    default: {
      name: "Command Executed",
      description: "Emitted when the command has been executed successfully.",
      possiblePrimaryParents: ["default"],
      type: {
        type: "object",
        properties: {
          stdout: {
            type: "string",
            description: "Standard output from the command.",
          },
          stderr: {
            type: "string",
            description: "Standard error from the command.",
          },
          exitCode: {
            type: "number",
            description: "Exit code of the command.",
          },
          duration: {
            type: "number",
            description: "Execution time in milliseconds.",
          },
        },
        required: ["stdout", "stderr", "exitCode", "duration"],
      },
    },
  },
} satisfies AppBlock;
