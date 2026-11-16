// Native audio recorder (MediaRecorder API) — replaces mic-recorder-to-mp3,
// whose lamejs dependency breaks in Vite production builds
// ("MPEGMode is not defined"). The backend converts the result to MP3.

const PREFERRED_TYPES = [
  "audio/ogg;codecs=opus",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
];

const EXT_BY_TYPE = {
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "audio/mp4": "m4a",
};

let mediaRecorder = null;
let stream = null;
let chunks = [];
let startedAt = 0;

const releaseMic = () => {
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null;
  mediaRecorder = null;
  chunks = [];
};

export const isRecordingSupported = () =>
  typeof window !== "undefined" &&
  !!navigator.mediaDevices?.getUserMedia &&
  typeof window.MediaRecorder !== "undefined";

export const startRecording = async () => {
  if (!isRecordingSupported()) {
    throw new Error("UNSUPPORTED");
  }
  releaseMic();
  stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  const mimeType = PREFERRED_TYPES.find(t => MediaRecorder.isTypeSupported(t));
  mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  chunks = [];
  mediaRecorder.ondataavailable = e => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  mediaRecorder.start();
  startedAt = Date.now();
};

// Resolves with { blob, filename, durationMs }
export const stopRecording = () =>
  new Promise((resolve, reject) => {
    if (!mediaRecorder) {
      reject(new Error("NOT_RECORDING"));
      return;
    }
    const recorder = mediaRecorder;
    recorder.onstop = () => {
      // Strip codec params: "audio/webm;codecs=opus" -> "audio/webm"
      const baseType = (recorder.mimeType || "audio/webm").split(";")[0];
      const blob = new Blob(chunks, { type: baseType });
      const ext = EXT_BY_TYPE[baseType] || "webm";
      const durationMs = Date.now() - startedAt;
      releaseMic();
      resolve({ blob, filename: `${Date.now()}.${ext}`, durationMs });
    };
    recorder.onerror = e => {
      releaseMic();
      reject(e.error || new Error("RECORDER_ERROR"));
    };
    recorder.stop();
  });

export const cancelRecording = () => {
  try {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.onstop = null;
      mediaRecorder.stop();
    }
  } catch (_) {
    // ignore
  }
  releaseMic();
};

// Friendly Portuguese message for recorder errors
export const recorderErrorMessage = err => {
  const name = err?.name || err?.message;
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Permita o acesso ao microfone no navegador para gravar áudio.";
  if (name === "NotFoundError" || name === "DevicesNotFoundError")
    return "Nenhum microfone encontrado neste computador.";
  if (name === "NotReadableError")
    return "O microfone está sendo usado por outro programa.";
  if (name === "UNSUPPORTED")
    return "Este navegador não permite gravar áudio. Use Chrome, Edge ou Firefox atualizados.";
  return "Não foi possível gravar o áudio.";
};
