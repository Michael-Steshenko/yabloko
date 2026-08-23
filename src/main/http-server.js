const http = require('http');
const { runAction } = require('./actions');

const ACTIONS = new Set(['favorite', 'undo-favorite', 'suggest-less']);
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function isAllowedHostHeader(hostHeader, host, port) {
  if (!hostHeader) return false;
  const idx = hostHeader.lastIndexOf(':');
  const hostname = idx === -1 ? hostHeader : hostHeader.slice(0, idx);
  const headerPort = idx === -1 ? '80' : hostHeader.slice(idx + 1);
  if (headerPort !== String(port)) return false;
  return (
    hostname === host ||
    hostname === '127.0.0.1' ||
    hostname === 'localhost' ||
    hostname === '::1' ||
    hostname === '[::1]'
  );
}

function statusFor(result) {
  if (result.ok) return 200;
  if (result.code === 'no-musickit') return 503;
  if (result.code === 'nothing-playing') return 409;
  return 502;
}

function createServer({ host, port, getWebContents }) {
  const server = http.createServer(async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    const remoteAddress = req.socket.remoteAddress || '';
    if (host === '127.0.0.1' && !LOOPBACK_ADDRESSES.has(remoteAddress)) {
      return send(403, { ok: false, code: 'forbidden-remote-address' });
    }

    if (req.headers.origin) {
      return send(403, { ok: false, code: 'forbidden-origin' });
    }

    const secFetchSite = req.headers['sec-fetch-site'];
    if (secFetchSite && secFetchSite !== 'none') {
      return send(403, { ok: false, code: 'forbidden-sec-fetch-site' });
    }

    if (!isAllowedHostHeader(req.headers.host, host, port)) {
      return send(403, { ok: false, code: 'forbidden-host' });
    }

    if (req.method !== 'GET' && req.method !== 'POST') {
      return send(404, { ok: false, code: 'not-found' });
    }

    const path = (req.url || '/').split('?')[0];
    const webContents = getWebContents();

    if (path === '/health') {
      const result = await runAction(webContents, 'health');
      return send(statusFor(result), result);
    }

    if (ACTIONS.has(path.slice(1))) {
      const result = await runAction(webContents, path.slice(1));
      return send(statusFor(result), result);
    }

    return send(404, { ok: false, code: 'not-found' });
  });

  return server;
}

module.exports = { createServer };
