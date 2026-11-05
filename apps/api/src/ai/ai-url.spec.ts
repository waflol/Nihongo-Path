import { describe, expect, it } from "vitest";
import { validateBaseUrl } from "./ai-url.js";

describe("validateBaseUrl", () => {
  it("accepts local servers over http and strips the trailing slash", () => {
    expect(validateBaseUrl("http://localhost:11434/v1/")).toBe("http://localhost:11434/v1");
    expect(validateBaseUrl("http://127.0.0.1:1234/v1")).toBe("http://127.0.0.1:1234/v1");
    expect(validateBaseUrl("http://192.168.1.20:8000/v1")).toBe("http://192.168.1.20:8000/v1");
    expect(validateBaseUrl("http://ollama:11434/v1")).toBe("http://ollama:11434/v1");
    expect(validateBaseUrl("http://host.docker.internal:11434/v1")).toBe("http://host.docker.internal:11434/v1");
  });

  it("accepts public https endpoints", () => {
    expect(validateBaseUrl("https://api.openai.com/v1")).toBe("https://api.openai.com/v1");
  });

  it("rejects public http, other schemes, credentials, queries and metadata hosts", () => {
    for (const bad of [
      "http://api.example.com/v1",
      "ftp://localhost/v1",
      "file:///etc/passwd",
      "https://user:pw@api.example.com/v1",
      "https://api.example.com/v1?key=1",
      "http://169.254.169.254/latest",
      "https://metadata.google.internal/x",
      "not a url",
      "",
    ]) expect(() => validateBaseUrl(bad), bad).toThrow();
  });
});
