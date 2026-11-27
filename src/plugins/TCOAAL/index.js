import { csvFormat } from "./formats/csv/index.js";
import { cldFormat } from "./formats/cld/index.js";
import { txtFormat } from "./formats/txt/index.js";

export { csvFormat, cldFormat, txtFormat };
export const tcoaalFormats = Object.freeze([csvFormat, cldFormat, txtFormat]);
