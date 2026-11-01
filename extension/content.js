chrome.runtime.sendMessage({ type: "hummy-ready" });

chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== "recording-ready") return;
  window.postMessage({
    source: "hummy-extension",
    type: "recording-ready",
    buffer: message.buffer,
    mimeType: message.mimeType,
    sourceName: message.sourceName,
    sourceDomain: message.sourceDomain
  }, "*");
});
