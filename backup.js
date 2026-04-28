const state = {
  calls: [],
  selectedCallId: null,
  peerConnection: null,
  remoteCandidateIndex: 0,
  eventSource: null,
  signalTimer: null
};

const backupCalls = document.querySelector("#backup-calls");
const backupConnection = document.querySelector("#backup-connection");
const backupCallDetail = document.querySelector("#backup-call-detail");
const backupRemoteVideo = document.querySelector("#backup-remote-video");
const backupRemoteLabel = document.querySelector("#backup-remote-label");

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
  backupCalls.innerHTML = "";

  if (!state.calls.length) {
    backupCalls.innerHTML = "<p>No calls available to monitor right now.</p>";
    return;
  }

  state.calls.forEach((call) => {
    const item = document.createElement("article");
    const title = document.createElement("strong");
    const meta = document.createElement("span");
    const button = document.createElement("button");

    item.className = `alert-item ${call.id === state.selectedCallId ? "active" : ""}`;
    meta.className = "alert-meta";

    title.textContent = `${call.type} emergency`;
    meta.textContent = `${new Date(call.createdAt).toLocaleString()} - ${call.status}`;

    button.type = "button";
    button.textContent = "Monitor";
    button.addEventListener("click", () => {
      state.selectedCallId = call.id;
      state.remoteCandidateIndex = 0;
      renderCallList();
      renderSelectedCall();
    });

    item.append(title, meta, button);
    backupCalls.append(item);
  });
}

function renderSelectedCall() {
  const call = state.calls.find((item) => item.id === state.selectedCallId);

  if (!call) {
    backupCallDetail.textContent = "Select a call to monitor the caller video.";
    return;
  }

  backupCallDetail.innerHTML = `
    <div class="detail-grid">
      <p><strong>Help needed:</strong> ${call.type}</p>
      <p><strong>Status:</strong> ${call.status}</p>
      <p><strong>User:</strong> ${call.profile.name}, age ${call.profile.age}</p>
      <p><strong>Message:</strong> ${call.message}</p>
      <p><strong>Backup video:</strong> ${call.backupOffer ? "Ready to monitor" : "Waiting for caller video"}</p>
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

function attachPeerListeners(peerConnection) {
  peerConnection.ontrack = (event) => {
    const [stream] = event.streams;
    backupRemoteVideo.srcObject = stream;
    backupRemoteLabel.textContent = "Caller visible";
    backupConnection.textContent = "Monitoring caller";
  };

  peerConnection.onicecandidate = (event) => {
    if (!event.candidate || !state.selectedCallId) return;
    requestJson(`/api/calls/${state.selectedCallId}/candidates`, {
      method: "POST",
      body: JSON.stringify({ sender: "backup", candidate: event.candidate })
    }).catch(() => {});
  };
}

async function watchBackupVideo() {
  const call = state.calls.find((item) => item.id === state.selectedCallId);
  if (!call || !call.backupOffer) {
    backupConnection.textContent = "No backup video offer yet";
    return;
  }

  const peerConnection = new RTCPeerConnection();
  attachPeerListeners(peerConnection);
  state.peerConnection = peerConnection;

  await peerConnection.setRemoteDescription(call.backupOffer);
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  await requestJson(`/api/calls/${call.id}/answer`, {
    method: "POST",
    body: JSON.stringify({ answer, sender: "backup" })
  });

  backupConnection.textContent = "Backup viewer connected";
  startSignalPolling();
}

async function pollSignals() {
  if (!state.selectedCallId || !state.peerConnection) return;

  const payload = await requestJson(
    `/api/calls/${state.selectedCallId}/signals?receiver=backup&role=backup&since=${state.remoteCandidateIndex}`
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

function connectEvents() {
  state.eventSource = new EventSource("/api/admin/events");
  state.eventSource.onopen = () => {
    backupConnection.textContent = "Connected to backend";
  };

  state.eventSource.onmessage = async () => {
    await loadCalls();
  };

  state.eventSource.onerror = () => {
    backupConnection.textContent = "Reconnecting";
  };
}

document.querySelector("#refresh-backup-calls").addEventListener("click", () => {
  loadCalls().catch((error) => {
    backupConnection.textContent = error.message;
  });
});

document.querySelector("#watch-backup-video").addEventListener("click", () => {
  watchBackupVideo().catch((error) => {
    backupConnection.textContent = error.message;
  });
});

window.addEventListener("beforeunload", () => {
  if (state.eventSource) {
    state.eventSource.close();
  }
});

loadCalls().catch(() => {});
connectEvents();
