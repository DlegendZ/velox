export default [
  ["f-title", ``, 2500],
  ["f-ghost", `g.save.data.records["coast_a"] = { bestLap: 99, ghost: Array.from({length: 60}, (_, i) => [i * 0.1, 0, 0.5, i, 0, 0, 0, 1]), splits: null };
    Object.assign(g.config,{mode:"time",track:"coast_a",weather:"clear",laps:1,eventId:undefined,rivals:0,reverse:false}); g.machine.go("prerace");
    for (let i=0;i<120 && g.machine.current!=="race"; i++) await sleep(250); await sleep(4200); window.__ghost = !!g.race?.ghost;`, 600],
  ["f-results", `g.race.finish(true)`, 2600],
  ["f-garage", `g.disposeRace(); g.machine.go("garage")`, 2000],
];
