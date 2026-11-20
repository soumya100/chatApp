const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "../src/components/Chat/ChatInput.tsx"),
  "utf8"
);

test("failed message requests preserve the user's text draft for retry", () => {
  const send = source.slice(source.indexOf("const sendMessage = async"), source.indexOf("const enterPress"));
  const requestIndex = send.indexOf("await onSendMessage");
  const fallbackRequestIndex = send.indexOf("await axios.post('/api/message/send'");
  const clearIndex = send.indexOf("setInput('')");
  assert.ok(requestIndex >= 0 || fallbackRequestIndex >= 0, "message send request must exist");
  assert.ok(clearIndex > requestIndex || clearIndex > fallbackRequestIndex,
    "draft clearing must happen only after the send request resolves");
  assert.match(send, /catch \(error: any\)/);
  assert.match(send, /toast\.error/);
});

test("failed message requests preserve attachment and reply context", () => {
  const send = source.slice(source.indexOf("const sendMessage = async"), source.indexOf("const enterPress"));
  const requestIndex = Math.min(
    ...[send.indexOf("await onSendMessage"), send.indexOf("await axios.post('/api/message/send'")].filter(i => i >= 0)
  );
  assert.ok(send.indexOf("removeAttachment()") > requestIndex,
    "attachment preview and File object must be retained until send success");
  assert.ok(send.indexOf("onCancelReply?.()") > requestIndex,
    "reply context must remain available until send success");
});

test("chat composer exposes an accessible sending state and prevents duplicate submits", () => {
  assert.match(source, /aria-busy=\{isLoading\}/);
  assert.match(source, /role='status' aria-live='polite'/);
  assert.match(source, /\|\| isLoading\) return/);
  assert.match(source, /isLoading=\{isLoading\}/);
});

test("attachment preview object URLs are revoked when the user removes an attachment", () => {
  assert.match(source, /URL\.revokeObjectURL\(attachment\.previewUrl\)/);
  assert.match(source, /onClick=\{removeAttachment\}/);
});

test("composer controls cannot mutate the in-flight draft during submission", () => {
  assert.match(source, /disabled=\{isLoading\}/);
  assert.match(source, /onClick=\{\(\) => fileInputRef\.current\?\.click\(\)\}[\s\S]*?disabled=\{isLoading\}/);
});

test("Chat surfaces send failures to the composer instead of swallowing the rejected request", () => {
  const chat = fs.readFileSync(
    path.join(__dirname, "../src/components/Chat/index.tsx"),
    "utf8"
  );
  const handler = chat.slice(
    chat.indexOf("const handleSendMessage"),
    chat.indexOf("// Retry sending an errored message")
  );
  assert.match(handler, /status: 'error'/);
  assert.match(handler, /throw error/);
  assert.doesNotMatch(handler, /toast\.error/);
});

test("group typing indicators track multiple members independently and expire stale states", () => {
  const chat = fs.readFileSync(
    path.join(__dirname, "../src/components/Chat/index.tsx"),
    "utf8"
  );
  assert.match(chat, /const \[typingUserIds, setTypingUserIds\] = useState<string\[\]>\(\[\]\)/);
  assert.match(chat, /isGroupChat \? userId !== sessionId : userId !== chatPartner\.id/);
  assert.match(chat, /previous\.includes\(userId\) \? previous : \[\.\.\.previous, userId\]/);
  assert.match(chat, /previous\.filter\(id => id !== userId\)/);
  assert.match(chat, /typingTimeoutsRef\.current\.forEach\(timeout => clearTimeout\(timeout\)\)/);
});
