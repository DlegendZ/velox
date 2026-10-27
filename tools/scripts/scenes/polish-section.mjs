import polish from "./polish.mjs";
const views = (process.env.POLISH_VIEWS ?? "").split(",");
const scenarios = polish
  .filter(([name]) => views.includes(name))
  .map(([name, code, wait]) => [
    `${process.env.POLISH_PREFIX ?? "section"}-${name}`,
    code,
    wait,
  ]);

if(process.env.POLISH_CAP==='1') scenarios.push([`${process.env.POLISH_PREFIX}-p-career-cap`, `g.machine.go("career");g.save.active.upgrades.engine=5;g.save.active.upgrades.turbo=5;g.save.active.upgrades.tires=5;g.save.active.upgrades.suspension=5;g.save.active.upgrades.nitro=5;g.save.active.upgrades.weight=5;g.screen();`,600]);
export default scenarios;
