# SSH

## Description

Provides SSH connectivity for executing commands, transferring files, and gathering host information on remote systems. Since blocks cannot maintain long-lived connections, each operation establishes a connection, performs its task, and disconnects.

## Config

The app config contains SSH connection credentials that are shared across all blocks.

- `privateKey` (string, required): SSH private key for authentication
- `username` (string, optional): Default SSH username
- `knownHosts` (object, optional): Object mapping hostnames to their public keys for host verification. If not provided, host key verification is skipped (less secure but simpler for dynamic environments)

## App Services

No HTTP endpoints or timers needed for the SSH app.

## Blocks

### Execute Command

- **Description**: Executes a single command on a remote host via SSH
- **Input Config**:
  - `host` (string, required): Hostname or IP address to connect to
  - `port` (number, required): SSH port for this connection (defaults to 22)
  - `command` (string, required): The command to execute
  - `username` (string, optional): Override the default SSH username for this connection
  - `workingDirectory` (string, optional): Working directory for the command
- **Output**:
  - `stdout` (string): Standard output from the command
  - `stderr` (string): Standard error from the command
  - `exitCode` (number): Exit code of the command
  - `duration` (number): Execution time in milliseconds

### Execute Script

- **Description**: Uploads a script to a temporary location and executes it on the remote host
- **Input Config**:
  - `host` (string, required): Hostname or IP address to connect to
  - `port` (number, required): SSH port for this connection (defaults to 22)
  - `script` (string, required): The script content to execute
  - `username` (string, optional): Override the default SSH username for this connection
  - `interpreter` (string, optional): Script interpreter (defaults to "sh")
  - `workingDirectory` (string, optional): Working directory for script execution
- **Output**:
  - `stdout` (string): Standard output from the script
  - `stderr` (string): Standard error from the script
  - `exitCode` (number): Exit code of the script
  - `duration` (number): Execution time in milliseconds

### Upload File

- **Description**: Uploads a file to the remote host via SCP/SFTP
- **Input Config**:
  - `host` (string, required): Hostname or IP address to connect to
  - `port` (number, required): SSH port for this connection (defaults to 22)
  - `content` (string, required): File content (base64 encoded for binary, plain text for text files)
  - `destinationPath` (string, required): Full path where to save the file
  - `username` (string, optional): Override the default SSH username for this connection
  - `encoding` (string, optional): "base64" or "text" (defaults to "text")
  - `permissions` (string, optional): File permissions in octal format (e.g., "0644")
- **Output**:
  - `path` (string): The destination path where file was uploaded
  - `size` (number): Size of the uploaded file in bytes

### Download File

- **Description**: Downloads a file from the remote host via SCP/SFTP
- **Input Config**:
  - `host` (string, required): Hostname or IP address to connect to
  - `port` (number, required): SSH port for this connection (defaults to 22)
  - `sourcePath` (string, required): Full path of the file to download
  - `username` (string, optional): Override the default SSH username for this connection
  - `encoding` (string, optional): "base64" or "text" for output encoding (defaults to "base64")
- **Output**:
  - `content` (string): File content (encoded according to input)
  - `path` (string): The source path that was downloaded
  - `size` (number): File size in bytes
  - `permissions` (string): File permissions in octal format
  - `modifiedTime` (string): Last modified timestamp (ISO 8601 format)

### Host Metadata

- **Description**: Retrieves and exposes host metadata as signals
- **Block Config** (static):
  - `host` (string, required): Hostname or IP address to connect to
  - `port` (number, required): SSH port for this connection (defaults to 22)
  - `username` (string, optional): Override the default SSH username for this connection
- **Signals**:
  - `hostname` (string): The hostname of the remote system
  - `osType` (string): Operating system type (e.g., "linux", "darwin")
  - `osRelease` (string): OS version/release information
  - `architecture` (string): System architecture (e.g., "x86_64")
  - `uptime` (number): System uptime in seconds
  - `loadAverage` (object): Load average with 1, 5, and 15 minute values
  - `memoryTotal` (number): Total memory in bytes
  - `memoryFree` (number): Free memory in bytes
- **Implementation**: Uses `onSync` to gather metadata when the block is synced

## Implementation Notes

Since blocks cannot maintain persistent connections, each operation should:

1. Establish an SSH connection using the app-level credentials (or overridden username)
2. Perform the requested operation
3. Close the connection
4. Return the results

If the app has no default username configured, and a block's config does not specify a username, the block callback should throw an error.

Host key verification should be handled according to the `knownHosts` configuration - either verifying against provided keys or skipping verification if not configured.

## Testing

1. Make sure you have the Test Utils app installed.
2. Create a temp directory for your test.
3. Run `ssh-keygen -t rsa -b 4096 -f ./test_ssh_key -N ""` to get a test SSH key pair.
4. Assuming you have a local flows dev setup, run

```shell
docker run \
   --rm \
   --name ssh-test-server \
   -p 2222:2222 \
   -e PUID=1000 \
   -e PGID=1000 \
   -e TZ=Etc/UTC \
   --network=spaceflows_default \
   -e USER_NAME=testuser \
   -e PASSWORD_ACCESS=false \
   -e SUDO_ACCESS=true \
   -e PUBLIC_KEY_FILE=/config/authorized_keys \
   -v "$PWD/test_ssh_key.pub:/config/authorized_keys:ro" \
   lscr.io/linuxserver/openssh-server:latest
```

4. Run `docker network inspect spaceflows_default` and find the IP address of the SSH server container.
5. Create and install the SSH app. Set the private key file contents as the `privateKey` config, the username as `testuser`.
6. Import the scenario, configure the IP address in the Variables block. Trigger blocks using debug events.
