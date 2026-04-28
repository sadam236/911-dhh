const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;

const calls = new Map();
const adminClients = new Set();

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, status, text) {
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(text);
}

function broadcastAdminEvent(event) {
  const chunk = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of adminClients) {
    client.write(chunk);
  }
}

function createId() {
  return `call-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let data = "";

    request.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error("Payload too large"));
        request.destroy();
      }
    });

    request.on("end", () => {
      if (!data) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });

    request.on("error", reject);
  });
}

function getCall(callId) {
  return calls.get(callId) || null;
}

function summarizeCall(call) {
  return {
    id: call.id,
    type: call.type,
    message: call.message,
    location: call.location,
    profile: call.profile,
    status: call.status,
    createdAt: call.createdAt,
    offer: call.offers.admin,
    answer: call.answers.admin,
    backupOffer: call.offers.backup,
    backupAnswer: call.answers.backup
  };
}

async function handleApi(request, response, url) {
  const pathname = url.pathname;

  if (request.method === "GET" && pathname === "/api/admin/events") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });
    response.write("data: " + JSON.stringify({ type: "ready" }) + "\n\n");
    adminClients.add(response);
    request.on("close", () => adminClients.delete(response));
    return;
  }

  if (request.method === "GET" && pathname === "/api/admin/calls") {
    const orderedCalls = Array.from(calls.values()).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    sendJson(response, 200, { calls: orderedCalls.map(summarizeCall) });
    return;
  }

  if (request.method === "POST" && pathname === "/api/calls") {
    const body = await readBody(request);
    const call = {
      id: createId(),
      type: body.type || "General Emergency Help",
      message: body.message || "",
      location: body.location || { latitude: "Not shared", longitude: "Not shared" },
      profile: body.profile || {},
      status: "Incoming",
      createdAt: new Date().toISOString(),
      messages: [
        {
          sender: "caller",
          text: body.message || "Emergency call started.",
          createdAt: new Date().toISOString()
        },
        {
          sender: "admin",
          text: "Emergency services notified. Waiting for an officer to answer.",
          createdAt: new Date().toISOString()
        }
      ],
      offers: {
        admin: null,
        backup: null
      },
      answers: {
        admin: null,
        backup: null
      },
      candidates: {
        toViewer: {
          admin: [],
          backup: []
        },
        toCaller: {
          admin: [],
          backup: []
        }
      }
    };

    calls.set(call.id, call);
    broadcastAdminEvent({ type: "incoming-call", callId: call.id });
    sendJson(response, 201, summarizeCall(call));
    return;
  }

  const callMatch = pathname.match(/^\/api\/calls\/([^/]+)(?:\/([^/]+))?$/);
  if (!callMatch) {
    sendText(response, 404, "Not found");
    return;
  }

  const [, callId, action] = callMatch;
  const call = getCall(callId);

  if (!call) {
    sendText(response, 404, "Call not found");
    return;
  }

  if (request.method === "GET" && !action) {
    sendJson(response, 200, summarizeCall(call));
    return;
  }

  if (request.method === "GET" && action === "messages") {
    const since = Number(url.searchParams.get("since") || "0");
    const messages = call.messages.slice(since);
    sendJson(response, 200, {
      messages,
      nextIndex: call.messages.length
    });
    return;
  }

  if (request.method === "POST" && action === "messages") {
    const body = await readBody(request);
    const message = {
      sender: body.sender === "admin" ? "admin" : "caller",
      text: body.text || "",
      createdAt: new Date().toISOString()
    };
    call.messages.push(message);
    if (message.sender === "admin") {
      call.status = "Officer responding";
    }
    broadcastAdminEvent({ type: "message", callId: call.id });
    sendJson(response, 201, { ok: true });
    return;
  }

  if (request.method === "POST" && action === "offer") {
    const body = await readBody(request);
    const target = body.target === "backup" ? "backup" : "admin";
    call.offers[target] = body.offer;
    call.status = "Video ringing";
    broadcastAdminEvent({ type: "video-offer", callId: call.id, target });
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && action === "answer") {
    const body = await readBody(request);
    const sender = body.sender === "backup" ? "backup" : "admin";
    call.answers[sender] = body.answer;
    if (sender === "admin") {
      call.status = "Video connected";
    }
    broadcastAdminEvent({ type: "video-answer", callId: call.id, sender });
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && action === "candidates") {
    const body = await readBody(request);
    const sender = body.sender === "backup" ? "backup" : body.sender === "admin" ? "admin" : "caller";
    const target = body.target === "backup" ? "backup" : "admin";

    if (sender === "caller") {
      call.candidates.toViewer[target].push(body.candidate);
    } else {
      call.candidates.toCaller[sender].push(body.candidate);
    }
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && action === "signals") {
    const receiver = url.searchParams.get("receiver");
    const role = url.searchParams.get("role") === "backup" ? "backup" : "admin";
    const since = Number(url.searchParams.get("since") || "0");

    if (receiver === "caller") {
      sendJson(response, 200, {
        answer: call.answers[role],
        candidates: call.candidates.toCaller[role].slice(since),
        nextIndex: call.candidates.toCaller[role].length
      });
      return;
    }

    sendJson(response, 200, {
      offer: call.offers[role],
      candidates: call.candidates.toViewer[role].slice(since),
      nextIndex: call.candidates.toViewer[role].length
    });
    return;
  }

  if (request.method === "POST" && action === "resolve") {
    call.status = "Resolved";
    broadcastAdminEvent({ type: "resolved", callId: call.id });
    sendJson(response, 200, { ok: true });
    return;
  }

  sendText(response, 404, "Not found");
}

function serveStatic(response, filePath) {
  const resolvedPath = path.join(ROOT, filePath);

  if (!resolvedPath.startsWith(ROOT)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  fs.readFile(resolvedPath, (error, data) => {
    if (error) {
      sendText(response, 404, "Not found");
      return;
    }

    const ext = path.extname(resolvedPath);
    const contentType =
      ext === ".html"
        ? "text/html; charset=utf-8"
        : ext === ".css"
          ? "text/css; charset=utf-8"
          : ext === ".js"
            ? "application/javascript; charset=utf-8"
            : ext === ".png"
              ? "image/png"
              : "application/octet-stream";

    response.writeHead(200, { "Content-Type": contentType });
    response.end(data);
  });
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      serveStatic(response, "index.html");
      return;
    }

    if (url.pathname === "/admin" || url.pathname === "/admin.html") {
      serveStatic(response, "admin.html");
      return;
    }

    if (url.pathname === "/backup" || url.pathname === "/backup.html") {
      serveStatic(response, "backup.html");
      return;
    }

    serveStatic(response, url.pathname.slice(1));
  } catch (error) {
    sendText(response, 500, error.message || "Internal server error");
  }
});

server.listen(PORT, () => {
  console.log(`911-DHH server listening on http://127.0.0.1:${PORT}`);
});
