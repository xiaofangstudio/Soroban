import { invoke } from "@tauri-apps/api/core";

export type DocRef = {
  path: string | null;
  name: string;
  buffer: Uint8Array | null;
};

export async function readFileBytes(path: string): Promise<Uint8Array> {
  const data = await invoke<ArrayBuffer | number[]>("read_document", { path });
  return data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data);
}

export async function writeFileBytes(path: string, bytes: Uint8Array): Promise<number> {
  const payload = Array.from(bytes);
  return invoke<number>("write_document", { path, data: payload });
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    return await invoke<boolean>("file_exists", { path });
  } catch {
    return false;
  }
}

export async function fileSize(path: string): Promise<number> {
  try {
    return await invoke<number>("file_size", { path });
  } catch {
    return 0;
  }
}
