/** Shared chart styling: recessive hairline grid/axes, 2px lines, thin bars. */
export const chartTheme = {
  grid: "#1e2a3f",
  axis: "#2b3850",
  tick: { fill: "#74829a", fontSize: 11 },
  surface: "#0f1726",
  series: ["#3987e5", "#d95926", "#199e70", "#c98500"],
  accent: "#38bdf8",
};

export const axisProps = {
  stroke: chartTheme.axis,
  tick: chartTheme.tick,
  tickLine: false,
  axisLine: { stroke: chartTheme.axis },
} as const;

export const barRadius: [number, number, number, number] = [4, 4, 0, 0];
export const hBarRadius: [number, number, number, number] = [0, 4, 4, 0];
