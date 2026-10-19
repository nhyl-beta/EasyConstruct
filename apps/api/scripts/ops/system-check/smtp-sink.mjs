// A tiny SMTP server for the checks (Node only, no packages). Accepts mail on 127.0.0.1:2525 and writes
// every message to a JSON file so a check can read links out of it. A recipient whose address contains
// "reject" is refused (550), which is how the checks produce a partial send failure.
//
//   node scripts/ops/system-check/smtp-sink.mjs [mailbox.json]
//   then start the API with MAIL_USER=a@b.c MAIL_APP_PASSWORD=x MAIL_HOST=127.0.0.1 MAIL_PORT=2525
import { createServer } from "node:net";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const boxPath = resolve(process.argv[2] ?? process.env.SINK_BOX ?? "system-check-out/mailbox.json");
mkdirSync(dirname(boxPath), { recursive: true });
const box = [];
writeFileSync(boxPath, "[]");

const decodeQp = (s) => s.replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

const server = createServer((socket) => {
  let state = "cmd";
  let from = "";
  let rcpts = [];
  let data = "";
  let authStep = null;
  socket.write("220 sink ESMTP\r\n");
  let buffer = "";
  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    for (;;) {
      if (state === "data") {
        const end = buffer.indexOf("\r\n.\r\n");
        if (end === -1) return;
        data = buffer.slice(0, end);
        buffer = buffer.slice(end + 5);
        box.push({ from, to: rcpts, raw: data, text: decodeQp(data), at: new Date().toISOString() });
        writeFileSync(boxPath, JSON.stringify(box, null, 2));
        socket.write("250 OK queued\r\n");
        state = "cmd";
        from = "";
        rcpts = [];
        continue;
      }
      const nl = buffer.indexOf("\r\n");
      if (nl === -1) return;
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 2);
      const up = line.toUpperCase();
      if (authStep) {
        authStep = authStep === "user" ? "pass" : null;
        socket.write(authStep === "pass" ? "334 UGFzc3dvcmQ6\r\n" : "235 Authentication successful\r\n");
      } else if (up.startsWith("EHLO") || up.startsWith("HELO")) socket.write("250-sink\r\n250 AUTH PLAIN LOGIN\r\n");
      else if (up.startsWith("AUTH PLAIN") && line.split(" ").length > 2) socket.write("235 Authentication successful\r\n");
      else if (up.startsWith("AUTH PLAIN")) {
        authStep = "plain";
        socket.write("334 \r\n");
      } else if (up.startsWith("AUTH LOGIN")) {
        authStep = "user";
        socket.write("334 VXNlcm5hbWU6\r\n");
      } else if (up.startsWith("MAIL FROM")) {
        from = line.slice(10).trim();
        socket.write("250 OK\r\n");
      } else if (up.startsWith("RCPT TO")) {
        const addr = line.slice(8).trim().replace(/[<>]/g, "");
        if (addr.toLowerCase().includes("reject")) socket.write("550 5.1.1 mailbox unavailable\r\n");
        else {
          rcpts.push(addr);
          socket.write("250 OK\r\n");
        }
      } else if (up === "DATA") {
        if (rcpts.length === 0) socket.write("554 no valid recipients\r\n");
        else {
          socket.write("354 go ahead\r\n");
          state = "data";
        }
      } else if (up === "QUIT") {
        socket.write("221 bye\r\n");
        socket.end();
      } else if (up === "RSET" || up === "NOOP") socket.write("250 OK\r\n");
      else socket.write("250 OK\r\n");
    }
  });
  socket.on("error", () => undefined);
});

server.listen(2525, "127.0.0.1", () => console.log(`sink up on 2525, writing ${boxPath}`));
