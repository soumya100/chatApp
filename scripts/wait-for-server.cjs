const baseUrl = (process.env.CHATAPP_SMOKE_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
const timeoutMs = Number(process.env.SMOKE_WAIT_TIMEOUT_MS || 90_000);
const started = Date.now();

(async () => {
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/login`, { signal: AbortSignal.timeout(3000) });
      if (response.ok) {
        console.log(`ChatApp is ready at ${baseUrl}`);
        return;
      }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`ChatApp did not become ready at ${baseUrl} within ${timeoutMs}ms`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
