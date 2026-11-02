import type { Fact } from "../src/shared/types";
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export function originalVisual(
  f: Fact,
): { svg: string; caption: string; alt: string } | null {
  let art = "",
    caption = "";
  const answer = f.answer.toLowerCase();
  if (f.diagram) {
    const nodes = f.diagram.nodes.slice(0, 4);
    const w = 620 / nodes.length;
    art = nodes
      .map(
        (node, i) =>
          `<rect x="${50 + i * w}" y="125" width="${w - 16}" height="115" rx="8" fill="${i === 1 ? "#e0efea" : "#f3f5f3"}" stroke="#b7cdc4"/><text x="${50 + i * w + (w - 16) / 2}" y="167" text-anchor="middle" font-size="15">${wrap(
            node,
            Math.floor(w / 9),
          )
            .map(
              (line, j) =>
                `<tspan x="${50 + i * w + (w - 16) / 2}" dy="${j ? 23 : 0}">${escape(line)}</tspan>`,
            )
            .join(
              "",
            )}</text>${i < nodes.length - 1 ? `<path d="M${50 + i * w + w - 12} 183h10m-4-4l4 4-4 4" fill="none" stroke="#087c82" stroke-width="2"/>` : ""}`,
      )
      .join("");
    caption = f.diagram.caption;
  } else if (
    /^(porosity|effective porosity|total porosity|intergranular porosity)$/.test(
      answer,
    )
  ) {
    art =
      Array.from(
        { length: 18 },
        (_, i) =>
          `<circle cx="${140 + (i % 6) * 82}" cy="${100 + Math.floor(i / 6) * 82}" r="34" fill="#c5b398"/>`,
      ).join("") +
      '<path d="M150 300H570" stroke="#087c82" stroke-width="3"/><text x="360" y="340" text-anchor="middle">Pore space ÷ bulk rock volume</text>';
    caption =
      "Rock grains (tan) surround pore space (white). Porosity is a volume fraction; connectivity determines effective porosity.";
  } else if (/^(permeability|absolute permeability)$/.test(answer)) {
    art =
      '<rect x="160" y="100" width="380" height="180" rx="10" fill="#ded5c6"/><path d="M70 160H200L260 130L320 190L390 150H610M70 230H230L300 210L380 245H610" fill="none" stroke="#087c82" stroke-width="15"/><text x="360" y="335" text-anchor="middle">Connected pores transmit fluid under a pressure gradient</text>';
    caption =
      "Connected flow paths permit fluid transmission through rock. Permeability measures this ability, rather than pore volume alone.";
  } else if (/^(anticline|syncline)$/.test(answer)) {
    const arch = answer === "anticline";
    art = Array.from(
      { length: 4 },
      (_, i) =>
        `<path d="M100 ${230 + i * 25} Q360 ${arch ? -80 + i * 25 : 430 + i * 25} 620 ${230 + i * 25}" fill="none" stroke="${["#a69a81", "#c7b28c", "#819a8a", "#bdccbd"][i]}" stroke-width="22"/>`,
    ).join("");
    caption = arch
      ? "An upward-convex fold. In an upright anticline, the oldest beds occupy the core."
      : "A downward-concave fold. In an upright syncline, the youngest beds occupy the core.";
  } else if (
    /^(drawdown test|buildup test|pressure drawdown|pressure buildup)$/.test(
      answer,
    )
  ) {
    const build = answer.includes("buildup");
    art = `<path d="M100 70V300H640" stroke="#7b8c8d" stroke-width="2" fill="none"/><path d="${build ? "M110 275 Q180 130 360 110 T620 95" : "M110 95 Q180 245 360 260 T620 275"}" fill="none" stroke="#087c82" stroke-width="5"/><text x="370" y="345" text-anchor="middle">Time →</text><text x="45" y="180" transform="rotate(-90 45 180)">Pressure →</text>`;
    caption = build
      ? "Schematic pressure recovery after shutting in a producing well. The curve is conceptual, not measured data."
      : "Schematic pressure decline after opening a well to flow. The curve is conceptual, not measured data.";
  } else if (/^boyle.s law$/.test(answer)) {
    art =
      '<path d="M100 60V300H640" stroke="#7b8c8d" stroke-width="2" fill="none"/><path d="M130 70C145 180 200 230 300 255S500 280 620 285" fill="none" stroke="#087c82" stroke-width="5"/><text x="360" y="338" text-anchor="middle">Volume →</text><text x="48" y="180" transform="rotate(-90 48 180)">Pressure →</text><text x="400" y="120" text-anchor="middle">P × V = constant</text><text x="400" y="151" text-anchor="middle" font-size="15">Fixed gas quantity and temperature</text>';
    caption =
      "Boyle's law: pressure decreases as volume increases for a fixed amount of ideal gas at constant temperature. The curve is schematic.";
  } else if (/^(normal fault|reverse fault)$/.test(answer)) {
    const normal = answer === "normal fault";
    art = `<path d="M100 130H360L260 290H100Z" fill="#b7c8ba"/><path d="M370 ${normal ? 180 : 90}H620V290H270Z" fill="#cbb695"/><path d="M400 70L250 310" stroke="#314c50" stroke-width="4"/><path d="M500 ${normal ? 125 : 220}v${normal ? 80 : -80}" stroke="#087c82" stroke-width="5"/><text x="480" y="345" text-anchor="middle">Hanging wall moves ${normal ? "down" : "up"}</text>`;
    caption = `In a ${answer}, the hanging wall moves ${normal ? "down" : "up"} relative to the footwall along the inclined fault plane.`;
  }
  if (!art) return null;
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="390" viewBox="0 0 720 390"><rect width="720" height="390" fill="#fff"/><g font-family="Segoe UI,Arial,sans-serif" font-size="18" fill="#29474a">${art}</g><text x="18" y="375" font-family="Segoe UI,Arial,sans-serif" font-size="11" fill="#7b8c8d">Original PetroBowl Trainer schematic · not to scale</text></svg>`,
    caption,
    alt: `${f.answer}: ${caption}`,
  };
}
function wrap(s: string, max: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of s.split(" ")) {
    if (line.length + word.length + 1 > max && line) {
      lines.push(line);
      line = word;
    } else line += (line ? " " : "") + word;
  }
  if (line) lines.push(line);
  return lines;
}
