// Minimal RESP2 client used by the Redis integration suites. It replaces the
// external redis-cli binary so the CI job needs no OS package installs: the
// runner's apt-get channel was an unpinned, mutable supply-chain dependency.
//
// Output follows `redis-cli --raw` semantics so suite assertions stay
// unchanged:
//   simple string / integer / bulk  -> the value as a string
//   nil bulk / null array           -> "" (empty string)
//   array                           -> elements joined with "\n"
//   error reply                     -> thrown as an Error
const net = require("node:net");

function encodeCommand(args) {
  const chunks = [Buffer.from(`*${args.length}\r\n`)];
  for (const arg of args) {
    const value = Buffer.isBuffer(arg) ? arg : Buffer.from(String(arg), "utf8");
    chunks.push(Buffer.from(`$${value.length}\r\n`), value, Buffer.from("\r\n"));
  }
  return Buffer.concat(chunks);
}

// Parses one complete RESP2 reply starting at offset; returns null when more
// bytes are needed. Error replies keep their type so callers can throw.
function parseReply(buffer, offset = 0) {
  const lineEnd = buffer.indexOf("\r\n", offset);
  if (lineEnd < 0) return null;
  const type = String.fromCharCode(buffer[offset]);
  const body = buffer.toString("utf8", offset + 1, lineEnd);
  const next = lineEnd + 2;
  if (type === "+" || type === ":" ) return { type, value: body, offset: next };
  if (type === "-") return { type, value: body, offset: next };
  if (type === "$") {
    const length = Number(body);
    if (length === -1) return { type, value: "", offset: next };
    const end = next + length + 2; // trailing \r\n
    if (buffer.length < end) return null;
    return { type, value: buffer.toString("utf8", next, next + length), offset: end };
  }
  if (type === "*") {
    const count = Number(body);
    if (count === -1) return { type, value: "", offset: next };
    let cursor = next;
    const items = [];
    for (let i = 0; i < count; i++) {
      const item = parseReply(buffer, cursor);
      if (!item) return null;
      items.push(item.value);
      cursor = item.offset;
    }
    return { type, value: items, offset: cursor };
  }
  throw new Error("Unsupported RESP type marker: " + JSON.stringify(type));
}

function formatRaw(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(item => (item === null ? "" : String(item))).join("\n");
  return String(value);
}

async function callRedis(host, port, args, timeoutMs = 10_000) {
  const socket = net.connect({ host, port });
  try {
    const parsed = await new Promise((resolve, reject) => {
      let buffer = Buffer.alloc(0);
      const fail = error => {
        socket.destroy();
        reject(error);
      };
      socket.setTimeout(timeoutMs, () => fail(new Error(`Redis command timed out after ${timeoutMs}ms`)));
      socket.on("error", fail);
      socket.on("connect", () => socket.write(encodeCommand(args)));
      socket.on("data", chunk => {
        buffer = Buffer.concat([buffer, chunk]);
        const reply = parseReply(buffer, 0);
        if (reply) {
          socket.destroy();
          resolve(reply);
        }
      });
    });
    if (parsed.type === "-") throw new Error("Redis error reply: " + parsed.value);
    return formatRaw(parsed.value);
  } finally {
    socket.destroy();
  }
}

module.exports = { callRedis, encodeCommand, parseReply, formatRaw };
