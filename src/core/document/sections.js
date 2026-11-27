export function isMapSection(sectionOrName) {
  const name = typeof sectionOrName === "string" ? sectionOrName : sectionOrName?.name;
  return typeof name === "string"
    && /^(?:Map\d+(?:\.json)?|CommonEvents(?:\.json)?)$/iu.test(name);
}
