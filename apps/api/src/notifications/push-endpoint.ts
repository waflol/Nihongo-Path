/**
 * The API itself POSTs to a subscription's `endpoint`, so an unchecked
 * endpoint would let any signed-in user make the server call an arbitrary
 * URL (SSRF: cloud metadata, internal services). Only the browsers' real
 * push services are accepted.
 */
const PUSH_HOSTS: readonly RegExp[] = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge (Android/desktop), Samsung Internet
  /^android\.googleapis\.com$/,
  /^([a-z0-9-]+\.)*push\.apple\.com$/, // Safari / iOS home-screen apps
  /^([a-z0-9-]+\.)*push\.services\.mozilla\.com$/, // Firefox
  /^([a-z0-9-]+\.)*notify\.windows\.com$/, // Edge on Windows (WNS)
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username || url.password) {
    return false;
  }
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.some((re) => re.test(host));
}
