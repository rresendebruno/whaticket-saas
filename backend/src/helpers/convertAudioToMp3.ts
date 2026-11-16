import { spawn } from "child_process";
import path from "path";
import { logger } from "../utils/logger";

// Formats Z-API delivers reliably as-is; anything else (webm/ogg/m4a/wav from
// the browser recorder or attachments) is converted to MP3 first.
const PASSTHROUGH = new Set(["audio/mpeg", "audio/mp3"]);

export const needsMp3Conversion = (mimetype: string): boolean => {
  const base = mimetype.split(";")[0].trim().toLowerCase();
  return base.startsWith("audio/") && !PASSTHROUGH.has(base);
};

// Converts the file at `inputPath` to MP3 next to it. Resolves with the new
// file path. Requires ffmpeg in the container (see backend/Dockerfile).
const convertAudioToMp3 = (inputPath: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const parsed = path.parse(inputPath);
    const outputPath = path.join(parsed.dir, `${parsed.name}.mp3`);

    const ffmpeg = spawn("ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "44100",
      "-codec:a",
      "libmp3lame",
      "-b:a",
      "96k",
      outputPath
    ]);

    let stderr = "";
    ffmpeg.stderr.on("data", chunk => {
      stderr += chunk.toString();
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });

    ffmpeg.on("error", err => {
      logger.error({ msg: "ffmpeg not available", err: err.message });
      reject(err);
    });

    ffmpeg.on("close", code => {
      if (code === 0) {
        resolve(outputPath);
      } else {
        logger.error({ msg: "ffmpeg conversion failed", code, stderr });
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });
  });

export default convertAudioToMp3;
