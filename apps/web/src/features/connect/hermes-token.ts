// The one-liner that hands a new token to Hermes on the VPS. Run in the
// user's own terminal so the token goes straight from this page to the
// server, never through a chat. Caretalk and Hermes share the box, so the
// CLI talks to Caretalk on loopback.

const TOKEN = /^ct_[A-Za-z0-9_-]+$/;

export function hermesConfigCommand(token: string): string {
  if (!TOKEN.test(token)) throw new Error("Not a Caretalk API token");
  const config = `{"base_url": "http://127.0.0.1:3000", "token": "${token}"}`;
  return `ssh hermes-vps 'umask 077 && cat > ~/.hermes/data/health/caretalk.json && chmod 600 ~/.hermes/data/health/caretalk.json' <<'EOF'\n${config}\nEOF`;
}
