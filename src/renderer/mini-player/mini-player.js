const $ = (id) => document.getElementById(id);
const icon = (name) =>
  `<svg viewBox="0 0 24 24"><path d="${window.ICONS[name]}"/></svg>`;

$("previous").innerHTML = icon("previous");
$("next").innerHTML = icon("next");
$("close").innerHTML = icon("close");

for (const button of document.querySelectorAll("button[data-command]")) {
  button.addEventListener("click", () =>
    window.miniPlayer.command(button.dataset.command),
  );
}
// Drag the pill from anywhere but its buttons. A press that barely moves is still a
// click: on the artwork, title or artist (not the empty space around them) it brings
// the window back. Pointer capture keeps the moves coming when the pointer outruns the
// window, but it also sends the click to the pill instead of the song, so the click is
// handled here rather than with a click listener.
const pill = document.querySelector(".pill");
let press = null;
let dragged = false;
pill.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || event.target.closest("button")) return;
  press = {
    x: event.screenX,
    y: event.screenY,
    onSong: Boolean(event.target.closest(".art, .title, .artist")),
  };
  dragged = false;
  pill.setPointerCapture(event.pointerId);
});
pill.addEventListener("pointermove", (event) => {
  if (!press) return;
  const dx = event.screenX - press.x;
  const dy = event.screenY - press.y;
  if (!dragged && Math.hypot(dx, dy) < 4) return;
  dragged = true;
  window.miniPlayer.drag(dx, dy);
});
pill.addEventListener("pointerup", () => {
  if (press && dragged) window.miniPlayer.dragEnd();
  else if (press && press.onSong) window.miniPlayer.command("show");
  press = null;
});
pill.addEventListener("pointercancel", () => {
  if (press && dragged) window.miniPlayer.dragEnd();
  press = null;
});

// The song buttons need a song; the × always works
const SONG_BUTTONS = [
  "favorite",
  "suggest-less",
  "previous",
  "play-pause",
  "next",
];

window.miniPlayer.onState((state) => {
  // Nothing playing: the pill stays up, with its song buttons disabled
  const song = state || {
    title: "Nothing playing",
    artist: "",
    artworkUrl: null,
    favorited: false,
    suggestLess: false,
    playing: false,
  };
  for (const id of SONG_BUTTONS) $(id).disabled = !state;

  $("title").textContent = song.title;
  $("artist").textContent = song.artist;
  // artworkUrl is a parsed https URL from the main process, so it has no quotes
  $("art").style.backgroundImage = song.artworkUrl
    ? `url("${song.artworkUrl}")`
    : "";

  $("favorite").innerHTML = icon(song.favorited ? "star-filled" : "star");
  $("favorite").classList.toggle("on", song.favorited);
  $("favorite").title = song.favorited ? "Remove from favorites" : "Favorite";
  $("suggest-less").innerHTML = icon(
    song.suggestLess ? "thumb-down-filled" : "thumb-down",
  );
  $("suggest-less").classList.toggle("on", song.suggestLess);

  $("play-pause").innerHTML = icon(song.playing ? "pause" : "play");
  $("play-pause").title = song.playing ? "Pause" : "Play";
});
