import { defineApp } from "@slflows/sdk/v1";

import executeCommand from "./blocks/executeCommand.ts";
import executeScript from "./blocks/executeScript.ts";
import { uploadFile, downloadFile } from "./blocks/files.ts";
import hostMetadata from "./blocks/hostMetadata.ts";

export const app = defineApp({
  name: "SSH",
  installationInstructions:
    "To use the SSH app, configure your SSH credentials:\n1. **Private Key**: Provide your SSH private key for authentication\n2. **Username**: Set a default SSH username (can be overridden per block)\n3. **Port**: Set default SSH port (defaults to 22)\n4. **Known Hosts**: Optionally provide host key fingerprints for verification (recommended for security)",
  config: {
    privateKey: {
      name: "SSH Private Key",
      description: "The SSH private key for authentication (PEM format).",
      type: "string",
      required: true,
      sensitive: true,
    },
    username: {
      name: "Default Username",
      description:
        "Default SSH username to use when connecting. Can be overridden in individual blocks.",
      type: "string",
      required: false,
    },
    port: {
      name: "Default Port",
      description: "Default SSH port to use when connecting.",
      type: "number",
      required: false,
      default: 22,
    },
    knownHosts: {
      name: "Known Hosts",
      description:
        "Object mapping hostnames to their public key fingerprints for host verification. If not provided, host key verification is skipped.",
      type: {
        type: "object",
      },
      required: false,
    },
  },

  async onSync(input) {
    const { privateKey } = input.app.config;

    if (!privateKey) {
      return {
        newStatus: "failed",
        customStatusDescription: "SSH Private Key is required",
      };
    }

    return { newStatus: "ready" };
  },

  blocks: {
    executeCommand: executeCommand,
    executeScript: executeScript,
    uploadFile: uploadFile,
    downloadFile: downloadFile,
    hostMetadata: hostMetadata,
  },
});
