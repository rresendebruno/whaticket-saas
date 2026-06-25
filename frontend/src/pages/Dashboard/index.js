import React, { useState, useEffect, useCallback } from "react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";

import Container from "@material-ui/core/Container";
import Grid from "@material-ui/core/Grid";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import ButtonGroup from "@material-ui/core/ButtonGroup";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import CircularProgress from "@material-ui/core/CircularProgress";
import { makeStyles } from "@material-ui/core/styles";

import AccessTimeIcon from "@material-ui/icons/AccessTime";
import ChatBubbleOutlineIcon from "@material-ui/icons/ChatBubbleOutline";
import HourglassEmptyIcon from "@material-ui/icons/HourglassEmpty";
import DoneAllIcon from "@material-ui/icons/DoneAll";

import api from "../../services/api";
import Chart from "./Chart";

const PRESETS = [
  { label: "Hoje", offset: 0 },
  { label: "Ontem", offset: 1 },
  { label: "7 dias", offset: 7 },
  { label: "30 dias", offset: 30 },
];

const fmtDate = d => format(d, "yyyy-MM-dd");

const useStyles = makeStyles(theme => ({
  container: { paddingTop: theme.spacing(3), paddingBottom: theme.spacing(4) },
  filterBar: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing(1),
    marginBottom: theme.spacing(3),
    padding: theme.spacing(2),
    background: theme.palette.background.paper,
    borderRadius: 8,
  },
  dateInput: { width: 160 },
  card: {
    padding: theme.spacing(2.5),
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(2),
    borderRadius: 8,
    height: 100,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  cardValue: { fontWeight: 700, fontSize: "2rem", lineHeight: 1 },
  cardLabel: { color: theme.palette.text.secondary, fontSize: "0.85rem", marginTop: 4 },
  chartPaper: { padding: theme.spacing(2), height: 280 },
  activeBtn: { fontWeight: 700 },
}));

const fmtDuration = secs => {
  if (!secs) return "—";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const StatCard = ({ icon, color, value, label, loading }) => {
  const classes = useStyles();
  return (
    <Paper className={classes.card} elevation={2}>
      <div className={classes.cardIcon} style={{ background: color + "22" }}>
        {React.cloneElement(icon, { style: { color, fontSize: 26 } })}
      </div>
      <div>
        {loading
          ? <CircularProgress size={28} />
          : <div className={classes.cardValue}>{value}</div>}
        <div className={classes.cardLabel}>{label}</div>
      </div>
    </Paper>
  );
};

const Dashboard = () => {
  const classes = useStyles();
  const today = new Date();

  const [preset, setPreset] = useState(0);
  const [dateStart, setDateStart] = useState(fmtDate(today));
  const [dateEnd, setDateEnd] = useState(fmtDate(today));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const applyPreset = useCallback(offset => {
    setPreset(offset);
    const end = offset === 1 ? subDays(today, 1) : today;
    const start = offset === 0 ? today : subDays(today, offset === 1 ? 1 : offset - 1);
    setDateStart(fmtDate(startOfDay(start)));
    setDateEnd(fmtDate(endOfDay(end)));
  }, []); // eslint-disable-line

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: result } = await api.get("/reports/overview", {
        params: { dateStart, dateEnd }
      });
      setData(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [dateStart, dateEnd]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const avgLabel = data ? fmtDuration(data.avgServiceTimeSeconds) : "—";

  return (
    <Container maxWidth="lg" className={classes.container}>
      {/* Filter bar */}
      <div className={classes.filterBar}>
        <ButtonGroup size="small" color="primary">
          {PRESETS.map(p => (
            <Button
              key={p.offset}
              variant={preset === p.offset ? "contained" : "outlined"}
              onClick={() => applyPreset(p.offset)}
              className={preset === p.offset ? classes.activeBtn : ""}
            >
              {p.label}
            </Button>
          ))}
        </ButtonGroup>
        <TextField
          type="date"
          size="small"
          variant="outlined"
          label="De"
          value={dateStart}
          onChange={e => { setPreset(null); setDateStart(e.target.value); }}
          className={classes.dateInput}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          type="date"
          size="small"
          variant="outlined"
          label="Até"
          value={dateEnd}
          onChange={e => { setPreset(null); setDateEnd(e.target.value); }}
          className={classes.dateInput}
          InputLabelProps={{ shrink: true }}
        />
        <Button size="small" variant="outlined" onClick={fetchData} disabled={loading}>
          Atualizar
        </Button>
      </div>

      <Grid container spacing={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            icon={<ChatBubbleOutlineIcon />}
            color="#1976d2"
            value={data?.open ?? "—"}
            label="Em Atendimento"
            loading={loading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            icon={<HourglassEmptyIcon />}
            color="#f57c00"
            value={data?.pending ?? "—"}
            label="Aguardando"
            loading={loading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            icon={<DoneAllIcon />}
            color="#388e3c"
            value={data?.closed ?? "—"}
            label="Encerrados no período"
            loading={loading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            icon={<AccessTimeIcon />}
            color="#7b1fa2"
            value={avgLabel}
            label="Tempo médio de atendimento"
            loading={loading}
          />
        </Grid>

        <Grid item xs={12}>
          <Paper className={classes.chartPaper}>
            <Chart byHour={data?.byHour || []} dateStart={dateStart} loading={loading} />
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
};

export default Dashboard;
