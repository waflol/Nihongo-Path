import { describe, expect, it } from "vitest";
import { isAllowedPushEndpoint } from "./push-endpoint.js";

describe("isAllowedPushEndpoint", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc:def",
    "https://web.push.apple.com/QGx2...",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAA",
    "https://wns2-par02p.notify.windows.com/w/?token=x",
  ])("accepts the browser push service %s", (url) => {
    expect(isAllowedPushEndpoint(url)).toBe(true);
  });

  it.each([
    "http://fcm.googleapis.com/fcm/send/abc", // not https
    "https://169.254.169.254/latest/meta-data", // cloud metadata
    "https://localhost:3000/admin",
    "https://fcm.googleapis.com.evil.example/x", // suffix trick
    "https://evilpush.apple.com.example/x",
    "https://fcm.googleapis.com:8443/x", // custom port
    "https://user:pass@fcm.googleapis.com/x",
    "not a url",
  ])("rejects %s", (url) => {
    expect(isAllowedPushEndpoint(url)).toBe(false);
  });
});
