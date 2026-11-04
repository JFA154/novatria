// ===== Game: the one global (tests drive the engine through it) =====
window.Game = Object.freeze({
  Rng, Dice, Cards, Tables, State, Rel, Town, World, Style, Api, Mock, Upgrade, Pipeline, Storage, UI, Commands, App, npcLabel, inferPronouns, namePronouns, pronounLabel, turnLook, kinWord, presenceOf, absentNote, ageText,
  BUILD: State.BUILD, // Wave 46: the build, as on the title screen's footer
  get state() { return State.current; },
  get town() { return State.town || TOWN_DATA; },
  data: Object.freeze({ TOWN_DATA, TABLES, BACKGROUNDS, FLAWS, LOOSE_ENDS, GRUDGE_TEMPLATES, FAVOUR_TEMPLATES, GOAL_PRESETS, STYLE_GUIDE_LITERARY, STYLE_GUIDE_CASUAL, EXAMPLE_TURNS_LITERARY, EXAMPLE_TURNS_CASUAL })
});

try {
  App.boot();
} catch (err) {
  console.error(err);
  const banner = document.getElementById('banner');
  const text = document.getElementById('banner-text');
  if (banner && text) { text.textContent = 'The game failed to start: ' + err.message; banner.hidden = false; }
}
})();
