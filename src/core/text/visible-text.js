const GAME_TEXT_ESCAPE_CODE = /\\(?:[A-Za-z]+(?:\[[^\]]*\])?|[{}$!.|^><])/gu;

export function getVisibleTextLength(text) {
  if (typeof text !== "string") {
    throw new TypeError("Visible text length requires a string.");
  }
  return text.replace(GAME_TEXT_ESCAPE_CODE, "").length;
}
