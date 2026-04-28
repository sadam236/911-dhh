const state = {
  calls: [],
  selectedCallId: null,
  peerConnection: null,
  localStream: null,
  remoteCandidateIndex: 0,
  lastMessageIndex: 0,
  eventSource: null,
  messageTimer: null,
  signalTimer: null
};

const incomingCalls = document.querySelector("#incoming-calls");
const adminConnection = document.querySelector("#admin-connection");
const adminCallDetail = document.querySelector("#admin-call-detail");
const adminChatLog = document.querySelector("#admin-chat-log");
const adminChatForm = document.querySelector("#admin-chat-form");
const adminChatMessage = document.querySelector("#admin-chat-message");
const localVideo = document.querySelector("#admin-local-video");
const remoteVideo = document.querySelector("#admin-remote-video");
const localLabel = document.querySelector("#admin-local-label");
const remoteLabel = document.querySelector("#admin-remote-label");
const remoteTile = document.querySelector("#admin-remote-tile");

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Request failed: ${response.status}`);
  }

  return response.json();
}

function renderCallList() {
  incomingCalls.innerHTML = "";

  if (!state.calls.length) {
    incomingCalls.innerHTML = "<p>No incoming calls right now.</p>";
    return;
  }

  state.calls.forEach((call) => {
    const item = document.createElement("article");
    const title = document.createElement("strong");
    const meta = document.createElement("span");
    const summary = document.createElement("span");
    const openButton = document.createElement("button");

    item.className = `alert-item ${call.id === state.selectedCallId ? "active" : ""}`;
    meta.className = "alert-meta";

    title.textContent = `${call.type} emergency`;
    meta.textContent = `${new Date(call.createdAt).toLocaleString()} - ${call.status}`;
    summary.textContent = call.message;

    openButton.type = "button";
    openButton.textContent = "Open Call";
    openButton.addEventListener("click", () => {
      state.selectedCallId = call.id;
      state.lastMessageIndex = 0;
      state.remoteCandidateIndex = 0;
      renderCallList();
      renderSelectedCall();
      refreshMessages().catch(() => {});
      startMessagePolling();
    });

    item.append(title, meta, summary, openButton);
    incomingCalls.append(item);
  });
}

function renderSelectedCall() {
  const call = state.calls.find((item) => item.id === state.selectedCallId);

  if (!call) {
    adminCallDetail.textContent = "Select a call to view details.";
    return;
  }

  adminCallDetail.innerHTML = `
    <div class="detail-grid">
      <p><strong>Help needed:</strong> ${call.type}</p>
      <p><strong>Status:</strong> ${call.status}</p>
      <p><strong>Message:</strong> ${call.message}</p>
      <p><strong>Location:</strong> ${call.location.latitude}, ${call.location.longitude}</p>
      <p><strong>User:</strong> ${call.profile.name}, age ${call.profile.age}</p>
      <p><strong>Communication:</strong> ${call.profile.communication}</p>
      <p><strong>Allergies:</strong> ${call.profile.allergies || "None listed"}</p>
      <p><strong>Medications:</strong> ${call.profile.medications || "None listed"}</p>
      <p><strong>Medical notes:</strong> ${call.profile.notes || "None listed"}</p>
      <p><strong>Emergency contact:</strong> ${call.profile.contactName} (${call.profile.contactInfo})</p>
      <p><strong>Video offer:</strong> ${call.offer ? "Waiting for answer" : "Not started"}</p>
    </div>
  `;
}

async function loadCalls() {
  const payload = await requestJson("/api/admin/calls");
  state.calls = payload.calls;
  if (!state.selectedCallId && state.calls.length) {
    state.selectedCallId = state.calls[0].id;
  }
  renderCallList();
  renderSelectedCall();
}

function renderMessages(messages) {
  adminChatLog.innerHTML = "";

  if (!messages.length) {
    adminChatLog.innerHTML = "<p>No caller messages yet.</p>";
    return;
  }

  messages.forEach((message) => {
    const bubble = document.createElement("article");
    const sender = document.createElement("strong");
    const text = document.createElement("span");

    bubble.className = `message ${message.sender === "caller" ? "user" : "dispatcher"}`;
    sender.textContent = message.sender === "caller" ? "User" : "Emergency officer";
    text.textContent = message.text;
    bubble.append(sender, text);
    adminChatLog.append(bubble);
  });
}

async function refreshMessages() {
  if (!state.selectedCallId) {
    renderMessages([]);
    return;
  }

  const payload = await requestJson(`/api/calls/${state.selectedCallId}/messages?since=0`);
  state.lastMessageIndex = payload.nextIndex;
  renderMessages(payload.messages);
}

function startMessagePolling() {
  window.clearInterval(state.messageTimer);
  state.messageTimer = window.setInterval(() => {
    refreshMessages().catch(() => {});
  }, 1500);
}

async function sendMessage(text) {
  if (!state.selectedCallId) return;

  await requestJson(`/api/calls/${state.selectedCallId}/messages`, {
    method: "POST",
    body: JSON.stringify({ sender: "admin", text })
  });

  await refreshMessages();
}

async function ensureLocalVideo() {
  if (state.localStream) return state.localStream;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("Camera API unavailable");
  }

  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  state.localStream = stream;
  localVideo.srcObject = stream;
  localLabel.textContent = "";
  return stream;
}

function attachPeerListeners(peerConnection) {
  peerConnection.ontrack = (event) => {
    const [stream] = event.streams;
    remoteVideo.srcObject = stream;
    remoteTile.classList.add("connected");
    remoteLabel.textContent = "Caller connected";
  };

  peerConnection.onicecandidate = (event) => {
    if (!event.candidate || !state.selectedCallId) return;
    requestJson(`/api/calls/${state.selectedCallId}/candidates`, {
      method: "POST",
      body: JSON.stringify({ sender: "admin", candidate: event.candidate })
    }).catch(() => {});
  };
}

async function answerVideoCall() {
  const call = state.calls.find((item) => item.id === state.selectedCallId);
  if (!call || !call.offer) {
    adminConnection.textContent = "No video offer yet";
    return;
  }

  const stream = await ensureLocalVideo();
  const peerConnection = new RTCPeerConnection();
  stream.getTracks().forEach((track) => peerConnection.addTrack(track, stream));
  attachPeerListeners(peerConnection);
  state.peerConnection = peerConnection;

  await peerConnection.setRemoteDescription(call.offer);
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  await requestJson(`/api/calls/${call.id}/answer`, {
    method: "POST",
    body: JSON.stringify({ answer, sender: "admin" })
  });

  await sendMessage("Emergency officer connected by video. I can see you now.");
  adminConnection.textContent = "Video answered";
  startSignalPolling();
}

async function pollSignals() {
  if (!state.selectedCallId || !state.peerConnection) return;

  const payload = await requestJson(
    `/api/calls/${state.selectedCallId}/signals?receiver=admin&role=admin&since=${state.remoteCandidateIndex}`
  );

  for (const candidate of payload.candidates) {
    await state.peerConnection.addIceCandidate(candidate);
  }

  state.remoteCandidateIndex = payload.nextIndex;
}

function startSignalPolling() {
  window.clearInterval(state.signalTimer);
  state.signalTimer = window.setInterval(() => {
    pollSignals().catch(() => {});
  }, 1200);
}

async function resolveCall() {
  if (!state.selectedCallId) return;
  await requestJson(`/api/calls/${state.selectedCallId}/resolve`, {
    method: "POST",
    body: "{}"
  });
  adminConnection.textContent = "Call resolved";
  await loadCalls();
}

function connectEvents() {
  state.eventSource = new EventSource("/api/admin/events");
  state.eventSource.onopen = () => {
    adminConnection.textContent = "Connected to backend";
  };

  state.eventSource.onmessage = async () => {
    await loadCalls();
    await refreshMessages().catch(() => {});
  };

  state.eventSource.onerror = () => {
    adminConnection.textContent = "Reconnecting";
  };
}

document.querySelector("#refresh-calls").addEventListener("click", () => {
  loadCalls().catch((error) => {
    adminConnection.textContent = error.message;
  });
});

document.querySelector("#answer-video").addEventListener("click", () => {
  answerVideoCall().catch((error) => {
    adminConnection.textContent = error.message;
  });
});

document.querySelector("#resolve-call").addEventListener("click", () => {
  resolveCall().catch((error) => {
    adminConnection.textContent = error.message;
  });
});

adminChatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = adminChatMessage.value.trim();
  if (!text) return;

  try {
    await sendMessage(text);
    adminChatMessage.value = "";
  } catch (error) {
    adminConnection.textContent = error.message;
  }
});

window.addEventListener("beforeunload", () => {
  if (state.eventSource) {
    state.eventSource.close();
  }
});

loadCalls().catch(() => {});
connectEvents();
