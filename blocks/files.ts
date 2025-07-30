import { type AppBlock, events } from "@slflows/sdk/v1";
import { NodeSSH } from "node-ssh";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

export const uploadFile: AppBlock = {
  name: "Upload File",
  description: "Uploads a file to the remote host via SCP/SFTP.",
  category: "File Transfer",
  inputs: {
    default: {
      name: "Upload",
      description: "Upload the specified file to the remote host.",
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
        content: {
          name: "Content",
          description:
            "File content (base64 encoded for binary, plain text for text files).",
          type: "string",
          required: true,
        },
        destinationPath: {
          name: "Destination Path",
          description: "Full path where to save the file.",
          type: "string",
          required: true,
        },
        username: {
          name: "Username",
          description: "Override the default SSH username for this connection.",
          type: "string",
          required: false,
        },
        encoding: {
          name: "Encoding",
          description: "Content encoding: 'base64' or 'text'.",
          type: {
            type: "string",
            enum: ["base64", "text"],
          },
          required: true,
          default: "text",
        },
        permissions: {
          name: "Permissions",
          description: "File permissions in octal format (e.g., '0644').",
          type: "string",
          required: false,
        },
      },
      async onEvent(input) {
        const { privateKey, username: defaultUsername } = input.app.config;
        const {
          host,
          port,
          content,
          destinationPath,
          username,
          encoding,
          permissions,
        } = input.event.inputConfig;

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
        let tempFilePath: string | null = null;

        try {
          await ssh.connect({
            host,
            username: finalUsername,
            port,
            privateKey,
          });

          // Create temporary file
          const tempDir = os.tmpdir();
          tempFilePath = path.join(
            tempDir,
            `ssh-upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          );

          // Write content to temporary file
          const fileContent =
            encoding === "base64" ? Buffer.from(content, "base64") : content;
          await fs.writeFile(tempFilePath, fileContent);

          // Upload file
          await ssh.putFile(tempFilePath, destinationPath);

          // Set permissions if specified
          if (permissions) {
            await ssh.execCommand(`chmod ${permissions} "${destinationPath}"`);
          }

          // Get file size
          const stats = await fs.stat(tempFilePath);
          const size = stats.size;

          await events.emit({
            path: destinationPath,
            size,
          });
        } finally {
          ssh.dispose();
          if (tempFilePath) {
            try {
              await fs.unlink(tempFilePath);
            } catch (e) {
              // Ignore cleanup errors
            }
          }
        }
      },
    },
  },
  outputs: {
    default: {
      name: "File Uploaded",
      description: "Emitted when the file has been uploaded successfully.",
      possiblePrimaryParents: ["default"],
      type: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The destination path where file was uploaded.",
          },
          size: {
            type: "number",
            description: "Size of the uploaded file in bytes.",
          },
        },
        required: ["path", "size"],
      },
    },
  },
};

export const downloadFile: AppBlock = {
  name: "Download File",
  description: "Downloads a file from the remote host via SCP/SFTP.",
  category: "File Transfer",
  inputs: {
    default: {
      name: "Download",
      description: "Download the specified file from the remote host.",
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
        sourcePath: {
          name: "Source Path",
          description: "Full path of the file to download.",
          type: "string",
          required: true,
        },
        username: {
          name: "Username",
          description: "Override the default SSH username for this connection.",
          type: "string",
          required: false,
        },
        encoding: {
          name: "Encoding",
          description: "Content encoding: 'base64' or 'text'.",
          type: {
            type: "string",
            enum: ["base64", "text"],
          },
          required: true,
          default: "text",
        },
      },
      async onEvent(input) {
        const { privateKey, username: defaultUsername } = input.app.config;
        const { host, port, sourcePath, username, encoding } =
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
        let tempFilePath: string | null = null;

        try {
          await ssh.connect({
            host,
            username: finalUsername,
            port,
            privateKey,
          });

          // Create temporary file path
          const tempDir = os.tmpdir();
          tempFilePath = path.join(
            tempDir,
            `ssh-download-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          );

          // Download file
          await ssh.getFile(tempFilePath, sourcePath);

          // Read file content
          const buffer = await fs.readFile(tempFilePath);
          const content =
            encoding === "base64"
              ? buffer.toString("base64")
              : buffer.toString("utf8");

          // Get file stats
          const stats = await fs.stat(tempFilePath);
          const size = stats.size;

          // Get remote file permissions and modified time
          const statResult = await ssh.execCommand(
            `stat -c "%a %Y" "${sourcePath}"`,
          );
          const [permissions, modifiedTimestamp] = statResult.stdout
            .trim()
            .split(" ");
          const modifiedTime = new Date(
            parseInt(modifiedTimestamp) * 1000,
          ).toISOString();

          await events.emit({
            content,
            path: sourcePath,
            size,
            permissions,
            modifiedTime,
          });
        } finally {
          ssh.dispose();
          if (tempFilePath) {
            try {
              await fs.unlink(tempFilePath);
            } catch (e) {
              // Ignore cleanup errors
            }
          }
        }
      },
    },
  },
  outputs: {
    default: {
      name: "File Downloaded",
      description: "Emitted when the file has been downloaded successfully.",
      possiblePrimaryParents: ["default"],
      type: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "File content (encoded according to input).",
          },
          path: {
            type: "string",
            description: "The source path that was downloaded.",
          },
          size: {
            type: "number",
            description: "File size in bytes.",
          },
          permissions: {
            type: "string",
            description: "File permissions in octal format.",
          },
          modifiedTime: {
            type: "string",
            description: "Last modified timestamp (ISO 8601 format).",
          },
        },
        required: ["content", "path", "size", "permissions", "modifiedTime"],
      },
    },
  },
};
