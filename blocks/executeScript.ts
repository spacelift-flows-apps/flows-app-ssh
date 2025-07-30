import { type AppBlock, events } from "@slflows/sdk/v1";
import { NodeSSH } from "node-ssh";

export default {
  name: "Execute Script",
  description:
    "Uploads a script to a temporary location and executes it on the remote host.",
  category: "Execution",
  inputs: {
    default: {
      name: "Execute",
      description: "Execute the specified script on the remote host.",
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
        script: {
          name: "Script",
          description: "The script content to execute.",
          type: "string",
          required: true,
        },
        username: {
          name: "Username",
          description: "Override the default SSH username for this connection.",
          type: "string",
          required: false,
        },
        interpreter: {
          name: "Interpreter",
          description: "Script interpreter (defaults to 'sh').",
          type: "string",
          required: false,
          default: "sh",
        },
        workingDirectory: {
          name: "Working Directory",
          description: "Working directory for script execution.",
          type: "string",
          required: false,
        },
      },
      async onEvent(input) {
        const { privateKey, username: defaultUsername } = input.app.config;
        const { host, port, script, username, interpreter, workingDirectory } =
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

        const finalInterpreter = interpreter || "sh";

        const ssh = new NodeSSH();
        const startTime = Date.now();

        // Generate unique temporary filename
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const tempFile = `/tmp/spacelift_script_${timestamp}_${random}.sh`;

        try {
          await ssh.connect({
            host,
            username: finalUsername,
            port,
            privateKey,
          });

          // Write script content to temporary file using cat with EOF delimiter
          const createScriptCommand = `cat > "${tempFile}" << 'SPACELIFT_SCRIPT_EOF'
${script}
SPACELIFT_SCRIPT_EOF`;

          await ssh.execCommand(createScriptCommand);

          // Make script executable
          await ssh.execCommand(`chmod +x "${tempFile}"`);

          // Execute the script with the specified interpreter
          const executeCommand = `${finalInterpreter} "${tempFile}"`;
          const result = await ssh.execCommand(executeCommand, {
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
          // Clean up temporary file (ignore errors in cleanup)
          try {
            await ssh.execCommand(`rm -f "${tempFile}"`);
          } catch (cleanupError) {
            // Log but don't throw - cleanup failure shouldn't fail the operation
            console.warn(
              `Failed to clean up temporary script file ${tempFile}:`,
              cleanupError,
            );
          }
          ssh.dispose();
        }
      },
    },
  },
  outputs: {
    default: {
      name: "Script Executed",
      description: "Emitted when the script has been executed successfully.",
      possiblePrimaryParents: ["default"],
      type: {
        type: "object",
        properties: {
          stdout: {
            type: "string",
            description: "Standard output from the script.",
          },
          stderr: {
            type: "string",
            description: "Standard error from the script.",
          },
          exitCode: {
            type: "number",
            description: "Exit code of the script.",
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
