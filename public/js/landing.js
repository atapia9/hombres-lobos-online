// Keeps a ?server= parameter when moving from the landing page to a screen.
const server = new URLSearchParams(location.search).get('server');
if (server) {
  for (const link of document.querySelectorAll('a[data-keep-server]')) {
    const url = new URL(link.getAttribute('href'), location.href);
    url.searchParams.set('server', server);
    link.href = url.href;
  }
}
