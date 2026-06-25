import React, { useMemo } from "react";
import { useTheme } from "@material-ui/core/styles";
import Typography from "@material-ui/core/Typography";
import CircularProgress from "@material-ui/core/CircularProgress";
import {
  BarChart,
  CartesianGrid,
  Bar,
  XAxis,
  YAxis,
  Label,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const pad = h => String(h).padStart(2, "0") + ":00";

const Chart = ({ byHour = [], loading }) => {
  const theme = useTheme();

  const chartData = useMemo(() => {
    const map = {};
    byHour.forEach(({ hour, count }) => { map[Number(hour)] = Number(count); });
    return Array.from({ length: 24 }, (_, h) => ({
      time: pad(h),
      amount: map[h] || 0
    })).filter(d => { const h = Number(d.time.slice(0, 2)); return d.amount > 0 || (h >= 7 && h <= 20); });
  }, [byHour]);

  const total = byHour.reduce((s, r) => s + Number(r.count), 0);

  return (
    <>
      <Typography variant="h6" style={{ marginBottom: 8 }}>
        {`Tickets criados no período: ${total}`}
        {loading && <CircularProgress size={16} style={{ marginLeft: 8 }} />}
      </Typography>
      <ResponsiveContainer width="100%" height="85%">
        <BarChart
          data={chartData}
          barSize={32}
          margin={{ top: 4, right: 16, bottom: 0, left: 24 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" stroke={theme.palette.text.secondary} tick={{ fontSize: 11 }} />
          <YAxis
            type="number"
            allowDecimals={false}
            stroke={theme.palette.text.secondary}
          >
            <Label
              angle={270}
              position="left"
              style={{ textAnchor: "middle", fill: theme.palette.text.primary }}
            >
              Tickets
            </Label>
          </YAxis>
          <Tooltip
            formatter={v => [v, "Tickets"]}
            contentStyle={{ background: theme.palette.background.paper }}
          />
          <Bar dataKey="amount" fill={theme.palette.primary.main} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </>
  );
};

export default Chart;
