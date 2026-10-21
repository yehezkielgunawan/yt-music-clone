import { expect, type Page } from '@playwright/test'

// Controlled API boundary only: this does not establish real media/background playback.
const apiFixture = `
(() => {
  const calls = [];
  let options, ids = [], index = -1, state = -1, currentTime = 42;
  const notify = () => options.events.onStateChange({ data: state });
  const player = {
    loadPlaylist(list, startIndex) { calls.push(['loadPlaylist', ...list]); ids = list; index = startIndex; state = 1; notify(); },
    playVideo() { calls.push(['play']); state = 1; notify(); },
    pauseVideo() { calls.push(['pause']); state = 2; notify(); },
    nextVideo() { calls.push(['next']); index = (index + 1) % ids.length; state = 1; currentTime = 0; notify(); },
    previousVideo() { calls.push(['previous']); index = Math.max(0, index - 1); currentTime = 0; notify(); },
    playVideoAt(value) { calls.push(['select', value]); index = value; state = 1; currentTime = 0; notify(); },
    seekTo(seconds, allowSeekAhead) { calls.push(['seek', seconds, allowSeekAhead]); currentTime = seconds; },
    setLoop(value) { calls.push(['loop', value]); },
    setShuffle(value) { calls.push(['shuffle', value]); },
    getPlaylist() { return ids; }, getPlaylistIndex() { return index; },
    getPlayerState() { return state; },
    getVideoData() { return { video_id: ids[index], title: ids.length ? 'Fixture track ' + (index + 1) : '', author: 'Fixture artist' }; },
    getCurrentTime() { return currentTime; }, getDuration() { return 180; }, destroy() {},
  };
  window.__fixture = { calls, block: () => { state = 5; notify(); options.events.onAutoplayBlocked(); }, fail: () => options.events.onError({ data: 150 }) };
  window.YT = { Player: function(host, config) {
    options = config;
    const iframe = document.createElement('iframe');
    iframe.id = 'fixture-player';
    host.replaceWith(iframe);
    setTimeout(() => options.events.onReady({ target: player }), 0);
    return player;
  }};
  window.onYouTubeIframeAPIReady();
})();
`

export async function fakeAPI(page: Page) {
  await page.route('https://www.youtube.com/iframe_api', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: apiFixture }),
  )
}

export async function connectAndStart(page: Page) {
  const bar = page.getByRole('region', { name: 'Playback controls' })
  await bar.getByRole('button', { name: 'Connect player', exact: true }).click()
  await expect(
    bar.getByRole('button', { name: 'Start listening', exact: true }),
  ).toBeEnabled()
  await bar
    .getByRole('button', { name: 'Start listening', exact: true })
    .click()
  await expect(
    page.getByText('Fixture track 1', { exact: true }).first(),
  ).toBeVisible()
}
