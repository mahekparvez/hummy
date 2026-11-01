let mediaStream = null;
let recorder = null;
let chunks = [];
let sourceName = "";
let sourceDomain = "";

chrome.runtime.onMessage.addListener(async (message) => {
  if (message.type === "offscreen-start") startCapture(message);
  if (message.type === "offscreen-stop") stopCapture();
});

async function startCapture(message) {
  sourceName = message.sourceName || "Captured website";
  sourceDomain = message.sourceDomain || "";
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: message.streamId } },
    video: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: message.streamId, maxFrameRate: 30 } }
  });
  const mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type)) || "";
  recorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : undefined);
  chunks = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  recorder.onstop = async () => {
    const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
    const buffer = await blob.arrayBuffer();
    chrome.runtime.sendMessage({ type: "recording-ready", buffer, mimeType: blob.type, sourceName, sourceDomain });
    mediaStream?.getTracks().forEach((track) => track.stop());
    mediaStream = null;
    recorder = null;
  };
  recorder.start(250);
}

function stopCapture() {
  if (recorder?.state === "recording") recorder.stop();
}
