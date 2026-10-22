// Server URL for the static client (ADR-006).
// Empty means "same origin": the page is served by the game server itself (local use).
// The GitHub Pages workflow overwrites this file with the deployed server URL.
// A ?server=https://… parameter in the page URL takes precedence.
export const SERVER_URL = '';
