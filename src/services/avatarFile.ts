const MAX_AVATAR_BYTES = 512 * 1024;

export async function readAvatarFile(file?: File): Promise<{ dataUrl?: string; error?: string }> {
  if (!file || file.size === 0) return {};

  if (!file.type.startsWith("image/")) {
    return { error: "Avatar must be an image file." };
  }

  if (file.size > MAX_AVATAR_BYTES) {
    return { error: "Avatar image must be 512 KB or smaller." };
  }

  try {
    const dataUrl = await fileToDataUrl(file);
    return { dataUrl };
  } catch {
    return { error: "Unable to read avatar image." };
  }
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Avatar reader returned a non-text result."));
      }
    });
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Avatar reader failed.")));
    reader.readAsDataURL(file);
  });
}
