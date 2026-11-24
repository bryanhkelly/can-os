/** V6.1 analytical series tokens. The theme owns color, not Recharts or a feature. */
export const reportSeriesColors=["var(--report-series-1)","var(--report-series-2)","var(--report-series-3)","var(--report-series-4)"] as const;
export const reportSeriesPatterns=["solid","diagonal","dots","crosshatch"] as const;
export const reportPlotStyle={
  axisFontSize:12,axisFontFamily:"var(--font-sans)",lineWidth:2,pointRadius:3,barHeight:24,
  rowHeight:40,minimumHeight:200,trendHeight:240,distributionHeight:224,
  gridStroke:"var(--report-grid)",separator:"var(--report-separator)",axisInk:"var(--report-axis)",
  hover:"var(--report-hover)",
} as const;
